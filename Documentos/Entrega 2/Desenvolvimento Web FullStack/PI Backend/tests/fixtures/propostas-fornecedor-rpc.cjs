"use strict";

const campos = ["id", "cotacao_id", "valor", "condicoes_pagamento", "detalhes_tecnicos",
  "status", "criada_em", "evento_nome", "categoria"];
const base = { id: 2, cotacao_id: 6, valor: "9999999999.99", condicoes_pagamento: " Pix ",
  detalhes_tecnicos: " Som Á ", status: "Recusada", criada_em: "2030-01-01T10:00:00-03:00",
  evento_nome: " Evento " };

// Strings de SAIDA simuladas: nao sao resultados observados de GROUP_CONCAT.
const retornosSimulados = [
  { nome: "duplicatas ja eliminadas pelo banco simulado", categoria: "Som" },
  { nome: "multiplas categorias agregadas", categoria: "Som, Luz" },
  { nome: "acentos preservados", categoria: "Áudio, Segurança" },
  { nome: "Unicode composto preservado", categoria: "Áudio" },
  { nome: "Unicode decomposto preservado", categoria: "A\u0301udio" },
  { nome: "espacos finais preservados", categoria: "Som  " },
  { nome: "NULL permanece NULL", categoria: null },
  { nome: "string vazia permanece vazia", categoria: "" },
];

// Entradas de comparacao REAL, sem oracle ficticio ou regra aproximada.
const comparacoesPendentes = [
  { nome: "duplicatas exatas e multiplos itens", itens: ["Som", "Som", "Luz"] },
  { nome: "caixa e acentos", itens: ["Áudio", "audio", "ÁUDIO", "Audio"] },
  { nome: "Unicode composto versus decomposto", itens: ["Áudio", "A\u0301udio"] },
  { nome: "espacos finais", itens: ["Som", "Som ", "Som  "] },
  { nome: "NULL e ausencia de itens", itens: [null, null], semItens: [] },
  { nome: "vazio e separador literal", itens: ["", "", "Som, Luz", "Palco"] },
  { nome: "limites UTF-8 em bytes", itens: ["Áudio", "Luz"], limiteFixtureBytes: 8 },
  { nome: "mesma cotacao em propostas distintas", itens: ["Som", "Luz"], propostas: [1, 2] },
];

// Somente medidas de fixtures; nenhum truncamento e implementado.
const medidasBytes = [
  { nome: "abaixo", texto: "Áudio", bytesUtf8: 6, limiteFixtureBytes: 8, relacao: -1 },
  { nome: "no limite", texto: "Áudio, ", bytesUtf8: 8, limiteFixtureBytes: 8, relacao: 0 },
  { nome: "acima", texto: "Áudio, L", bytesUtf8: 9, limiteFixtureBytes: 8, relacao: 1 },
];

module.exports = { campos, base, retornosSimulados, comparacoesPendentes, medidasBytes };
