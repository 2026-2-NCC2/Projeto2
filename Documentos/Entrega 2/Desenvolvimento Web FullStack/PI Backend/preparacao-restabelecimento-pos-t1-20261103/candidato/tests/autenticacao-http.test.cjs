"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const jwt = require("jsonwebtoken"), bcrypt = require("bcryptjs");
const { iniciar } = require("./helpers/http-autenticacao.cjs");
const response = (status, erro) => ({ status, body: { erro } });
function semSegredos(a, r) {
  const texto = JSON.stringify([r, a.logs]);
  for (const privado of [a.segredo, a.hash, a.privado, "sb_secret_sintetica_exclusiva_do_backend"]) assert.equal(texto.includes(privado), false);
}
for (const provider of [undefined, "mysql", "supabase"]) {
  const nome = provider ?? "padrao";
  test(`HTTP ${nome}: login bcrypt real, JWT HS256/1h e perfil pelo provedor selecionado`, async t => {
    const a = await iniciar(t, provider), r = await a.login();
    assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.body).sort(), ["mensagem", "token", "usuario"]);
    assert.deepEqual(r.body.usuario, { id: 7, nome: "Teste 7", email: "teste7@example.invalid", perfil: "organizador" });
    const token = jwt.verify(r.body.token, a.segredo, { algorithms: ["HS256"] });
    assert.equal(token.id, 7); assert.equal(token.perfil, "organizador"); assert.equal(token.exp-token.iat, 3600);
    assert.equal(jwt.decode(r.body.token, { complete: true }).header.alg, "HS256");
    const perfil = await a.request("GET", "/perfil", undefined, r.body.token);
    assert.deepEqual(perfil, { status: 200, body: { id: 7, nome: "Teste 7", email: "teste7@example.invalid" } });
    semSegredos(a, r); semSegredos(a, perfil);
    assert.ok(a.calls.length >= 3);
    assert.ok(a.calls.every(c => c.kind === (provider === "supabase" ? "supabase" : "mysql")));
    if (provider === "supabase") {
      assert.equal(a.imports.some(i => i === "../db" || i.includes("/mysql/")), false);
      assert.ok(a.calls.every(c => c.headersChecked));
    } else assert.equal(a.imports.includes("../db-supabase.cjs"), false);
  });
}
for (const provider of ["mysql", "supabase"]) {
  test(`HTTP ${provider}: login invalido/ausente e validacoes mantem status e mensagens`, async t => {
    const a = await iniciar(t, provider);
    assert.deepEqual(await a.login(7, "senha-errada"), response(401, "Email ou senha incorretos."));
    assert.deepEqual(await a.login(999), response(401, "Email ou senha incorretos."));
    const count = a.calls.length;
    for (const body of [undefined, {}, { email: [], senha: "senha" }, { email: " ", senha: "senha" }]) {
      assert.deepEqual(await a.request("POST", "/login", body), response(400, "Email e senha são obrigatórios."));
    }
    assert.equal(a.calls.length, count);
  });
  test(`HTTP ${provider}: tokens expirados, assinatura/algoritmo/ID invalidos nao consultam banco`, async t => {
    const a = await iniciar(t, provider);
    assert.deepEqual(await a.request("GET", "/perfil"), response(401, "Token não informado."));
    const tokens = [a.token(7, { expiresIn: -1 }), a.token(7, { algorithm: "HS384" }),
      jwt.sign({ id: 7 }, "outra-chave-ficticia", { algorithm: "HS256" }),
      jwt.sign({ id: 7 }, null, { algorithm: "none" }), a.token("7"), a.token(-1), a.token(0), "malformado"];
    for (const token of tokens) assert.deepEqual(await a.request("GET", "/perfil", undefined, token), response(401, "Token inválido ou expirado."));
    assert.deepEqual(a.calls, []);
  });
  test(`HTTP ${provider}: perfil atual do banco prevalece sobre o claim antigo`, async t => {
    const a = await iniciar(t, provider), token = a.token(7);
    assert.deepEqual(await a.request("GET", "/solicitacoes-acesso", undefined, token), response(403, "Você não tem permissão para realizar esta ação."));
    a.state.usuarios.find(u => u.id === 7).perfil = "admin";
    const r = await a.request("GET", "/solicitacoes-acesso", undefined, token);
    assert.equal(r.status, 200); assert.equal(r.body.length, 1);
    a.state.usuarios = a.state.usuarios.filter(u => u.id !== 7);
    assert.deepEqual(await a.request("GET", "/perfil", undefined, token), response(401, "Usuário não encontrado."));
  });
  test(`HTTP ${provider}: evento proprio, evento alheio e lista filtrada`, async t => {
    const a = await iniciar(t, provider), token = a.token();
    const list = await a.request("GET", "/eventos", undefined, token);
    assert.equal(list.status, 200); assert.deepEqual(list.body.map(e => e.id), [13]);
    assert.equal((await a.request("GET", "/eventos/13", undefined, token)).status, 200);
    assert.deepEqual(await a.request("GET", "/eventos/14", undefined, token), response(404, "Evento não encontrado."));
    assert.deepEqual(await a.request("GET", "/eventos/999", undefined, token), response(404, "Evento não encontrado."));
  });
  test(`HTTP ${provider}: cotacoes e propostas respeitam organizador e fornecedor`, async t => {
    const a = await iniciar(t, provider);
    for (const [route, id, ids] of [["/cotacoes", 7, [21]], ["/organizador/propostas", 7, [31]], ["/fornecedor/propostas", 8, [31]]]) {
      const r = await a.request("GET", route, undefined, a.token(id));
      assert.equal(r.status, 200); assert.deepEqual(r.body.map(v => v.id), ids); semSegredos(a, r);
      if (route.includes("propostas")) assert.equal(r.body[0].valor, "10.10");
    }
    assert.deepEqual(await a.request("GET", "/cotacoes", undefined, a.token(8)), response(403, "Você não tem permissão para realizar esta ação."));
  });
  test(`HTTP ${provider}: avaliacao condicional preserva propriedade, sucesso e repeticao`, async t => {
    const a = await iniciar(t, provider), token = a.token();
    const body = { status: "Aprovada", organizador_id: 17, usuario_id: 17 };
    const naoEncontrada = response(404, "Proposta não encontrada, sem permissão ou já avaliada.");
    assert.deepEqual(await a.request("PATCH", "/organizador/propostas/32/status", body, token), naoEncontrada);
    assert.equal(a.state.propostas.find(p => p.id === 32).status, "Em avaliação");
    assert.deepEqual(await a.request("PATCH", "/organizador/propostas/31/status", body, token), {
      status: 200, body: { mensagem: "Proposta aprovada com sucesso!", proposta_id: 31, status: "Aprovada" },
    });
    assert.deepEqual(await a.request("PATCH", "/organizador/propostas/31/status", body, token), naoEncontrada);
  });
  test(`HTTP ${provider}: decisao administrativa atualiza perfil observado pelo mesmo JWT`, async t => {
    const a = await iniciar(t, provider), tokenParticipante = a.token(9);
    assert.deepEqual(await a.request("PATCH", "/solicitacoes-acesso/41", { status: "aprovado", admin_id: 10 }, a.token(7)), response(403, "Você não tem permissão para realizar esta ação."));
    assert.equal(a.rpcCalls.length, 0);
    const r = await a.request("PATCH", "/solicitacoes-acesso/41", { status: "aprovado" }, a.token(10));
    assert.deepEqual(r, { status: 200, body: { mensagem: "Solicitação aprovada com sucesso!" } });
    assert.equal(a.state.usuarios.find(u => u.id === 9).perfil, "fornecedor");
    assert.deepEqual(await a.request("GET", "/fornecedor/propostas", undefined, tokenParticipante), { status: 200, body: [] });
    assert.deepEqual(await a.request("PATCH", "/solicitacoes-acesso/41", { status: "rejeitado" }, a.token(10)), response(409, "Esta solicitação já foi analisada."));
    assert.deepEqual(await a.request("PATCH", "/solicitacoes-acesso/999", { status: "aprovado" }, a.token(10)), response(404, "Solicitação não encontrada."));
  });
  test(`HTTP ${provider}: cadastro usa bcrypt custo 12, sem hash no JSON, e permite login`, async t => {
    const a = await iniciar(t, provider);
    const body = { nome: " Teste Novo ", email: " TESTE33@EXAMPLE.INVALID ", senha: a.senha, perfil: "participante" };
    assert.deepEqual(await a.request("POST", "/usuarios", { ...body, perfil: "admin" }), response(400, "Informe nome, email válido, senha de 8 a 72 bytes e um perfil permitido."));
    const r = await a.request("POST", "/usuarios", body);
    assert.deepEqual(r, { status: 201, body: { mensagem: "Usuário cadastrado com sucesso!", usuario: { id: 33, nome: "Teste Novo", email: "teste33@example.invalid", perfil: "participante" } } });
    const armazenado = a.state.usuarios.find(u => u.id === 33);
    assert.equal(bcrypt.getRounds(armazenado.senha), 12); assert.equal(await bcrypt.compare(a.senha, armazenado.senha), true);
    assert.equal((await a.login(33)).status, 200); semSegredos(a, r);
    assert.deepEqual(await a.request("POST", "/usuarios", body), response(409, "Email já cadastrado!"));
  });
  test(`HTTP ${provider}: falha e timeout de leitura nao expoem credenciais nem mudam provedor`, async t => {
    const a = await iniciar(t, provider);
    for (const falha of ["banco", "transporte"]) {
      a.state.falha = falha;
      const login = await a.login(), perfil = await a.request("GET", "/perfil", undefined, a.token());
      assert.deepEqual(login, response(500, "Erro interno no login."));
      assert.deepEqual(perfil, response(500, "Erro interno ao autenticar usuário."));
      semSegredos(a, login); semSegredos(a, perfil);
    }
    assert.ok(a.calls.every(c => c.kind === provider));
  });
}
test("HTTP: contratos JSON de leituras coincidem entre MySQL e Supabase", async t => {
  const my = await iniciar(t, "mysql"), sb = await iniciar(t, "supabase");
  for (const [route, id] of [["/perfil", 7], ["/eventos", 7], ["/eventos/13", 7], ["/cotacoes", 7],
    ["/organizador/propostas", 7], ["/fornecedor/propostas", 8]]) {
    assert.deepEqual(await sb.request("GET", route, undefined, sb.token(id)), await my.request("GET", route, undefined, my.token(id)));
  }
});
test("HTTP Supabase: resposta de autenticacao com ID divergente falha fechada", async t => {
  const a = await iniciar(t, "supabase"); a.state.authIdDivergente = true;
  assert.deepEqual(await a.request("GET", "/perfil", undefined, a.token()), response(500, "Erro interno ao autenticar usuário."));
});
test("HTTP Supabase: requisicoes concorrentes nao compartilham JWT ou identidade", async t => {
  const a = await iniciar(t, "supabase");
  const [um, outro] = await Promise.all([
    a.request("GET", "/perfil", undefined, a.token(7)),
    a.request("GET", "/perfil", undefined, a.token(8)),
  ]);
  assert.equal(um.status, 200); assert.equal(outro.status, 200);
  assert.equal(um.body.id, 7); assert.equal(outro.body.id, 8);
  assert.ok(a.calls.every(c => c.headersChecked));
  assert.equal(a.imports.includes("../db"), false);
});
test("HTTP Supabase: timeout transacional e incerto, uma RPC, nenhum JWT do usuario no SDK", async t => {
  const a = await iniciar(t, "supabase", { rpcPendente: true });
  const r = await a.request("PATCH", "/solicitacoes-acesso/41", { status: "aprovado" }, a.token(10));
  assert.deepEqual(r, response(500, "Erro interno ao analisar solicitação."));
  assert.equal(a.rpcCalls.length, 1); semSegredos(a, r);
  assert.ok(a.calls.filter(c => c.kind === "supabase").every(c => c.headersChecked));
});
test("risco de ativacao: token legado com mesmo segredo/ID autentica a conta do novo provedor", async t => {
  const my = await iniciar(t, "mysql"), sb = await iniciar(t, "supabase");
  const old = (await my.login()).body.token;
  Object.assign(sb.state.usuarios.find(u => u.id === 7), { nome: "Outra conta sintética", email: "outra@example.invalid" });
  const r = await sb.request("GET", "/perfil", undefined, old);
  assert.equal(r.status, 200); assert.equal(r.body.nome, "Outra conta sintética");
  // Caracterizacao de risco, nao aprovacao de seguranca para ativacao.
  // Exige reconciliar identidades e invalidar sessoes na troca autorizada.
});
