"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), jwt = require("jsonwebtoken");
const { iniciar } = require("./helpers/http-autenticacao.cjs");
const segredo = "homologacao_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const options = { somenteLeitura: true, jwtSecret: segredo };

test("HTTP homologacao: login/JWT proprio funcionam; JWT anterior e recusado antes da persistencia", async t => {
  const a = await iniciar(t, "supabase", options), r = await a.login();
  assert.equal(r.status, 200);
  const dados = jwt.verify(r.body.token, segredo, { algorithms: ["HS256"] });
  assert.equal(dados.exp-dados.iat, 3600);
  assert.equal((await a.request("GET", "/perfil", undefined, r.body.token)).status, 200);
  const antigo = jwt.sign({ id: 7, perfil: "organizador" }, "segredo-ficticio-exclusivo-da-validacao-http-incremento-4", { expiresIn: "1h" });
  const calls = a.calls.length;
  assert.deepEqual(await a.request("GET", "/perfil", undefined, antigo), { status: 401, body: { erro: "Token inválido ou expirado." } });
  assert.equal(a.calls.length, calls);
  assert.ok(a.calls.every(c => c.kind === "supabase" && c.headersChecked));
});
test("HTTP homologacao: todas as escritas bloqueadas antes de JSON, JWT ou banco", async t => {
  const a = await iniciar(t, "supabase", options), token = a.token(10);
  const antes = structuredClone(a.state);
  for (const [method, route] of [["POST", "/usuarios"], ["POST", "/eventos"], ["PUT", "/eventos/13"],
    ["PATCH", "/eventos/13/publicar"], ["DELETE", "/eventos/13"], ["PUT", "/eventos/13/custos"],
    ["POST", "/cotacoes"], ["POST", "/fornecedor/propostas"], ["PATCH", "/organizador/propostas/31/status"],
    ["POST", "/solicitacoes-acesso"], ["PATCH", "/solicitacoes-acesso/41"], ["POST", "/participante/inscricoes"],
    ["HEAD", "/eventos"], ["OPTIONS", "/login"], ["POST", "/LOGIN"], ["POST", "/login/"], ["POST", "/%6cogin"]]) {
    const r = await a.request(method, route, undefined, token);
    assert.equal(r.status, 405);
    // HEAD nao possui corpo HTTP, ainda que o handler produza JSON.
  }
  const malformado = await a.request("POST", "/usuarios", "{json invalido", token, true);
  assert.equal(malformado.status, 405);
  assert.deepEqual(a.calls, []); assert.deepEqual(a.rpcCalls, []); assert.deepEqual(a.state, antes);
});
test("HTTP homologacao: GET conserva autorizacao e usa somente as RPCs de leitura liberadas", async t => {
  const a = await iniciar(t, "supabase", options);
  assert.equal((await a.request("GET", "/eventos/13", undefined, a.token(7))).status, 200);
  assert.equal((await a.request("GET", "/eventos/14", undefined, a.token(7))).status, 404);
  assert.equal((await a.request("GET", "/solicitacoes-acesso", undefined, a.token(7))).status, 403);
  const r = await a.request("GET", "/fornecedor/propostas", undefined, a.token(8));
  assert.equal(r.status, 200); assert.deepEqual(r.body.map(p => p.id), [31]);
  assert.equal(a.rpcCalls.length, 1); assert.equal(a.rpcCalls[0].name, "listar_propostas_por_fornecedor");
  const rpcsHttp = a.calls.filter(c => c.path.startsWith('/rest/v1/rpc/'));
  assert.ok(rpcsHttp.some(c => c.path === '/rest/v1/rpc/eventos_capacidades_v1'));
  assert.ok(rpcsHttp.every(c => c.method === 'POST' && [
    '/rest/v1/rpc/eventos_capacidades_v1', '/rest/v1/rpc/listar_propostas_por_fornecedor',
  ].includes(c.path)));
  assert.equal(a.state.propostas[0].status, "Em avaliação");
});

test('HTTP homologacao: verificação de contas de teste permanece ativa no login e no JWT existente', async t => {
  const a = await iniciar(t, 'supabase', options);
  const usuariosAntes = structuredClone(a.state.usuarios);
  a.state.contasTeste = [{ usuario_id: 7, estado: 'ativa' }];
  const login = await a.login(); assert.equal(login.status, 200);
  for (const estado of ['encerrando', 'excluida']) {
    a.state.contasTeste[0].estado = estado;
    assert.equal((await a.login()).status, 401);
    assert.deepEqual(await a.request('GET', '/perfil', undefined, login.body.token),
      { status: 401, body: { erro: 'Usuário não encontrado.' } });
  }
  const consultas = a.calls.filter(c => c.path === '/rest/v1/contas_teste_imagens');
  assert.ok(consultas.length > 0);
  for (const c of consultas) {
    assert.equal(c.method, 'GET');
    const params = new URLSearchParams(c.query);
    assert.equal(params.get('select'), 'estado'); assert.equal(params.get('usuario_id'), 'eq.7');
    assert.equal([...params].length, 2);
  }
  assert.deepEqual(a.state.usuarios, usuariosAntes);
  assert.ok(a.calls.every(c => c.method === 'GET'));
});
