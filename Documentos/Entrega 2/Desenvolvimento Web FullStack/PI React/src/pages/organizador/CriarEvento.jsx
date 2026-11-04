import { VagasEvento } from '../../components/eventos/VagasEvento.jsx'
import { MidiaEvento } from '../../components/eventos/MidiaEvento.jsx'

export function CriarEvento({
  evento,
  setEvento,
  setPagina,
  aoAvancarParaCustos,
  podeSalvar = false,
  controleCapacidade = false,
  salvando = false,
}) {
  const publicado=evento.status==='Ativo'
  const categorias = ['Corporativo', 'Confraternização', 'Workshop', 'Social']
  const aoAlterarCampo = (campo, valor) => {
    setEvento((estadoAnterior) => ({ ...estadoAnterior, [campo]: valor }))
  }
  const aoEnviarFormulario = async (eventoDisparado) => {
  eventoDisparado.preventDefault()
  if(!podeSalvar||salvando)return
  await aoAvancarParaCustos()
  }
  return (
    <div>
      <button className="voltar" onClick={() => setPagina('eventos')}>
        ← Voltar para Meus Eventos
      </button>
      <h1>{evento.id?'Dados do evento':'Criar evento'}</h1>
      {evento.status && <p>Estado: <strong>{evento.status}</strong></p>}
      {publicado && <p role="status">O evento já foi publicado. A descrição e a capacidade podem ser editadas quando disponíveis.</p>}
      {!podeSalvar && <p role="status">Dados disponíveis para consulta. O salvamento está indisponível.</p>}
      <p>Comece pelos dados básicos para planejar o evento e as cotações.</p>
      <p>Datas e horários seguem o fuso de Brasília. Novas inscrições terminam no horário de início.</p>
      <div className="etapas">
        <b>1 &nbsp; Dados Básicos</b>
        <span>2 &nbsp; Custos e Cotações</span>
        <span>3 &nbsp; Ticket e Viabilidade</span>
      </div>
      <form onSubmit={aoEnviarFormulario} className="cartaoFormulario">
        <fieldset disabled={!podeSalvar||salvando} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <label>Nome do evento *</label>
        <input
          value={evento.nome}
          maxLength={100}
          disabled={publicado}
          onChange={(eventoDisparado) => aoAlterarCampo('nome', eventoDisparado.target.value)}
          placeholder="Ex: Summit Corporativo de Inovação & Tecnologia 2026"
          required
        />
        <div className="duasColunas">
          <div>
            <label>Data do evento *</label>
            <input
              type="date"
              min="1000-01-01"
              max="9999-12-31"
              disabled={publicado}
              value={evento.data}
              onChange={(eventoDisparado) => aoAlterarCampo('data', eventoDisparado.target.value)}
              required
            />
          </div>
          <div>
            <label>Horário de início *</label>
            <input
              type="time"
              disabled={publicado}
              value={evento.horario}
              onChange={(eventoDisparado) => aoAlterarCampo('horario', eventoDisparado.target.value)}
              required
            />
          </div>
        </div>
        <div className="duasColunas">
          <div>
            <label>Local do evento *</label>
            <input
              value={evento.local}
              maxLength={200}
              disabled={publicado}
              onChange={(eventoDisparado) => aoAlterarCampo('local', eventoDisparado.target.value)}
              placeholder="Ex: Centro de Convenções Rebouças, SP"
              required
            />
          </div>
          <div>
            <label>Público previsto (participantes) *</label>
            <input
              type="number"
              min="1"
              max="2147483647"
              step="1"
              disabled={publicado}
              value={evento.publico}
              onChange={(eventoDisparado) => aoAlterarCampo('publico', Number(eventoDisparado.target.value))}
              required
            />
          </div>
        </div>
        <VagasEvento evento={evento} />
        {controleCapacidade && <>
          <label htmlFor="capacidade-evento">Capacidade máxima de inscrições</label>
          <input id="capacidade-evento" type="number" min="1" max="2147483647" step="1"
            value={evento.capacidade_maxima ?? ''}
            onChange={e=>aoAlterarCampo('capacidade_maxima',e.target.value===''?null:Number(e.target.value))} />
          <p>Deixe vazio para manter sem limite configurado. Público previsto é uma estimativa independente.
          A capacidade deve comportar todos os inscritos confirmados.</p>
        </>}
        <label>Categoria do evento</label>
        <div className="categorias">
          {categorias.map((itemCategoria) => (
            <button
              type="button"
              key={itemCategoria}
              disabled={publicado}
              className={evento.categoria === itemCategoria ? 'selecionado' : ''}
              onClick={() => aoAlterarCampo('categoria', itemCategoria)}
            >
              {itemCategoria}
            </button>
          ))}
        </div>
        <label>Descrição do evento e escopo previsto</label>
        <textarea
          rows="4"
          maxLength={10000}
          value={evento.descricao}
          onChange={(eventoDisparado) => aoAlterarCampo('descricao', eventoDisparado.target.value)}
          placeholder="Descreva os objetivos, perfil do público e necessidades gerais..."
        />
        <div className="acoes">
          <button
            type="button"
            className="secundario"
            onClick={() => setPagina('eventos')}
          >
            Voltar sem salvar
          </button>
          <button type="submit" className="principal" disabled={!podeSalvar||salvando}>
            {salvando?'Salvando...':'Salvar para Custos & Cotações →'}
          </button>
        </div>
        </fieldset>
      </form>
      <MidiaEvento eventoId={evento.id} estado={evento.status} editar />
    </div>
  )
}
