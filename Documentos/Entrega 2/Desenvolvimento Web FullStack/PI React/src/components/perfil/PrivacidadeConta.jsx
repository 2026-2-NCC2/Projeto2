import { useEffect, useState } from 'react'
import { Alerta, Botao, EstadoVazio, Skeleton } from '../ui/Primitivas.jsx'
import { consultarPrivacidadeConta } from '../../services/privacidadeConta.js'
import './PrivacidadeConta.css'

const titulos = { cadastro: 'Cadastro', perfil_pessoal: 'Perfil pessoal', perfil_profissional: 'Perfil profissional',
  atividades: 'Resumo das atividades próprias', portfolio: 'Portfólio', aceites: 'Registros de aceite' }
const campos = { id: 'Identificador', nome: 'Nome', email: 'E-mail', perfil: 'Perfil', telefone: 'Telefone', biografia: 'Biografia',
  redes_sociais: 'Redes sociais', dados_comerciais: 'Dados comerciais', instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook',
  tiktok: 'TikTok', site_pessoal: 'Site pessoal', nome_comercial: 'Nome comercial', descricao: 'Descrição', telefone_comercial: 'Telefone comercial',
  email_comercial: 'E-mail comercial', cidade: 'Cidade', site_oficial: 'Site oficial', categorias_servicos: 'Categorias de serviços',
  eventos_organizados: 'Eventos organizados', inscricoes: 'Inscrições', propostas_enviadas: 'Propostas enviadas',
  solicitacoes_acesso: 'Solicitações de acesso', itens: 'Itens de portfólio' }

function DadosVisiveis({ dados }) {
  return <dl className="privacidadeContaDados">{Object.entries(dados).filter(([k]) => Object.hasOwn(campos, k)).map(([k, valor]) => <div key={k}>
    <dt>{campos[k]}</dt><dd>{valor === null || valor === '' ? 'Não informado' : Array.isArray(valor) ? valor.join(', ') :
      typeof valor === 'object' ? <DadosVisiveis dados={valor} /> : String(valor)}</dd>
  </div>)}</dl>
}

export function ConteudoPrivacidadeConta({ dados }) {
  return <>
    {dados.situacao === 'limitada' && <Alerta variante="aviso" titulo="Consulta com limitações">Uma ou mais categorias não estão habilitadas ou aguardam infraestrutura. Isso não significa ausência de dados.</Alerta>}
    {Object.entries(titulos).map(([nome, titulo]) => {
      const secao = dados.categorias[nome]
      return <section className="privacidadeContaCartao" key={nome} aria-label={titulo}>
        <h3>{titulo}</h3>
        {secao.estado !== 'disponivel' ? <EstadoVazio tipo="indisponivel" titulo={secao.estado === 'nao_habilitado' ? 'Funcionalidade não habilitada' : 'Infraestrutura pendente'}>
          <p>Não foi possível consultar esta categoria. Nenhuma lista vazia foi presumida.</p>
        </EstadoVazio> : nome === 'aceites' ? secao.dados.length === 0 ? <EstadoVazio titulo="Nenhum aceite registrado nesta consulta" /> :
          <ul className="privacidadeContaAceites">{secao.dados.map(a => <li key={`${a.documento}:${a.versao}`}>
            <p><strong>Termos de Uso — versão {a.versao}</strong></p>
            <p>Aceito em: <time dateTime={a.aceito_em}>{new Date(a.aceito_em).toLocaleString('pt-BR')}</time> · Fluxo: cadastro</p>
            <p>SHA-256 do documento: <code>{a.hash_documento}</code></p>
          </li>)}</ul> : <>
            {nome === 'atividades' && Object.values(secao.dados).every(v => v === 0) && <EstadoVazio titulo="Nenhuma atividade própria encontrada nesta consulta" />}
            <DadosVisiveis dados={secao.dados} />
          </>}
      </section>
    })}
    <section className="privacidadeContaCartao" aria-label="Escopo e limitações"><h3>Escopo e limitações</h3>
      <ul>{dados.limitacoes.map((texto, i) => <li key={i}>{texto}</li>)}</ul>
      <p>Para correções disponíveis, utilize os formulários do perfil. Exportação, exclusão e protocolos de solicitação não estão disponíveis nesta etapa.</p>
      <p><a href="/contato-privacidade">Contato de Privacidade</a> · <a href="/privacidade">Política de Privacidade</a> · <a href="/preferencias-privacidade">Preferências de privacidade</a></p>
    </section>
  </>
}

export function PrivacidadeConta({ token, id }) {
  const [tentativa, setTentativa] = useState(0)
  const [estado, setEstado] = useState({ token, id, tentativa, dados: null, erro: '', carregando: true })
  useEffect(() => {
    const controle = new AbortController()
    consultarPrivacidadeConta(token, id, controle.signal).then(dados => {
      if (!controle.signal.aborted) setEstado({ token, id, tentativa, dados, erro: '', carregando: false })
    }).catch(erro => {
      if (!controle.signal.aborted) setEstado({ token, id, tentativa, dados: null, erro: erro.message || 'Consulta indisponível.', carregando: false })
    })
    return () => controle.abort()
  }, [token, id, tentativa])
  const atual = estado.token === token && estado.id === id && estado.tentativa === tentativa ? estado : { carregando: true }
  return <section className="privacidadeConta" aria-label="Dados pessoais da conta" aria-busy={atual.carregando}>
    <p>Consulta autenticada dos seus próprios dados. Não altera registros.</p>
    {atual.carregando && <Skeleton tipo="card" rotulo="Carregando dados de privacidade" />}
    {atual.erro && <Alerta variante="erro" titulo="Não foi possível consultar seus dados"><p>{atual.erro}</p>
      <Botao variante="secundario" onClick={() => setTentativa(v => v + 1)}>Tentar novamente</Botao></Alerta>}
    {atual.dados && <ConteudoPrivacidadeConta dados={atual.dados} />}
  </section>
}
