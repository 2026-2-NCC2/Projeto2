"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const fabricantes = {
  custos: require("../services/custos.cjs").criarServicoCustos,
  cotacoes: require("../services/cotacoes.cjs").criarServicoCotacoes,
  acesso: require("../services/solicitacoes-acesso.cjs").criarServicoSolicitacoesAcesso,
};
const item = () => ({ categoria: "Som", descricao: "PA", valor_estimado: "0.10" });
const ator = caso => ({ id: 7, perfil: caso === "acesso" ? "admin" : "organizador" });
const agora = () => new Date("2030-01-01T12:00:00Z");
const payload = () => ({ evento_id: 13, prazo: "2030-01-02", observacoes: "Teste", itens: [item()] });
function chamar(caso, servico, pessoa = ator(caso), dados) {
  if (caso === "custos") return servico.substituir(pessoa, "13", dados ?? [item()]);
  if (caso === "cotacoes") return servico.publicar(pessoa, dados ?? payload());
  return servico.decidir(pessoa, "13", dados ?? "aprovado");
}

// Modelo transacional em memoria: comprova coordenacao/contratos, nao SQL real.
function mysql(caso, op = {}) {
  const etapas = [], parametros = [];
  const estado = { custos: [{ id: 9, ...item() }], cotacoes: [], itens: [], perfil: op.perfil ?? "participante", status: op.status ?? "pendente" };
  let pendente, inserts = 0, itens = 0;
  function passo(nome) {
    etapas.push(nome);
    if (op.falhar === nome || op.falharTambem === nome) throw Object.assign(Error("detalhes privados"), { code: "ETIMEDOUT" });
  }
  const conexao = {
    async beginTransaction() { passo("begin"); pendente = structuredClone(estado); },
    async commit() { passo("commit"); Object.assign(estado, pendente); },
    async rollback() { passo("rollback"); pendente = undefined; },
    release() { passo("release"); }, destroy() { passo("destroy"); },
  };
  const verificar = c => assert.equal(c, conexao, "a mesma conexao em toda a transacao");
  const custos = {
    async bloquearEventoDoUsuario(c, id, usuario) { verificar(c); assert.equal(id, 13); assert.equal(usuario, 7); passo("eventLock"); return op.ausente ? [] : [{ id }]; },
    async excluirPorEvento(c, id) { verificar(c); assert.equal(id, 13); passo("delete"); pendente.custos = []; },
    async inserir(c, id, custo) { verificar(c); assert.equal(id, 13); passo("insert" + ++inserts); parametros.push(custo); pendente.custos.push({ id: 20 + inserts, evento_id: id, ...custo }); },
    async listarPorEvento(id, c) { verificar(c); assert.equal(id, 13); passo("read"); return structuredClone(pendente.custos); },
  };
  const cotacoes = {
    async bloquearCustosDoEvento(c, id) { verificar(c); assert.equal(id, 13); passo("costLock"); return op.persistidos ?? [item()]; },
    async criar(c, dados) { verificar(c); passo("quote"); parametros.push(dados); pendente.cotacoes.push({ id: 21, ...dados }); return 21; },
    async inserirItem(c, id, custo) { verificar(c); assert.equal(id, 21); passo("item" + ++itens); pendente.itens.push(custo); },
  };
  const solicitacoesAcesso = {
    async bloquearPorId(c, id) { verificar(c); assert.equal(id, 13); passo("requestLock"); return op.ausente ? [] : [{ usuario_id: 9, perfil_solicitado: "fornecedor", status: pendente.status }]; },
    async atualizarPerfilParticipante(c, perfil, usuario) { verificar(c); assert.equal(perfil, "fornecedor"); assert.equal(usuario, 9); passo("profile"); const count = op.afetados ?? (pendente.perfil === "participante" ? 1 : 0); if (count === 1) pendente.perfil = perfil; return count; },
    async atualizarStatus(c, status, id) { verificar(c); assert.equal(id, 13); passo("status"); pendente.status = status; },
  };
  const db = { async getConnection() { passo("connect"); return conexao; } };
  const opcoes = { db, repositorios: { custos, cotacoes, solicitacoesAcesso }, agora };
  return { etapas, estado, parametros, opcoes, servico: fabricantes[caso](opcoes) };
}

