"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const jwt = require("jsonwebtoken");
const fonte = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const segredo = "segredo-ficticio-exclusivo-dos-contratos-12345";
const json = valor => JSON.parse(JSON.stringify(valor));
const usuario = { id: 7, nome: "Pessoa", email: "pessoa@example.invalid", perfil: "organizador" };

// Executa os handlers e middlewares reais. O require fechado impede carregar
// dotenv, drivers, adaptadores, isolamento real ou qualquer dependencia extra.
// A fila SQL e estrita: consultas inesperadas e passos omitidos falham no fim,
// inclusive quando o catch da rota transforma uma falha da simulacao em 500.
function ambiente(perfil = "organizador", passos = []) {
  const rotas = new Map(), chamadas = [], transacao = [], falhas = [], hashes = [];
  let indice = 0;
  async function executar(tipo, sql, params = []) {
    const texto = sql.replace(/\s+/g, " ").trim();
    chamadas.push({ tipo, sql: texto, params: json(params) });
    if (tipo === "execute" && texto === "SELECT id, nome, email, perfil FROM usuarios WHERE id = ?") {
      assert.deepEqual(json(params), [7]);
      return [[{ ...usuario, perfil }]];
    }
    const esperado = passos[indice++];
    try {
      assert.ok(esperado, `SQL inesperado: ${texto}`);
      assert.equal(tipo, esperado.tipo || "execute");
      if (typeof esperado.sql === "string") assert.equal(texto, esperado.sql);
      else assert.match(texto, esperado.sql);
      assert.deepEqual(json(params), esperado.params || []);
    } catch (erro) { falhas.push(erro); throw erro; }
    if (esperado.erro) throw esperado.erro;
    return [structuredClone(esperado.retorno ?? [])];
  }
  const conexao = {
    execute: (sql, params) => executar("tx", sql, params),
    async beginTransaction() { transacao.push("begin"); },
    async commit() { transacao.push("commit"); },
    async rollback() { transacao.push("rollback"); },
    release() { transacao.push("release"); },
  };
  const db = {
    execute: (sql, params) => executar("execute", sql, params),
    query: (sql, params) => executar("query", sql, params),
    async getConnection() { transacao.push("getConnection"); return conexao; },
  };
  const app = { use() {} };
  for (const metodo of ["get", "post", "put", "patch", "delete"]) {
    app[metodo] = (rota, ...handlers) => rotas.set(`${metodo} ${rota}`, handlers);
  }
  const express = Object.assign(() => app, { json: () => () => {} });
  const dependencias = {
    express, cors: () => () => {}, jsonwebtoken: jwt,
    bcryptjs: {
      async hash(senha, custo) { hashes.push([senha, custo]); return "hash-simulado"; },
      async compare(senha, hash) { hashes.push([senha, hash]); return senha === "senha-valida"; },
    },
    "./db": db,
    "./repositories/mysql/usuarios.cjs": require("../repositories/mysql/usuarios.cjs"),
    "./isolamento.cjs": { modoExecucao: () => "principal" },
    dotenv: { config() {} },
  };
  vm.runInNewContext(fonte, {
    module: { exports: {} }, Buffer,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ["2030-01-01T12:00:00Z"])); }
      static now() { return Date.parse("2030-01-01T12:00:00Z"); }
    },
    process: { env: { JWT_SECRET: segredo } }, console: { log() {}, error() {} },
    require(nome) {
      if (!Object.hasOwn(dependencias, nome)) throw Error("Dependencia proibida: " + nome);
      return dependencias[nome];
    },
  });
  async function requisitar(rota, body = {}, opcoes = {}) {
    const req = { body, params: { id: opcoes.id ?? "13" }, ip: "127.0.0.1",
      headers: { authorization: opcoes.semToken ? undefined : `Bearer ${jwt.sign({ id: 7, perfil: "ignorado" }, segredo)}` } };
    const res = { statusCode: 200, headers: {},
      status(codigo) { this.statusCode = codigo; return this; },
      setHeader(nome, valor) { this.headers[nome] = valor; },
      json(dados) { this.body = json(dados); return this; },
    };
    assert.ok(rotas.has(rota), rota);
    for (const handler of rotas.get(rota)) {
      let continuar = false;
      await handler(req, res, () => { continuar = true; });
      if (!continuar) break;
    }
    return res;
  }
  function verificar() {
    assert.deepEqual(falhas, []);
    assert.equal(indice, passos.length, "Todos os passos SQL devem ser consumidos");
  }
  return { rotas, requisitar, verificar, chamadas, transacao, hashes };
}

