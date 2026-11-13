import { Component, Suspense, createRef, lazy, useState } from 'react'
import { Alerta, Botao, Skeleton } from './Primitivas.jsx'

class FalhaDeModulo extends Component {
  state = { erro: null }
  mensagem = createRef()
  static getDerivedStateFromError(erro) { return { erro } }
  componentDidCatch(erro) { if (erro.carregamentoModulo) this.mensagem.current?.focus() }
  render() {
    if (!this.state.erro) return this.props.children
    if (!this.state.erro.carregamentoModulo) throw this.state.erro
    return <Alerta variante="erro" titulo="Não foi possível carregar esta tela" tabIndex={-1} ref={this.mensagem}>
      <p>Confira sua conexão e tente novamente. Os dados mantidos na aplicação não foram descartados.</p>
      <Botao variante="secundario" onClick={this.props.aoRepetir}>Tentar novamente</Botao>
    </Alerta>
  }
}

// Um carregador por grupo reaproveita o módulo entre seções e desmontagens.
// Falhas liberam a promessa para uma nova tentativa explícita, sem recarga da página.
export function criarCarregador(importar) {
  let promessa
  return () => {
    if (!promessa) promessa = Promise.resolve().then(importar).catch(causa => {
      promessa = undefined
      throw Object.assign(new Error('Falha no carregamento do módulo.', { cause: causa }), { carregamentoModulo: true })
    })
    return promessa
  }
}

export function criarTelaSobDemanda(carregar, nome) {
  const tipos = new Map()
  let geracao = 0
  function obterTipo(tentativa) {
    if (!tipos.has(tentativa)) tipos.set(tentativa, lazy(() => carregar().then(modulo => ({ default: modulo[nome] }))))
    return tipos.get(tentativa)
  }
  return function TelaSobDemanda(props) {
    const [tentativa, setTentativa] = useState(() => geracao)
    const Tela = obterTipo(tentativa)
    return <FalhaDeModulo key={tentativa} aoRepetir={() => { geracao++; setTentativa(geracao) }}>
      <Suspense fallback={<Skeleton tipo="card" rotulo="Carregando tela..." linhas={5} />}>
        <Tela {...props} />
      </Suspense>
    </FalhaDeModulo>
  }
}
