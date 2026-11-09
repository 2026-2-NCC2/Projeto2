import { Skeleton, Botao, Campo, Badge, Alerta, EstadoVazio } from '../../components/ui/Primitivas.jsx'
import './Organizador.css'
import './OrganizadorAcabamento.css'
import { Icone } from '../../components/ui/Icone.jsx'
import { useState, useMemo, useEffect } from 'react'
import { ConsultaPortfolios } from '../../components/portfolio/Portfolio.jsx'
import { apiUrl } from '../../services/api.js'
import { formatarMoeda } from '../../utils/formatarMoeda.js'

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
  useEffect(() => {
  const buscarPropostasRecebidas = async () => {
    try {
      setCarregandoPropostas(true)
      setErroPropostas('')

      const token = sessionStorage.getItem('token')

      const resposta = await fetch(
        apiUrl('/organizador/propostas'),
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const dados = await resposta.json()

      if (!resposta.ok) {
        throw new Error(dados.erro || 'Erro ao buscar propostas.')
      }

      const propostasDoEvento = dados.filter(
        (proposta) => Number(proposta.evento_id) === Number(evento.id)
      )

      setPropostasRecebidas(propostasDoEvento)

    } catch (erro) {
      console.error('Erro ao buscar propostas recebidas:', erro)
      setErroPropostas(erro.message)

    } finally {
      setCarregandoPropostas(false)
    }
  }

  if (evento?.id) {
    buscarPropostasRecebidas()
  }
}, [evento?.id])
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
            <section className="cartaoFormulario" style={{ marginTop: '24px' }}>
        <h2><Icone nome="documento" /> Propostas recebidas</h2>
        <p>Propostas enviadas pelos fornecedores para este evento.</p>
        {feedbackAvaliacao && <Alerta variante={feedbackAvaliacao.tipo}>
          <p>{feedbackAvaliacao.mensagem}</p>
          {feedbackAvaliacao.tipo === 'erro' && <p>Não foi possível confirmar o resultado. Consulte as propostas antes de repetir a operação.</p>}
        </Alerta>}

        {carregandoPropostas && (
          <Skeleton tipo="card" rotulo="Carregando propostas..." />
        )}

        {erroPropostas && (
          <Alerta variante="erro">{erroPropostas}</Alerta>
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
              className="cartaoFormulario"
              style={{ marginTop: '16px' }}
            >
              <h3>{proposta.fornecedor_nome}</h3>
              {proposta.fornecedor_id && <ConsultaPortfolios fornecedorId={Number(proposta.fornecedor_id)} />}

              <p>
                <strong>Evento:</strong> {proposta.evento_nome}
              </p>

              <p>
                <strong>Valor:</strong> {formatarMoeda(Number(proposta.valor))}
              </p>

              <p>
                <strong>Condições de pagamento:</strong>{' '}
                {proposta.condicoes_pagamento}
              </p>

              <p>
                <strong>Detalhes técnicos:</strong>{' '}
                {proposta.detalhes_tecnicos}
              </p>

              <p>
                <strong>Status:</strong> <Badge variante={proposta.status === 'Aprovada' ? 'sucesso' : proposta.status === 'Recusada' ? 'erro' : 'alerta'}>{proposta.status}</Badge>
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
    </div>
  )
}

