"use strict";

// Somente leituras de inscricoes. Nenhuma rota passa a
// usar Supabase nesta etapa; fabrica existente e importada apenas se necessario.
function criarRepositorioInscricoes(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase()
) {
  return {
    async buscarPorUsuarioEEvento(usuarioId, eventoId) {
      const { data, error } = await cliente.schema("public")
        .from("inscricoes")
        .select("id")
        .eq("usuario_id", usuarioId)
        .eq("evento_id", eventoId);

      // Sem filtro de status, como no MySQL. O par usuario/evento e unico.
      if (error) throw error;
      if (!Array.isArray(data) || data.length > 1 || data.some(inscricao =>
        !inscricao || typeof inscricao !== "object" || Array.isArray(inscricao) ||
        !Number.isSafeInteger(inscricao.id) || inscricao.id <= 0
      )) {
        throw Object.assign(new Error("Resposta invalida ao consultar inscricao."), {
          code: "SUPABASE_INSCRICAO_RESPONSE",
        });
      }
      return data.map(inscricao => ({ id: inscricao.id }));
    },

    async buscarEventoAtivo(eventoId) {
      const { data, error } = await cliente.schema("public")
        .from("eventos")
        .select("id")
        .eq("id", eventoId)
        .eq("status", "Ativo");

      // O MySQL devolve array (inclusive vazio), nao objeto/undefined.
      // Validacoes, JWT, autorizacao e HTTP permanecem no handler existente.
      if (error) throw error;
      if (!Array.isArray(data) || data.length > 1 || data.some(evento =>
        !evento || typeof evento !== "object" || Array.isArray(evento) || evento.id !== eventoId
      )) {
        throw Object.assign(new Error("Resposta invalida ao consultar evento ativo."), {
          code: "SUPABASE_INSCRICAO_RESPONSE",
        });
      }
      return data.map(evento => ({ id: evento.id }));
    },

    async listarPorUsuario(usuarioId) {
      const { erroResposta, dataLocal, instante, listarPaginas } = require("./suporte-leitura.cjs");
      const code = "SUPABASE_INSCRICAO_RESPONSE";
      // Sem filtros de status e sem desempate novo: MySQL ordena somente pela
      // data de inscricao. Empates podem tornar a paginacao instavel.
      return listarPaginas(() => cliente.schema("public").from("inscricoes")
        .select("id, evento_id, status, data_inscricao, evento:eventos!inner(nome, data, horario, local, categoria)", { count: "exact" })
        .eq("usuario_id", usuarioId)
        .order("data_inscricao", { ascending: false }), item => {
        const evento = item.evento;
        if (["evento_id", "status", "data_inscricao"].some(campo => !Object.hasOwn(item, campo)) ||
            !evento || typeof evento !== "object" || Array.isArray(evento) ||
            ["nome", "data", "horario", "local", "categoria"].some(campo => !Object.hasOwn(evento, campo))) {
          throw erroResposta(code);
        }
        return {
          id: item.id, evento_id: item.evento_id, status: item.status,
          data_inscricao: instante(item.data_inscricao, code), evento_nome: evento.nome,
          evento_data: dataLocal(evento.data, code), evento_horario: evento.horario,
          evento_local: evento.local, evento_categoria: evento.categoria,
        };
      }, code);
    },
  };
}

module.exports = { criarRepositorioInscricoes };
