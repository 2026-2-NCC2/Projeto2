"use strict";
// Composicao exclusivamente de teste. Nenhum driver, .env ou cliente real.
const suporte = require("../../services/suporte-transacoes.cjs");
function criar(db, { agora, modulos = {} } = {}) {
  const repositorios = { provider: "mysql" };
  for (const [nome, arquivo, fabrica] of [
    ["usuarios", "usuarios", "criarRepositorioUsuarios"], ["eventos", "eventos", "criarRepositorioEventos"],
    ["custos", "custos", "criarRepositorioCustos"], ["cotacoes", "cotacoes", "criarRepositorioCotacoes"],
    ["propostas", "propostas", "criarRepositorioPropostas"], ["inscricoes", "inscricoes", "criarRepositorioInscricoes"],
    ["solicitacoesAcesso", "solicitacoes-acesso", "criarRepositorioSolicitacoesAcesso"],
  ]) {
    const modulo = modulos[`./repositories/mysql/${arquivo}.cjs`] ?? require(`../../repositories/mysql/${arquivo}.cjs`);
    repositorios[nome] = modulo[fabrica](db);
  }
  // Alguns testes de startup nao executam transacoes e fornecem pool vazio.
  const pool = typeof db.getConnection === "function" ? db : { ...db, getConnection() { throw Error("Conexao inesperada no teste"); } };
  const options = { db: pool, repositorios, agora };
  return { repositorios, servicos: {
    custos: require("../../services/custos.cjs").criarServicoCustos(options),
    cotacoes: require("../../services/cotacoes.cjs").criarServicoCotacoes(options),
    solicitacoesAcesso: require("../../services/solicitacoes-acesso.cjs").criarServicoSolicitacoesAcesso(options),
  } };
}
function dependencia(nome, db, options) {
  if (nome === "./config/banco.cjs") return require("../../config/banco.cjs");
  if (nome === "./services/suporte-transacoes.cjs") return suporte;
  if (nome === "./repositories/index.cjs") return { criarPersistencia: () => criar(db, options) };
}
function responderErroServico(res, erro, mensagem) {
  return res.status(erro instanceof suporte.ErroServico ? erro.respostaStatus : 500)
    .json({ erro: erro instanceof suporte.ErroServico ? erro.message : mensagem });
}
module.exports = { criar, dependencia, responderErroServico };
