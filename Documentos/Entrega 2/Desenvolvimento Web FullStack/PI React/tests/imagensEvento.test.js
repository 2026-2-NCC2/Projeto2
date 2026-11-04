import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { transformSync } from 'rolldown/utils'

const fonteServico = readFileSync(new URL('../src/services/imagensEvento.js', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ')
const { conferirImagensEvento, acessarImagensEvento } = vm.runInNewContext(fonteServico+'\n({conferirImagensEvento,acessarImagensEvento})', { URL })

const jsx = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
function componente(props) {
  const fonte = readFileSync(new URL('../src/components/eventos/MidiaEvento.jsx', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace('export function ', 'function ')
  const r = transformSync('MidiaEvento.jsx', fonte, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  return vm.runInNewContext(r.code+'\nMidiaEvento', { jsx, Fragment: 'fragment', Icone: 'svg', conferirImagensEvento })(props)
}
const imagem = posicao => ({ posicao, url:'https://sintetico.supabase.co/storage/v1/object/sign/eventos-imagens/13/00000000-0000-4000-8000-000000000001.webp?token=ficticio', expira_em_segundos:120 })
test('organizador tem controles explicitamente bloqueados; consulta não oferece edição', () => {
  const editar = componente({ eventoId:13, editar:true })
  assert.ok(nodes(editar).filter(n=>['button','input'].includes(n.type)).every(n=>n.props.disabled))
  assert.match(text(editar),/Uploads permanecem bloqueados/)
  assert.equal(nodes(componente({eventoId:13})).filter(n=>['button','input'].includes(n.type)).length,0)
  assert.match(text(componente({editar:true})),/Salve o evento/)
})
test('capa e galeria preservam ordem, texto alternativo e privacidade', () => {
  const view = componente({ eventoId:13, imagens:[imagem(8),imagem(0),imagem(1)] })
  const imgs = nodes(view).filter(n=>n.type==='img')
  assert.deepEqual(imgs.map(n=>n.props.alt),['Capa do evento','Imagem 1 da galeria do evento','Imagem 8 da galeria do evento'])
  assert.ok(imgs.every(n=>n.props.referrerPolicy==='no-referrer'))
})
test('URLs de outro evento/perfil, posição duplicada e excesso são recusados', () => {
  assert.throws(()=>conferirImagensEvento(14,[imagem(0)]))
  assert.throws(()=>conferirImagensEvento(13,[imagem(0),imagem(0)]))
  assert.throws(()=>conferirImagensEvento(13,[{...imagem(0),url:imagem(0).url.replace('eventos-imagens','perfil-capas')}]))
  assert.throws(()=>conferirImagensEvento(13,Array.from({length:10},(_,i)=>imagem(i))))
  assert.equal(nodes(componente({eventoId:14,imagens:[imagem(0)]})).filter(n=>n.type==='img').length,0)
})
test('cliente recusa qualquer operação enquanto não autorizado, antes de acessar rede', async () => {
  for(const metodo of ['GET','PUT','DELETE']) await assert.rejects(acessarImagensEvento({token:'ficticio',eventoId:13,metodo}),/indisponíveis/)
})
