"use strict";

// O chamador prepara process.env. Este modulo nao carrega .env nem altera o
// provedor ativo. Importa-lo nao cria pools, clientes ou repositorios.
// A fabrica prepara dependencias; NAO autoriza iniciar o servidor Supabase.
// O bloqueio de startup em config/banco.cjs continua independente e intacto.
function prepararRepositorios() {
  const { modoExecucao } = require("../isolamento.cjs");
  const { lerConfiguracaoBanco } = require("../config/banco.cjs");
  // Validar antes de importar qualquer driver ou repositorio. O modo real do
  // processo nao pode ser substituido por uma opcao recebida pelo chamador.
  const { provider } = lerConfiguracaoBanco(process.env, modoExecucao());
  const conexao = provider === "mysql"
    ? require("../db")
    : require("../db-supabase.cjs").criarClienteSupabase(process.env);

  // provider ja foi restrito a mysql/supabase pela configuracao existente.
  // Cada conjunto recebe apenas seu adaptador; sem wrappers de consultas,
  // fallback, conexao transacional REST ficticia ou mudanca de assinaturas.
  const repositorios = {
    provider,
    usuarios: require(`./${provider}/usuarios.cjs`).criarRepositorioUsuarios(conexao,
      { contasTeste: provider === 'supabase' }),
    eventos: require(`./${provider}/eventos.cjs`).criarRepositorioEventos(conexao,{gestaoSegura:provider==='supabase'}),
    custos: require(`./${provider}/custos.cjs`).criarRepositorioCustos(conexao),
    cotacoes: require(`./${provider}/cotacoes.cjs`).criarRepositorioCotacoes(conexao),
    propostas: require(`./${provider}/propostas.cjs`).criarRepositorioPropostas(conexao),
    inscricoes: require(`./${provider}/inscricoes.cjs`).criarRepositorioInscricoes(conexao,{gestaoSegura:provider==='supabase'}),
    solicitacoesAcesso: require(`./${provider}/solicitacoes-acesso.cjs`)
      .criarRepositorioSolicitacoesAcesso(conexao),
  };
  // Usa o cliente já selecionado; não cria conexão extra nem recorre ao MySQL.
  if(provider==='supabase' && process.env.PORTFOLIO_FORNECEDOR_ATIVO==='true') {
    repositorios.portfolio=require('./supabase/portfolio.cjs').criarRepositorioPortfolio(conexao);
  }
  return { provider, conexao, repositorios };
}

function criarRepositorios() {
  const { repositorios } = prepararRepositorios();
  const supervisor = require("../config/supervisor-cutover.cjs").criarSupervisor();
  return supervisor.instrumentar({ repositorios, servicos: {} }).repositorios;
}

function criarPersistencia() {
  // A leitura do estado privado precede qualquer criacao de cliente/pool.
  const supervisor = require("../config/supervisor-cutover.cjs").criarSupervisor();
  const { provider, conexao, repositorios } = prepararRepositorios();
  const opcoes = provider === "mysql"
    ? { provider, db: conexao, repositorios }
    : { provider, clienteSupabase: conexao };
  const servicos = {
    custos: require("../services/custos.cjs").criarServicoCustos(opcoes),
    cotacoes: require("../services/cotacoes.cjs").criarServicoCotacoes(opcoes),
    solicitacoesAcesso: require("../services/solicitacoes-acesso.cjs").criarServicoSolicitacoesAcesso(opcoes),
  };
  return { ...supervisor.instrumentar({ repositorios, servicos }), supervisor };
}

module.exports = { criarRepositorios, criarPersistencia };