test("MySQL custos: begin, lock, DELETE, INSERT normalizado, releitura, commit, release", async () => {
  const m = mysql("custos");
  const result = await chamar("custos", m.servico, undefined, [{ categoria: " Som ", descricao: " PA ", valor_estimado: "000.1" }]);
  assert.deepEqual(m.etapas, ["connect", "begin", "eventLock", "delete", "insert1", "read", "commit", "release"]);
  assert.deepEqual(m.parametros, [item()]); assert.deepEqual(result, m.estado.custos);
});
test("MySQL custos: array vazio remove e rele antes do commit", async () => {
  const m = mysql("custos"); assert.deepEqual(await chamar("custos", m.servico, undefined, []), []);
  assert.deepEqual(m.estado.custos, []);
  assert.deepEqual(m.etapas, ["connect", "begin", "eventLock", "delete", "read", "commit", "release"]);
});
test("MySQL publicacao: evento antes de custos, snapshot persistido e resposta 201 compativel", async () => {
  const m = mysql("cotacoes", { persistidos: [{ categoria: " Som ", descricao: " PA ", valor_estimado: "00.10" }] });
  const result = await chamar("cotacoes", m.servico);
  assert.deepEqual(m.etapas, ["connect", "begin", "eventLock", "costLock", "quote", "item1", "commit", "release"]);
  assert.deepEqual(result, { mensagem: "Cotação publicada com sucesso!", cotacao: {
    id: 21, evento_id: 13, prazo: "2030-01-02", observacoes: "Teste", modalidade: "Fechada", status: "Aberta", itens: [item()],
  } });
  assert.deepEqual(m.estado.itens, [item()]);
});
test("MySQL decisao: aprovacao condicional e status na mesma transacao", async () => {
  const m = mysql("acesso");
  assert.deepEqual(await chamar("acesso", m.servico), { mensagem: "Solicitação aprovada com sucesso!" });
  assert.deepEqual(m.etapas, ["connect", "begin", "requestLock", "profile", "status", "commit", "release"]);
  assert.equal(m.estado.perfil, "fornecedor"); assert.equal(m.estado.status, "aprovado");
});
test("MySQL rejeicao: nao altera nem exige perfil participante", async () => {
  const m = mysql("acesso", { perfil: "organizador" });
  assert.deepEqual(await chamar("acesso", m.servico, undefined, "rejeitado"), { mensagem: "Solicitação rejeitada com sucesso!" });
  assert.equal(m.estado.perfil, "organizador"); assert.equal(m.estado.status, "rejeitado");
  assert.equal(m.etapas.includes("profile"), false);
});

const conflitos = [
  ["custos", { ausente: true }, 404, "Evento não encontrado."],
  ["cotacoes", { ausente: true }, 404, "Evento não encontrado ou não pertence ao usuário."],
  ["cotacoes", { persistidos: [] }, 400, "Cadastre custos no evento antes de publicar a cotação."],
  ["cotacoes", { persistidos: [{ ...item(), valor_estimado: "0.20" }] }, 409, "Os custos foram alterados. Consulte e revise a lista antes de publicar."],
  ["acesso", { ausente: true }, 404, "Solicitação não encontrada."],
  ["acesso", { status: "aprovado" }, 409, "Esta solicitação já foi analisada."],
  ["acesso", { status: "rejeitado" }, 409, "Esta solicitação já foi analisada."],
  ["acesso", { perfil: "fornecedor" }, 409, "O usuário não possui mais o perfil participante."],
  ["acesso", { afetados: 2 }, 409, "O usuário não possui mais o perfil participante."],
];
test("MySQL conflitos: mesmos status/mensagens, rollback unico e nenhum commit", async () => {
  for (const [caso, opcoes, status, mensagem] of conflitos) {
    const m = mysql(caso, opcoes), antes = structuredClone(m.estado);
    await assert.rejects(chamar(caso, m.servico), e => e.respostaStatus === status && e.message === mensagem && !e.resultadoIncerto);
    assert.deepEqual(m.estado, antes); assert.equal(m.etapas.includes("commit"), false);
    assert.equal(m.etapas.filter(e => e === "rollback").length, 1); assert.equal(m.etapas.at(-1), "release");
  }
});

