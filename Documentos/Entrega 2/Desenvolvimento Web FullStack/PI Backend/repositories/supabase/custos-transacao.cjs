"use strict";

const { decimalTexto } = require("./suporte-leitura.cjs");
const mensagemErro = "Erro interno ao salvar custos do evento.";
class ErroCustos extends Error {}

function erro(code, respostaStatus, message, resultadoIncerto = false) {
  return Object.assign(new ErroCustos(message), { code, respostaStatus, resultadoIncerto });
}

// Mesmo contrato de validacao do PUT atual, sem converter dinheiro em float.
function normalizar(eventoId, usuarioId, custos) {
  if (!Number.isSafeInteger(eventoId) || eventoId <= 0) {
    throw erro("CUSTOS_VALIDACAO", 400, "ID do evento inválido.");
  }
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    throw erro("CUSTOS_ATOR_INVALIDO", 403, "Você não tem permissão para realizar esta ação.");
  }
  if (!Array.isArray(custos)) throw erro("CUSTOS_VALIDACAO", 400, "Informe a propriedade custos como um array.");
  return Array.from(custos, item => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        typeof item.categoria !== "string" || !item.categoria.trim() || Array.from(item.categoria.trim()).length > 100 ||
        typeof item.descricao !== "string" || !item.descricao.trim() || Array.from(item.descricao.trim()).length > 255 ||
        !["number", "string"].includes(typeof item.valor_estimado) ||
        (typeof item.valor_estimado === "number" && !Number.isFinite(item.valor_estimado))) {
      throw erro("CUSTOS_VALIDACAO", 400, "Informe categoria de até 100 caracteres, descrição de até 255 caracteres e valor estimado válido.");
    }
    const valor = String(item.valor_estimado).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(valor)) {
      throw erro("CUSTOS_VALIDACAO", 400, "O valor estimado deve ser não negativo e possuir no máximo duas casas decimais.");
    }
    const [inteiro, fracao = ""] = valor.split(".");
    const parteInteira = inteiro.replace(/^0+(?=\d)/, "");
    if (parteInteira.length > 10) {
      throw erro("CUSTOS_VALIDACAO", 400, "O valor estimado não pode exceder 9999999999.99.");
    }
    return { categoria: item.categoria.trim(), descricao: item.descricao.trim(),
      valor_estimado: `${parteInteira}.${fracao.padEnd(2, "0")}` };
  });
}

// Adaptador independente, ainda nao importado por server.js/db.js ou rotas.
// A fabrica existente so e chamada depois de validar integralmente a entrada.
function criarAdaptadorSubstituicaoCustos(cliente, { timeoutMs = 15000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) {
    throw erro("CUSTOS_CONFIG", 500, "Limite de tempo inválido.");
  }
  let banco = cliente;
  return {
    async substituir(eventoId, usuarioId, custos) {
      const itens = normalizar(eventoId, usuarioId, custos);
      if (banco === undefined) banco = require("../../db-supabase.cjs").criarClienteSupabase();
      const controle = new AbortController();
      let timer;
      try {
        const consulta = banco.schema("public").rpc("substituir_custos_evento", {
          p_evento_id: eventoId, p_usuario_id: usuarioId, p_custos: itens,
        }, { get: false, head: false }).retry(false).abortSignal(controle.signal);
        const limite = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(erro("CUSTOS_TIMEOUT", 500, mensagemErro, true));
            controle.abort();
          }, timeoutMs);
        });
        const resposta = await Promise.race([consulta, limite]);
        if (resposta?.error) {
          const codigo = resposta.error.code;
          if (codigo === "TC404") throw erro("CUSTOS_NAO_ENCONTRADO", 404, "Evento não encontrado.");
          if (codigo === "TC403") throw erro("CUSTOS_ACESSO_NEGADO", 403, "Você não tem permissão para realizar esta ação.");
          if (codigo === "TC400") throw erro("CUSTOS_VALIDACAO_RPC", 400, "Lista de custos inválida.");
          throw erro("CUSTOS_RPC_ERROR", 500, mensagemErro, true);
        }
        const data = resposta?.data;
        if (!Array.isArray(data) || data.length !== itens.length) throw Error("resposta");
        let anterior = 0;
        return Array.from(data, (item, indice) => {
          const esperado = itens[indice];
          if (!item || typeof item !== "object" || Array.isArray(item) || !Number.isSafeInteger(item.id) || item.id <= anterior || item.evento_id !== eventoId ||
              item.categoria !== esperado.categoria || item.descricao !== esperado.descricao ||
              decimalTexto(item.valor_estimado, "CUSTOS_RESPOSTA") !== esperado.valor_estimado) throw Error("resposta");
          anterior = item.id;
          return { id: item.id, evento_id: item.evento_id, categoria: item.categoria,
            descricao: item.descricao, valor_estimado: item.valor_estimado };
        });
      } catch (falha) {
        // Nao expor SDK, parametros, stack SQL ou credenciais. Falhas tecnicas
        // sao conservadoramente incertas; nao ha reenvio nem consulta posterior.
        if (falha instanceof ErroCustos) throw falha;
        throw erro("CUSTOS_RESULTADO_INCERTO", 500, mensagemErro, true);
      } finally {
        clearTimeout(timer);
        controle.abort();
      }
    },
  };
}

module.exports = { criarAdaptadorSubstituicaoCustos };
