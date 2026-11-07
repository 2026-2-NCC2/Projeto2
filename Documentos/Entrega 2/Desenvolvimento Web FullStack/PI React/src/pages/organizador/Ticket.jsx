import { Botao } from '../../components/ui/Primitivas.jsx'
import './Organizador.css'
import { useState, useMemo } from 'react'
import { formatarMoeda } from '../../utils/formatarMoeda.js'

export function Ticket({
  evento,
  custos,
  setPagina,
  aoFinalizarESalvar,
}) {
  const [margemPercentual, setMargemPercentual] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const custoTotal = useMemo(() => {
    return custos.reduce((acumulador, itemCusto) => acumulador + Number(itemCusto.valor), 0)
  }, [custos])
  const publico = Number(evento.publico)
  const custosValidos = custos.length > 0 && custos.every(item =>
    item.valor !== null && item.valor !== '' && Number.isFinite(Number(item.valor)) && Number(item.valor) >= 0)
  const podeCalcular = Number.isFinite(publico) && publico > 0 && custosValidos && Number.isFinite(custoTotal)
  const ticketEquilibrio = custoTotal / publico
  const margemOperacional = custoTotal * (margemPercentual / 100)
  const ticketSugerido = (custoTotal + margemOperacional) / publico
  if (!podeCalcular) return (
    <section className="cartaoTicket">
      <h1>Estimativa de ticket indisponível</h1>
      <p>{!Number.isFinite(publico) || publico <= 0
        ? 'Cadastre um público previsto válido para calcular o ticket.'
        : 'Cadastre custos válidos para calcular o ticket.'}</p>
      <button type="button" className="principal" onClick={() => setPagina(!Number.isFinite(publico) || publico <= 0 ? 'criar' : 'custos')}>Revisar dados do evento</button>
    </section>
  )
  return (
    <div className="organizadorPagina">
      <Botao className="voltar" variante="discreto" onClick={() => setPagina('cotacao')}>
        ← Voltar às Cotações
      </Botao>
      <div className="tituloLinha">
        <div>
          <h1>TICKET ESTIMADO & VIABILIDADE</h1>
          <p>
            Simulação com os custos cadastrados para <strong>{evento.nome}</strong>.
          </p>
        </div>

      </div>
      <div className="gradeTicket">
        <div className="cartaoTicket">
          <span className="tag">TICKET SUGERIDO POR PARTICIPANTE</span>
          <div className="preco">
            R$ <strong>{ticketSugerido.toFixed(2).replace('.', ',')}</strong>
          </div>
          <p>
            Estimativa por ingresso para cobrir custos, com acréscimo de{' '}
            {margemPercentual}% sobre os custos. A estimativa não confirma cotações ou propostas.
          </p>
          <hr style={{ margin: '20px 0', border: '0', borderTop: '1px solid #e2e4eb' }} />
          <div className="itemResumo">
            <span>Custo total estimado</span>
            <b>{formatarMoeda(custoTotal)}</b>
          </div>
          <div className="itemResumo">
            <span>Quantidade de participantes</span>
            <b>{publico} pessoas</b>
          </div>
          <div className="itemResumo">
            <span>Ticket de Equilíbrio (Custo unitário)</span>
            <b>{formatarMoeda(ticketEquilibrio)}</b>
          </div>
          <div className="itemResumo">
            <span>Acréscimo sobre os custos ({margemPercentual}%)</span>
            <b>{formatarMoeda(margemOperacional)}</b>
          </div>
        </div>
        <div className="cartaoTicket">
          <h2>Simulação e Detalhamento</h2>
          <label htmlFor="ticket-margem" style={{ display: 'block', margin: '15px 0 5px', fontWeight: 600 }}>
            Ajustar acréscimo sobre os custos: {margemPercentual}%
          </label>
          <input
            id="ticket-margem"
            type="range"
            min="0"
            max="100"
            value={margemPercentual}
            onChange={(eventoDisparado) => setMargemPercentual(Number(eventoDisparado.target.value))}
            style={{ width: '100%', accentColor: 'var(--marca-coral)' }}
          />
          <h3 style={{ marginTop: '25px', fontSize: '15px' }}>Composição dos custos</h3>
          <div style={{ marginTop: '15px' }}>
            {custos.map((custo) => (
              <div className="itemResumo" key={custo.id}>
                <span>{custo.categoria || 'Categoria não informada'}</span>
                <b>{formatarMoeda(Number(custo.valor))}</b>
              </div>
            ))}
          </div>
          <p>O ticket é uma simulação e não será salvo com os dados do evento.</p>
          <Botao
            type="button"
            className="principal"
            style={{ width: '100%', marginTop: '30px' }}
            disabled={salvando} ocupado={salvando}
            onClick={async () => {
              if (salvando) return
              setSalvando(true)
              try {
                await aoFinalizarESalvar()
              } finally {
                setSalvando(false)
              }
            }}
          >
            {salvando ? 'Salvando evento...' : 'Salvar dados do evento →'}
          </Botao>
        </div>
      </div>
    </div>
  )
}



