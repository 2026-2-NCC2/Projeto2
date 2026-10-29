import { useState, useMemo } from 'react'
import { formatarMoeda } from '../../utils/formatarMoeda.js'

export function Ticket({
  evento,
  custos,
  setPagina,
  aoFinalizarESalvar,
}) {
  const [margemPercentual, setMargemPercentual] = useState(30)
  const custoTotal = useMemo(() => {
    return custos.reduce((acumulador, itemCusto) => acumulador + itemCusto.valor, 0)
  }, [custos])
  const publico = evento.publico > 0 ? evento.publico : 600
  const ticketEquilibrio = custoTotal / publico
  const margemOperacional = custoTotal * (margemPercentual / 100)
  const ticketSugerido = (custoTotal + margemOperacional) / publico
  return (
    <div>
      <button className="voltar" onClick={() => setPagina('cotacao')}>
        ← Voltar às Cotações
      </button>
      <div className="tituloLinha">
        <div>
          <h1>TICKET ESTIMADO & VIABILIDADE</h1>
          <p>
            Simulação de sustentabilidade financeira para <strong>{evento.nome}</strong>.
          </p>
        </div>
        <span className="status">● Cotações suficientes recebidas</span>
      </div>
      <div className="gradeTicket">
        <div className="cartaoTicket">
          <span className="tag">TICKET SUGERIDO POR PARTICIPANTE</span>
          <div className="preco">
            R$ <strong>{ticketSugerido.toFixed(2).replace('.', ',')}</strong>
          </div>
          <p>
            Preço recomendado por ingresso para cobrir custos e atingir{' '}
            {margemPercentual}% de margem operacional.
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
            <span>Margem operacional ({margemPercentual}%)</span>
            <b>{formatarMoeda(margemOperacional)}</b>
          </div>
        </div>
        <div className="cartaoTicket">
          <h2>Simulação e Detalhamento</h2>
          <label style={{ display: 'block', margin: '15px 0 5px', fontWeight: 600 }}>
            Ajustar margem de lucro operacional: {margemPercentual}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={margemPercentual}
            onChange={(eventoDisparado) => setMargemPercentual(Number(eventoDisparado.target.value))}
            style={{ width: '100%', accentColor: '#3427b8' }}
          />
          <h3 style={{ marginTop: '25px', fontSize: '15px' }}>Composição dos custos</h3>
          <div className="barraCusto">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div style={{ marginTop: '15px' }}>
            {custos.slice(0, 3).map((custo) => (
              <div className="itemResumo" key={custo.id}>
                <span>{custo.categoria}</span>
                <b>{formatarMoeda(custo.valor)}</b>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="principal"
            style={{ width: '100%', marginTop: '30px' }}
            onClick={() => {
              aoFinalizarESalvar(ticketSugerido)
              setPagina('eventos')
            }}
          >
            Finalizar planejamento e salvar evento →
          </button>
        </div>
      </div>
    </div>
  )
}



