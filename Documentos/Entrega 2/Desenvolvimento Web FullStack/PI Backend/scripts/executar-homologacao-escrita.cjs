"use strict";
// Entrada exclusiva do roteiro autorizado. Sem retry de escrita ou acesso MySQL.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), bcrypt = require("bcryptjs"), jwt = require("jsonwebtoken");
const { criarControle, iniciar, TABELAS } = require("../homologacao-escrita.cjs");
const { validarCatalogo } = require("./catalogo-homologacao-escrita.cjs");
const { limparDescartaveis } = require("./limpeza-homologacao-escrita.cjs");
const fetchLocal = global.fetch;
const raiz = path.resolve(__dirname, ".."), runId = crypto.randomUUID().replace(/-/g, ""), marcador = "TT-HW-" + runId;
const arquivo = path.join(raiz, "fixtures", "hw-" + runId + ".manifesto.json");
const manifesto = { runId, marcador, projectRef: "gnwybroqfvwosiqzsfla", estado: "PREPARACAO", checks: [], endpoints: [],
  createdIds: Object.fromEntries(TABELAS.map(t => [t, []])), registros: Object.fromEntries(TABELAS.map(t => [t, []])), tentativas: [], residuos: null };
const controle = criarControle();
let app, etapa = "catalogo", adminAntes, adminId;
function salvar() { fs.writeFileSync(arquivo, JSON.stringify(manifesto, null, 2) + "\n", { mode: 0o600 }); }
function check(ok, nome) { assert.ok(ok, nome); manifesto.checks.push(nome); salvar(); }
function guardar(table, row, origem) {
  assert.ok(Number.isSafeInteger(row.id) && row.id > 0, "ID positivo");
  if (!manifesto.createdIds[table].includes(row.id)) {
    manifesto.createdIds[table].push(row.id); manifesto.registros[table].push({ ...row, origem }); salvar();
  }
}
function limparSegredos(body) {
  if (!body || typeof body !== "object") return body;
  return Object.fromEntries(Object.entries(body).filter(([k]) => !/senha|password|token|secret/i.test(k)));
}
async function registrar(e) {
  if (e.phase === "antes") {
    manifesto.tentativas.push({ etapa, method: e.method, tabela: e.tabela, body: limparSegredos(e.body), estado: "ENVIANDO" });
    salvar(); return;
  }
  const tentativa = manifesto.tentativas.at(-1);
  tentativa.estado = e.phase;
  if (e.phase === "confirmada" && e.method === "POST") {
    if (TABELAS.includes(e.tabela)) {
      for (const row of Array.isArray(e.data) ? e.data : [e.data]) guardar(e.tabela, { ...limparSegredos(e.body), ...row }, "POST_CONFIRMADO");
    } else if (e.tabela === "rpc/substituir_custos_evento") {
      for (const row of e.data) guardar("custos_evento", row, "RPC_CUSTOS");
    } else if (e.tabela === "rpc/publicar_cotacao") guardar("cotacoes", { id: e.data.id, evento_id: e.body.p_evento_id, observacoes: e.body.p_observacoes }, "RPC_PUBLICACAO");
  }
  salvar();
}
const params = entries => new URLSearchParams(entries).toString();
const idFilter = ids => "in.(" + ids.join(",") + ")";
async function rest(method, table, filtros = [], body, select = "*") {
  const route = "/rest/v1/" + table + "?" + params([...filtros, ["select", select]]);
  if (method !== "GET") controle.armarEscrita(method, route, body);
  try {
    const response = await app.fetch(app.config.SUPABASE_URL + route, { method, headers: {
      apikey: app.config.SUPABASE_SECRET_KEY, authorization: "Bearer " + app.config.SUPABASE_SECRET_KEY,
      "accept-profile": "public", "content-profile": "public", "content-type": "application/json", Prefer: "return=representation",
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, "REST HTTP " + response.status);
    const rows = await response.json(); assert.ok(Array.isArray(rows), "REST array"); return rows;
  } finally { controle.limpar(); }
}
async function ler(table, col, ids, select = "*") {
  if (!ids.length) return [];
  return rest("GET", table, [[col, idFilter(ids)]], undefined, select);
}
async function http(method, route, body, token, status, permissao) {
  const authorization = token ? "Bearer " + token : undefined;
  controle.armarHttp(method, route, authorization);
  if (permissao) controle.armarEscrita(permissao.method, permissao.route, permissao.body, permissao.conferir);
  try {
    const response = await fetchLocal("http://127.0.0.1:3111" + route, { method, redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { ...(authorization ? { authorization } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    // Registrar somente status/rota. Nao gravar corpo, senha ou JWT.
    manifesto.endpoints.push({ etapa, method, route, status: response.status, esperado: status }); salvar();
    assert.equal(response.status, status, "HTTP " + method + " " + route);
    if (status >= 400) assert.deepEqual(Object.keys(data), ["erro"]);
    return data;
  } finally { controle.limpar(); }
}
function insert(table, body, conferir) { return { method: "POST", route: "/rest/v1/" + table + "?select=id", body, conferir }; }
function rpc(name, body) { return { method: "POST", route: "/rest/v1/rpc/" + name, body }; }
function updateEvent(id, owner, body, extra = []) {
  return { method: "PATCH", route: "/rest/v1/eventos?" + params([["id", "eq." + id], ["usuario_id", "eq." + owner], ...extra, ["select", "id"]]), body };
}
async function conferirSemMutacao(table, ids, fn) {
  const before = await ler(table, "id", ids); await fn(); const after = await ler(table, "id", ids);
  assert.deepEqual(after, before, "Negativa preserva estado");
}
async function negarSemEscrita(method, route, body, token, status) {
  const antes = controle.contagem.escritas;
  await http(method, route, body, token, status);
  assert.equal(controle.contagem.escritas, antes, "Recusa antes da mutacao SDK");
}
async function identificarItens(quote) {
  for (const row of await ler("itens_cotacao", "cotacao_id", [quote])) {
    assert.ok(row.descricao.startsWith(marcador)); guardar("itens_cotacao", row, "FILHO_RPC_CONFIRMADA");
  }
}
function pertence(table, row) {
  const ids = manifesto.createdIds;
  if (table === "usuarios") return row.nome.startsWith(marcador) && row.email.includes(runId);
  if (table === "eventos") return row.nome.startsWith(marcador) && row.descricao.startsWith(marcador) && ids.usuarios.includes(row.usuario_id);
  if (["custos_evento", "itens_cotacao"].includes(table)) return row.descricao.startsWith(marcador) &&
    (table === "custos_evento" ? ids.eventos.includes(row.evento_id) : ids.cotacoes.includes(row.cotacao_id));
  if (table === "cotacoes") return row.observacoes === marcador && ids.eventos.includes(row.evento_id);
  if (table === "propostas") return row.detalhes_tecnicos.startsWith(marcador) && ids.cotacoes.includes(row.cotacao_id) && ids.usuarios.includes(row.fornecedor_id);
  if (table === "solicitacoes_acesso") return row.justificativa === marcador && ids.usuarios.includes(row.usuario_id);
  if (table === "inscricoes") return ids.usuarios.includes(row.usuario_id) && ids.eventos.includes(row.evento_id);
  return false;
}
async function reconciliar() {
  // Leitura apenas. Registros sem resposta podem ser encontrados por chaves
  // exclusivas cuja ausencia foi confirmada ANTES da primeira escrita.
  const emails = atores.map(a => a.email);
  for (const row of await rest("GET", "usuarios", [["email", idFilter(emails)]], undefined, "id,nome,email,perfil")) {
    assert.ok(pertence("usuarios", row)); guardar("usuarios", row, "RECONCILIACAO_CHAVE_EXCLUSIVA");
  }
  const ligacoes = [["eventos", "usuario_id", "usuarios"], ["solicitacoes_acesso", "usuario_id", "usuarios"],
    ["custos_evento", "evento_id", "eventos"], ["cotacoes", "evento_id", "eventos"],
    ["itens_cotacao", "cotacao_id", "cotacoes"], ["propostas", "cotacao_id", "cotacoes"], ["inscricoes", "evento_id", "eventos"]];
  for (const [table, col, parent] of ligacoes) for (const row of await ler(table, col, manifesto.createdIds[parent])) {
    assert.ok(pertence(table, row), "Registro externo detectado"); guardar(table, row, "RECONCILIACAO_VINCULO_EXCLUSIVO");
  }
}
async function limpar(catalogo) {
  manifesto.residuos = await limparDescartaveis({ ids: manifesto.createdIds, foreignKeys: catalogo.foreign_keys, pertence,
    ler: (table, col, ids) => ler(table, col, ids, table === "usuarios" ? "id,nome,email,perfil" : "*"),
    remover: (table, id) => rest("DELETE", table, [["id", "eq." + id]], undefined, "id") });
  salvar();
}
const template = JSON.parse(fs.readFileSync(path.join(raiz, "fixtures/homologacao-escrita.modelo.json"), "utf8").replaceAll("${RUN_ID_ALEATORIO}", runId));
const atores = template.atores.map(a => ({ ...a, senha: crypto.randomBytes(36).toString("base64url") }));
async function executar() {
  const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, "fixtures/homologacao-escrita.catalogo-20261031.json"), "utf8"))[0].preflight_homologacao_escrita;
  manifesto.catalogo = validarCatalogo(catalogo); salvar();
  if (process.argv.includes("--preparar")) { console.log(JSON.stringify({ estado: "PREPARADO_SEM_CONEXOES", manifesto: arquivo })); return; }
  assert.deepEqual(process.argv.slice(2), ["--executar-autorizado"], "Entrada explicita");
  const privado = require("dotenv").parse(fs.readFileSync(path.join(raiz, ".env"), "utf8"));
  assert.ok(privado.HOMOLOG_ADMIN_EMAIL && privado.HOMOLOG_ADMIN_PASSWORD, "Admin de teste configurado");
  assert.equal(require("../config/banco.cjs").lerConfiguracaoBanco(privado).provider, "mysql");
  app = await iniciar(controle, registrar);
  try {
    etapa = "preflight";
    // SDK do app e leituras de controle usam o MESMO transporte restrito.
    assert.equal((await rest("GET", "usuarios", [["email", idFilter(atores.map(a => a.email))]], undefined, "id")).length, 0);
    manifesto.fixturesAusentesAntes = true; salvar();
    const adminRows = await rest("GET", "usuarios", [["email", "eq." + privado.HOMOLOG_ADMIN_EMAIL]], undefined, "id,nome,email,perfil");
    assert.equal(adminRows.length, 1); assert.equal(adminRows[0].perfil, "admin"); adminAntes = adminRows[0]; adminId = adminAntes.id;
    const loginAdmin = await http("POST", "/login", { email: privado.HOMOLOG_ADMIN_EMAIL, senha: privado.HOMOLOG_ADMIN_PASSWORD }, undefined, 200);
    const adminToken = loginAdmin.token;
    assert.equal(jwt.verify(adminToken, app.config.JWT_SECRET, { algorithms: ["HS256"] }).id, adminId);
    check(controle.contagem.mysqlTentativas === 0, "projeto e processo sem MySQL");
    console.log(JSON.stringify({ etapa, estado: "OK", runId, pid: process.pid }));
    etapa = "cadastros";
    for (const a of atores) {
      const body = { nome: a.nome, email: a.email, senha: a.senha, perfil: "participante" };
      const permit = insert("usuarios", undefined, async row => Object.keys(row).sort().join(",") === "email,nome,perfil,senha" &&
        row.nome === a.nome && row.email === a.email && row.perfil === "participante" && /^\$2[aby]\$12\$/.test(row.senha) && await bcrypt.compare(a.senha, row.senha));
      const r = await http("POST", "/usuarios", body, undefined, 201, permit);
      a.id = r.usuario.id; assert.equal(r.usuario.perfil, "participante"); assert.ok(!Object.hasOwn(r.usuario, "senha"));
      assert.ok(manifesto.createdIds.usuarios.includes(a.id));
      const login = await http("POST", "/login", { email: a.email, senha: a.senha }, undefined, 200);
      a.token = login.token; const claims = jwt.verify(a.token, app.config.JWT_SECRET, { algorithms: ["HS256"] });
      assert.equal(claims.id, a.id); assert.equal(claims.exp - claims.iat, 3600);
    }
    await http("POST", "/usuarios", { nome: atores[0].nome, email: atores[0].email, senha: atores[0].senha, perfil: "participante" }, undefined, 409);
    check(manifesto.createdIds.usuarios.length === 4, "quatro cadastros e duplicidade preservada");
    const [oa, ob, fa, pa] = atores;
    etapa = "acesso";
    for (const [i, a] of atores.entries()) {
      const perfil = i === 2 ? "fornecedor" : "organizador", decisao = i === 3 ? "rejeitado" : "aprovado";
      const body = { perfil_solicitado: perfil, justificativa: marcador };
      const r = await http("POST", "/solicitacoes-acesso", body, a.token, 201, insert("solicitacoes_acesso", { usuario_id: a.id, perfil_solicitado: perfil, justificativa: marcador }));
      const id = r.solicitacao.id;
      if (i === 3) await http("POST", "/solicitacoes-acesso", body, a.token, 409);
      if (i === 3) await negarSemEscrita("PATCH", "/solicitacoes-acesso/" + id, { status: decisao }, a.token, 403);
      await http("PATCH", "/solicitacoes-acesso/" + id, { status: decisao }, adminToken, 200,
        rpc("decidir_solicitacao_acesso", { p_admin_id: adminId, p_solicitacao_id: String(id), p_status: decisao }));
      const user = (await ler("usuarios", "id", [a.id], "id,perfil"))[0];
      const pedido = (await ler("solicitacoes_acesso", "id", [id]))[0];
      assert.equal(user.perfil, i === 3 ? "participante" : perfil); assert.equal(pedido.status, decisao);
      if (i === 3) await conferirSemMutacao("solicitacoes_acesso", [id], () => http("PATCH", "/solicitacoes-acesso/" + id,
        { status: "aprovado" }, adminToken, 409, rpc("decidir_solicitacao_acesso", { p_admin_id: adminId, p_solicitacao_id: String(id), p_status: "aprovado" })));
    }
    check(true, "decisoes atomicas e perfis atuais com JWT anterior");
    console.log(JSON.stringify({ etapa, estado: "OK", usuariosCriados: 4 }));
    etapa = "eventos";
    const data = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const eventos = [];
    for (const e of template.eventos) {
      const dono = e.dono === "O_B" ? ob : oa;
      const body = { nome: e.nome, data, horario: e.horario, local: e.local, categoria: e.categoria, publico: e.publico, descricao: e.descricao };
      const r = await http("POST", "/eventos", body, dono.token, 201, insert("eventos", { ...body, status: "Em planejamento", usuario_id: dono.id }));
      eventos.push({ id: r.evento.id, dono, body });
    }
    const [fluxo, alheio, excluir] = eventos;
    const editado = { ...fluxo.body, local: "Local sintetico revisado" };
    await http("PUT", "/eventos/" + fluxo.id, editado, oa.token, 200, updateEvent(fluxo.id, oa.id, editado));
    assert.equal((await ler("eventos", "id", [fluxo.id]))[0].local, editado.local);
    await conferirSemMutacao("eventos", [alheio.id], () => http("PUT", "/eventos/" + alheio.id, editado, oa.token, 404, updateEvent(alheio.id, oa.id, editado)));
    await http("POST", "/participante/inscricoes", { evento_id: fluxo.id }, pa.token, 404);
    const writesAntes = controle.contagem.escritas;
    await http("PUT", "/eventos/" + fluxo.id, editado, pa.token, 403);
    await http("POST", "/eventos", fluxo.body, undefined, 401);
    check(controle.contagem.escritas === writesAntes, "evento nega perfil e token sem mutacao");
    etapa = "custos";
    await negarSemEscrita("PUT", "/eventos/" + fluxo.id + "/custos", { custos: template.custos }, fa.token, 403);
    for (const custos of [template.custos, template.custosRevisados]) {
      const resposta = await http("PUT", "/eventos/" + fluxo.id + "/custos", { custos }, oa.token, 200,
        rpc("substituir_custos_evento", { p_evento_id: fluxo.id, p_usuario_id: oa.id, p_custos: custos }));
      assert.deepEqual(resposta.map(({ categoria, descricao, valor_estimado }) => ({ categoria, descricao, valor_estimado })), custos);
      const get = await http("GET", "/eventos/" + fluxo.id + "/custos", undefined, oa.token, 200);
      assert.deepEqual(get, resposta);
    }
    await conferirSemMutacao("custos_evento", manifesto.createdIds.custos_evento, () => http("PUT", "/eventos/" + fluxo.id + "/custos",
      { custos: template.custos }, ob.token, 404, rpc("substituir_custos_evento", { p_evento_id: fluxo.id, p_usuario_id: ob.id, p_custos: template.custos })));
    check(true, "custos RPC inteiros e decimais via HTTP e GET");
    etapa = "cotacao";
    const prazo = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const hoje = new Date().toISOString().slice(0, 10);
    const cotBody = { evento_id: fluxo.id, prazo, observacoes: marcador, itens: template.custos };
    await negarSemEscrita("POST", "/cotacoes", cotBody, pa.token, 403);
    const argsPublicar = itens => ({ p_usuario_id: oa.id, p_evento_id: fluxo.id, p_prazo: prazo, p_hoje_utc: hoje, p_observacoes: marcador, p_itens: itens });
    await http("POST", "/cotacoes", cotBody, oa.token, 409, rpc("publicar_cotacao", argsPublicar(template.custos)));
    assert.equal((await ler("cotacoes", "evento_id", [fluxo.id])).length, 0);
    const publicada = await http("POST", "/cotacoes", { ...cotBody, itens: template.custosRevisados }, oa.token, 201,
      rpc("publicar_cotacao", argsPublicar(template.custosRevisados)));
    const quote = publicada.cotacao.id; await identificarItens(quote);
    assert.deepEqual(publicada.cotacao.itens, template.custosRevisados);
    assert.equal((await ler("itens_cotacao", "cotacao_id", [quote])).length, 2);
    check(true, "publicacao atomica 201 e revisao obsoleta 409 sem filhos");
    etapa = "propostas";
    for (const p of template.propostas) {
      const body = { cotacao_id: quote, valor: p.valor, condicoes_pagamento: p.condicoes_pagamento, detalhes_tecnicos: p.detalhes_tecnicos };
      if (p.alias === "PR_APROVAR") await negarSemEscrita("POST", "/fornecedor/propostas", body, pa.token, 403);
      const r = await http("POST", "/fornecedor/propostas", body, fa.token, 201, insert("propostas", { cotacao_id: quote, fornecedor_id: fa.id,
        valor: Number(p.valor), condicoes_pagamento: p.condicoes_pagamento, detalhes_tecnicos: p.detalhes_tecnicos }));
      const id = r.proposta_id, args = { p_proposta_id: String(id), p_organizador_id: oa.id, p_status: p.avaliacao };
      await negarSemEscrita("PATCH", "/organizador/propostas/" + id + "/status", { status: p.avaliacao }, fa.token, 403);
      await conferirSemMutacao("propostas", [id], () => http("PATCH", "/organizador/propostas/" + id + "/status", { status: p.avaliacao }, ob.token, 404,
        rpc("avaliar_proposta", { ...args, p_organizador_id: ob.id })));
      await http("PATCH", "/organizador/propostas/" + id + "/status", { status: p.avaliacao }, oa.token, 200, rpc("avaliar_proposta", args));
      assert.equal((await ler("propostas", "id", [id]))[0].status, p.avaliacao);
      await conferirSemMutacao("propostas", [id], () => http("PATCH", "/organizador/propostas/" + id + "/status", { status: p.avaliacao }, oa.token, 404, rpc("avaliar_proposta", args)));
    }
    check(true, "avaliar proposta condicional 200 e 404 integrado");
    etapa = "publicacao_inscricao";
    const permitPublicar = updateEvent(fluxo.id, oa.id, { status: "Ativo" }, [["status", "eq.Em planejamento"]]);
    await http("PATCH", "/eventos/" + fluxo.id + "/publicar", undefined, oa.token, 200, permitPublicar);
    await http("PATCH", "/eventos/" + fluxo.id + "/publicar", undefined, oa.token, 404, permitPublicar);
    const inscricao = { evento_id: fluxo.id };
    await negarSemEscrita("POST", "/participante/inscricoes", inscricao, fa.token, 403);
    await http("POST", "/participante/inscricoes", inscricao, pa.token, 201, insert("inscricoes", { usuario_id: pa.id, evento_id: fluxo.id }));
    await http("POST", "/participante/inscricoes", inscricao, pa.token, 409);
    assert.equal((await ler("inscricoes", "evento_id", [fluxo.id])).length, 1);
    check(true, "evento ativo e inscricao unica persistidos");
    etapa = "exclusao_endpoint";
    const permitDelete = { method: "DELETE", route: "/rest/v1/eventos?" + params([["id", "eq." + excluir.id], ["usuario_id", "eq." + oa.id], ["select", "id"]]) };
    await http("DELETE", "/eventos/" + excluir.id, undefined, oa.token, 200, permitDelete);
    assert.equal((await ler("eventos", "id", [excluir.id])).length, 0);
    await http("DELETE", "/eventos/" + excluir.id, undefined, oa.token, 404, permitDelete);
    check(true, "DELETE somente fixture reservada");
    manifesto.estado = "TESTES_APROVADOS"; salvar();
  } catch (e) {
    manifesto.estado = "INTERROMPIDA";
    manifesto.falha = { etapa, code: /^HW_/.test(e.code ?? "") ? e.code : "VALIDACAO_OU_TRANSPORTE", detalhe: e.code === "ERR_ASSERTION" ? String(e.message).split("\n")[0].slice(0, 100) : undefined };
    process.exitCode = 1; salvar();
  } finally {
    try {
      etapa = "reconciliacao_limpeza";
      await reconciliar();
      await limpar(catalogo);
      if (adminAntes) assert.deepEqual((await ler("usuarios", "id", [adminId], "id,nome,email,perfil"))[0], adminAntes);
      manifesto.adminPreexistentePreservado = !!adminAntes;
      manifesto.mysqlCarregado = Object.keys(require.cache).some(p => /[\\/]mysql2[\\/]|[\\/]PI Backend[\\/]db\.js$/i.test(p));
      assert.equal(manifesto.mysqlCarregado, false); assert.equal(controle.contagem.mysqlTentativas, 0);
      manifesto.estado = manifesto.estado === "TESTES_APROVADOS" ? "APROVADA_E_LIMPA" : "INTERROMPIDA_E_LIMPA";
    } catch (e) {
      manifesto.limpezaFalhou = true; manifesto.limpezaErro = "RECONCILIACAO_OU_DEPENDENCIA_INCERTA"; process.exitCode = 1;
      manifesto.residuos = {};
      for (const table of TABELAS) {
        try { manifesto.residuos[table] = (await ler(table, "id", manifesto.createdIds[table], "id")).map(r => r.id); }
        catch { manifesto.residuos[table] = "NAO_VERIFICADO"; }
      }
    }
    finally { await app.fechar(); manifesto.servidorEncerrado = true; manifesto.contagem = controle.contagem; salvar(); }
    console.log(JSON.stringify({ estado: manifesto.estado, falha: manifesto.falha, limpezaFalhou: !!manifesto.limpezaFalhou,
      criados: Object.fromEntries(TABELAS.map(t => [t, manifesto.createdIds[t].length])), residuos: manifesto.residuos,
      checks: manifesto.checks, endpointsExecutados: manifesto.endpoints.length, manifesto: arquivo, mysqlCarregado: manifesto.mysqlCarregado, servidorEncerrado: manifesto.servidorEncerrado }));
  }
}
if (require.main === module) executar().catch(e => {
  manifesto.estado = "PRECONDICAO_RECUSADA"; manifesto.falha = { etapa, code: /^HW_/.test(e.code ?? "") ? e.code : "CONFIGURACAO_OU_CATALOGO" }; salvar();
  console.log(JSON.stringify({ estado: manifesto.estado, falha: manifesto.falha, manifesto: arquivo })); process.exitCode = 1;
});
