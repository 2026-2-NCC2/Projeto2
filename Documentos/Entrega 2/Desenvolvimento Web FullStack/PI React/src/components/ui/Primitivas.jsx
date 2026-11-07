import { useId } from 'react'
import './Primitivas.css'

const classes = (...valores) => valores.filter(Boolean).join(' ')
const variantes = ['sucesso', 'alerta', 'erro', 'informacao', 'neutro']

// Controles nativos preservam teclado, semantica e integracao com formularios.
export function Botao({ variante = 'primario', ocupado = false, disabled = false, type = 'button', children, className, ...props }) {
  const tom = ['primario', 'secundario', 'discreto', 'destrutivo'].includes(variante) ? variante : 'primario'
  return <button {...props} type={type} disabled={disabled || ocupado} aria-busy={ocupado || undefined}
    className={classes('ttBotao', `ttBotao--${tom}`, className)}>
    {ocupado && <span className="ttProgresso" aria-hidden="true" />}{children}
    {ocupado && <span className="ttSrOnly"> — Em andamento</span>}
  </button>
}

export function Campo({ id, label, dica, erro, obrigatorio = false, ocupado = false, disabled = false,
  como = 'input', children, className, 'aria-describedby': descritoPor, 'aria-invalid': invalido, ...props }) {
  const gerado = useId()
  const controleId = id || `campo-${gerado}`
  const Controle = ['input', 'select', 'textarea'].includes(como) ? como : 'input'
  const descricoes = [descritoPor, dica && `${controleId}-dica`, erro && `${controleId}-erro`].filter(Boolean).join(' ') || undefined
  const atributos = { ...props, id: controleId, required: obrigatorio, disabled: disabled || ocupado,
    'aria-describedby': descricoes, 'aria-invalid': erro ? true : invalido,
    'aria-busy': ocupado || undefined, className: 'ttCampoControle' }
  return <div className={classes('ttCampo', className)} aria-busy={ocupado || undefined}>
    <label htmlFor={controleId}>{label}{obrigatorio && <span aria-hidden="true"> *</span>}</label>
    {Controle === 'input' ? <input {...atributos} /> : <Controle {...atributos}>{children}</Controle>}
    {dica && <p className="ttCampoDica" id={`${controleId}-dica`}>{dica}</p>}
    {erro && <p className="ttCampoErro" id={`${controleId}-erro`} role="alert">{erro}</p>}
  </div>
}

export function Badge({ variante = 'neutro', children, className, ...props }) {
  const tom = variantes.includes(variante) ? variante : 'neutro'
  return <span {...props} className={classes('ttBadge', `ttTom--${tom}`, className)}>{children}</span>
}

export function Alerta({ variante = 'informacao', titulo, children, className, ...props }) {
  const tom = variante === 'aviso' ? 'alerta' : variantes.includes(variante) ? variante : 'informacao'
  return <div {...props} className={classes('ttAlerta', `ttTom--${tom}`, className)}
    role={tom === 'erro' ? 'alert' : 'status'} aria-atomic="true">
    {titulo && <p className="ttAlertaTitulo">{titulo}</p>}{children}
  </div>
}

export function EstadoVazio({ tipo = 'sem-dados', titulo, children, acao, className }) {
  const titulos = { 'sem-dados': 'Nenhum dado disponível', 'sem-resultados': 'Nenhum resultado para estes filtros',
    indisponivel: 'Consulta indisponível', 'sem-permissao': 'Você não tem permissão para acessar este conteúdo' }
  return <div className={classes('ttVazio', className)} role="status" aria-atomic="true">
    <p className="ttVazioTitulo">{titulo || titulos[tipo] || titulos['sem-dados']}</p>
    {children}{acao && <div className="ttVazioAcao">{acao}</div>}
  </div>
}

export function Skeleton({ tipo = 'texto', linhas = 3, rotulo = 'Carregando dados', className }) {
  const forma = ['texto', 'card', 'avatar', 'tabela'].includes(tipo) ? tipo : 'texto'
  const quantidade = Number.isInteger(linhas) ? Math.max(1, Math.min(linhas, 20)) : 3
  return <div className={classes('ttSkeleton', `ttSkeleton--${forma}`, className)} role="status" aria-busy="true">
    <span className="ttSrOnly">{rotulo}</span>
    <div className="ttSkeletonVisual" aria-hidden="true">
      {forma === 'avatar' ? <span className="ttSkeletonAvatar" /> : <>
        {forma === 'card' && <span className="ttSkeletonCapa" />}
        {Array.from({ length: quantidade }, (_, i) => forma === 'tabela'
          ? <div className="ttSkeletonLinhaTabela" key={i}>{[0, 1, 2].map(c => <span key={c} />)}</div>
          : <span className="ttSkeletonTexto" key={i} />)}
      </>}
    </div>
  </div>
}
