"use strict";

// Usa somente o pool/adaptador injetado. Validacoes e HTTP ficam nas rotas.
function criarRepositorioEventos(db) {
  return {
    async listarPorUsuario(usuarioId) {
      const [eventos] = await db.execute(
        `SELECT id, nome, data, horario, local,
                categoria, publico, descricao, status, usuario_id
         FROM eventos
         WHERE usuario_id = ?
         ORDER BY id DESC`,
        [usuarioId]
      );
      return eventos;
    },

    async listarAdministrativo() {
      const [eventos] = await db.execute(
        `SELECT
            e.id,
            e.nome,
            e.data,
            e.horario,
            e.local,
            e.categoria,
            e.publico,
            e.descricao,
            e.status,
            e.usuario_id,
            u.nome AS organizador_nome
         FROM eventos e
         INNER JOIN usuarios u ON u.id = e.usuario_id
         ORDER BY e.id DESC`
      );
      return eventos;
    },

    async listarAtivosParaParticipante() {
      const [eventos] = await db.execute(
        `SELECT id, nome, data, horario, local, categoria, publico, descricao, status
         FROM eventos
         WHERE status = 'Ativo'
         ORDER BY data ASC, id ASC`
      );
      return eventos;
    },

    async buscarPorIdDoUsuario(id, usuarioId) {
      const [eventos] = await db.execute(
        `SELECT id, nome, data, horario, local, categoria, publico, descricao, status, usuario_id
         FROM eventos
         WHERE id = ? AND usuario_id = ?`,
        [id, usuarioId]
      );
      return eventos[0];
    },

    async criar({ nome, data, horario, local, categoria, publico, descricao, status, usuarioId }) {
      const [resultado] = await db.execute(
        `INSERT INTO eventos
         (nome, data, horario, local, categoria,
          publico, descricao, status, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome, data, horario, local, categoria, publico, descricao, status, usuarioId]
      );
      return resultado.insertId;
    },

    async atualizar(id, usuarioId, { nome, data, horario, local, categoria, publico, descricao }) {
      const [resultado] = await db.execute(
        `UPDATE eventos
         SET nome = ?, data = ?, horario = ?, local = ?,
             categoria = ?, publico = ?, descricao = ?
         WHERE id = ? AND usuario_id = ?`,
        [nome, data, horario, local, categoria, publico, descricao, id, usuarioId]
      );
      return resultado.affectedRows;
    },

    async excluir(id, usuarioId) {
      const [resultado] = await db.execute(
        `DELETE FROM eventos
         WHERE id = ? AND usuario_id = ?`,
        [id, usuarioId]
      );
      return resultado.affectedRows;
    },

    async publicar(id, usuarioId) {
      const [resultado] = await db.execute(
        `UPDATE eventos
         SET status = 'Ativo'
         WHERE id = ?
           AND usuario_id = ?
           AND status = 'Em planejamento'`,
        [id, usuarioId]
      );
      return resultado.affectedRows;
    },
  };
}

module.exports = { criarRepositorioEventos };