// null = qualquer perfil autenticado; publico = sem autenticacao.
const contratos = [
  ["get /", "publico"], ["post /usuarios", "publico"], ["post /login", "publico"],
  ["get /eventos", null], ["get /eventos/:id", null], ["get /perfil", null],
  ["get /admin/eventos", "admin"], ["get /usuarios", "admin"],
  ["get /admin/cotacoes", "admin"], ["get /admin/propostas", "admin"],
  ["get /solicitacoes-acesso", "admin"], ["patch /solicitacoes-acesso/:id", "admin"],
  ["get /participante/eventos", "participante"], ["get /participante/inscricoes", "participante"],
  ["post /participante/inscricoes", "participante"], ["post /solicitacoes-acesso", "participante"],
  ["post /eventos", "organizador"], ["put /eventos/:id", "organizador"],
  ["delete /eventos/:id", "organizador"], ["patch /eventos/:id/publicar", "organizador"],
  ["get /eventos/:id/custos", "organizador"], ["put /eventos/:id/custos", "organizador"],
  ["get /cotacoes", "organizador"], ["post /cotacoes", "organizador"],
  ["get /organizador/propostas", "organizador"], ["patch /organizador/propostas/:id/status", "organizador"],
  ["get /fornecedor/cotacoes", "fornecedor"], ["get /fornecedor/propostas", "fornecedor"],
  ["post /fornecedor/propostas", "fornecedor"],
];

test("inventario fixa exatamente os 29 pares metodo/caminho", () => {
  assert.deepEqual([...ambiente().rotas.keys()].sort(), contratos.map(([rota]) => rota).sort());
});
for (const [rota, perfil] of contratos.filter(([, p]) => p !== "publico")) {
  test(`${rota}: exige Bearer antes de consultar banco`, async () => {
    const a = ambiente();
    const r = await a.requisitar(rota, {}, { semToken: true });
    assert.equal(r.statusCode, 401);
    assert.deepEqual(r.body, { erro: "Token não informado." });
    assert.equal(a.chamadas.length, 0); a.verificar();
  });
  if (perfil) test(`${rota}: bloqueia os demais perfis antes da operacao`, async () => {
    for (const outro of ["admin", "organizador", "participante", "fornecedor"].filter(p => p !== perfil)) {
      const a = ambiente(outro);
      const body = { perfil_solicitado: "fornecedor", justificativa: "Solicito acesso" };
      const r = await a.requisitar(rota, body);
      assert.equal(r.statusCode, 403);
      assert.deepEqual(r.body, { erro: rota === "post /solicitacoes-acesso"
        ? "Somente participantes podem solicitar acesso." : "Você não tem permissão para realizar esta ação." });
      assert.equal(a.chamadas.length, 1); assert.deepEqual(a.transacao, []); a.verificar();
    }
  });
}

