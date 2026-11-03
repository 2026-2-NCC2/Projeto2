import { usePerfil } from '../../hooks/usePerfil.js'
import { useState } from 'react'

export function PerfilOrganizador() {
  const { perfil: identidade, erro } = usePerfil()
  const [perfil, setPerfil] = useState({ cargo: '', telefone: '', empresa: '', cnpj: '', bio: '' })
  const [preferencias, setPreferencias] = useState({ cotacoes: true, propostas: true, relatorios: false, seguranca: true })
  const [editando, setEditando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const alterar = (campo, valor) => { setPerfil((atual) => ({ ...atual, [campo]: valor })); setSalvo(false) }
  const salvar = (evento) => { evento.preventDefault(); setEditando(false); setSalvo(true) }
  return <div className="perfilPagina">
    {erro && <p role="alert">{erro}</p>}
    <div className="perfilCabecalho"><div><p className="trilhaNavegacao">TrocaTicket › Gestão Corporativa › Meu Perfil</p><h1>Meu perfil</h1><p>Gerencie seus dados, sua empresa e as preferências da conta.</p></div><span className="perfilContaAtiva">● Conta verificada</span></div>
    {salvo && <div className="perfilSucesso" role="status">Rascunho local atualizado; não salvo no servidor.</div>}
    <section className="perfilResumo"><div className="perfilAvatar">◉</div><div className="perfilIdentidade"><h2>{identidade?.nome || 'Conta'}</h2><p>{perfil.cargo} · {perfil.empresa}</p><div><span>Organizador</span><span>Conta corporativa</span></div></div><div className="perfilResumoNumeros"><div><strong>4</strong><small>Eventos ativos</small></div><div><strong>18</strong><small>Cotações publicadas</small></div><div><strong>98,4%</strong><small>Precisão de auditoria</small></div></div></section>
    <div className="perfilGrade">
      <form className="perfilCartao perfilDados" onSubmit={salvar}>
        <div className="perfilTituloCartao"><div><h2>Informações pessoais</h2><p>Nome e e-mail da conta. Demais campos são rascunhos locais.</p></div><button type="button" className="perfilEditar" onClick={() => { setEditando((valor) => !valor); setSalvo(false) }}>{editando ? 'Cancelar' : '✎ Editar dados'}</button></div>
        <div className="perfilCampos"><label>Nome completo<input disabled={!editando} value={identidade?.nome || ''} readOnly /></label><label>Cargo<input disabled={!editando} value={perfil.cargo} onChange={(e) => alterar('cargo', e.target.value)} /></label><label>E-mail corporativo<input type="email" disabled={!editando} value={identidade?.email || ''} readOnly /></label><label>Telefone<input disabled={!editando} value={perfil.telefone} onChange={(e) => alterar('telefone', e.target.value)} /></label><label className="perfilCampoInteiro">Sobre você<textarea rows="3" disabled={!editando} value={perfil.bio} onChange={(e) => alterar('bio', e.target.value)} /></label></div>
        {editando && <div className="perfilAcoes"><button type="button" className="secundario" onClick={() => setEditando(false)}>Cancelar</button><button className="principal" type="submit">Salvar alterações</button></div>}
      </form>
      <aside className="perfilColuna">
        <section className="perfilCartao"><div className="perfilTituloCartao"><div><h2>Segurança</h2><p>Proteção e acesso da conta.</p></div></div><div className="perfilSegurancaItem"><span>◈</span><div><strong>Senha</strong><small>Atualizada há 34 dias</small></div><button onClick={() => alert('Um link de redefinição foi enviado para o e-mail cadastrado.')}>Alterar</button></div><div className="perfilSegurancaItem"><span>✓</span><div><strong>Autenticação em duas etapas</strong><small>Ativada por aplicativo</small></div><b>Ativa</b></div><div className="perfilSegurancaItem"><span>⌁</span><div><strong>Sessões ativas</strong><small>2 dispositivos conectados</small></div><button onClick={() => alert('As outras sessões foram encerradas.')}>Gerenciar</button></div></section>
        <section className="perfilCartao"><div className="perfilTituloCartao"><div><h2>Preferências</h2><p>Escolha quais avisos deseja receber.</p></div></div>{[['cotacoes','Atualizações de cotações','Prazos, respostas e encerramentos'],['propostas','Novas propostas','Avisos de fornecedores'],['relatorios','Relatórios semanais','Resumo por e-mail'],['seguranca','Alertas de segurança','Novos acessos e alterações']].map(([id,titulo,texto]) => <label className="perfilPreferencia" key={id}><span><strong>{titulo}</strong><small>{texto}</small></span><input type="checkbox" checked={preferencias[id]} onChange={(e) => setPreferencias((atual) => ({...atual,[id]:e.target.checked}))} /></label>)}</section>
      </aside>
      <section className="perfilCartao perfilEmpresa"><div className="perfilTituloCartao"><div><h2>Empresa vinculada</h2><p>Informações fiscais e operacionais da organização.</p></div><span className="perfilHomologada">✓ Homologada</span></div><div className="perfilEmpresaDados"><div><small>RAZÃO SOCIAL</small><strong>{perfil.empresa}</strong></div><div><small>CNPJ</small><strong>{perfil.cnpj}</strong></div><div><small>LOCALIZAÇÃO</small><strong>São Paulo — SP</strong></div><div><small>PERFIL DE CONTRATAÇÃO</small><strong>Eventos corporativos</strong></div></div></section>
    </div>
  </div>
}

