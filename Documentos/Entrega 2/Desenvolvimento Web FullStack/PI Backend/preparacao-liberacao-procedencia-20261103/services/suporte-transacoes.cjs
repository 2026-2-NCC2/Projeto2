"use strict";

class ErroServico extends Error {}
function falha(status, mensagem, incerto = false) {
  return Object.assign(new ErroServico(mensagem), { respostaStatus: status, resultadoIncerto: incerto });
}
function autorizar(ator, perfil) {
  // Ator deve ser req.usuario autenticado. Nunca aceitar identidade do body.
  if (!ator) throw falha(401, "Usuário não autenticado.");
  if (ator.perfil !== perfil || !Number.isSafeInteger(ator.id) || ator.id <= 0) {
    throw falha(403, "Você não tem permissão para realizar esta ação.");
  }
  return ator.id;
}
function dependencias(opcoes) {
  const provider = opcoes.provider === undefined ? "mysql" : opcoes.provider;
  if (!["mysql", "supabase"].includes(provider)) throw falha(500, "Provedor inválido.");
  const { modoExecucao } = require("../isolamento.cjs");
  if (modoExecucao() === "isolado" && provider !== "mysql") throw falha(500, "Ambiente isolado exige MySQL.");
  if (provider === "mysql") {
    if (opcoes.clienteSupabase !== undefined || !opcoes.db || typeof opcoes.db.getConnection !== "function") {
      throw falha(500, "Dependências MySQL inválidas.");
    }
  } else if (opcoes.db !== undefined || opcoes.repositorios !== undefined ||
      !opcoes.clienteSupabase || typeof opcoes.clienteSupabase.schema !== "function") {
    throw falha(500, "Dependências Supabase inválidas.");
  }
  return provider;
}
async function executarRpc(acao, mensagem) {
  try { return await acao(); }
  catch (erro) {
    // Os adaptadores existentes sanitizam falhas de transporte/SQL. Normalizar
    // a fronteira publica para o handler nao confiar em Error.message arbitrario.
    if ([400, 403, 404, 409, 500].includes(erro?.respostaStatus) &&
        typeof erro.resultadoIncerto === "boolean") {
      throw falha(erro.respostaStatus, erro.message, erro.resultadoIncerto);
    }
    throw falha(500, mensagem, true);
  }
}
module.exports = { ErroServico, falha, autorizar, dependencias, executarRpc };