const listagens = [
  ["get /eventos", "participante", /WHERE usuario_id = \? ORDER BY id DESC$/, [7]],
  ["get /admin/eventos", "admin", /u.nome AS organizador_nome FROM eventos e INNER JOIN usuarios u ON u.id = e.usuario_id ORDER BY e.id DESC$/, []],
  ["get /participante/eventos", "participante", /WHERE status = 'Ativo' ORDER BY data ASC, id ASC$/, []],
  ["get /participante/inscricoes", "participante", /WHERE i.usuario_id = \? ORDER BY i.data_inscricao DESC$/, [7]],
  ["get /usuarios", "admin", "SELECT id, nome, email, perfil FROM usuarios ORDER BY id DESC", []],
  ["get /admin/cotacoes", "admin", /FROM cotacoes c INNER JOIN eventos e ON e.id = c.evento_id ORDER BY c.id DESC$/, []],
  ["get /fornecedor/propostas", "fornecedor", /GROUP_CONCAT\(DISTINCT i.categoria SEPARATOR ', '\) AS categoria .*WHERE p.fornecedor_id = \? GROUP BY .*ORDER BY p.criada_em DESC, p.id DESC$/, [7], "query"],
  ["get /organizador/propostas", "organizador", /WHERE e.usuario_id = \? ORDER BY p.criada_em DESC, p.id DESC$/, [7], "query"],
  ["get /admin/propostas", "admin", /INNER JOIN usuarios u ON u.id = p.fornecedor_id ORDER BY p.criada_em DESC, p.id DESC$/, [], "query"],
  ["get /solicitacoes-acesso", "admin", /INNER JOIN usuarios u ON u.id = s.usuario_id ORDER BY s.criada_em DESC, s.id DESC$/, []],
];
for (const [rota, perfil, sql, params, tipo] of listagens) {
  test(`${rota}: preserva filtro, ordenacao e array sem envelope`, async () => {
    for (const linhas of [[], [{ id: 13, status: "fixture" }, { id: 12, status: "outra" }]]) {
      const a = ambiente(perfil, [{ sql, params, tipo, retorno: linhas }]);
      const r = await a.requisitar(rota);
      assert.equal(r.statusCode, 200); assert.deepEqual(r.body, linhas); a.verificar();
    }
  });
}

for (const [rota, sql, params] of [
  ["get /cotacoes", /WHERE e.usuario_id = \? ORDER BY c.id DESC$/, [7]],
  ["get /fornecedor/cotacoes", /WHERE c.status = 'Aberta' AND c.prazo >= CURDATE\(\) ORDER BY c.id DESC$/, []],
]) test(`${rota}: anexa itens da cotacao em ordem de id, incluindo lista vazia`, async () => {
  const linhas = [{ id: 20, evento_id: 13 }, { id: 19, evento_id: 14 }];
  const itens = [{ id: 3, categoria: "Som", descricao: "Caixa", valor_estimado: "10.20" }];
  const a = ambiente(rota.includes("fornecedor") ? "fornecedor" : "organizador", [
    { sql, params, retorno: linhas },
    { sql: "SELECT id, categoria, descricao, valor_estimado FROM itens_cotacao WHERE cotacao_id = ? ORDER BY id", params: [20], retorno: itens },
    { sql: /WHERE cotacao_id = \? ORDER BY id$/, params: [19], retorno: [] },
  ]);
  const r = await a.requisitar(rota);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, [{ ...linhas[0], itens }, { ...linhas[1], itens: [] }]); a.verificar();
});

