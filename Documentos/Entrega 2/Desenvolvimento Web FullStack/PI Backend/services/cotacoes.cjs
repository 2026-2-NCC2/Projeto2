"use strict";
const { ErroServico, falha, autorizar, dependencias, executarRpc } = require("./suporte-transacoes.cjs");
const { prepararPublicacao } = require("./validacao-publicacao.cjs");
const { normalizarCustos } = require("../repositories/supabase/validacao-custos.cjs");
const mensagens = {
  400: "Cadastre custos no evento antes de publicar a cotação.",
  404: "Evento não encontrado ou não pertence ao usuário.",
  409: "Os custos foram alterados. Consulte e revise a lista antes de publicar.",
  500: "Não foi possível confirmar a publicação. Consulte as cotações antes de tentar novamente.",
};
function criarServicoCotacoes(opcoes = {}) {
  const provider = dependencias(opcoes);
  const agora = opcoes.agora ?? (() => new Date());
  if (provider === "supabase") {
    const adapter = require("../repositories/supabase/cotacoes-publicacao.cjs")
      .criarAdaptadorPublicacaoCotacoes(opcoes.clienteSupabase, { timeoutMs: opcoes.timeoutMs, agora });
    return { async publicar(ator, payload) {
      const id = autorizar(ator, "organizador");
      return executarRpc(() => adapter.publicar(id, payload), mensagens[500]);
    } };
  }
  if (typeof agora !== "function") throw falha(500, "Configuração inválida.");
  const db = opcoes.db;
  const custos = opcoes.repositorios?.custos ?? require("../repositories/mysql/custos.cjs").criarRepositorioCustos(db);
  const cotacoes = opcoes.repositorios?.cotacoes ?? require("../repositories/mysql/cotacoes.cjs").criarRepositorioCotacoes(db);
  return { async publicar(ator, payload) {
    const usuarioId = autorizar(ator, "organizador");
    const { evento_id, prazo, observacoes, revisados } = prepararPublicacao(usuarioId, payload, agora);
    const id = Number(evento_id);
    let conexao, descartar = false;
    try {
      conexao = await db.getConnection();
      await conexao.beginTransaction();
      if ((await custos.bloquearEventoDoUsuario(conexao, id, usuarioId)).length === 0) throw falha(404, mensagens[404]);
      const rows = await cotacoes.bloquearCustosDoEvento(conexao, id);
      if (rows.length === 0) throw falha(400, mensagens[400]);
      let persistidos;
      try { persistidos = normalizarCustos(id, usuarioId, rows); } catch { throw falha(500, mensagens[500], true); }
      if (JSON.stringify(revisados) !== JSON.stringify(persistidos)) throw falha(409, mensagens[409]);
      const cotacaoId = await cotacoes.criar(conexao, { eventoId: id, prazo, observacoes: observacoes || "" });
      for (const item of persistidos) await cotacoes.inserirItem(conexao, cotacaoId, item);
      await conexao.commit();
      return { mensagem: "Cotação publicada com sucesso!", cotacao: {
        id: cotacaoId, evento_id: id, prazo, modalidade: "Fechada", observacoes: observacoes || "", status: "Aberta", itens: persistidos,
      } };
    } catch (erro) {
      let status = erro instanceof ErroServico ? erro.respostaStatus : 500;
      if (conexao) {
        try { await conexao.rollback(); }
        catch {
          status = 500;
          if (typeof conexao.destroy === "function") {
            descartar = true;
            try { conexao.destroy(); } catch { /* Sem retry. */ }
          }
        }
      }
      if (![400, 404, 409].includes(status)) status = 500;
      throw falha(status, mensagens[status], status === 500);
    } finally {
      if (conexao && !descartar) { try { conexao.release(); } catch { /* Handler atual conserva a resposta. */ } }
    }
  } };
}
module.exports = { criarServicoCotacoes };
