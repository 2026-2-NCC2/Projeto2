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
    usuarios: require(`./${provider}/usuarios.cjs`).criarRepositorioUsuarios(conexao),
    eventos: require(`./${provider}/eventos.cjs`).criarRepositorioEventos(conexao),
    custos: require(`./${provider}/custos.cjs`).criarRepositorioCustos(conexao),
    cotacoes: require(`./${provider}/cotacoes.cjs`).criarRepositorioCotacoes(conexao),
    propostas: require(`./${provider}/propostas.cjs`).criarRepositorioPropostas(conexao),
    inscricoes: require(`./${provider}/inscricoes.cjs`).criarRepositorioInscricoes(conexao),
    solicitacoesAcesso: require(`./${provider}/solicitacoes-acesso.cjs`)
      .criarRepositorioSolicitacoesAcesso(conexao),
  };
  return { provider, conexao, repositorios };
}

function criarRepositorios() { return prepararRepositorios().repositorios; }

function criarPersistencia() {
  const { provider, conexao, repositorios } = prepararRepositorios();
  const opcoes = provider === "mysql"
    ? { provider, db: conexao, repositorios }
    : { provider, clienteSupabase: conexao };
  const servicos = {
    custos: require("../services/custos.cjs").criarServicoCustos(opcoes),
    cotacoes: require("../services/cotacoes.cjs").criarServicoCotacoes(opcoes),
    solicitacoesAcesso: require("../services/solicitacoes-acesso.cjs").criarServicoSolicitacoesAcesso(opcoes),
  };
  return { repositorios, servicos };
}

module.exports = { criarRepositorios, criarPersistencia };
