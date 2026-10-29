export function CriarEvento({
  evento,
  setEvento,
  setPagina,
  aoAvancarParaCustos,
}) {
  const categorias = ['Corporativo', 'Confraternização', 'Workshop', 'Social']
  const aoAlterarCampo = (campo, valor) => {
    setEvento((estadoAnterior) => ({ ...estadoAnterior, [campo]: valor }))
  }
  const aoEnviarFormulario = async (eventoDisparado) => {
  eventoDisparado.preventDefault()
  await aoAvancarParaCustos()
  }
  return (
    <div>
      <button className="voltar" onClick={() => setPagina('eventos')}>
        ← Voltar para Meus Eventos
      </button>
      <h1>CRIAR EVENTO</h1>
      <p>Comece pelos dados básicos para planejar o evento e as cotações.</p>
      <div className="etapas">
        <b>1 &nbsp; Dados Básicos</b>
        <span>2 &nbsp; Custos e Cotações</span>
        <span>3 &nbsp; Ticket e Viabilidade</span>
      </div>
      <form onSubmit={aoEnviarFormulario} className="cartaoFormulario">
        <label>Nome do evento *</label>
        <input
          value={evento.nome}
          onChange={(eventoDisparado) => aoAlterarCampo('nome', eventoDisparado.target.value)}
          placeholder="Ex: Summit Corporativo de Inovação & Tecnologia 2026"
          required
        />
        <div className="duasColunas">
          <div>
            <label>Data do evento *</label>
            <input
              type="date"
              value={evento.data}
              onChange={(eventoDisparado) => aoAlterarCampo('data', eventoDisparado.target.value)}
              required
            />
          </div>
          <div>
            <label>Horário de início *</label>
            <input
              type="time"
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
              onChange={(eventoDisparado) => aoAlterarCampo('local', eventoDisparado.target.value)}
              placeholder="Ex: Centro de Convenções Rebouças - SP"
              required
            />
          </div>
          <div>
            <label>Público previsto (participantes) *</label>
            <input
              type="number"
              min="1"
              value={evento.publico}
              onChange={(eventoDisparado) => aoAlterarCampo('publico', Number(eventoDisparado.target.value))}
              required
            />
          </div>
        </div>
        <label>Categoria do evento</label>
        <div className="categorias">
          {categorias.map((itemCategoria) => (
            <button
              type="button"
              key={itemCategoria}
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
            Cancelar
          </button>
          <button type="submit" className="principal">
            Salvar para Custos & Cotações →
          </button>
        </div>
      </form>
    </div>
  )
}
