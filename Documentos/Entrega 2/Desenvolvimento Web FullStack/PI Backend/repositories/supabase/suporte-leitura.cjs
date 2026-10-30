"use strict";

// Funcoes puras/cliente injetado: nenhuma configuracao, SDK ou conexao propria.
function erroResposta(code) {
  return Object.assign(new Error("Resposta invalida ao consultar listagem."), { code });
}

function validarCalendario(valor, code) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw erroResposta(code);
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(`${valor}T00:00:00Z`);
  if (!Number.isFinite(data.getTime()) || data.getUTCFullYear() !== ano ||
      data.getUTCMonth() + 1 !== mes || data.getUTCDate() !== dia) throw erroResposta(code);
}

function dataLocal(valor, code) {
  validarCalendario(valor, code);
  const data = new Date(`${valor}T00:00:00`);
  if (!Number.isFinite(data.getTime())) throw erroResposta(code);
  return data;
}

function instante(valor, code) {
  if (typeof valor !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(valor)) {
    throw erroResposta(code);
  }
  validarCalendario(valor.slice(0, 10), code);
  if (Number(valor.slice(11, 13)) > 23 || Number(valor.slice(14, 16)) > 59 ||
      Number(valor.slice(17, 19)) > 59) throw erroResposta(code);
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) throw erroResposta(code);
  return data;
}

// Mantem a lista completa. Detecta contagens divergentes e IDs repetidos, mas
// NAO garante snapshot ou estabilidade dos empates entre paginas REST.
// DATE segue o fuso local do mysql2; TIMESTAMPTZ conserva o offset recebido.
// Fidelidade dos instantes importados depende de reconciliacao posterior.
async function listarPaginas(montarConsulta, converter, code) {
  const resultado = [];
  const ids = new Set();
  let total;
  do {
    const { data, error, count } = await montarConsulta().range(resultado.length, resultado.length + 999);
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 ||
        (total !== undefined && count !== total) || resultado.length + data.length > count ||
        (data.length === 0 && resultado.length < count)) throw erroResposta(code);
    total = count;
    for (const item of data) {
      if (!item || typeof item !== "object" || Array.isArray(item) ||
          !Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(item.id)) throw erroResposta(code);
      const convertido = converter(item);
      ids.add(item.id);
      resultado.push(convertido);
    }
  } while (resultado.length < total);
  return resultado;
}

// mysql2 devolve DECIMAL(12,2) como string na configuracao atual. Solicitar
// numeric::text no PostgREST evita perda antes de JSON.parse. Nao arredondar
// nem impor sinal positivo aqui: a leitura preserva inclusive valores negativos
// historicos que o tipo MySQL permite, sem criar regra de negocio nova.
function decimalTexto(valor, code) {
  if (typeof valor !== "string" || !/^-?(?:0|[1-9]\d{0,9})\.\d{2}$/.test(valor)) {
    throw erroResposta(code);
  }
  return valor;
}

module.exports = { erroResposta, dataLocal, instante, listarPaginas, decimalTexto };
