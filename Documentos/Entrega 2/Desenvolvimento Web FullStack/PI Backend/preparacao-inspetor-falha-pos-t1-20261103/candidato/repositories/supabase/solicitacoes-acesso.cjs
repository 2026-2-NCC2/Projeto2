"use strict";

// Leituras, criacao e decisao atomica via RPC. Nenhuma rota muda de provedor;
// importar este modulo e inerte.
function criarRepositorioSolicitacoesAcesso(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase()
) {
  let decisao;
  return {
    async decidir(adminId, solicitacaoId, status) {
      // Operacao composta: nao emular conexao MySQL nem dividir perfil/status
      // entre chamadas HTTP. Admin vem da sessao autenticada no backend.
      // Reutiliza validacoes, mensagens, timeout incerto e ausencia de retry.
      decisao ??= require("./solicitacoes-acesso-decisao.cjs")
        .criarAdaptadorDecisaoAcesso(cliente);
      return decisao.decidir(adminId, solicitacaoId, status);
    },

    async criar(usuarioId, perfilSolicitado, justificativa) {
      // Participante, perfil solicitado, trim e pendencia ficam no handler.
      // Sem transacao/garantia nova contra corridas; preserva o fluxo MySQL.
      const { data, error } = await cliente.schema("public")
        .from("solicitacoes_acesso")
        .insert({ usuario_id: usuarioId, perfil_solicitado: perfilSolicitado, justificativa })
        .select("id")
        .single()
        .retry(false);
      // Inclusive unicidade: nao mapear para 409, pois o handler atual usa 500.
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          !Object.hasOwn(data, "id") || !Number.isSafeInteger(data.id) || data.id <= 0) {
        throw Object.assign(new Error("Resposta invalida ao criar solicitacao."), {
          code: "SUPABASE_SOLICITACAO_CREATE_RESPONSE", resultadoIncerto: true,
        });
      }
      return data.id;
    },

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
