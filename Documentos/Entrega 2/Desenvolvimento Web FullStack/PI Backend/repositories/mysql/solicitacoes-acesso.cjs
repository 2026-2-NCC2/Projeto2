"use strict";

// Somente SQL. O handler controla a transacao e fornece sua unica conexao.
function criarRepositorioSolicitacoesAcesso(db) {
  return {
    async buscarPendentesPorUsuario(usuarioId) {
      const [solicitacoes] = await db.execute(
        `SELECT id FROM solicitacoes_acesso
       WHERE usuario_id = ? AND status = 'pendente'`,
        [usuarioId]
      );
      return solicitacoes;
    },

    async criar(usuarioId, perfilSolicitado, justificativa) {
      const [resultado] = await db.execute(
        `INSERT INTO solicitacoes_acesso
       (usuario_id, perfil_solicitado, justificativa)
       VALUES (?, ?, ?)`,
        [usuarioId, perfilSolicitado, justificativa]
      );
      return resultado.insertId;
    },

    async listar() {
      const [solicitacoes] = await db.execute(`
        SELECT
          s.id,
          s.usuario_id,
          u.nome,
          u.email,
          s.perfil_solicitado,
          s.justificativa,
          s.status,
          s.criada_em
        FROM solicitacoes_acesso s
        INNER JOIN usuarios u ON u.id = s.usuario_id
        ORDER BY s.criada_em DESC, s.id DESC
      `);
      return solicitacoes;
    },

    async bloquearPorId(conexao, id) {
      const [solicitacoes] = await conexao.execute(
        `SELECT usuario_id, perfil_solicitado, status
         FROM solicitacoes_acesso
         WHERE id = ?
         FOR UPDATE`,
        [id]
      );
      return solicitacoes;
    },

    async atualizarPerfilParticipante(conexao, perfilSolicitado, usuarioId) {
      const [resultado] = await conexao.execute(
        `UPDATE usuarios
           SET perfil = ?
           WHERE id = ? AND perfil = 'participante'`,
        [perfilSolicitado, usuarioId]
      );
      return resultado.affectedRows;
    },

    async atualizarStatus(conexao, status, id) {
      const [resultado] = await conexao.execute(
        `UPDATE solicitacoes_acesso
         SET status = ?
         WHERE id = ?`,
        [status, id]
      );
      return resultado;
    },
  };
}

module.exports = { criarRepositorioSolicitacoesAcesso };
