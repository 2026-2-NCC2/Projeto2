import { custosSemanticamenteIguais } from './custos.js'

export const ESTADOS_GET_CUSTOS = Object.freeze({
  NAO_CARREGADO: 'naoCarregado', CARREGANDO: 'carregando', CARREGADO: 'carregado', ERRO: 'erro',
})
export const ESTADOS_PUT_CUSTOS = Object.freeze({
  OCIOSO: 'ocioso', SALVANDO: 'salvando', ERRO: 'erro', RESULTADO_INCERTO: 'resultadoIncerto',
})

export function criarRascunhoCustos(geracaoSessao) {
  return {
    itens: [], basePersistida: null, revisaoLocal: 0, geracaoSessao, conflitoRemoto: false,
    get: { estado: 'naoCarregado', idRequisicao: null, revisaoInicial: null, erro: null },
    put: { estado: 'ocioso', idRequisicao: null, revisaoInicial: null, erro: null, mensagem: null, confirmarReenvio: false },
  }
}

export function rascunhoCustosTemAlteracoes(rascunho) {
  if (!rascunho) return false
  if (['salvando', 'resultadoIncerto'].includes(rascunho.put.estado)) return true
  return rascunho.basePersistida === null
    ? rascunho.itens.length > 0
    : !custosSemanticamenteIguais(rascunho.itens, rascunho.basePersistida)
}

export function iniciarRequisicaoCustos(rascunho, requisicao) {
  if (!rascunho || rascunho.geracaoSessao !== requisicao.geracaoSessao) return rascunho
  const campo = requisicao.metodo === 'GET' ? 'get' : 'put'
  return {
    ...rascunho,
    [campo]: {
      ...rascunho[campo], estado: campo === 'get' ? 'carregando' : 'salvando',
      idRequisicao: requisicao.id, revisaoInicial: requisicao.revisaoInicial,
      erro: null, mensagem: null,
    },
  }
}

function corresponde(rascunho, requisicao) {
  const campo = requisicao.metodo === 'GET' ? 'get' : 'put'
  return rascunho?.geracaoSessao === requisicao.geracaoSessao &&
    rascunho[campo].idRequisicao === requisicao.id
}

export function concluirGetCustos(rascunho, requisicao, servidor, formularioPendente = false) {
  if (!corresponde(rascunho, requisicao)) return rascunho
  const desconhecida = rascunho.basePersistida === null
  const incerto = rascunho.put.estado === 'resultadoIncerto'
  const preservar = formularioPendente || incerto ||
    rascunho.revisaoLocal !== requisicao.revisaoInicial ||
    (desconhecida ? rascunho.revisaoLocal > 0 || rascunho.itens.length > 0 :
      !custosSemanticamenteIguais(rascunho.itens, rascunho.basePersistida))
  const servidorMudou = desconhecida ? servidor.length > 0 :
    !custosSemanticamenteIguais(rascunho.basePersistida, servidor)
  return {
    ...rascunho,
    itens: preservar || custosSemanticamenteIguais(rascunho.itens, servidor) ? rascunho.itens : servidor,
    basePersistida: servidor,
    conflitoRemoto: preservar && !custosSemanticamenteIguais(rascunho.itens, servidor) &&
      (rascunho.conflitoRemoto || servidorMudou || incerto),
    get: { ...rascunho.get, estado: 'carregado', erro: null },
    put: incerto ? { ...rascunho.put, estado: 'ocioso', idRequisicao: null, erro: null, confirmarReenvio: true,
      mensagem: 'Estado atual do servidor consultado. A operação anterior pode ainda terminar. Um novo salvamento exige revisão e confirmação explícitas.' } : rascunho.put,
  }
}

export function concluirPutCustos(rascunho, requisicao, servidor) {
  if (!corresponde(rascunho, requisicao)) return rascunho
  const alterado = !custosSemanticamenteIguais(rascunho.itens, servidor)
  return {
    ...rascunho,
    // IDs locais permanecem estaveis: um formulario aberto durante o PUT nao perde seu item.
    basePersistida: servidor, conflitoRemoto: false,
    put: { ...rascunho.put, estado: 'ocioso', erro: null, confirmarReenvio: false,
      mensagem: alterado ? 'Lista enviada salva. Há alterações locais posteriores ainda não salvas.' : 'Custos salvos no banco.' },
  }
}

export function falharRequisicaoCustos(rascunho, requisicao, erro) {
  if (!corresponde(rascunho, requisicao)) return rascunho
  const campo = requisicao.metodo === 'GET' ? 'get' : 'put'
  return {
    ...rascunho,
    [campo]: {
      ...rascunho[campo],
      estado: campo === 'put' && erro.resultadoIncerto ? 'resultadoIncerto' : 'erro',
      erro: erro.message, mensagem: null,
    },
  }
}

export function usarBasePersistida(rascunho) {
  if (!rascunho || rascunho.basePersistida === null || rascunho.get.estado !== 'carregado' ||
      ['salvando', 'resultadoIncerto'].includes(rascunho.put.estado)) return rascunho
  const mudou = !custosSemanticamenteIguais(rascunho.itens, rascunho.basePersistida)
  return { ...rascunho, itens: rascunho.basePersistida, conflitoRemoto: false,
    revisaoLocal: rascunho.revisaoLocal + (mudou ? 1 : 0),
    put: { ...rascunho.put, estado: 'ocioso', erro: null,
      mensagem: rascunho.put.confirmarReenvio ? rascunho.put.mensagem : null } }
}