const evento = { nome: " Feira ", data: "2030-02-10", horario: "09:30", local: " Centro ", publico: 20 };
test("evento: cadastro aplica defaults e proprietario autenticado; edicao preserva status", async () => {
  const valores = ["Feira", evento.data, evento.horario, "Centro", "Corporativo", 20, ""];
  const a = ambiente("organizador", [
    { sql: /^INSERT INTO eventos .*VALUES/, params: [...valores, "Em planejamento", 7], retorno: { insertId: 13 } },
    { sql: "UPDATE eventos SET nome = ?, data = ?, horario = ?, local = ?, categoria = ?, publico = ?, descricao = ? WHERE id = ? AND usuario_id = ?", params: [...valores, 13, 7], retorno: { affectedRows: 1 } },
  ]);
  const r = await a.requisitar("post /eventos", { ...evento, usuario_id: 999, status: "Ativo" });
  assert.equal(r.statusCode, 201);
  assert.deepEqual(r.body, { mensagem: "Evento cadastrado com sucesso!", evento: {
    ...evento, id: 13, nome: "Feira", local: "Centro", categoria: "Corporativo", descricao: "", status: "Em planejamento", usuario_id: 7,
  } });
  assert.deepEqual((await a.requisitar("put /eventos/:id", { ...evento, status: "Ativo" })).body,
    { mensagem: "Evento atualizado com sucesso!" }); a.verificar();
});
test("eventos: validacoes de corpo e ID ocorrem antes da escrita", async () => {
  for (const rota of ["post /eventos", "put /eventos/:id"]) {
    for (const alteracao of [{ nome: " " }, { data: "invalida" }, { horario: "24:00" }, { local: null }, { publico: "20" }, { categoria: [] }, { descricao: 1 }]) {
      const a = ambiente(); assert.equal((await a.requisitar(rota, { ...evento, ...alteracao })).statusCode, 400); a.verificar();
    }
  }
  for (const rota of ["get /eventos/:id", "put /eventos/:id", "delete /eventos/:id", "get /eventos/:id/custos", "put /eventos/:id/custos", "patch /eventos/:id/publicar"]) {
    for (const id of ["0", "-1", "1.5", "abc"]) {
      const a = ambiente(); assert.equal((await a.requisitar(rota, evento, { id })).statusCode, 400); a.verificar();
    }
  }
});
for (const [rota, sql, mensagem] of [
  ["patch /eventos/:id/publicar", "UPDATE eventos SET status = 'Ativo' WHERE id = ? AND usuario_id = ? AND status = 'Em planejamento'", "Evento publicado com sucesso!"],
  ["delete /eventos/:id", "DELETE FROM eventos WHERE id = ? AND usuario_id = ?", "Evento excluído com sucesso!"],
  ["put /eventos/:id", /WHERE id = \? AND usuario_id = \?$/, "Evento atualizado com sucesso!"],
]) test(`${rota}: affectedRows distingue sucesso de ausente/alheio`, async () => {
  for (const affectedRows of [0, 1]) {
    const params = rota.startsWith("put") ? ["Feira", evento.data, evento.horario, "Centro", "Corporativo", 20, "", 13, 7] : [13, 7];
    const a = ambiente("organizador", [{ sql, params, retorno: { affectedRows } }]);
    const r = await a.requisitar(rota, evento);
    assert.equal(r.statusCode, affectedRows ? 200 : 404);
    if (affectedRows) assert.deepEqual(r.body, rota.startsWith("patch") ? { mensagem, status: "Ativo" } : { mensagem });
    a.verificar();
  }
});
test("detalhe e custos: evento alheio/ausente nao e exposto nem tem custos consultados", async () => {
  for (const rota of ["get /eventos/:id", "get /eventos/:id/custos"]) {
    const a = ambiente("organizador", [{ sql: /FROM eventos WHERE id = \? AND usuario_id = \?$/, params: [13, 7] }]);
    const r = await a.requisitar(rota); assert.equal(r.statusCode, 404);
    assert.deepEqual(r.body, { erro: "Evento não encontrado." }); a.verificar();
  }
});
test("custos: consulta ordenada so ocorre depois de verificar proprietario", async () => {
  const custos = [{ id: 2, evento_id: 13, categoria: "Som", descricao: "Caixa", valor_estimado: "0.10" }];
  const a = ambiente("organizador", [
    { sql: /FROM eventos WHERE id = \? AND usuario_id = \?$/, params: [13, 7], retorno: [{ id: 13 }] },
    { sql: "SELECT id, evento_id, categoria, descricao, valor_estimado FROM custos_evento WHERE evento_id = ? ORDER BY id", params: [13], retorno: custos },
  ]);
  const r = await a.requisitar("get /eventos/:id/custos"); assert.equal(r.statusCode, 200); assert.deepEqual(r.body, custos); a.verificar();
});
test("custos: array vazio remove todos dentro da transacao e retorna array vazio", async () => {
  const a = ambiente("organizador", [
    { tipo: "tx", sql: /WHERE id = \? AND usuario_id = \? FOR UPDATE$/, params: [13, 7], retorno: [{ id: 13 }] },
    { tipo: "tx", sql: "DELETE FROM custos_evento WHERE evento_id = ?", params: [13] },
    { tipo: "tx", sql: /WHERE evento_id = \? ORDER BY id$/, params: [13] },
  ]);
  const r = await a.requisitar("put /eventos/:id/custos", { custos: [] });
  assert.equal(r.statusCode, 200); assert.deepEqual(r.body, []);
  assert.deepEqual(a.transacao, ["getConnection", "begin", "commit", "release"]); a.verificar();
});

