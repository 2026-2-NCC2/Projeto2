import { Skeleton, Botao, Campo, Badge, Alerta, EstadoVazio } from '../../components/ui/Primitivas.jsx'
import './Organizador.css'
import './OrganizadorAcabamento.css'
import { Icone } from '../../components/ui/Icone.jsx'
import { useState, useMemo, useEffect } from 'react'
import { ConsultaPortfolios } from '../../components/portfolio/Portfolio.jsx'
import { apiUrl } from '../../services/api.js'
import { formatarMoeda } from '../../utils/formatarMoeda.js'
import { Contratacoes } from '../../components/contratacoes/Contratacoes.jsx'

export function Cotacao({
  evento,
  custos,
  setPagina,
  publicacao,
}) {
  const [prazo, setPrazo] = useState('')
  const { publicando } = publicacao
  const [propostasRecebidasSalvas, setPropostasRecebidas] = useState([])
  const [buscandoPropostas, setCarregandoPropostas] = useState(true)
  const propostasRecebidas = evento?.id ? propostasRecebidasSalvas : []
  const carregandoPropostas = Boolean(evento?.id) && buscandoPropostas
  const [erroPropostas, setErroPropostas] = useState('')
  const [tentativaPropostas, setTentativaPropostas] = useState(0)
  const token = sessionStorage.getItem('token')
  useEffect(() => {
  let ativo = true
  const controller = new AbortController()
  const buscarPropostasRecebidas = async () => {
    try {
      setCarregandoPropostas(true)
      setErroPropostas('')

      const resposta = await fetch(
        apiUrl('/organizador/propostas'),
        {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const dados = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Erro ao buscar propostas.')
      }

      if (!Array.isArray(dados)) throw new Error('Resposta de propostas incompleta. Tente consultar novamente.')
      const propostasDoEvento = dados.filter(
        (proposta) => Number(proposta.evento_id) === Number(evento.id)
      )

      if (ativo && sessionStorage.getItem('token') === token) setPropostasRecebidas(propostasDoEvento)

    } catch (erro) {
      if (!ativo || controller.signal.aborted || sessionStorage.getItem('token') !== token) return
      console.error('Erro ao buscar propostas recebidas:', erro)
      if (ativo && sessionStorage.getItem('token') === token) setErroPropostas(erro.message)

    } finally {
      if (ativo && sessionStorage.getItem('token') === token) setCarregandoPropostas(false)
    }
  }

  if (evento?.id) {
    buscarPropostasRecebidas()
  }
  return () => { ativo = false; controller.abort() }
}, [evento?.id, token, tentativaPropostas])
  const [avaliandoPropostaId, setAvaliandoPropostaId] = useState(null)
  const [feedbackAvaliacao, setFeedbackAvaliacao] = useState(null)
  const avaliarProposta = async (propostaId, novoStatus) => {
  if (avaliandoPropostaId !== null) return

  const acao = novoStatus === 'Aprovada' ? 'aprovar' : 'recusar'

  const confirmou = window.confirm(
    `Tem certeza que deseja ${acao} esta proposta?`
  )

  if (!confirmou) return

  setFeedbackAvaliacao(null)
  try {
    setAvaliandoPropostaId(propostaId)

    const token = sessionStorage.getItem('token')

    const resposta = await fetch(
      apiUrl(`/organizador/propostas/${propostaId}/status`),
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: novoStatus
        })
      }
    )

    const dados = await resposta.json()

    if (!resposta.ok) {
      throw new Error(dados.erro || 'Erro ao avaliar proposta.')
    }

    setPropostasRecebidas((atual) =>
      atual.map((proposta) =>
        proposta.id === propostaId
          ? { ...proposta, status: novoStatus }
          : proposta
      )
    )

    setFeedbackAvaliacao({ tipo: 'sucesso', mensagem: dados.mensagem })

  } catch (erro) {
    console.error('Erro ao avaliar proposta:', erro)
    setFeedbackAvaliacao({ tipo: 'erro', mensagem: erro.message })

  } finally {
    setAvaliandoPropostaId(null)
  }
}
  const [observacoes, setObservacoes] = useState(
    'Apresentar proposta comercial completa, incluindo impostos e condições de pagamento.'
  )
  const totalEstimado = useMemo(() => {
    return custos.reduce((acumulador, itemCusto) => acumulador + itemCusto.valor, 0)
  }, [custos])
  
