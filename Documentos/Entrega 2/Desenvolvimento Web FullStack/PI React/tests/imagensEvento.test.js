import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { setImmediate } from 'node:timers'
import { readFileSync } from 'node:fs'
import { transformSync } from 'rolldown/utils'

const fonteServico = readFileSync(new URL('../src/services/imagensEvento.js', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ')
const { conferirImagensEvento, acessarImagensEvento } = vm.runInNewContext(fonteServico+'\n({conferirImagensEvento,acessarImagensEvento})', { URL })

const jsx = (type, props, ...children) => typeof type==='function'?type({...props,children:children.flat(Infinity)}):({ type, props: props || {}, children: children.flat(Infinity) })
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
function harness({ativo=false,imagens=[],carregando=false,erro='',recarregar=async()=>true,enviar=async()=>({})}={}) {
  const states=[],effects=[],jobs=[],urls=[],revogadas=[],calls=[]
  let cursor=0,ec=0,pendentes=[]
  const fonte = readFileSync(new URL('../src/components/eventos/MidiaEvento.jsx', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replaceAll('export function ', 'function ')
  const r = transformSync('MidiaEvento.jsx', fonte, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  class Url extends URL { static createObjectURL(){const u='blob:fixture-'+urls.length;urls.push(u);return u} static revokeObjectURL(u){revogadas.push(u)} }
  const Midia=vm.runInNewContext(r.code+'\nMidiaEvento', { jsx, Fragment: 'fragment', Icone: 'svg', conferirImagensEvento,URL:Url,AbortController,
    ContextoImagensEvento:{},useContext:()=>({token:'sintetico'}),useImagensEvento:()=>({token:'sintetico',consultar:ativo,alterar:ativo,imagens,carregando,erro,recarregar}),
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


test('arquivo inválido descarta a seleção anterior e impede envio acidental',()=>{
  const h=harness({ativo:true}),props={eventoId:13,editar:true}
  let view=h.render(props)
  nodes(view).find(n=>n.type==='input').props.onChange({target:{files:[{size:20,type:'image/webp'}]}})
  h.render(props);view=h.render(props)
  nodes(view).find(n=>n.type==='input').props.onChange({target:{files:[{size:20,type:'text/plain'}]}})
  view=h.render(props)
  assert.equal(nodes(view).find(n=>n.type==='button'&&text(n)==='Confirmar envio').props.disabled,true)
  assert.ok(!nodes(view).some(n=>n.type==='img'&&n.props.src.startsWith('blob:')))
  assert.deepEqual(h.revogadas,h.urls);assert.equal(h.calls.length,0);h.unmount()
})

test('consulta e escrita apresentam progresso e bloqueiam ações concorrentes',async()=>{
  const props={eventoId:13,editar:true},h=harness({ativo:true,carregando:true})
  const loading=h.render(props)
  assert.equal(nodes(loading).find(n=>n.props.className==='eventoMidiaCorpo').props['aria-busy'],true)
  assert.match(text(loading),/Carregando imagens/)
  assert.equal(nodes(loading).find(n=>n.type==='button'&&text(n)==='Consultar imagens novamente').props.disabled,true)
  let terminar
  const enviando=harness({ativo:true,enviar:()=>new Promise(r=>{terminar=r})})
  let view=enviando.render(props)
  nodes(view).find(n=>n.type==='input').props.onChange({target:{files:[{size:20,type:'image/webp'}]}})
  enviando.render(props);view=enviando.render(props)
  const envio=nodes(view).find(n=>n.type==='button'&&text(n)==='Confirmar envio').props.onClick()
  view=enviando.render(props)
  assert.match(text(view),/Salvando alteração/)
  assert.equal(nodes(view).find(n=>n.type==='fieldset').props.disabled,true)
  terminar({});await envio;enviando.unmount();h.unmount()
})

test('imagem que falha apresenta aviso legível; falha de consulta apresenta alerta',()=>{
  const h=harness({imagens:[imagem(0)]}),props={eventoId:13}
  let view=h.render(props)
  nodes(view).find(n=>n.type==='img').props.onError()
  view=h.render(props)
  assert.equal(nodes(view).filter(n=>n.type==='img').length,0)
  assert.match(text(view),/Imagem indisponível/)
  assert.ok(nodes(harness({ativo:true,erro:'Falha sintética'}).render(props)).some(n=>n.props.role==='alert'&&text(n)==='Falha sintética'))
  h.unmount()
})

test('escrita incerta só libera novo envio após consulta bem-sucedida, sem retry',async()=>{
  let consultaOk=false
  const h=harness({ativo:true,enviar:async()=>{throw Error('Operação não confirmada')},recarregar:async()=>consultaOk}),props={eventoId:13,editar:true}
  let view=h.render(props)
  nodes(view).find(n=>n.type==='input').props.onChange({target:{files:[{size:20,type:'image/webp'}]}})
  h.render(props);view=h.render(props)
  await nodes(view).find(n=>n.type==='button'&&text(n)==='Confirmar envio').props.onClick()
  view=h.render(props)
  assert.equal(nodes(view).find(n=>n.type==='button'&&text(n)==='Confirmar envio').props.disabled,true)
  await nodes(view).find(n=>n.type==='button'&&text(n)==='Consultar imagens novamente').props.onClick()
  view=h.render(props)
  assert.equal(nodes(view).find(n=>n.type==='button'&&text(n)==='Confirmar envio').props.disabled,true)
  consultaOk=true
  await nodes(view).find(n=>n.type==='button'&&text(n)==='Consultar imagens novamente').props.onClick()
  view=h.render(props)
  assert.equal(nodes(view).find(n=>n.type==='button'&&text(n)==='Confirmar envio').props.disabled,false)
  assert.equal(h.calls.length,1);h.unmount()
})


function hookHarness() {
  const states=[],effects=[],callbacks=[],timeouts=new Map(),intervals=new Map(),pedidos=[]
  let cursor=0,ec=0,cc=0,seq=0,acesso={token:'sessao-a',consultar:true,alterar:true}
  const fonte=readFileSync(new URL('../src/hooks/useImagensEvento.js',import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export const ','const ').replaceAll('export function ','function ')
  const executarHook=vm.runInNewContext(fonte+'\nuseImagensEvento',{
    AbortController,Number,createContext:v=>v,useContext:()=>acesso,
    acessarImagensEvento:args=>new Promise((resolve,reject)=>pedidos.push({args,resolve,reject})),
    useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=v}]},
    useRef:initial=>{const i=cursor++;return states[i]||=({current:initial})},
    useCallback:(fn,deps)=>{const i=cc++,old=callbacks[i];if(!old||deps.some((v,j)=>v!==old.deps[j]))callbacks[i]={fn,deps};return callbacks[i].fn},
    useEffect:(fn,deps)=>{const i=ec++,old=effects[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();effects[i]={deps,cleanup:fn()}}},
    setTimeout:fn=>{timeouts.set(++seq,fn);return seq},clearTimeout:id=>timeouts.delete(id),
    setInterval:fn=>{intervals.set(++seq,fn);return seq},clearInterval:id=>intervals.delete(id),
  })
  return {pedidos,render(id,novoAcesso){if(novoAcesso)acesso=novoAcesso;cursor=ec=cc=0;return executarHook(id)},
    iniciar(){for(const [id,fn] of timeouts){timeouts.delete(id);fn()}},renovar(){for(const fn of intervals.values())fn()},
    unmount(){effects.forEach(e=>e.cleanup?.());assert.equal(intervals.size,0);assert.equal(timeouts.size,0)}}
}

test('hook mostra carregamento, descarta URLs na renovação e encerra timers',async()=>{
  const h=hookHarness()
  h.render(13);h.iniciar()
  assert.equal(h.render(13).carregando,true)
  h.pedidos[0].resolve([imagem(0)]);await new Promise(setImmediate)
  assert.equal(h.render(13).imagens.length,1)
  h.renovar()
  assert.equal(h.render(13).imagens.length,0);assert.equal(h.render(13).carregando,true)
  h.pedidos[1].reject(Error('Consulta indisponível'));await new Promise(setImmediate)
  assert.equal(h.render(13).carregando,false);assert.equal(h.render(13).erro,'Consulta indisponível')
  h.unmount()
})

test('hook impede imagens de outro evento/sessão e ignora respostas atrasadas',async()=>{
  const h=hookHarness()
  h.render(13);h.iniciar();h.pedidos[0].resolve([imagem(0)]);await new Promise(setImmediate)
  assert.equal(h.render(13).imagens.length,1)
  assert.equal(h.render(14).imagens.length,0);h.iniciar()
  const antigo=h.render(14).recarregar()
  const cancelado=h.pedidos.at(-1)
  assert.equal(h.render(14,{token:'sessao-b',consultar:true,alterar:true}).imagens.length,0)
  h.iniciar()
  cancelado.resolve([imagem(0)])
  assert.equal(await antigo,false)
  assert.equal(h.render(14).imagens.length,0)
  h.pedidos.at(-1).resolve([]);await new Promise(setImmediate)
  assert.equal(h.render(14).carregando,false);h.unmount()
})

test('hook desabilitado não consulta nem conserva URLs da sessão anterior',()=>{
  const h=hookHarness()
  const view=h.render(13,{token:'sessao-a',consultar:false,alterar:false});h.iniciar();h.renovar()
  assert.equal(view.imagens.length,0);assert.equal(view.carregando,false);assert.equal(h.pedidos.length,0);h.unmount()
})


test('falha de transporte mostra orientação em português sem repetir a chamada',async()=>{
  let chamadas=0
  const api=vm.runInNewContext(fonteServico+'\n({acessarImagensEvento})',{URL,apiUrl:p=>p,
    validarArquivoImagem(){},fetch:async()=>{chamadas++;throw new TypeError('Failed to fetch')},
  })
  await assert.rejects(api.acessarImagensEvento({token:'sintetico',eventoId:13,habilitado:true}),/consultar as imagens/)
  await assert.rejects(api.acessarImagensEvento({token:'sintetico',eventoId:13,habilitado:true,metodo:'PUT',posicao:0,arquivo:{}}),/não confirmada/)
  assert.equal(chamadas,2)
})
