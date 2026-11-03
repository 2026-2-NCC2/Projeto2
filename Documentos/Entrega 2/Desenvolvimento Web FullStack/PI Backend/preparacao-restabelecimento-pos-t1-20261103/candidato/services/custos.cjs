"use strict";
const { falha, autorizar, dependencias, executarRpc } = require("./suporte-transacoes.cjs");
const { normalizarCustos } = require("../repositories/supabase/validacao-custos.cjs");
const mensagem = "Erro interno ao salvar custos do evento.";

function criarServicoCustos(opcoes = {}) {
  const provider = dependencias(opcoes);
  if (provider === "supabase") {
    const adapter = require("../repositories/supabase/custos-transacao.cjs")
      .criarAdaptadorSubstituicaoCustos(opcoes.clienteSupabase, { timeoutMs: opcoes.timeoutMs });
    return { async substituir(ator, eventoId, custos) {
      const usuarioId = autorizar(ator, "organizador");
      return executarRpc(() => adapter.substituir(Number(eventoId), usuarioId, custos), mensagem);
    } };
  }
  const db = opcoes.db;
  const repo = opcoes.repositorios?.custos ?? require("../repositories/mysql/custos.cjs").criarRepositorioCustos(db);
  return { async substituir(ator, eventoId, custos) {
    const usuarioId = autorizar(ator, "organizador"), id = Number(eventoId);
    let itens;
    try { itens = normalizarCustos(id, usuarioId, custos); }
    catch (erro) { throw falha(erro.respostaStatus, erro.message); }
    let conexao, resultado, negocio;
    try {
      conexao = await db.getConnection();
      await conexao.beginTransaction();
      const eventos = await repo.bloquearEventoDoUsuario(conexao, id, usuarioId);
      if (eventos.length === 0) {
        await conexao.rollback();
        negocio = falha(404, "Evento não encontrado.");
      } else {
        await repo.excluirPorEvento(conexao, id);
        for (const item of itens) await repo.inserir(conexao, id, item);
        resultado = await repo.listarPorEvento(id, conexao);
        await conexao.commit();
      }
    } catch {
      if (conexao) { try { await conexao.rollback(); } catch { /* Mesmo tratamento do handler. */ } }
      throw falha(500, mensagem, true);
    } finally {
      // O handler atual deixa falhas de release chegarem ao erro global.
      if (conexao) {
        try { conexao.release(); } catch { throw falha(500, "Erro interno no servidor.", true); }
      }
    }
    if (negocio) throw negocio;
    return resultado;
  } };
}
module.exports = { criarServicoCustos };
