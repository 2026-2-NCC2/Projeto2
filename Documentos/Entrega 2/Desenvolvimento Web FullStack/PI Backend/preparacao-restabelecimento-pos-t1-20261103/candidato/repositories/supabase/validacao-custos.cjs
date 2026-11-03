"use strict";

// Puro: contrato atual do PUT, compartilhado com a revisao da publicacao.
function falha(code, respostaStatus, message) {
  return Object.assign(new Error(message), { code, respostaStatus, resultadoIncerto: false });
}

function normalizarCustos(eventoId, usuarioId, custos) {
  if (!Number.isSafeInteger(eventoId) || eventoId <= 0) {
    throw falha("CUSTOS_VALIDACAO", 400, "ID do evento inválido.");
  }
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    throw falha("CUSTOS_ATOR_INVALIDO", 403, "Você não tem permissão para realizar esta ação.");
  }
  if (!Array.isArray(custos)) throw falha("CUSTOS_VALIDACAO", 400, "Informe a propriedade custos como um array.");
  return Array.from(custos, item => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.categoria !== "string" || !item.categoria.trim() || Array.from(item.categoria.trim()).length > 100 ||
        typeof item.descricao !== "string" || !item.descricao.trim() || Array.from(item.descricao.trim()).length > 255 ||
        !["number", "string"].includes(typeof item.valor_estimado) ||
        (typeof item.valor_estimado === "number" && !Number.isFinite(item.valor_estimado))) {
      throw falha("CUSTOS_VALIDACAO", 400, "Informe categoria de até 100 caracteres, descrição de até 255 caracteres e valor estimado válido.");
    }
    const valor = String(item.valor_estimado).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(valor)) {
      throw falha("CUSTOS_VALIDACAO", 400, "O valor estimado deve ser não negativo e possuir no máximo duas casas decimais.");
    }
    const [inteiro, fracao = ""] = valor.split(".");
    const parteInteira = inteiro.replace(/^0+(?=\d)/, "");
    if (parteInteira.length > 10) {
      throw falha("CUSTOS_VALIDACAO", 400, "O valor estimado não pode exceder 9999999999.99.");
    }
    return { categoria: item.categoria.trim(), descricao: item.descricao.trim(),
      valor_estimado: `${parteInteira}.${fracao.padEnd(2, "0")}` };
  });
}

module.exports = { normalizarCustos };
