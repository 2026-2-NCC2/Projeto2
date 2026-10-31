"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { lerDump, comparar, identidades, integridade } = require("../scripts/reconciliar-cutover-leitura.cjs");
const tables = ["usuarios", "eventos", "custos_evento", "cotacoes", "itens_cotacao", "propostas", "inscricoes", "solicitacoes_acesso"];
const vazio = () => Object.fromEntries(tables.map(t => [t, []]));
test("dump: preserva literais, escapes e dinheiro sem executar SQL", () => {
  const sql = tables.map((t, i) => "INSERT INTO `" + t + "` (`id`,`descricao`,`valor`) VALUES (" + (i + 1) + ",'d''agua\\nlinha','0.10');").join("\n");
  const parsed = lerDump(sql, true); assert.equal(parsed.rows.usuarios[0].descricao, "d'agua\nlinha"); assert.equal(parsed.rows.usuarios[0].valor, "0.10");
  assert.throws(() => lerDump(sql.replace("'0.10'", "expressao()"), true));
});
test("comparacao: detecta dinheiro negativo, ausencias e campos sem exportar valores", () => {
  const a = vazio(), b = vazio(); a.custos_evento = [{ id: 1, valor_estimado: "-0.10" }, { id: 2, valor_estimado: "1" }];
  b.custos_evento = [{ id: 1, valor_estimado: "0.10" }, { id: 3, valor_estimado: "1.00" }];
  const r = comparar(a, b).custos_evento;
  assert.deepEqual(r.ausentesDestino, ["2"]); assert.deepEqual(r.extrasDestino, ["3"]);
  assert.deepEqual(r.camposDivergentes, { valor_estimado: 1 }); assert.equal(JSON.stringify(r).includes("-0.10"), false);
});
test("identidades: mesma PK nao valida outra pessoa; email detecta remapeamento", () => {
  const a = vazio(), b = vazio(); a.usuarios = [{ id: 1, email: "a@example.invalid", senha: "hash-sintetico", perfil: "participante" }];
  b.usuarios = [{ id: 1, email: "b@example.invalid", senha: "outro", perfil: "admin" }, { ...a.usuarios[0], id: 2 }];
  const r = identidades(a, b); assert.deepEqual(r.idsComOutraIdentidade, ["1"]);
  assert.deepEqual(r.mesmoEmailIdDiferente, [{ origem: "1", destino: "2" }]);
  assert.ok(!JSON.stringify(r).includes("@")); assert.ok(!JSON.stringify(r).includes("hash-sintetico"));
});
test("relacionamentos: detecta vinculos orfaos independentemente das contagens", () => {
  const rows = vazio(); rows.eventos = [{ id: 1, usuario_id: 10 }];
  assert.equal(integridade(rows).eventos.usuario_id, 1);
  rows.usuarios = [{ id: 10 }]; assert.equal(integridade(rows).eventos.usuario_id, 0);
});
test("classificacao: extra ao dump pode existir na origem atual, sem ser residuo", () => {
  const baseline = vazio(), source = vazio(), target = vazio();
  source.usuarios = [{ id: 10, email: "teste@example.invalid", perfil: "participante" }]; target.usuarios = structuredClone(source.usuarios);
  const r = require("../scripts/reconciliar-cutover-leitura.cjs").classificarAdicionais(baseline, source, target, ["teste@example.invalid"]);
  assert.equal(r[0].origem, "TAMBEM_PRESENTE_NA_ORIGEM_ATUAL");
  assert.equal(r[0].finalidade, "CONTA_DE_TESTE_DECLARADA_NO_ENV"); assert.ok(!JSON.stringify(r).includes("@"));
});
test("classificacao: texto teste nao autoriza excluir; evidencia classifica filhos", () => {
  const baseline = vazio(), source = vazio(), target = vazio();
  target.eventos = [{ id: 12, nome: "Evento teste", usuario_id: 1 }]; target.custos_evento = [{ id: 7, evento_id: 12, descricao: "Teste" }];
  const { classificarAdicionais } = require("../scripts/reconciliar-cutover-leitura.cjs");
  const sem = classificarAdicionais(baseline, source, target); assert.equal(sem.find(r => r.tabela === "eventos").finalidade, "INDICIO_TEXTUAL_DE_TESTE_NAO_CONCLUSIVO");
  const com = classificarAdicionais(baseline, source, target, [], { "eventos:12": "evidencia.json" });
  assert.equal(com.find(r => r.tabela === "custos_evento").finalidade, "VINCULADO_A_EVENTO_DE_TESTE_CONFIRMADO");
  assert.ok(com.every(r => r.decisao === "PRESERVAR_SEM_ALTERACAO_ATE_DECISAO_EXPLICITA"));
});
test("vinculo: mesma FK numerica pode apontar outra identidade", () => {
  const source = vazio(), target = vazio(); source.usuarios = [{ id: 1, email: "a@example.invalid" }]; target.usuarios = [{ id: 1, email: "b@example.invalid" }];
  source.eventos = [{ id: 5, usuario_id: 1 }]; target.eventos = structuredClone(source.eventos);
  assert.deepEqual(require("../scripts/reconciliar-cutover-leitura.cjs").conferirIdentidadeRelacionada(source, target)["eventos.usuario_id"], ["5"]);
});
test("instantes: componentes iguais nao ocultam diferenca de tres horas", () => {
  const target = vazio(); target.cotacoes = [{ id: 1, criada_em: "2026-10-31T12:00:00+00:00" }];
  const epochs = { cotacoes: { criada_em: { "1": String(Date.parse("2026-10-31T15:00:00Z") / 1000) } } };
  const r = require("../scripts/reconciliar-cutover-leitura.cjs").compararInstantes(epochs, target)["cotacoes.criada_em"];
  assert.deepEqual(r.idsDivergentes, ["1"]); assert.equal(r.diferencasMilissegundos[-10800000], 1);
});
