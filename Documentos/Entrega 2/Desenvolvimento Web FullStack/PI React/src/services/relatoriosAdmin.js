import { diaSolicitacao, normalizarBusca } from './admin.js'

export const relatoriosAdmin = {
  eventos: { titulo: 'Eventos', rota: '/admin/eventos', periodo: 'Data de realização', grupos: [['status', 'Estado'], ['categoria', 'Categoria']] },
  usuarios: { titulo: 'Usuários', rota: '/usuarios', grupos: [['perfil', 'Perfil']] },
  solicitacoes: { titulo: 'Solicitações de acesso', rota: '/solicitacoes-acesso', periodo: 'Data do pedido', grupos: [['status', 'Estado'], ['perfil_solicitado', 'Perfil solicitado']] },
  cotacoes: { titulo: 'Cotações', rota: '/admin/cotacoes', periodo: 'Criação ou prazo', grupos: [['status', 'Estado'], ['modalidade', 'Modalidade']] },
  propostas: { titulo: 'Propostas', rota: '/admin/propostas', periodo: 'Data de criação', grupos: [['status', 'Estado']] },
}
export const filtrosRelatorio = { estado: '', categoria: '', organizador: '', perfil: '', busca: '', inicio: '', fim: '', modalidade: '', evento: '', fornecedor: '', dataReferencia: 'criacao' }

// DATE acompanha a data de calendário apresentada pelos catálogos existentes;
// criada_em é um instante e usa o horário de São Paulo, como Solicitações.
export function diaEventoRelatorio(valor) {
  if (typeof valor !== 'string') return ''
  if (valor.length !== 10 && (!/^\d{4}-\d{2}-\d{2}T/.test(valor) || !Number.isFinite(Date.parse(valor)))) return ''
  const dia = valor.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return ''
  const data = new Date(dia + 'T00:00:00Z')
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === dia ? dia : ''
}
export function validarDadosRelatorio(tipo, dados) {
  const erro = () => { throw new Error('Resposta incompleta ou inconsistente. Atualize o relatório.') }
  if (!relatoriosAdmin[tipo] || !Array.isArray(dados)) erro()
  const ids = new Set()
  for (const item of dados) {
    if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(item.id)) erro()
    ids.add(item.id)
    const textos = tipo === 'eventos' ? ['nome', 'local', 'status', 'organizador_nome', 'horario'] :
      tipo === 'usuarios' ? ['nome', 'email', 'perfil'] : tipo === 'cotacoes' ? ['evento_nome', 'modalidade', 'status'] :
        tipo === 'propostas' ? ['evento_nome', 'fornecedor_nome', 'status'] : ['nome', 'perfil_solicitado', 'status']
    if (textos.some(k => typeof item[k] !== 'string' || !item[k].trim())) erro()
    if (tipo === 'eventos' && (!Number.isSafeInteger(item.usuario_id) || item.usuario_id <= 0 || !diaEventoRelatorio(item.data) ||
      !(item.categoria === null || typeof item.categoria === 'string'))) erro()
    if (tipo === 'solicitacoes' && (!Number.isSafeInteger(item.usuario_id) || item.usuario_id <= 0 ||
      typeof item.criada_em !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(item.criada_em) || !diaSolicitacao(item.criada_em))) erro()
    if (tipo === 'cotacoes' || tipo === 'propostas') {
      if (!Number.isSafeInteger(item.evento_id) || item.evento_id <= 0 ||
        typeof item.criada_em !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(item.criada_em) ||
        !diaEventoRelatorio(item.criada_em) || !diaSolicitacao(item.criada_em)) erro()
      if (tipo === 'cotacoes' && !diaEventoRelatorio(item.prazo)) erro()
      if (tipo === 'propostas' && (!Number.isSafeInteger(item.fornecedor_id) || item.fornecedor_id <= 0 ||
        !['string', 'number'].includes(typeof item.valor) || !/^\d+(?:\.\d{1,2})?$/.test(String(item.valor)))) erro()
    }
  }
  return dados
}
export function filtrarRelatorio(tipo, dados, f) {
  if (tipo !== 'usuarios' && f.inicio && f.fim && f.inicio > f.fim) return []
  return dados.filter(item => {
    if (tipo === 'usuarios') return (!f.perfil || item.perfil === f.perfil) &&
      (!f.busca || normalizarBusca(`${item.nome} ${item.email}`).includes(normalizarBusca(f.busca)))
    const dia = tipo === 'eventos' ? diaEventoRelatorio(item.data) :
      tipo === 'cotacoes' && f.dataReferencia === 'prazo' ? diaEventoRelatorio(item.prazo) : diaSolicitacao(item.criada_em)
    if (tipo === 'cotacoes' || tipo === 'propostas') return (!f.estado || item.status === f.estado) &&
      (!f.evento || String(item.evento_id) === f.evento) && (!f.inicio || dia >= f.inicio) && (!f.fim || dia <= f.fim) &&
      (tipo === 'cotacoes' ? (!f.modalidade || item.modalidade === f.modalidade) : (!f.fornecedor || String(item.fornecedor_id) === f.fornecedor))
    return (!f.estado || item.status === f.estado) && (!f.inicio || dia >= f.inicio) && (!f.fim || dia <= f.fim) &&
      (tipo === 'eventos' ? (!f.categoria || (item.categoria || 'Não informada') === f.categoria) &&
        (!f.organizador || String(item.usuario_id) === f.organizador) : (!f.perfil || item.perfil_solicitado === f.perfil))
  })
}
export function agruparRelatorio(dados, campo) {
  const grupos = new Map()
  for (const item of dados) {
    const valor = item[campo] || 'Não informada'
    grupos.set(valor, (grupos.get(valor) || 0) + 1)
  }
  return [...grupos].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([valor, quantidade]) => ({ valor, quantidade }))
}