for (const [caso, falhas] of [
  ["custos", ["connect", "begin", "eventLock", "delete", "insert1", "read", "commit"]],
  ["cotacoes", ["connect", "begin", "eventLock", "costLock", "quote", "item1", "commit"]],
  ["acesso", ["connect", "begin", "requestLock", "profile", "status", "commit"]],
]) {
  test(`MySQL ${caso}: falhas em cada etapa, inclusive timeout, sem repetir escrita`, async () => {
    for (const falhar of falhas) {
      const m = mysql(caso, { falhar }), antes = structuredClone(m.estado);
      await assert.rejects(chamar(caso, m.servico), e => e.respostaStatus === 500 && e.resultadoIncerto && !e.message.includes("privados"));
      assert.deepEqual(m.estado, antes);
      assert.equal(m.etapas.filter(e => e === falhar).length, 1);
      if (falhar !== "connect") assert.deepEqual(m.etapas.slice(-2), ["rollback", "release"]);
    }
  });
}
test("MySQL publicacao: falha no segundo item nao confirma cotacao nem primeiro item", async () => {
  const rows = [item(), { ...item(), descricao: "Outro" }], m = mysql("cotacoes", { persistidos: rows, falhar: "item2" });
  const antes = structuredClone(m.estado);
  await assert.rejects(chamar("cotacoes", m.servico, undefined, { ...payload(), itens: rows }), e => e.respostaStatus === 500);
  assert.deepEqual(m.estado, antes); assert.equal(m.etapas.includes("commit"), false);
});
test("MySQL limpeza: preserva politicas distintas de rollback e release dos handlers", async () => {
  const pub = mysql("cotacoes", { falhar: "quote", falharTambem: "rollback" });
  await assert.rejects(chamar("cotacoes", pub.servico), e => e.respostaStatus === 500);
  assert.equal(pub.etapas.at(-1), "destroy"); assert.equal(pub.etapas.includes("release"), false);
  for (const caso of ["custos", "acesso"]) {
    const m = mysql(caso, { falhar: caso === "custos" ? "insert1" : "status", falharTambem: "rollback" });
    await assert.rejects(chamar(caso, m.servico), e => e.respostaStatus === 500 &&
      e.message === (caso === "custos" ? "Erro interno ao salvar custos do evento." : "Erro interno no servidor."));
    assert.equal(m.etapas.at(-1), "release");
  }
  for (const caso of Object.keys(fabricantes)) {
    const m = mysql(caso, { falhar: "release" });
    if (caso === "cotacoes") await chamar(caso, m.servico);
    else await assert.rejects(chamar(caso, m.servico), e => e.message === "Erro interno no servidor.");
    assert.equal(m.etapas.filter(e => e === "commit").length, 1);
  }
});

