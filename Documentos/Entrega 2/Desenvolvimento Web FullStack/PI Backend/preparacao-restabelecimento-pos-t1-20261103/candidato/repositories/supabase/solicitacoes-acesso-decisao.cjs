"use strict";

const mensagens = Object.freeze({
  TA400: [400, "Informe uma solicitação e um status válidos."],
  TA403: [403, "Você não tem permissão para realizar esta ação."],
  TA404: [404, "Solicitação não encontrada."],
  TA409: [409, "Esta solicitação já foi analisada."],
  TA412: [409, "O usuário não possui mais o perfil participante."],
});
const mensagemErro = "Erro interno ao analisar solicitação.";
class ErroDecisao extends Error {}
function erro(code, respostaStatus, message, resultadoIncerto = false) {
  return Object.assign(new ErroDecisao(message), { code, respostaStatus, resultadoIncerto });
}

// Independente das rotas/provider. Admin deve vir de req.usuario.id, nunca do
// corpo. O adaptador valida o numero; a autorizacao administrativa fica no
// middleware existente e na precondicao SQL preparada, nao em dados do cliente.
function criarAdaptadorDecisaoAcesso(cliente, { timeoutMs = 15000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) {
    throw erro("DECISAO_CONFIG", 500, mensagemErro);
  }
  let banco = cliente;
  return {
    async decidir(adminId, solicitacaoId, status) {
      if (!Number.isSafeInteger(adminId) || adminId <= 0) throw erro("TA403", ...mensagens.TA403);
      let id;
      try { id = Number(solicitacaoId); }
      catch { throw erro("DECISAO_ENTRADA", 500, mensagemErro); }
      // Mesma permissividade do handler: isInteger, sem isSafeInteger no ID.
      if (!Number.isInteger(id) || id <= 0 || !["aprovado", "rejeitado"].includes(status)) {
        throw erro("TA400", ...mensagens.TA400);
      }
      const mensagemEsperada = status === "aprovado"
        ? "Solicitação aprovada com sucesso!" : "Solicitação rejeitada com sucesso!";
      const controle = new AbortController();
      let timer;
      try {
        if (banco === undefined) banco = require("../../db-supabase.cjs").criarClienteSupabase();
        const consulta = banco.schema("public").rpc("decidir_solicitacao_acesso", {
          p_admin_id: adminId, p_solicitacao_id: String(id), p_status: status,
        }, { get: false, head: false }).retry(false).abortSignal(controle.signal);
        const limite = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(erro("DECISAO_TIMEOUT", 500, mensagemErro, true));
            controle.abort();
          }, timeoutMs);
        });
        const resposta = await Promise.race([consulta, limite]);
        if (resposta?.error) {
          const codigo = resposta.error.code;
          const negocio = typeof codigo === "string" && Object.hasOwn(mensagens, codigo) && mensagens[codigo];
          if (negocio) throw erro(codigo, ...negocio);
          throw erro("DECISAO_RPC", 500, mensagemErro, true);
        }
        const data = resposta?.data;
        if (!data || typeof data !== "object" || Array.isArray(data) || !Object.hasOwn(data, "mensagem") ||
            data.mensagem !== mensagemEsperada) {
          throw Error("resposta");
        }
        return { mensagem: data.mensagem };
      } catch (falha) {
        if (falha instanceof ErroDecisao) throw falha;
        // Nao expor SDK/SQL/parametros/cause. Tecnico/timeout pode ter ocorrido
        // apos commit: nao afirmar rollback nem repetir a decisao automaticamente.
        throw erro("DECISAO_RESULTADO_INCERTO", 500, mensagemErro, true);
      } finally {
        clearTimeout(timer);
        controle.abort();
      }
    },
  };
}

module.exports = { criarAdaptadorDecisaoAcesso };
