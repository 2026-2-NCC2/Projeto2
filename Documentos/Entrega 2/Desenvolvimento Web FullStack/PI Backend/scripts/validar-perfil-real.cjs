"use strict";

// Execução manual autorizada: escrita e restauração em UMA conta de homologação.
// Não imprime credenciais, dados pessoais, hashes ou tokens; não executa SQL.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const raiz = path.resolve(__dirname, "..");
process.chdir(raiz);
require("dotenv").config({ quiet: true });
const campos = ["nome", "telefone", "biografia"];
const selecionar = u => Object.fromEntries(campos.map(k => [k, u[k]]));
const registrar = etapa => console.log(JSON.stringify({ etapa, aprovado: true }));

async function main() {
  const navegadorAtivo = process.argv.includes("--navegador");
  assert.deepEqual(process.argv.slice(2), navegadorAtivo ? ["--executar-autorizado", "--navegador"] : ["--executar-autorizado"]);
  const env = process.env;
  assert.equal(env.DB_PROVIDER, "supabase");
  assert.equal(env.SUPABASE_URL, env.HOMOLOG_SUPABASE_URL);
  assert.ok(env.HOMOLOG_ADMIN_EMAIL && env.HOMOLOG_ADMIN_PASSWORD);
  const cliente = require("../db-supabase.cjs").criarClienteSupabase();
  const repo = require("../repositories/supabase/usuarios.cjs").criarRepositorioUsuarios(cliente);
  const conta = await repo.buscarParaLogin(env.HOMOLOG_ADMIN_EMAIL.trim().toLowerCase());
  assert.ok(conta && conta.perfil === "admin");
  assert.ok(await require("bcryptjs").compare(env.HOMOLOG_ADMIN_PASSWORD, conta.senha));
  async function consultar() {
    const { data, error } = await cliente.schema("public").from("usuarios")
      .select("id,nome,email,senha,perfil,telefone,biografia").eq("id", conta.id).single();
    assert.ok(!error && data, "LEITURA_DIRETA_RECUSADA");
    return data;
  }
  const original = await consultar();
  const restauracao = Object.fromEntries(campos.map(k => [k, original[k] ?? ""]));
  assert.deepEqual(require("../perfil.cjs").validarAlteracoesPerfil(restauracao), selecionar(original),
    "VALORES_ORIGINAIS_NAO_RESTAURAVEIS_PELA_API");
  const app = require("../server.js");
  const servidor = await new Promise((resolve, reject) => {
    const s = app.listen(navegadorAtivo ? 3001 : 0, navegadorAtivo ? "localhost" : "127.0.0.1", () => resolve(s));
    s.once("error", reject);
  });
  const url = `http://${navegadorAtivo ? "localhost" : "127.0.0.1"}:${servidor.address().port}`;
  async function http(method, rota, token, body, status = 200) {
    const resposta = await fetch(url + rota, { method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
    assert.equal(resposta.status, status, `HTTP_${method}_${rota}`);
    return resposta.json();
  }
  async function login(email, senha, id, perfil) {
    const r = await http("POST", "/login", null, { email, senha });
    const claims = require("jsonwebtoken").verify(r.token, env.JWT_SECRET, { algorithms: ["HS256"] });
    assert.equal(claims.id, id); assert.equal(claims.perfil, perfil);
    return r.token;
  }
  const perfilValido = p => {
    assert.deepEqual(Object.keys(p).sort(), ["id", "nome", "email", "telefone", "biografia", "edicao_disponivel"].sort());
    assert.equal(p.edicao_disponivel, true);
    assert.equal(typeof p.nome, "string"); assert.equal(typeof p.email, "string");
    for (const k of ["telefone", "biografia"]) assert.ok(p[k] === null || typeof p[k] === "string");
  };
  let token, tentouEscrita = false, backup, navegador;
  const novo = { nome: `Homologacao perfil ${randomUUID().slice(0, 8)}`,
    telefone: "+55 (11) 99999-0000", biografia: `Validacao temporaria ${randomUUID()}` };
  try {
    token = await login(conta.email, env.HOMOLOG_ADMIN_PASSWORD, conta.id, conta.perfil);
    const antes = await http("GET", "/perfil", token);
    perfilValido(antes); assert.deepEqual(selecionar(antes), selecionar(original));
    registrar("GET /perfil: quatro campos e edicao habilitada");
    for (const campo of ["email", "senha", "id", "perfil"]) {
      await http("PATCH", "/perfil", token, { nome: novo.nome, [campo]: campo === "id" ? conta.id + 1 : "proibido" }, 400);
    }
    assert.deepEqual(await consultar(), original);
    registrar("email, senha, ID e perfil rejeitados com 400 e registro intacto");
    // Artefato privado de recuperação contém somente ID e campos editáveis.
    backup = fs.mkdtempSync(path.join(os.tmpdir(), "trocaticket-perfil-"));
    fs.writeFileSync(path.join(backup, "restauracao.json"), JSON.stringify({ id: conta.id, ...selecionar(original) }), { mode: 0o600, flag: "wx" });
    tentouEscrita = true;
    // Exercitar o serviço React real contra a API real, sem simular fetch.
    const origem = fs.readFileSync(path.join(raiz, "../PI React/src/services/perfil.js"), "utf8")
      .replace(/^import .*\r?\n/gm, "").replace("export async function", "async function");
    let evento;
    const salvar = vm.runInNewContext(origem + "\nsalvarPerfil", {
      apiUrl: rota => url + rota, fetch, sessionStorage: { getItem: () => token },
      window: { dispatchEvent: e => { evento = e; } },
      CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    });
    if (navegadorAtivo) {
      navegador = await require("./perfil-navegador.cjs").criarNavegador();
      await navegador.salvarERecarregar(conta.email, env.HOMOLOG_ADMIN_PASSWORD, novo);
      registrar("Chrome real: salvar formulario, atualizar pagina e sair/entrar novamente");
    }
    const salvo = navegadorAtivo ? await http("GET", "/perfil", token) : await salvar(token, novo, AbortSignal.timeout(20000));
    perfilValido(salvo); assert.deepEqual(selecionar(salvo), novo);
    if (!navegadorAtivo) {
      assert.equal(evento.type, "trocaticket:perfil-atualizado");
      assert.equal(evento.detail.token, token);
    }
    assert.deepEqual(selecionar(await consultar()), novo);
    registrar("servico React PATCH e persistencia direta no Supabase");
    // Nova consulta sem cache representa a leitura feita ao remontar a página.
    const recarregado = await http("GET", "/perfil", token);
    assert.deepEqual(selecionar(recarregado), novo);
    token = await login(conta.email, env.HOMOLOG_ADMIN_PASSWORD, conta.id, conta.perfil);
    assert.deepEqual(selecionar(await http("GET", "/perfil", token)), novo);
    const persistido = await consultar();
    for (const k of ["email", "senha", "id", "perfil"]) assert.equal(persistido[k], original[k]);
    registrar("nova leitura e novo login preservam alteracoes e campos protegidos");
    // Outras três contas: somente login e GET, com seletores de homologação já usados no projeto.
    for (const [perfil, id, email] of [["participante", null, env.HOMOLOG_PARTICIPANTE_EMAIL],
      ["organizador", 4, null], ["fornecedor", 3, null]]) {
      assert.ok(env.HOMOLOG_PARTICIPANTE_PASSWORD);
      let q = cliente.schema("public").from("usuarios").select("id,email,perfil,senha");
      q = email ? q.eq("email", email.trim().toLowerCase()) : q.eq("id", id);
      const { data: u, error } = await q.single();
      assert.ok(!error && u && u.perfil === perfil);
      if (!email) assert.match(u.email, /teste/i);
      assert.ok(await require("bcryptjs").compare(env.HOMOLOG_PARTICIPANTE_PASSWORD, u.senha));
      const t = await login(u.email, env.HOMOLOG_PARTICIPANTE_PASSWORD, u.id, perfil);
      const p = await http("GET", "/perfil", t); perfilValido(p); assert.equal(p.id, u.id);
      registrar(`login e GET /perfil real: ${perfil}`);
    }
  } finally {
    try {
      if (tentouEscrita) {
        const atual = await consultar();
        const dados = selecionar(atual);
        assert.ok(JSON.stringify(dados) === JSON.stringify(novo) || JSON.stringify(dados) === JSON.stringify(selecionar(original)),
          "ALTERACAO_CONCORRENTE: backup preservado");
        await http("PATCH", "/perfil", token, restauracao);
        assert.deepEqual(await consultar(), original);
        assert.deepEqual(selecionar(await http("GET", "/perfil", token)), selecionar(original));
        registrar("restauracao exata confirmada no Supabase e GET /perfil");
      }
      if (backup) {
        fs.unlinkSync(path.join(backup, "restauracao.json")); fs.rmdirSync(backup);
      }
    } catch {
      console.error(JSON.stringify({ etapa: "restauracao", aprovado: false, backup }));
      process.exitCode = 1;
    } finally {
      if (navegador) await navegador.fechar();
      servidor.closeAllConnections();
      await new Promise(resolve => servidor.close(resolve));
    }
  }
}
main().catch(erro => {
  // Mensagem de assertion não inclui valores privados; detalhes/stack são omitidos.
  console.error(JSON.stringify({ etapa: "validacao", aprovado: false,
    codigo: erro.code === "ERR_ASSERTION" ? "ASSERTION" : "EXECUCAO_RECUSADA" }));
  process.exitCode = 1;
});
