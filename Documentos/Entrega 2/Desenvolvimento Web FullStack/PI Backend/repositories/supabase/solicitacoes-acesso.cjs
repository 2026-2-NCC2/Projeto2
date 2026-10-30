"use strict";

// Apenas leituras comuns. Nao cria solicitacoes, altera perfis ou usa
// bloqueios. Nenhuma rota muda de provedor; importar este modulo e inerte.
function criarRepositorioSolicitacoesAcesso(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase()
) {
  return {
    async buscarPendentesPorUsuario(usuarioId) {
      const solicitacoes = [];
      const ids = new Set();
      let total;
      // SQL original nao promete ordem. id ASC estabiliza a paginacao interna;
      // nao limita a uma pendencia nem filtra por perfil solicitado.
      // Nao ha snapshot entre paginas: concorrencia ainda exige validacao real.
      do {
        const { data, error, count } = await cliente.schema("public").from("solicitacoes_acesso")
          .select("id", { count: "exact" })
          .eq("usuario_id", usuarioId)
          .eq("status", "pendente")
          .order("id", { ascending: true })
          .range(solicitacoes.length, solicitacoes.length + 999);
        if (error) throw error;
        if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 ||
            (total !== undefined && count !== total) || solicitacoes.length + data.length > count ||
            (data.length === 0 && solicitacoes.length < count)) {
          throw Object.assign(new Error("Resposta invalida ao consultar pendencias."), { code: "SUPABASE_SOLICITACAO_RESPONSE" });
        }
        total = count;
        for (const solicitacao of data) {
          if (!solicitacao || typeof solicitacao !== "object" || Array.isArray(solicitacao) ||
              !Number.isSafeInteger(solicitacao.id) || solicitacao.id <= 0 || ids.has(solicitacao.id)) {
            throw Object.assign(new Error("Resposta invalida ao consultar pendencias."), { code: "SUPABASE_SOLICITACAO_RESPONSE" });
          }
          ids.add(solicitacao.id);
          solicitacoes.push({ id: solicitacao.id });
        }
      } while (solicitacoes.length < total);
      return solicitacoes;
    },

    async listar() {
      const { erroResposta, instante, listarPaginas } = require("./suporte-leitura.cjs");
      const code = "SUPABASE_SOLICITACAO_RESPONSE";
      return listarPaginas(() => cliente.schema("public").from("solicitacoes_acesso")
        .select("id, usuario_id, perfil_solicitado, justificativa, status, criada_em, usuario:usuarios!inner(nome, email)", { count: "exact" })
        .order("criada_em", { ascending: false })
        .order("id", { ascending: false }), item => {
        const usuario = item.usuario;
        if (["usuario_id", "perfil_solicitado", "justificativa", "status", "criada_em"]
          .some(campo => !Object.hasOwn(item, campo)) ||
            !usuario || typeof usuario !== "object" || Array.isArray(usuario) ||
            !Object.hasOwn(usuario, "nome") || !Object.hasOwn(usuario, "email")) throw erroResposta(code);
        return {
          id: item.id, usuario_id: item.usuario_id, nome: usuario.nome, email: usuario.email,
          perfil_solicitado: item.perfil_solicitado, justificativa: item.justificativa,
          status: item.status, criada_em: instante(item.criada_em, code),
        };
      }, code);
    },
  };
}

module.exports = { criarRepositorioSolicitacoesAcesso };