const buscaEventoAtivo = { sql: "SELECT id FROM eventos WHERE id = ? AND status = 'Ativo'", params: [13], retorno: [{ id: 13 }] };
const buscaInscricao = { sql: "SELECT id FROM inscricoes WHERE usuario_id = ? AND evento_id = ?", params: [7, 13] };
test("inscricao: valida ID, exige evento ativo e impede duplicata inclusive corrida de insert", async () => {
  for (const evento_id of [0, -1, 1.5, "abc", null]) {
    const a = ambiente("participante"); assert.equal((await a.requisitar("post /participante/inscricoes", { evento_id })).statusCode, 400); a.verificar();
  }
  for (const [passos, status] of [
    [[{ ...buscaEventoAtivo, retorno: [] }], 404],
    [[buscaEventoAtivo, { ...buscaInscricao, retorno: [{ id: 1 }] }], 409],
    [[buscaEventoAtivo, buscaInscricao, { sql: /^INSERT INTO inscricoes/, params: [7, 13], erro: { code: "ER_DUP_ENTRY" } }], 409],
  ]) {
    const a = ambiente("participante", passos);
    const r = await a.requisitar("post /participante/inscricoes", { evento_id: "13" });
    assert.equal(r.statusCode, status); a.verificar();
  }
});
test("inscricao: ignora usuario do corpo e devolve contrato Confirmada", async () => {
  const a = ambiente("participante", [buscaEventoAtivo, buscaInscricao,
    { sql: "INSERT INTO inscricoes (usuario_id, evento_id) VALUES (?, ?)", params: [7, 13], retorno: { insertId: 21 } }]);
  const r = await a.requisitar("post /participante/inscricoes", { evento_id: "13", usuario_id: 999 });
  assert.equal(r.statusCode, 201);
  assert.deepEqual(r.body, { mensagem: "Inscrição realizada com sucesso!", inscricao: { id: 21, usuario_id: 7, evento_id: 13, status: "Confirmada" } }); a.verificar();
});

const proposta = { cotacao_id: "13", valor: "12.345", condicoes_pagamento: " Pix ", detalhes_tecnicos: " Som " };
test("proposta: valida dados antes de consultar e exige cotacao aberta dentro do prazo", async () => {
  for (const alteracao of [{ cotacao_id: 0 }, { valor: 0 }, { valor: "abc" }, { condicoes_pagamento: " " }, { detalhes_tecnicos: null }]) {
    const a = ambiente("fornecedor"); assert.equal((await a.requisitar("post /fornecedor/propostas", { ...proposta, ...alteracao })).statusCode, 400); a.verificar();
  }
  const a = ambiente("fornecedor", [{ tipo: "query", sql: /WHERE id = \? AND status = 'Aberta' AND prazo >= CURDATE\(\)$/, params: ["13"] }]);
  assert.equal((await a.requisitar("post /fornecedor/propostas", proposta)).statusCode, 404); a.verificar();
});
test("proposta: usa fornecedor autenticado, trim e Number sem limitar casas decimais", async () => {
  const a = ambiente("fornecedor", [
    { tipo: "query", sql: /WHERE id = \? AND status = 'Aberta' AND prazo >= CURDATE\(\)$/, params: ["13"], retorno: [{ id: 13 }] },
    { tipo: "query", sql: /^INSERT INTO propostas/, params: ["13", 7, 12.345, "Pix", "Som"], retorno: { insertId: 21 } },
  ]);
  const r = await a.requisitar("post /fornecedor/propostas", { ...proposta, fornecedor_id: 999 });
  assert.equal(r.statusCode, 201); assert.deepEqual(r.body, { mensagem: "Proposta enviada com sucesso!", proposta_id: 21 }); a.verificar();
});
test("avaliacao: somente dono do evento e proposta Em avaliacao podem mudar status", async () => {
  for (const status of ["Aprovada", "Recusada"]) for (const affectedRows of [0, 1]) {
    const a = ambiente("organizador", [{ tipo: "query",
      sql: /SET p.status = \? WHERE p.id = \? AND e.usuario_id = \? AND p.status = 'Em avaliação'$/,
      params: [status, 13, 7], retorno: { affectedRows } }]);
    const r = await a.requisitar("patch /organizador/propostas/:id/status", { status });
    assert.equal(r.statusCode, affectedRows ? 200 : 404);
    assert.deepEqual(r.body, affectedRows ? { mensagem: `Proposta ${status.toLowerCase()} com sucesso!`, proposta_id: 13, status }
      : { erro: "Proposta não encontrada, sem permissão ou já avaliada." }); a.verificar();
  }
  for (const [body, id] of [[{ status: "aprovada" }, "13"], [{ status: "Aprovada" }, "0"]]) {
    const a = ambiente(); assert.equal((await a.requisitar("patch /organizador/propostas/:id/status", body, { id })).statusCode, 400); a.verificar();
  }
});

