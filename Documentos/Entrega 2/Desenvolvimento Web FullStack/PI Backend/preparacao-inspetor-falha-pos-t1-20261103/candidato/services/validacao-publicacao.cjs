"use strict";
// Validador puro existente, compartilhado tambem com a RPC de custos.
const { normalizarCustos } = require("../repositories/supabase/validacao-custos.cjs");
const { falha } = require("./suporte-transacoes.cjs");
function erro(code, respostaStatus, message) {
  return Object.assign(falha(respostaStatus, message), { code });
}
function prepararPublicacao(usuarioId, payload, agora) {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) throw erro("TP403", 403, "Você não tem permissão para realizar esta ação.");
  const { evento_id, prazo, observacoes, itens } = payload || {};
  const invalido = () => erro("TP400", 400, "Informe evento, prazo válido e itens da cotação.");
  let revisados;
  try { revisados = normalizarCustos(Number(evento_id), usuarioId, itens); }
  catch { throw invalido(); }
  if (!["number", "string"].includes(typeof evento_id) || !Number.isSafeInteger(Number(evento_id)) || Number(evento_id) <= 0 ||
      typeof prazo !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(prazo) ||
      (observacoes !== undefined && typeof observacoes !== "string")) throw invalido();
  let hojeUtc;
  try {
    hojeUtc = agora().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hojeUtc)) throw Error();
  } catch { throw erro("PUBLICACAO_RELOGIO", 500, "Não foi possível confirmar a publicação. Consulte as cotações antes de tentar novamente."); }
  const data = new Date(`${prazo}T00:00:00Z`);
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== prazo || prazo < hojeUtc) {
    throw erro("PUBLICACAO_PRAZO", 400, "O prazo da cotação deve ser uma data válida e não pode estar no passado.");
  }
  return { evento_id, prazo, observacoes, revisados, hojeUtc };
}
module.exports = { prepararPublicacao };
