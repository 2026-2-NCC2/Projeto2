import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { transformSync } from 'rolldown/utils'

const fonteServico = readFileSync(new URL('../src/services/imagensEvento.js', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ')
const { conferirImagensEvento, acessarImagensEvento } = vm.runInNewContext(fonteServico+'\n({conferirImagensEvento,acessarImagensEvento})', { URL })

const jsx = (type, props, ...children) => typeof type==='function'?type({...props,children:children.flat(Infinity)}):({ type, props: props || {}, children: children.flat(Infinity) })
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
function harness({ativo=false,imagens=[],enviar=async()=>({})}={}) {
  const states=[],effects=[],jobs=[],urls=[],revogadas=[],calls=[]
  let cursor=0,ec=0,pendentes=[]
  const fonte = readFileSync(new URL('../src/components/eventos/MidiaEvento.jsx', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ')
  const r = transformSync('MidiaEvento.jsx', fonte, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  class Url extends URL { static createObjectURL(){const u='blob:fixture-'+urls.length;urls.push(u);return u} static revokeObjectURL(u){revogadas.push(u)} }
  const Midia=vm.runInNewContext(r.code+'\nMidiaEvento', { jsx, Fragment: 'fragment', Icone: 'svg', conferirImagensEvento,URL:Url,AbortController,
    ContextoImagensEvento:{},useContext:()=>({token:'sintetico'}),useImagensEvento:()=>({token:'sintetico',consultar:ativo,alterar:ativo,imagens,erro:'',recarregar:async()=>true}),
    validarArquivoImagem:(_tipo,f)=>{if(f.type!=='image/webp'||f.size>10485760)throw Error('Arquivo inválido')},
    acessarImagensEvento:async args=>{calls.push(args);return enviar(args)},queueMicrotask:fn=>jobs.push(fn),
    useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},
    useRef:initial=>{const i=cursor++;return states[i]||=( {current:initial} )},
    useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();effects[i]={deps};pendentes.push(()=>{effects[i].cleanup=fn()})}},
  })
  return{calls,urls,revogadas,render(props){cursor=0;ec=0;pendentes=[];const view=Midia(props);pendentes.forEach(f=>f());while(jobs.length)jobs.shift()();return view},unmount(){effects.forEach(e=>e.cleanup?.())}}
}
function componente(props){return harness().render(props)}
const imagem = posicao => ({ posicao, url:'https://gnwybroqfvwosiqzsfla.supabase.co/storage/v1/object/sign/eventos-imagens/13/00000000-0000-4000-8000-000000000001.webp?token=ficticio', expira_em_segundos:120 })
test('uploads bloqueados permitem prévia local; consulta não oferece edição', () => {
  const editar = componente({ eventoId:13, editar:true })
  assert.ok(nodes(editar).filter(n=>n.type==='button').every(n=>n.props.disabled))
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
  assert.throws(()=>conferirImagensEvento(13,[{...imagem(0),url:imagem(0).url.replace('gnwybroqfvwosiqzsfla','outro-projeto')}]))
  assert.throws(()=>conferirImagensEvento(13,Array.from({length:10},(_,i)=>imagem(i))))
  assert.equal(nodes(componente({eventoId:14,imagens:[imagem(0)]})).filter(n=>n.type==='img').length,0)
})
test('cliente recusa qualquer operação enquanto não autorizado, antes de acessar rede', async () => {
  for(const metodo of ['GET','PUT','DELETE']) await assert.rejects(acessarImagensEvento({token:'ficticio',eventoId:13,metodo}),/indisponíveis/)
})
test('prévia não envia automaticamente e revoga object URL ao descartar/desmontar',()=>{
  const h=harness(),props={eventoId:13,editar:true}
  let view=h.render(props)
  nodes(view).find(n=>n.type==='input').props.onChange({target:{files:[{size:20,type:'image/webp'}]}})
  h.render(props);view=h.render(props)
  assert.equal(h.urls.length,1);assert.equal(h.calls.length,0)
  assert.ok(nodes(view).some(n=>n.type==='img'&&n.props.src.startsWith('blob:')))
  assert.equal(nodes(view).find(n=>n.type==='button'&&text(n)==='Confirmar envio').props.disabled,true)
  nodes(view).find(n=>n.type==='button'&&text(n)==='Descartar prévia').props.onClick()
  h.render(props);assert.deepEqual(h.revogadas,h.urls);h.unmount()
})
test('envio exige confirmação, trava clique repetido e mantém apenas uma tentativa',async()=>{
  let terminar;const pending=new Promise(r=>{terminar=r}),h=harness({ativo:true,enviar:()=>pending}),props={eventoId:13,editar:true}
  let view=h.render(props)
  nodes(view).find(n=>n.type==='input').props.onChange({target:{files:[{size:20,type:'image/webp'}]}})
  h.render(props);view=h.render(props)
  const confirmar=nodes(view).find(n=>n.type==='button'&&text(n)==='Confirmar envio')
  assert.equal(confirmar.props.disabled,false);assert.equal(h.calls.length,0)
  const envio=confirmar.props.onClick();await confirmar.props.onClick();assert.equal(h.calls.length,1)
  terminar({});await envio;h.render(props);assert.deepEqual(h.revogadas,h.urls);h.unmount()
})
test('remoção confirma a posição e eventos terminais ficam somente leitura',async()=>{
  const h=harness({ativo:true,imagens:[imagem(0)]}),props={eventoId:13,editar:true,estado:'Ativo'}
  let view=h.render(props)
  nodes(view).find(n=>n.type==='button'&&text(n)==='Remover imagem desta posição').props.onClick()
  assert.equal(h.calls.length,0);view=h.render(props)
  await nodes(view).find(n=>n.type==='button'&&text(n)==='Confirmar remoção').props.onClick()
  assert.equal(h.calls[0].metodo,'DELETE');assert.equal(h.calls[0].posicao,0);h.unmount()
  for(const estado of ['Cancelado','Encerrado']){
    const view=componente({eventoId:13,editar:true,estado})
    assert.equal(nodes(view).find(n=>n.type==='fieldset').props.disabled,true)
  }
})
test('cliente envia somente bytes e descarta resposta de sessão alterada',async()=>{
  const calls=[],s={token:'sintetico'}
  const api=vm.runInNewContext(fonteServico+'\n({acessarImagensEvento})',{URL,apiUrl:p=>p,sessionStorage:{getItem:()=>s.token},
    validarArquivoImagem(){},fetch:async(...args)=>{calls.push(args);return{ok:true,json:async()=>{s.token='outra-sessao';return{imagens:[imagem(0)]}}}},
  })
  await assert.rejects(api.acessarImagensEvento({token:'sintetico',eventoId:13,habilitado:true}),/sessão/)
  s.token='sintetico';const arquivo={size:20,type:'image/webp'}
  await assert.rejects(api.acessarImagensEvento({token:'sintetico',eventoId:13,habilitado:true,metodo:'PUT',posicao:8,arquivo}),/sessão/)
  assert.equal(calls[1][1].body,arquivo);assert.equal(calls[1][1].headers['Content-Type'],'application/octet-stream');assert.equal(calls[1][0],'/eventos/13/imagens/8')
})