const aoPublicarCotacao = async () => {
  const resultado = await publicacao.publicar({ prazo, observacoes, custosRevisados: custos })
  if (!resultado.contextoAtual) return
  if (resultado.estado === 'sucesso') {
    alert(resultado.mensagem)
    setPagina('ticket')
  } else if (resultado.estado === 'bloqueado') {
    alert(resultado.mensagem)
  }
}

  return (
    <div className="organizadorPagina orgPaginaSecundaria">
      <Botao className="voltar" variante="discreto" onClick={() => setPagina('custos')}>
        ← Voltar para Itens de Custo
      </Botao>
      <h1>PUBLICAR COTAÇÃO</h1>
      <p>Revise o resumo dos itens e configure o prazo para fornecedores.</p>
      <div className="gradeCotacao">
        <div className="cartaoFormulario">
          <h2><Icone nome="documento" /> Resumo da cotação e do evento</h2>
          <h3>{evento.nome}</h3>
          <p>
            {evento.data} às {evento.horario} • {evento.local}
          </p>
          <div style={{ marginTop: '20px' }}>
            {custos.map((itemCusto) => (
              <div className="itemResumo" key={itemCusto.id}>
                <span>{itemCusto.categoria}</span>
                <b>{formatarMoeda(itemCusto.valor)}</b>
              </div>
            ))}
          </div>
          <div className="total">
            <span>Total estimado</span>
            <strong>{formatarMoeda(totalEstimado)}</strong>
          </div>
        </div>
        <div className="cartaoFormulario">
          <h2>Parâmetros & Prazo da Concorrência</h2>
          <Campo id="cotacao-campo-1" label="Prazo para envio de propostas"
            type="date"
            value={prazo}
            onChange={(eventoDisparado) => setPrazo(eventoDisparado.target.value)}
           />
          <label>Modalidade da cotação</label>
          <div className="opcaoSelecionada">
            Cotação fechada
            <small>Melhor preço e condições comerciais com sigilo até abertura.</small>
          </div>
          <Campo id="cotacao-campo-2" label="Observações para os fornecedores" como="textarea"
            rows="5"
            value={observacoes}
            onChange={(eventoDisparado) => setObservacoes(eventoDisparado.target.value)}
           />
          
<Botao
  type="button"
  className="principal"
  style={{ width: '100%', marginTop: '20px' }}
  onClick={aoPublicarCotacao}
  disabled={publicacao.bloqueada}
>
  {publicando
    ? 'Publicando cotação...'
    : 'Publicar Cotação & Simular Ticket →'}
          </Botao>
          {(publicacao.motivo || publicacao.mensagem) && (
            <Alerta variante="informacao">{publicacao.motivo || publicacao.mensagem}</Alerta>
          )}
          {publicacao.estado === 'conflito' && (
            <Botao variante="secundario" type="button" className="secundario" onClick={() => setPagina('custos')}>
              Atualizar e revisar custos
            </Botao>
          )}
        </div>
      </div>
      <section className="cartaoFormulario orgPropostasRecebidas" aria-labelledby="org-propostas-titulo">
        <h2 id="org-propostas-titulo"><Icone nome="documento" /> Propostas recebidas</h2>
        <p>Propostas enviadas pelos fornecedores para este evento.</p>
        {feedbackAvaliacao && <Alerta variante={feedbackAvaliacao.tipo}>
          <p>{feedbackAvaliacao.mensagem}</p>
          {feedbackAvaliacao.tipo === 'erro' && <><p>Não foi possível confirmar o resultado. Consulte as propostas antes de repetir a operação.</p><Botao variante="secundario" disabled={carregandoPropostas} onClick={() => setTentativaPropostas(n => n + 1)}>Consultar propostas novamente</Botao></>}
        </Alerta>}

        {carregandoPropostas && (
          <Skeleton tipo="card" rotulo="Carregando propostas..." />
        )}

        {erroPropostas && (
          <Alerta variante="erro"><p>{erroPropostas}</p><Botao variante="secundario" disabled={carregandoPropostas} onClick={() => setTentativaPropostas(n => n + 1)}>Tentar consultar propostas novamente</Botao></Alerta>
        )}

        {!carregandoPropostas &&
          !erroPropostas &&
          propostasRecebidas.length === 0 && (
            <EstadoVazio titulo="Nenhuma proposta recebida para este evento." />
          )}

        {!carregandoPropostas &&
          !erroPropostas &&
          propostasRecebidas.map((proposta) => (
            <div
              key={proposta.id}
              className="cartaoFormulario orgProposta"
              role="group"
              aria-labelledby={`org-proposta-${proposta.id}`}
            >
              <div className="orgPropostaCabecalho">
                <h3 id={`org-proposta-${proposta.id}`}>{proposta.fornecedor_nome}</h3>
                <Badge variante={proposta.status === 'Aprovada' ? 'sucesso' : proposta.status === 'Recusada' ? 'erro' : 'alerta'}>{proposta.status}</Badge>
              </div>
              {proposta.fornecedor_id && <ConsultaPortfolios fornecedorId={Number(proposta.fornecedor_id)} />}

              <p>
                <strong>Evento:</strong> {proposta.evento_nome}
              </p>

              <p className="orgPropostaValor">
                <strong>Valor proposto:</strong> <span>{formatarMoeda(Number(proposta.valor))}</span>
              </p>

              <p>
                <strong>Condições de pagamento:</strong>{' '}
                {proposta.condicoes_pagamento}
              </p>

              <p>
                <strong>Detalhes técnicos:</strong>{' '}
                {proposta.detalhes_tecnicos}
              </p>

              {proposta.status === 'Em avaliação' && (
              <div className="acoes acoesProposta">
              <Botao
                type="button"
                className="principal"
                onClick={() => avaliarProposta(proposta.id, 'Aprovada')}
                disabled={avaliandoPropostaId !== null}
                >
                  {avaliandoPropostaId === proposta.id
                  ? 'Processando...'
                  : '✓ Aprovar proposta'}
              </Botao>
              <Botao
                type="button"
                variante="destrutivo"
                onClick={() => avaliarProposta(proposta.id, 'Recusada')}
                disabled={avaliandoPropostaId !== null}
              >
                {avaliandoPropostaId === proposta.id
                ? 'Processando...'
                : '✕ Recusar proposta'}
              </Botao>
              </div>
              )}
            </div>
          ))}
      </section>
      {evento?.id && <Contratacoes key={evento.id} eventoId={evento.id} propostas={propostasRecebidas} organizador />}
    </div>
  )
}

