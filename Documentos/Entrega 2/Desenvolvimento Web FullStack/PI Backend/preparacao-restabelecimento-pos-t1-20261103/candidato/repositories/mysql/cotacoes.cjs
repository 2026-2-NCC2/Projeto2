"use strict";

// Somente persistencia. Publicacao recebe a conexao da transacao do handler.
function criarRepositorioCotacoes(db) {
  return {
    async bloquearCustosDoEvento(conexao, eventoId) {
      const [custos] = await conexao.execute(
        `SELECT id, categoria, descricao, valor_estimado FROM custos_evento
         WHERE evento_id = ? ORDER BY id FOR UPDATE`, [eventoId]
      );
      return custos;
    },

    async criar(conexao, { eventoId, prazo, observacoes }) {
      const [resultado] = await conexao.execute(
        `INSERT INTO cotacoes
         (evento_id, prazo, modalidade, observacoes, status)
         VALUES (?, ?, 'Fechada', ?, 'Aberta')`,
        [eventoId, prazo, observacoes]
      );
      return resultado.insertId;
    },

    async inserirItem(conexao, cotacaoId, { categoria, descricao, valor_estimado }) {
      const [resultado] = await conexao.execute(
        `INSERT INTO itens_cotacao
         (cotacao_id, categoria, descricao, valor_estimado)
         VALUES (?, ?, ?, ?)`,
        [cotacaoId, categoria, descricao, valor_estimado]
      );
      return resultado;
    },

    async listarPorOrganizador(usuarioId) {
      const [cotacoes] = await db.execute(
        `SELECT
          c.id,
          c.evento_id,
          e.nome AS evento_nome,
          e.data AS evento_data,
          e.local AS evento_local,
          c.prazo,
          c.modalidade,
          c.observacoes,
          c.status,
          c.criada_em
         FROM cotacoes c
         INNER JOIN eventos e ON e.id = c.evento_id
         WHERE e.usuario_id = ?
         ORDER BY c.id DESC`, [usuarioId]
      );
      return cotacoes;
    },

    async listarAdministrativo() {
      const [cotacoes] = await db.execute(
        `SELECT
          c.id,
          c.evento_id,
          e.nome AS evento_nome,
          c.prazo,
          c.modalidade,
          c.observacoes,
          c.status,
          c.criada_em
         FROM cotacoes c
         INNER JOIN eventos e ON e.id = c.evento_id
         ORDER BY c.id DESC`
      );
      return cotacoes;
    },

    async listarDisponiveisParaFornecedor() {
      const [cotacoes] = await db.execute(
        `SELECT
          c.id,
          c.evento_id,
          e.nome AS evento_nome,
          e.data AS evento_data,
          e.local AS evento_local,
          c.prazo,
          c.modalidade,
          c.observacoes,
          c.status,
          c.criada_em
         FROM cotacoes c
         INNER JOIN eventos e ON e.id = c.evento_id
         WHERE c.status = 'Aberta'
           AND c.prazo >= CURDATE()
         ORDER BY c.id DESC`
      );
      return cotacoes;
    },

    async listarItens(cotacaoId) {
      const [itens] = await db.execute(
        `SELECT id, categoria, descricao, valor_estimado
         FROM itens_cotacao
         WHERE cotacao_id = ?
         ORDER BY id`, [cotacaoId]
      );
      return itens;
    },
  };
}

module.exports = { criarRepositorioCotacoes };
