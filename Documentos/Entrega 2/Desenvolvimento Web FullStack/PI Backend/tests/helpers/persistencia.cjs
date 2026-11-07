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
function dependenciaPura(nome) {
  // Lista fechada de módulos inertes. Nenhum prefixo dinâmico, driver,
  // preflight, inicializador de imagens ou configuração privada é permitido.
  if (nome === './services/eventos.cjs') return require('../../services/eventos.cjs');
  if (nome === './config/encerramento-gracioso.cjs') return require('../../config/encerramento-gracioso.cjs');
  if (nome === './imagens/http-binario.cjs') return require('../../imagens/http-binario.cjs');
  if (nome === './eventos-imagens-http.cjs') return require('../../eventos-imagens-http.cjs');
  if (nome === './painel-evento-admin-http.cjs') return require('../../painel-evento-admin-http.cjs');
  if (nome === './admin-consultas-http.cjs') return require('../../admin-consultas-http.cjs');
  if (nome === './termos-cadastro.cjs') return require('../../termos-cadastro.cjs');
  if (nome === './privacidade-conta.cjs') return require('../../privacidade-conta.cjs');
  if (nome === "./portfolio.cjs") return require("../../portfolio.cjs");
  if (nome === "./imagens/rotas.cjs") return require("../../imagens/rotas.cjs");
  if (nome === "./perfil.cjs") return require("../../perfil.cjs");
}
function dependencia(nome, db, options) {
  const pura = dependenciaPura(nome);
  if (pura) return pura;
  if (nome === "./config/startup-controlado.cjs") return { validarEntrada: (env, modo) =>
    require('../../config/startup-controlado.cjs').validarEntrada(env, modo, { estado: { ler: () => ({ versao: 1, congelado: false, selado: false, instancias: [] }) } }) };
  if (nome === "./config/banco.cjs") return require("../../config/banco.cjs");
  if (nome === "./services/suporte-transacoes.cjs") return suporte;
  if (nome === "./repositories/index.cjs") return { criarPersistencia: () => criar(db, options) };
}
function responderErroServico(res, erro, mensagem) {
  return res.status(erro instanceof suporte.ErroServico ? erro.respostaStatus : 500)
    .json({ erro: erro instanceof suporte.ErroServico ? erro.message : mensagem });
}
module.exports = { criar, dependencia, dependenciaPura, responderErroServico };
