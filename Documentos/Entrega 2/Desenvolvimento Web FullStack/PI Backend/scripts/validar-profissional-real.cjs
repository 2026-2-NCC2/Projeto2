"use strict";
// Somente homologação previamente identificada. SQL exclusivamente READ ONLY.
// Escritas pela API em duas colunas de quatro contas; restauração em finally.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { isDeepStrictEqual: igual } = require("node:util");
const raiz = path.resolve(__dirname, "..");
process.chdir(raiz);
const envOriginal = fs.readFileSync(".env");
require("dotenv").config({ quiet: true });
const env = process.env;
const report = { inicio: new Date().toISOString(), etapas: [], restaurado: false };
const registrar = etapa => { report.etapas.push(etapa); console.log(JSON.stringify({ aprovado: true, etapa })); };
const secoes = u => ({ redes_sociais: u.redes_sociais, dados_comerciais: u.dados_comerciais });
let etapa = "entrada";
async function metadados() {
  etapa = "metadados PostgreSQL READ ONLY";
  const ca = env.PGSSLROOTCERT;
  assert.equal(env.PGUSER, `postgres.${new URL(env.SUPABASE_URL).hostname.split('.')[0]}`);
  const pool = require("../db-postgres.js").criarPoolPostgres({ ...env, PGSSLROOTCERT: ca, PGCONNECT_TIMEOUT_MS: "10000" });
  let db;
  try {
    db = await pool.connect();
    assert.ok(db.connection.stream.encrypted && db.connection.stream.authorized);
    await db.query("BEGIN READ ONLY");
    await db.query("SET LOCAL statement_timeout='15s'");
    const q = async sql => (await db.query(sql)).rows;
    const colunas = await q("SELECT column_name,data_type,is_nullable,column_default,is_generated FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name IN ('redes_sociais','dados_comerciais') ORDER BY column_name");
    assert.equal(colunas.length, 2);
    for (const c of colunas) {
      assert.equal(c.data_type, "jsonb"); assert.equal(c.is_nullable, "YES");
      assert.equal(c.column_default, null); assert.equal(c.is_generated, "NEVER");
    }
    const permissoes = await q("SELECT r.rolname,a.attname,has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AS leitura,has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS escrita FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relname='usuarios' AND a.attname IN ('redes_sociais','dados_comerciais') AND r.rolname IN ('anon','authenticated','service_role') ORDER BY r.rolname,a.attname");
    const rls = await q("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.usuarios'::regclass");
    const politicas = await q("SELECT policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='usuarios'");
    const triggers = await q("SELECT trigger_name,action_statement FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table='usuarios'");
    report.schema = { colunas, permissoes, rls, politicas, triggers };
    // Novas colunas devem continuar exclusivas do backend.
    assert.equal(permissoes.length, 6);
    for (const p of permissoes) {
      assert.equal(p.leitura, p.rolname === "service_role");
      assert.equal(p.escrita, p.rolname === "service_role");
    }
    // Não disparar triggers de escrita com efeitos em outras tabelas.
    assert.equal(triggers.length, 0, "TRIGGERS_EXIGEM_REVISAO");
    await db.query("COMMIT");
    registrar("JSONB nullable sem default; grants exclusivos de service_role; RLS/políticas/triggers inspecionados via TLS");
  } finally { if (db) db.release(); await pool.end(); }
}
async function main() {
  assert.deepEqual(process.argv.slice(2), ["--executar-autorizado", "--navegador"]);
  assert.equal(env.DB_PROVIDER, "supabase");
  assert.equal(env.SUPABASE_URL, env.HOMOLOG_SUPABASE_URL);
  try { await metadados(); }
  catch (e) {
    // Uma divergência de schema/grants deve bloquear. Indisponibilidade do
    // transporte SQL permite verificar a API e registrar o limite da auditoria.
    if (e.code === "ERR_ASSERTION" || e.code === "POSTGRES_CONFIG") throw e;
    report.pendencias = ["Catálogo PostgreSQL indisponível: nullable/default/grants de authenticated/RLS/políticas/triggers não confirmados por SQL nesta execução."];
    const r = await fetch(env.SUPABASE_URL + "/rest/v1/", { headers: { apikey: env.SUPABASE_SECRET_KEY }, signal: AbortSignal.timeout(20000) });
    assert.equal(r.status, 200);
    const schema = (await r.json()).definitions.usuarios;
    for (const k of ["redes_sociais", "dados_comerciais"]) {
      assert.equal(schema.properties[k].format, "jsonb");
      assert.ok(!schema.required?.includes(k));
    }
    const anon = await fetch(env.SUPABASE_URL + "/rest/v1/usuarios?select=redes_sociais,dados_comerciais&limit=0", { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(20000) });
    assert.ok([401, 403].includes(anon.status), "ACESSO_PUBLICO_INDEVIDO");
    report.schemaHttps = { colunas: ["redes_sociais", "dados_comerciais"], tipo: "jsonb", obrigatorias: false, anonStatus: anon.status };
    registrar("PostgREST real confirma duas colunas JSONB opcionais e recusa leitura anon; inspeção SQL pendente");
  }
  const cliente = require("../db-supabase.cjs").criarClienteSupabase();
  const contas = [];
  etapa = "identificar contas autorizadas";
  for (const [perfil, id, email, senha] of [
    ["admin", null, env.HOMOLOG_ADMIN_EMAIL, env.HOMOLOG_ADMIN_PASSWORD],
    ["participante", null, env.HOMOLOG_PARTICIPANTE_EMAIL, env.HOMOLOG_PARTICIPANTE_PASSWORD],
    ["fornecedor", 3, null, env.HOMOLOG_PARTICIPANTE_PASSWORD],
    ["organizador", 4, null, env.HOMOLOG_PARTICIPANTE_PASSWORD],
  ]) {
    assert.ok(senha && (id || email));
    let q = cliente.schema("public").from("usuarios").select("*");
    const { data: u, error } = await (id ? q.eq("id", id) : q.eq("email", email.trim().toLowerCase())).single();
    assert.ok(!error && u && u.perfil === perfil);
    assert.match(u.email, /teste/i);
    assert.ok(await require("bcryptjs").compare(senha, u.senha));
    const dados = secoes(u);
    const permitidos = require("../perfil-profissional.cjs").validarProfissional(
      ["fornecedor", "organizador"].includes(perfil) ? dados : { redes_sociais: dados.redes_sociais }, perfil);
    for (const [k, v] of Object.entries(permitidos)) assert.deepEqual(v, dados[k], "ORIGINAL_NAO_RESTAURAVEL");
    contas.push({ original: u, esperado: structuredClone(u), senha, token: null, tocada: false });
  }
  registrar("quatro contas de teste existentes confirmadas por papel e senha; originais restauráveis");
  async function iniciarServidor() {
    delete require.cache[require.resolve("../server.js")];
    const app = require("../server.js");
    return new Promise((resolve, reject) => {
      const s = app.listen(3001, "localhost", () => resolve(s)); s.once("error", reject);
    });
  }
  let servidor = await iniciarServidor();
  let navegador, backup;
  async function http(method, rota, token, body, status = 200) {
    const r = await fetch("http://localhost:3001" + rota, { method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
    assert.equal(r.status, status, `HTTP_${method}_${rota}_${r.status}_ESPERADO_${status}`);
    return r.json();
  }
  const rota = "/perfil/profissional";
  async function login(c) {
    const r = await http("POST", "/login", null, { email: c.original.email, senha: c.senha });
    const claims = require("jsonwebtoken").verify(r.token, env.JWT_SECRET, { algorithms: ["HS256"] });
    assert.equal(claims.id, c.original.id); assert.equal(claims.perfil, c.original.perfil);
    c.token = r.token;
  }
  async function ler(c) {
    const { data, error } = await cliente.schema("public").from("usuarios").select("*").eq("id", c.original.id).single();
    assert.ok(!error && data, "LEITURA_RECUSADA"); return data;
  }
  async function conferirTodas() {
    for (const c of contas) assert.ok(igual(await ler(c), c.esperado), "REGISTRO_DIVERGENTE");
  }
  async function salvar(c, body) {
    c.tocada = true;
    // Registrar intenção antes da chamada para permitir restauração se a resposta se perder.
    c.anterior = structuredClone(c.esperado);
    Object.assign(c.esperado, require("../perfil-profissional.cjs").validarProfissional(body, c.original.perfil));
    const r = await http("PATCH", rota + "?usuario_id=999999", c.token, body);
    assert.equal(r.id, c.original.id);
    assert.deepEqual(secoes(r), secoes(c.esperado));
    await conferirTodas(); return r;
  }
  try {
    for (const c of contas) await login(c);
    etapa = "flag de ativacao";
    const flag = env.PERFIL_PROFISSIONAL_ATIVO;
    env.PERFIL_PROFISSIONAL_ATIVO = "false";
    await http("GET", rota, contas[0].token, undefined, 503);
    env.PERFIL_PROFISSIONAL_ATIVO = "true";
    for (const c of contas) {
      const r = await http("GET", rota, c.token);
      assert.equal(r.edicao_disponivel, true); assert.equal(r.id, c.original.id);
      assert.deepEqual(r.redes_sociais, c.original.redes_sociais);
    }
    report.flagAnterior = flag ?? "ausente";
    registrar("backend real: flag false retorna 503; true habilita GET nas quatro contas");
    etapa = "autenticacao e validacao";
    for (const method of ["GET", "PATCH"]) for (const token of [null, "invalido"]) await http(method, rota, token, method === "PATCH" ? { redes_sociais: {} } : undefined, 401);
    for (const c of contas) {
      for (const url of ["http://example.invalid", "javascript:alert(1)", "//example.invalid", "https://u:p@example.invalid", "https://example.invalid/a\nb", "https://example.invalid\\a"]) await http("PATCH", rota, c.token, { redes_sociais: { instagram: url } }, 400);
      for (const body of [{ id: c.original.id }, { perfil: "fornecedor" }, { email: "nao@example.invalid" }, { senha: "proibida" }, { redes_sociais: { extra: "https://example.invalid" } }]) await http("PATCH", rota, c.token, body, 400);
      if (["admin", "participante"].includes(c.original.perfil)) {
        for (const dados_comerciais of [null, {}, { nome_comercial: "Proibido" }]) await http("PATCH", rota, c.token, { dados_comerciais }, 403);
      } else {
        for (const dados_comerciais of [{ extra: "nao" }, { site_oficial: "http://example.invalid" }]) await http("PATCH", rota, c.token, { dados_comerciais }, 400);
        if (c.original.perfil === "organizador") await http("PATCH", rota, c.token, { dados_comerciais: { categorias_servicos: ["Som"] } }, 400);
      }
    }
    await conferirTodas();
    registrar("401 sem sessão/inválida; 400 URLs inseguras/campos proibidos; 403 comerciais admin/participante; registros intactos");
    backup = fs.mkdtempSync(path.join(os.tmpdir(), "trocaticket-profissional-"));
    fs.writeFileSync(path.join(backup, "restauracao.json"), JSON.stringify(contas.map(c => ({ id: c.original.id, perfil: c.original.perfil, ...secoes(c.original) }))), { flag: "wx", mode: 0o600 });
    navegador = await require("./perfil-navegador.cjs").criarNavegador();
    for (const c of contas) {
      etapa = `consulta/edicao/remocao ${c.original.perfil}`;
      // Cada papel tem uma instância nova do backend de teste. Preserva o limite
      // real de 10 logins/15min e não altera o middleware de produção.
      servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve));
      servidor = await iniciarServidor();
      const redes = Object.fromEntries(["instagram", "linkedin", "facebook", "tiktok", "site_pessoal"].map(k => [k, `https://example.invalid/homologacao/${k}`]));
      await salvar(c, { redes_sociais: redes });
      if (["fornecedor", "organizador"].includes(c.original.perfil)) {
        const dados_comerciais = { nome_comercial: "Homologacao temporaria", descricao: "Validacao\nTemporaria", telefone_comercial: "+55 (11) 1234-5678", email_comercial: "contato@example.invalid", cidade: "São Paulo", site_oficial: "https://example.invalid", ...(c.original.perfil === "fornecedor" ? { categorias_servicos: ["Som", "Iluminação"] } : {}) };
        await salvar(c, { dados_comerciais });
      }
      assert.deepEqual(secoes(await http("GET", rota, c.token)), secoes(c.esperado));
      await login(c);
      assert.deepEqual(secoes(await http("GET", rota, c.token)), secoes(c.esperado));
      await salvar(c, { redes_sociais: {} });
      await salvar(c, { redes_sociais: { instagram: redes.instagram } });
      // Navegador salva as mesmas informações mínimas; remove redes ao terminar.
      if (["fornecedor", "organizador"].includes(c.original.perfil)) await salvar(c, { dados_comerciais: { nome_comercial: "Homologacao temporaria" } });
      await navegador.profissional(c.original.email, c.senha, c.original.perfil, { instagram: redes.instagram }, c.esperado.dados_comerciais);
      c.esperado.redes_sociais = null;
      await conferirTodas();
      if (["fornecedor", "organizador"].includes(c.original.perfil)) await salvar(c, { dados_comerciais: null });
      await http("GET", "/perfil", c.token);
      registrar(`${c.original.perfil}: API consulta/edita/remove; Chrome salva, recarrega, sai/entra e remove; persistência Supabase e isolamento confirmados`);
    }
  } finally {
    const etapaTeste = etapa;
    etapa = "restauracao";
    let falha;
    for (const c of contas.filter(c => c.tocada)) {
      try {
        const atual = await ler(c);
        // Impede sobrescrever mudanças concorrentes nos campos editados.
        const candidatos = [c.esperado, c.anterior, c.original, { ...c.esperado, redes_sociais: null }];
        assert.ok(candidatos.some(v => igual(secoes(atual), secoes(v))), "ALTERACAO_CONCORRENTE");
        const body = ["fornecedor", "organizador"].includes(c.original.perfil) ? secoes(c.original) : { redes_sociais: c.original.redes_sociais };
        await http("PATCH", rota, c.token, body);
        assert.ok(igual(await ler(c), c.original), "RESTAURACAO_DIVERGENTE");
        c.esperado = structuredClone(c.original);
        assert.deepEqual(secoes(await http("GET", rota, c.token)), { ...secoes(c.original), ...(["admin", "participante"].includes(c.original.perfil) ? { dados_comerciais: null } : {}) });
      } catch { falha = true; }
    }
    try {
      if (!falha) {
        await conferirTodas(); report.restaurado = true;
        registrar("restauração exata das quatro contas confirmada; credenciais e demais campos preservados");
        if (backup) { fs.unlinkSync(path.join(backup, "restauracao.json")); fs.rmdirSync(backup); }
      } else report.recuperacao = backup;
    } finally {
      if (navegador) await navegador.fechar();
      servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve));
      assert.ok(envOriginal.equals(fs.readFileSync(".env")), "ENV_ALTERADO");
    }
    assert.ok(!falha, "RESTAURACAO_PENDENTE");
    etapa = etapaTeste;
  }
}
main().catch(e => {
  report.falha = { etapa, codigo: /^[A-Z0-9_]+$/.test(e.code || "") ? e.code : "VALIDACAO_RECUSADA" };
  // Não incluir valores das assertions nem erros brutos de transporte.
  console.error(JSON.stringify(report.falha)); process.exitCode = 1;
}).finally(() => {
  report.fim = new Date().toISOString();
  fs.writeFileSync(path.join(raiz, "evidencias/perfil-profissional-real-20261103.json"), JSON.stringify(report, null, 2) + "\n");
});
