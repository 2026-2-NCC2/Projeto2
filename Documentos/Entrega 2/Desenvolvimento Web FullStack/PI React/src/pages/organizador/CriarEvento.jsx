import { Botao, Campo, Alerta, Badge } from '../../components/ui/Primitivas.jsx'
import './Organizador.css'
import './OrganizadorGerenciamento.css'
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
    <div className="organizadorPagina orgEventoFormulario">
      <Botao className="voltar" variante="discreto" onClick={() => setPagina('eventos')}>
        ← Voltar para Meus Eventos
      </Botao>
      <div className="orgFormularioTitulo">
        <h1>{evento.id?'Dados do evento':'Criar evento'}</h1>
        {evento.status && <p>Estado: <Badge variante={({ Ativo: 'sucesso', Cancelado: 'erro', Encerrado: 'neutro', 'Em planejamento': 'neutro' })[evento.status] || 'neutro'}>{evento.status}</Badge></p>}
      </div>
      {publicado && <Alerta variante="informacao">O evento já foi publicado. A descrição e a capacidade podem ser editadas quando disponíveis.</Alerta>}
      {!podeSalvar && <Alerta variante="informacao">Dados disponíveis para consulta. O salvamento está indisponível.</Alerta>}
      <p>Comece pelos dados básicos para planejar o evento e as cotações.</p>
      <p>Datas e horários seguem o fuso de Brasília. Novas inscrições terminam no horário de início.</p>
      <div className="etapas">
        <b>1 &nbsp; Dados Básicos</b>
        <span>2 &nbsp; Custos e Cotações</span>
        <span>3 &nbsp; Ticket e Viabilidade</span>
      </div>
      <form onSubmit={aoEnviarFormulario} className="cartaoFormulario" aria-label="Dados do evento" aria-busy={salvando}>
        <fieldset disabled={!podeSalvar||salvando} className="orgFormularioCampos">
        <legend className="ttSrOnly">Dados básicos do evento</legend>
        <section className="orgFormularioGrupo" aria-labelledby="org-identificacao-evento">
        <h2 id="org-identificacao-evento">Identificação</h2>
        <p>Defina o nome que identifica este evento.</p>
        <Campo id="criarevento-campo-1" label="Nome do evento"
          value={evento.nome}
          maxLength={100}
          disabled={publicado}
          onChange={(eventoDisparado) => aoAlterarCampo('nome', eventoDisparado.target.value)}
          placeholder="Ex: Summit Corporativo de Inovação & Tecnologia 2026"
          obrigatorio
         />
        </section>
        <section className="orgFormularioGrupo" aria-labelledby="org-agenda-evento">
        <h2 id="org-agenda-evento">Data e local</h2>
        <p>Datas e horários seguem o fuso de Brasília.</p>
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
            <Campo id="criarevento-campo-4" label="Local do evento"
              value={evento.local}
              maxLength={200}
              disabled={publicado}
              onChange={(eventoDisparado) => aoAlterarCampo('local', eventoDisparado.target.value)}
              placeholder="Ex: Centro de Convenções Rebouças, SP"
              obrigatorio
             />
        </section>
        <section className="orgFormularioGrupo" aria-labelledby="org-publico-evento">
        <h2 id="org-publico-evento">Público e capacidade</h2>
        <p>O público previsto é uma estimativa; a capacidade limita as inscrições quando disponível.</p>
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
        <VagasEvento evento={evento} />
        {controleCapacidade && <>
          <Campo id="capacidade-evento" label="Capacidade máxima de inscrições"  type="number" min="1" max="2147483647" step="1"
            dica="Deixe vazio para manter sem limite configurado. Público previsto é uma estimativa independente. A capacidade deve comportar todos os inscritos confirmados."
            value={evento.capacidade_maxima ?? ''}
            onChange={e=>aoAlterarCampo('capacidade_maxima',e.target.value===''?null:Number(e.target.value))}  />
        </>}
        </section>
        <section className="orgFormularioGrupo" aria-labelledby="org-descricao-evento">
        <h2 id="org-descricao-evento">Categoria e descrição</h2>
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
        </section>
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
      <section className="orgFormularioImagens" aria-labelledby="org-imagens-evento">
        <h2 id="org-imagens-evento">Imagens do evento</h2>
        <MidiaEvento eventoId={evento.id} estado={evento.status} editar />
      </section>
    </div>
  )
}