test("acesso: valida corpo antes do perfil, impede pendencia e grava justificativa aparada", async () => {
  const body = { perfil_solicitado: "fornecedor", justificativa: " Preciso fornecer " };
  const invalido = ambiente("admin");
  assert.equal((await invalido.requisitar("post /solicitacoes-acesso", {})).statusCode, 400); invalido.verificar();
  for (const pendente of [false, true]) {
    const passos = [{ sql: "SELECT id FROM solicitacoes_acesso WHERE usuario_id = ? AND status = 'pendente'", params: [7], retorno: pendente ? [{ id: 1 }] : [] }];
    if (!pendente) passos.push({ sql: /^INSERT INTO solicitacoes_acesso/, params: [7, "fornecedor", "Preciso fornecer"], retorno: { insertId: 21 } });
    const a = ambiente("participante", passos); const r = await a.requisitar("post /solicitacoes-acesso", body);
    assert.equal(r.statusCode, pendente ? 409 : 201);
    assert.deepEqual(r.body, pendente ? { erro: "Você já possui uma solicitação pendente." } : {
      mensagem: "Solicitação enviada com sucesso!", solicitacao: { id: 21, usuario_id: 7, perfil_solicitado: "fornecedor", justificativa: "Preciso fornecer", status: "pendente" },
    }); a.verificar();
  }
});
const buscaSolicitacao = { tipo: "tx", sql: "SELECT usuario_id, perfil_solicitado, status FROM solicitacoes_acesso WHERE id = ? FOR UPDATE", params: [13], retorno: [{ usuario_id: 9, perfil_solicitado: "fornecedor", status: "pendente" }] };
for (const status of ["aprovado", "rejeitado"]) test(`acesso ${status}: lock, atualizacoes atomicas, commit e release`, async () => {
  const passos = [buscaSolicitacao];
  if (status === "aprovado") passos.push({ tipo: "tx", sql: "UPDATE usuarios SET perfil = ? WHERE id = ? AND perfil = 'participante'", params: ["fornecedor", 9], retorno: { affectedRows: 1 } });
  passos.push({ tipo: "tx", sql: "UPDATE solicitacoes_acesso SET status = ? WHERE id = ?", params: [status, 13] });
  const a = ambiente("admin", passos); const r = await a.requisitar("patch /solicitacoes-acesso/:id", { status });
  assert.equal(r.statusCode, 200); assert.deepEqual(r.body, { mensagem: status === "aprovado" ? "Solicitação aprovada com sucesso!" : "Solicitação rejeitada com sucesso!" });
  assert.deepEqual(a.transacao, ["getConnection", "begin", "commit", "release"]); a.verificar();
});
test("analise de acesso: ausente, ja analisada, perfil alterado e falha SQL revertem sem commit", async () => {
  for (const [passos, status] of [
    [[{ ...buscaSolicitacao, retorno: [] }], 404],
    [[{ ...buscaSolicitacao, retorno: [{ status: "aprovado" }] }], 409],
    [[buscaSolicitacao, { tipo: "tx", sql: /UPDATE usuarios .*perfil = 'participante'$/, params: ["fornecedor", 9], retorno: { affectedRows: 0 } }], 409],
    [[buscaSolicitacao, { tipo: "tx", sql: /^UPDATE usuarios/, params: ["fornecedor", 9], erro: Error("falha simulada") }], 500],
  ]) {
    const a = ambiente("admin", passos); const r = await a.requisitar("patch /solicitacoes-acesso/:id", { status: "aprovado" });
    assert.equal(r.statusCode, status); assert.deepEqual(a.transacao, ["getConnection", "begin", "rollback", "release"]); a.verificar();
  }
});
test("perfil: consulta adicional sem perfil e 404 se usuario desaparecer depois da autenticacao", async () => {
  for (const linhas of [[], [{ id: 7, nome: usuario.nome, email: usuario.email }]]) {
    const a = ambiente("participante", [{ sql: "SELECT id, nome, email FROM usuarios WHERE id = ?", params: [7], retorno: linhas }]);
    const r = await a.requisitar("get /perfil"); assert.equal(r.statusCode, linhas.length ? 200 : 404);
    assert.deepEqual(r.body, linhas[0] || { erro: "Usuário não encontrado." }); a.verificar();
  }
});
test("publicas: raiz, cadastro normalizado sem hash e login sem senha na resposta", async () => {
  const a = ambiente("participante", [
    { sql: "SELECT id FROM usuarios WHERE email = ?", params: ["pessoa@example.invalid"] },
    { sql: /^INSERT INTO usuarios/, params: ["Pessoa", "pessoa@example.invalid", "hash-simulado", "participante"], retorno: { insertId: 7 } },
    { sql: "SELECT id, nome, email, senha, perfil FROM usuarios WHERE email = ?", params: ["pessoa@example.invalid"], retorno: [{ ...usuario, perfil: "participante", senha: "hash-simulado" }] },
  ]);
  assert.deepEqual((await a.requisitar("get /", {}, { semToken: true })).body, { mensagem: "Backend do TrocaTicket funcionando!" });
  const r = await a.requisitar("post /usuarios", { nome: " Pessoa ", email: " PESSOA@example.invalid ", senha: "senha-valida", perfil: "participante" });
  assert.equal(r.statusCode, 201); assert.deepEqual(r.body, { mensagem: "Usuário cadastrado com sucesso!", usuario: { ...usuario, perfil: "participante" } });
  const login = await a.requisitar("post /login", { email: " PESSOA@example.invalid ", senha: "senha-valida" });
  assert.equal(login.statusCode, 200); assert.deepEqual(Object.keys(login.body).sort(), ["mensagem", "token", "usuario"]);
  assert.deepEqual(login.body.usuario, { ...usuario, perfil: "participante" });
  assert.equal(jwt.verify(login.body.token, segredo).id, 7);
  assert.deepEqual(a.hashes, [["senha-valida", 12], ["senha-valida", "hash-simulado"]]); a.verificar();
});

