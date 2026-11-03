"use strict";

// Apenas consultas. O handler conserva validacao, transacao e ciclo da conexao.
function criarRepositorioCustos(db) {
  return {
    async buscarEventoDoUsuario(id, usuarioId) {
      const [eventos] = await db.execute(
        "SELECT id FROM eventos WHERE id = ? AND usuario_id = ?", [id, usuarioId]
      );
      return eventos;
    },

    async bloquearEventoDoUsuario(conexao, id, usuarioId) {
      const [eventos] = await conexao.execute(
        "SELECT id FROM eventos WHERE id = ? AND usuario_id = ? FOR UPDATE", [id, usuarioId]
      );
      return eventos;
    },

    async listarPorEvento(id, conexao = db) {
      const [custos] = await conexao.execute(
        `SELECT id, evento_id, categoria, descricao, valor_estimado
         FROM custos_evento
         WHERE evento_id = ?
         ORDER BY id`, [id]
      );
      return custos;
    },

    async excluirPorEvento(conexao, id) {
      const [resultado] = await conexao.execute("DELETE FROM custos_evento WHERE evento_id = ?", [id]);
      return resultado;
    },

    async inserir(conexao, id, item) {
      const [resultado] = await conexao.execute(
        `INSERT INTO custos_evento (evento_id, categoria, descricao, valor_estimado)
         VALUES (?, ?, ?, ?)`,
        [id, item.categoria, item.descricao, item.valor_estimado]
      );
      return resultado;
    },
  };
}

module.exports = { criarRepositorioCustos };
