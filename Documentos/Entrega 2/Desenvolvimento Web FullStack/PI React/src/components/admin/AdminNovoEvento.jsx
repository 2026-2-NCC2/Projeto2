import { useEffect, useRef, useState } from 'react'
import { useConsultaAdmin } from '../../hooks/useConsultaAdmin.js'
import { capacidadesAdminEventos, criarEnvioAdmin } from '../../services/adminEventos.js'
import { CriarEvento } from '../../pages/organizador/CriarEvento.jsx'
import { ErroAdmin, SkeletonAdmin } from './AdminUI.jsx'
import './AdminNovoEvento.css'

export function AdminNovoEvento({ aoCancelar, aoCriar, aoSair }) {
  const usuarios = useConsultaAdmin('/usuarios')
  const [caps, setCaps] = useState(null)
  const [erroCaps, setErroCaps] = useState(null)
  const [tentativaCaps, setTentativaCaps] = useState(0)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [incerto, setIncerto] = useState(false)
  const [anterior] = useState(() => Boolean(sessionStorage.getItem('adminEventoPendente')))
  const [organizador, setOrganizador] = useState('')
  const [evento, setEvento] = useState({ nome: '', data: '', horario: '', local: '', publico: 1, categoria: 'Corporativo', descricao: '' })
  const envio = useRef(null), ativo = useRef(false), pendente = useRef(null)
  if (envio.current == null) envio.current = criarEnvioAdmin()
  useEffect(() => {
    ativo.current = true
    let atual = true
    const controle = new AbortController()
    capacidadesAdminEventos({ signal: controle.signal }).then(c => { if (atual) setCaps(c) }).catch(e => { if (atual) setErroCaps(e) })
    return () => { atual = false; ativo.current = false; controle.abort() }
  }, [tentativaCaps])
  function tentarCapacidades() {
    setCaps(null); setErroCaps(null); setTentativaCaps(n => n + 1)
  }
  async function salvar() {
    if (caps?.criar !== true || erroCaps || salvando || anterior) return
    if (!Number.isSafeInteger(Number(organizador)) || Number(organizador) <= 0) { setErro('Selecione um organizador responsável.'); return }
    const dados = pendente.current || { ...evento, publico: Number(evento.publico), organizador_id: Number(organizador) }
    setSalvando(true); setErro('')
    try {
      const criado = await envio.current(dados)
      if (ativo.current) { pendente.current = null; setIncerto(false); aoCriar(criado.id) }
    } catch (e) {
      if (ativo.current) { setErro(e.message); setIncerto(e.resultadoIncerto === true); pendente.current = e.resultadoIncerto ? dados : null }
    } finally { if (ativo.current) setSalvando(false) }
  }
  if (erroCaps) return <ErroAdmin erro={erroCaps} aoAtualizar={tentarCapacidades} aoSair={aoSair} rotuloAtualizar="Tentar novamente" />
  if (!caps || usuarios.carregando) return <SkeletonAdmin rotulo="Verificando criação administrativa" />
  if (usuarios.erro) return <ErroAdmin erro={usuarios.erro} aoAtualizar={usuarios.recarregar} aoSair={aoSair} />
  if (caps.criar !== true) return <section className="admPagina"><h1 className="admSrOnly">Novo evento</h1><p role="status">Criação administrativa indisponível neste ambiente.</p><button className="admAcao" onClick={aoCancelar}>Voltar para Eventos</button></section>
  const organizadores = usuarios.dados.filter(u => u.perfil === 'organizador')
  return <section className="admNovoEvento">
    <p className="admNota">O evento será criado Em planejamento. Dados não salvos são descartados ao atualizar ou sair desta seção.</p>
    {anterior && <p role="alert">Há uma tentativa anterior não confirmada. Confira Eventos e solicite a reconciliação antes de cadastrar novamente.</p>}
    <label className="admNovoOrganizador">Organizador responsável *
      <select value={organizador} onChange={e => setOrganizador(e.target.value)} disabled={salvando || incerto || anterior} required>
        <option value="">Selecione um organizador</option>
        {organizadores.map(u => <option key={u.id} value={u.id}>{u.nome} · #{u.id}</option>)}
      </select>
    </label>
    {!organizadores.length && <p role="status">Nenhum organizador disponível.</p>}
    {erro && <p className="admMensagem admMensagem--erro" role="alert">{erro}</p>}
    {incerto && <div className="admAcoes"><button className="admAcao" onClick={salvar} disabled={salvando}>Confirmar tentativa anterior</button><button className="admAcao admAcao--secundaria" onClick={aoCancelar}>Consultar Eventos</button></div>}
    <CriarEvento administrativo evento={evento} setEvento={setEvento} setPagina={aoCancelar}
      aoAvancarParaCustos={salvar} podeSalvar={Boolean(organizador) && organizadores.length > 0 && !incerto && !anterior}
      controleCapacidade={caps.controleCapacidade} salvando={salvando} />
  </section>
}
