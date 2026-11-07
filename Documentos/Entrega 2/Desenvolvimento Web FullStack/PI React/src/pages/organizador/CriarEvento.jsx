import { Botao, Campo, Alerta } from '../../components/ui/Primitivas.jsx'
import './Organizador.css'
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
    <div className="organizadorPagina">
      <Botao className="voltar" variante="discreto" onClick={() => setPagina('eventos')}>
        ← Voltar para Meus Eventos
      </Botao>
      <h1>{evento.id?'Dados do evento':'Criar evento'}</h1>
      {evento.status && <p>Estado: <strong>{evento.status}</strong></p>}
      {publicado && <Alerta variante="informacao">O evento já foi publicado. A descrição e a capacidade podem ser editadas quando disponíveis.</Alerta>}
      {!podeSalvar && <Alerta variante="informacao">Dados disponíveis para consulta. O salvamento está indisponível.</Alerta>}
      <p>Comece pelos dados básicos para planejar o evento e as cotações.</p>
      <p>Datas e horários seguem o fuso de Brasília. Novas inscrições terminam no horário de início.</p>
      <div className="etapas">
        <b>1 &nbsp; Dados Básicos</b>
        <span>2 &nbsp; Custos e Cotações</span>
        <span>3 &nbsp; Ticket e Viabilidade</span>
      </div>
      <form onSubmit={aoEnviarFormulario} className="cartaoFormulario">
        <fieldset disabled={!podeSalvar||salvando} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <Campo id="criarevento-campo-1" label="Nome do evento"
          value={evento.nome}
          maxLength={100}
          disabled={publicado}
          onChange={(eventoDisparado) => aoAlterarCampo('nome', eventoDisparado.target.value)}
          placeholder="Ex: Summit Corporativo de Inovação & Tecnologia 2026"
          obrigatorio
         />
        <div className="duasColunas">
          <div>
            <Campo id="criarevento-campo-2" label="Data do evento"
              type="date"
              min="1000-01-01"
              max="9999-12-31"
              disabled={publicado}
              value={evento.data}
              onChange={(eventoDisparado) => aoAlterarCampo('data', eventoDisparado.target.value)}
              obrigatorio
             />
          </div>
          <div>
            <Campo id="criarevento-campo-3" label="Horário de início"
              type="time"
              disabled={publicado}
              value={evento.horario}
              onChange={(eventoDisparado) => aoAlterarCampo('horario', eventoDisparado.target.value)}
              obrigatorio
             />
          </div>
        </div>
        <div className="duasColunas">
          <div>
            <Campo id="criarevento-campo-4" label="Local do evento"
              value={evento.local}
              maxLength={200}
              disabled={publicado}
              onChange={(eventoDisparado) => aoAlterarCampo('local', eventoDisparado.target.value)}
              placeholder="Ex: Centro de Convenções Rebouças, SP"
              obrigatorio
             />
          </div>
          <div>
            <Campo id="criarevento-campo-5" label="Público previsto (participantes)"
              type="number"
              min="1"
              max="2147483647"
              step="1"
              disabled={publicado}
              value={evento.publico}
              onChange={(eventoDisparado) => aoAlterarCampo('publico', Number(eventoDisparado.target.value))}
              obrigatorio
             />
          </div>
        </div>
        <VagasEvento evento={evento} />
        {controleCapacidade && <>
          <Campo id="capacidade-evento" label="Capacidade máxima de inscrições"  type="number" min="1" max="2147483647" step="1"
            value={evento.capacidade_maxima ?? ''}
            onChange={e=>aoAlterarCampo('capacidade_maxima',e.target.value===''?null:Number(e.target.value))}  />
          <p>Deixe vazio para manter sem limite configurado. Público previsto é uma estimativa independente.
          A capacidade deve comportar todos os inscritos confirmados.</p>
        </>}
        <p className="categoriasTitulo" id="categoria-evento-titulo">Categoria do evento</p>
        <div className="categorias" role="group" aria-labelledby="categoria-evento-titulo">
          {categorias.map((itemCategoria) => (
            <Botao
              type="button"
              key={itemCategoria}
              disabled={publicado}
              aria-pressed={evento.categoria === itemCategoria}
              className={evento.categoria === itemCategoria ? 'selecionado' : ''}
              onClick={() => aoAlterarCampo('categoria', itemCategoria)}
            >
              {itemCategoria}
            </Botao>
          ))}
        </div>
        <Campo id="criarevento-campo-7" label="Descrição do evento e escopo previsto" como="textarea"
          rows="4"
          maxLength={10000}
          value={evento.descricao}
          onChange={(eventoDisparado) => aoAlterarCampo('descricao', eventoDisparado.target.value)}
          placeholder="Descreva os objetivos, perfil do público e necessidades gerais..."
         />
        <div className="acoes">
          <Botao variante="secundario"
            type="button"
            className="secundario"
            onClick={() => setPagina('eventos')}
          >
            Voltar sem salvar
          </Botao>
          <Botao type="submit" className="principal" disabled={!podeSalvar||salvando} ocupado={salvando}>
            {salvando?'Salvando...':'Salvar para Custos & Cotações →'}
          </Botao>
        </div>
        </fieldset>
      </form>
      <MidiaEvento eventoId={evento.id} estado={evento.status} editar />
    </div>
  )
}