test("cadastro via repositorio preserva 409 para email existente e corrida no INSERT", async () => {
  const busca = { sql: "SELECT id FROM usuarios WHERE email = ?", params: [usuario.email] };
  for (const passos of [
    [{ ...busca, retorno: [{ id: 7 }] }],
    [busca, { sql: /^INSERT INTO usuarios/, params: ["Pessoa", usuario.email, "hash-simulado", "participante"],
      erro: Object.assign(new Error("duplicidade simulada"), { code: "ER_DUP_ENTRY" }) }],
  ]) {
    const a = ambiente("participante", passos);
    const r = await a.requisitar("post /usuarios", { nome: "Pessoa", email: usuario.email, senha: "senha-valida", perfil: "participante" });
    assert.equal(r.statusCode, 409);
    assert.deepEqual(r.body, { erro: "Email já cadastrado!" });
    assert.equal(a.hashes.length, passos.length === 1 ? 0 : 1);
    a.verificar();
  }
});

test("login via repositorio preserva 401 sem usuario e nao chama bcrypt", async () => {
  const a = ambiente("participante", [{ sql: "SELECT id, nome, email, senha, perfil FROM usuarios WHERE email = ?", params: [usuario.email] }]);
  const r = await a.requisitar("post /login", { email: usuario.email, senha: "" });
  assert.equal(r.statusCode, 401);
  assert.deepEqual(r.body, { erro: "Email ou senha incorretos." });
  assert.deepEqual(a.hashes, []);
  a.verificar();
});
