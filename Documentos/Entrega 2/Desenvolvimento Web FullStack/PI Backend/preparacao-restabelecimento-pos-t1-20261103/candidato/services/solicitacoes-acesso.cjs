"use strict";
const { falha, autorizar, dependencias, executarRpc } = require("./suporte-transacoes.cjs");
const mensagem = "Erro interno ao analisar solicitação.";
function criarServicoSolicitacoesAcesso(opcoes = {}) {
  const provider = dependencias(opcoes);
  if (provider === "supabase") {
    const adapter = require("../repositories/supabase/solicitacoes-acesso-decisao.cjs")
      .criarAdaptadorDecisaoAcesso(opcoes.clienteSupabase, { timeoutMs: opcoes.timeoutMs });
    return { async decidir(ator, id, status) {
      const adminId = autorizar(ator, "admin");
      return executarRpc(() => adapter.decidir(adminId, id, status), mensagem);
    } };
  }
  const db = opcoes.db;
  const repo = opcoes.repositorios?.solicitacoesAcesso ?? require("../repositories/mysql/solicitacoes-acesso.cjs").criarRepositorioSolicitacoesAcesso(db);
  return { async decidir(ator, solicitacaoId, status) {
    autorizar(ator, "admin");
    const id = Number(solicitacaoId);
    if (!Number.isInteger(id) || id <= 0 || !["aprovado", "rejeitado"].includes(status)) {
      throw falha(400, "Informe uma solicitação e um status válidos.");
    }
    let conexao, negocio, resultado;
    try {
      conexao = await db.getConnection();
      await conexao.beginTransaction();
      const rows = await repo.bloquearPorId(conexao, id);
      if (rows.length === 0) negocio = falha(404, "Solicitação não encontrada.");
      else if (rows[0].status !== "pendente") negocio = falha(409, "Esta solicitação já foi analisada.");
      else if (status === "aprovado" &&
          await repo.atualizarPerfilParticipante(conexao, rows[0].perfil_solicitado, rows[0].usuario_id) !== 1) {
        negocio = falha(409, "O usuário não possui mais o perfil participante.");
      }
      if (negocio) await conexao.rollback();
      else {
        await repo.atualizarStatus(conexao, status, id);
        await conexao.commit();
        resultado = { mensagem: status === "aprovado" ? "Solicitação aprovada com sucesso!" : "Solicitação rejeitada com sucesso!" };
      }
    } catch {
      if (conexao) {
        try { await conexao.rollback(); }
        catch { throw falha(500, "Erro interno no servidor.", true); }
      }
      throw falha(500, mensagem, true);
    } finally {
      if (conexao) { try { conexao.release(); } catch { throw falha(500, "Erro interno no servidor.", true); } }
    }
    if (negocio) throw negocio;
    return resultado;
  } };
}
module.exports = { criarServicoSolicitacoesAcesso };
