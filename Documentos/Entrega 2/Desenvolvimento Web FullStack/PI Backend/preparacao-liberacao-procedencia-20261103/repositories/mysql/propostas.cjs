"use strict";

// Somente persistencia, usando o mesmo pool/adaptador injetado em server.js.
function criarRepositorioPropostas(db) {
  return {
    async buscarCotacaoDisponivel(cotacaoId) {
      const [cotacoes] = await db.query(
        `SELECT id
         FROM cotacoes
         WHERE id = ?
           AND status = 'Aberta'
           AND prazo >= CURDATE()`,
        [cotacaoId]
      );
      return cotacoes;
    },

    async criar({ cotacaoId, fornecedorId, valor, condicoesPagamento, detalhesTecnicos }) {
      const [resultado] = await db.query(
        `INSERT INTO propostas
          (cotacao_id, fornecedor_id, valor,
           condicoes_pagamento, detalhes_tecnicos)
         VALUES (?, ?, ?, ?, ?)`,
        [cotacaoId, fornecedorId, valor, condicoesPagamento, detalhesTecnicos]
      );
      return resultado.insertId;
    },

    async listarPorFornecedor(fornecedorId) {
      const [propostas] = await db.query(
        `SELECT
          p.id,
          p.cotacao_id,
          p.valor,
          p.condicoes_pagamento,
          p.detalhes_tecnicos,
          p.status,
          p.criada_em,
          e.nome AS evento_nome,
          GROUP_CONCAT(DISTINCT i.categoria SEPARATOR ', ') AS categoria
        FROM propostas p
        INNER JOIN cotacoes c ON c.id = p.cotacao_id
        INNER JOIN eventos e ON e.id = c.evento_id
        LEFT JOIN itens_cotacao i ON i.cotacao_id = c.id
        WHERE p.fornecedor_id = ?
        GROUP BY
          p.id,
          p.cotacao_id,
          p.valor,
          p.condicoes_pagamento,
          p.detalhes_tecnicos,
          p.status,
          p.criada_em,
          e.nome
        ORDER BY p.criada_em DESC, p.id DESC`,
        [fornecedorId]
      );
      return propostas;
    },

    async listarPorOrganizador(organizadorId) {
      const [propostas] = await db.query(
        `SELECT
          p.id,
          p.cotacao_id,
          p.fornecedor_id,
          p.valor,
          p.condicoes_pagamento,
          p.detalhes_tecnicos,
          p.status,
          p.criada_em,
          e.id AS evento_id,
          e.nome AS evento_nome,
          u.nome AS fornecedor_nome
        FROM propostas p
        INNER JOIN cotacoes c ON c.id = p.cotacao_id
        INNER JOIN eventos e ON e.id = c.evento_id
        INNER JOIN usuarios u ON u.id = p.fornecedor_id
        WHERE e.usuario_id = ?
        ORDER BY p.criada_em DESC, p.id DESC`,
        [organizadorId]
      );
      return propostas;
    },

    async listarAdministrativo() {
      const [propostas] = await db.query(
        `
      SELECT
        p.id,
        p.cotacao_id,
        p.fornecedor_id,
        p.valor,
        p.condicoes_pagamento,
        p.detalhes_tecnicos,
        p.status,
        p.criada_em,
        e.id AS evento_id,
        e.nome AS evento_nome,
        u.nome AS fornecedor_nome
      FROM propostas p
      INNER JOIN cotacoes c ON c.id = p.cotacao_id
      INNER JOIN eventos e ON e.id = c.evento_id
      INNER JOIN usuarios u ON u.id = p.fornecedor_id
      ORDER BY p.criada_em DESC, p.id DESC
    `
      );
      return propostas;
    },

    async avaliar(propostaId, organizadorId, status) {
      const [resultado] = await db.query(
        `UPDATE propostas p
         INNER JOIN cotacoes c ON c.id = p.cotacao_id
         INNER JOIN eventos e ON e.id = c.evento_id
         SET p.status = ?
         WHERE p.id = ?
           AND e.usuario_id = ?
           AND p.status = 'Em avaliação'`,
        [status, propostaId, organizadorId]
      );
      return resultado.affectedRows;
    },

  };
}

module.exports = { criarRepositorioPropostas };
