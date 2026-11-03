"use strict";

// Somente persistencia. Validacoes, autorizacao e HTTP ficam nos handlers.
function criarRepositorioInscricoes(db) {
  return {
    async buscarEventoAtivo(eventoId) {
      const [eventos] = await db.execute(
        "SELECT id FROM eventos WHERE id = ? AND status = 'Ativo'",
        [eventoId]
      );
      return eventos;
    },

    async buscarPorUsuarioEEvento(usuarioId, eventoId) {
      const [inscricoes] = await db.execute(
        "SELECT id FROM inscricoes WHERE usuario_id = ? AND evento_id = ?",
        [usuarioId, eventoId]
      );
      return inscricoes;
    },

    async criar(usuarioId, eventoId) {
      const [resultado] = await db.execute(
        "INSERT INTO inscricoes (usuario_id, evento_id) VALUES (?, ?)",
        [usuarioId, eventoId]
      );
      return resultado.insertId;
    },

    async listarPorUsuario(usuarioId) {
      const [inscricoes] = await db.execute(
        `SELECT
          i.id,
          i.evento_id,
          i.status,
          i.data_inscricao,
          e.nome AS evento_nome,
          e.data AS evento_data,
          e.horario AS evento_horario,
          e.local AS evento_local,
          e.categoria AS evento_categoria
        FROM inscricoes i
        INNER JOIN eventos e ON i.evento_id = e.id
        WHERE i.usuario_id = ?
        ORDER BY i.data_inscricao DESC`,
        [usuarioId]
      );
      return inscricoes;
    },
  };
}

module.exports = { criarRepositorioInscricoes };