function supabase(caso, responder, timeoutMs = 1000) {
  const calls = []; let signal;
  const clienteSupabase = { schema(schema) {
    assert.equal(schema, "public");
    return { rpc(name, args, options) {
      calls.push({ name, args, options }); assert.deepEqual(options, { get: false, head: false });
      return { retry(value) { assert.equal(value, false); return { abortSignal(s) {
        signal = s; return Promise.resolve().then(() => responder(name, args));
      } }; } };
    } };
  } };
  const opcoes = { provider: "supabase", clienteSupabase, timeoutMs, agora };
  return { calls, opcoes, servico: fabricantes[caso](opcoes), signal: () => signal };
}
function resposta(caso, args) {
  if (caso === "custos") return [{ id: 21, evento_id: 13, ...args.p_custos[0] }];
  if (caso === "cotacoes") return { id: 21, evento_id: 13, prazo: args.p_prazo, observacoes: args.p_observacoes, modalidade: "Fechada", status: "Aberta", itens: args.p_itens };
  return { mensagem: args.p_status === "aprovado" ? "Solicitação aprovada com sucesso!" : "Solicitação rejeitada com sucesso!" };
}
for (const [caso, rpc] of [["custos", "substituir_custos_evento"], ["cotacoes", "publicar_cotacao"], ["acesso", "decidir_solicitacao_acesso"]]) {
  test(`Supabase ${caso}: adaptador real, uma RPC, contrato igual ao MySQL`, async () => {
    const m = supabase(caso, (name, args) => { assert.equal(name, rpc); return { data: resposta(caso, args) }; });
    const result = await chamar(caso, m.servico);
    assert.deepEqual(result, await chamar(caso, mysql(caso).servico));
    assert.equal(m.calls.length, 1);
    const args = m.calls[0].args;
    assert.equal(caso === "acesso" ? args.p_admin_id : args.p_usuario_id, 7);
  });
  test(`Supabase ${caso}: timeout incerto aborta e ignora resposta tardia sem reenvio`, async () => {
    let resolve;
    const m = supabase(caso, () => new Promise(r => { resolve = r; }), 10);
    await assert.rejects(chamar(caso, m.servico), e => e.respostaStatus === 500 && e.resultadoIncerto);
    assert.equal(m.signal().aborted, true);
    resolve({ data: resposta(caso, m.calls[0].args) }); await Promise.resolve();
    assert.equal(m.calls.length, 1);
  });
}
test("Supabase conflitos/falhas: preserva erros do adaptador sem outras escritas", async () => {
  for (const [caso, code, status] of [["custos", "TC404", 404], ["custos", "TC403", 403],
    ["cotacoes", "TP409", 409], ["cotacoes", "TP402", 400], ["acesso", "TA404", 404],
    ["acesso", "TA409", 409], ["acesso", "TA412", 409], ["acesso", "TA403", 403],
    ["custos", "57014", 500], ["cotacoes", "XX000", 500], ["acesso", "PGRST202", 500]]) {
    const m = supabase(caso, () => ({ error: { code, message: "privado" } }));
    await assert.rejects(chamar(caso, m.servico), e => e.respostaStatus === status && !e.message.includes("privado"));
    assert.equal(m.calls.length, 1);
  }
});
test("validacoes/autorizacao: nenhum provedor recebe escrita com entrada invalida", async () => {
  for (const caso of Object.keys(fabricantes)) {
    for (const m of [mysql(caso), supabase(caso, () => { throw Error("nao chamar"); })]) {
      for (const pessoa of [undefined, { id: 7, perfil: "fornecedor" }]) {
        // Chamada direta evita o ator default do auxiliar.
        const call = caso === "custos" ? () => m.servico.substituir(pessoa, 13, [item()])
          : caso === "cotacoes" ? () => m.servico.publicar(pessoa, payload()) : () => m.servico.decidir(pessoa, 13, "aprovado");
        await assert.rejects(call(), e => e.respostaStatus === (pessoa ? 403 : 401));
      }
      const invalido = caso === "custos" ? [{ ...item(), valor_estimado: "0.001" }]
        : caso === "cotacoes" ? { ...payload(), prazo: "2030-02-30" } : "Aprovado";
      await assert.rejects(chamar(caso, m.servico, ator(caso), invalido), e => e.respostaStatus === 400);
      assert.deepEqual(m.etapas ?? m.calls, []);
    }
  }
});

test("dependencias invalidas ou misturadas falham sem fallback, cliente ou pool implicito", () => {
  for (const [caso, criar] of Object.entries(fabricantes)) {
    const my = mysql(caso), sb = supabase(caso, () => ({}));
    for (const opcoes of [{}, { provider: "postgres" }, { ...my.opcoes, clienteSupabase: sb.opcoes.clienteSupabase },
      { ...sb.opcoes, db: my.opcoes.db }, { ...sb.opcoes, repositorios: {} }]) {
      assert.throws(() => criar(opcoes), e => e.respostaStatus === 500);
    }
    assert.deepEqual(my.etapas, []); assert.deepEqual(sb.calls, []);
  }
});
test("imports tardios: servico MySQL nao carrega adaptadores RPC; Supabase nao carrega repos MySQL", () => {
  for (const [caso, arquivo, fabrica] of [["custos", "custos", "criarServicoCustos"],
    ["cotacoes", "cotacoes", "criarServicoCotacoes"], ["acesso", "solicitacoes-acesso", "criarServicoSolicitacoesAcesso"]]) {
    for (const provider of ["mysql", "supabase"]) {
      const imports = [];
      const context = { module: { exports: {} }, require(name) {
        imports.push(name);
        assert.notEqual(name, "../db"); assert.notEqual(name, "../db-supabase.cjs");
        if (provider === "supabase") assert.equal(name.includes("/mysql/"), false);
        else assert.equal(/supabase\/(custos-transacao|cotacoes-publicacao|solicitacoes-acesso-decisao)/.test(name), false);
        return require(path.resolve(__dirname, "../services", name));
      } };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services", arquivo + ".cjs"), "utf8"), context);
      const my = mysql(caso), sb = supabase(caso, () => ({}));
      const options = provider === "mysql" ? { db: my.opcoes.db, agora } : sb.opcoes;
      context.module.exports[fabrica](options);
      assert.equal(imports.some(n => n.includes("/mysql/")), provider === "mysql");
    }
  }
});
