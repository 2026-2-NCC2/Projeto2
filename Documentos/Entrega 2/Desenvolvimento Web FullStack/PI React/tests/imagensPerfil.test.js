import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { setImmediate } from 'node:timers'
import { transformSync } from 'rolldown/utils'
import postcss from 'postcss'

const jsx = jsxPrimitivas
const nodes = v => v && typeof v === 'object' ? [v, ...(v.children || []).flatMap(nodes)] : []
const text = v => v && typeof v === 'object' ? (v.children || []).map(text).join(' ') : String(v ?? '')
const tick = () => new Promise(r => setImmediate(r))
function load(file, name, env = {}) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '')
    .replaceAll('export function ', 'function ').replaceAll('export async function ', 'async function ')
  const result = transformSync(file, source, { jsx: { runtime: 'classic', pragma: 'jsx', pragmaFrag: 'Fragment' } })
  assert.equal(result.errors.length, 0)
  class URLTeste extends URL { static createObjectURL(){return 'blob:previa-local'} static revokeObjectURL(){} }
  return vm.runInNewContext(result.code + '\n' + name, { ...primitivasFixture, jsx, Fragment: 'fragment', URL:URLTeste, Icone: 'svg', AbortController, useFocoModal:()=>({current:null}),
    apiUrl: x => x, sessionStorage: { getItem: () => 'token-a' }, ...env })
}
const arquivo = { size: 20, type: 'image/png' }
const imagem = { url: 'https://teste.supabase.co/storage/v1/object/sign/perfil-fotos/7/00000000-0000-4000-8000-000000000001.webp?token=sintetico', expira_em_segundos: 120 }
function runtime(acessarImagem) {
  const cells = [], deps = [], cleanups = [], efeitos = [], timers = []
  let cursor = 0, effect = 0
  const validarArquivoImagem = load('services/imagensPerfil.js','validarArquivoImagem')
  const fn = load('components/perfil/ImagensPerfil.jsx','ImagemPerfil',{
    acessarImagem, validarArquivoImagem, window: { confirm: () => true },
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length - 1 }, clearTimeout(i) { timers[i] = null },
    useState(inicial) { const i=cursor++; if(!(i in cells))cells[i]=inicial;return[cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v}] },
    useRef(valor) { const i=cursor++;if(!(i in cells))cells[i]={current:valor};return cells[i] },
    useEffect(fn, d) { const i=effect++; if(!deps[i] || d.some((v,j)=>v!==deps[i][j])) { deps[i]=d;efeitos.push(()=>{cleanups[i]?.();cleanups[i]=fn()}) } },
  })
  let props = { token: 'token-a', id: 7, tipo:'foto' }
  return { timers, render(extra) { props={...props,...extra};cursor=0;effect=0;const v=fn(props);efeitos.splice(0).forEach(f=>f());return v },
    unmount() { cleanups.forEach(c=>c?.()) } }
}
const button = (view,label) => nodes(view).find(n=>n.type==='button' && text(n).includes(label))
test('os quatro perfis habilitam imagens somente com capacidade confirmada pelo backend',()=>{
  const ImagensPerfil=()=>null
  for(const papel of ['participante','organizador','fornecedor','admin'])for(const capacidade of [undefined,false,true]){
    const pagina=load('components/perfil/PerfilPessoal.jsx','PerfilPessoal',{
      usePerfil:()=>({perfil:{id:7,nome:'Fixture',email:'fixture@example.invalid',perfil:papel,imagens_disponiveis:capacidade},erro:'',recarregar(){}}),
      ImagensPerfil,PerfilProfissional:()=>null,ConsultaPortfolios:()=>null,
    })
    const componente=nodes(pagina({})).find(n=>n.type===ImagensPerfil)
    assert.equal(componente.props.habilitado,capacidade===true)
  }
})
test('produção mantém foto/capa bloqueadas, sem consultar API', () => {
  let calls=0;const r=runtime(()=>{calls++})
  for(const tipo of ['foto','capa']) {
    const view=r.render({tipo});assert.ok(nodes(view).filter(n=>n.type==='button' || n.type==='input').every(n=>n.props.disabled))
    assert.match(text(view),/personalização de imagens ainda não está disponível/)
  }
  assert.equal(calls,0)
  const source=readFileSync(new URL('../src/components/perfil/ImagensPerfil.jsx',import.meta.url),'utf8')
  assert.ok(!source.includes('habilitado={true}'))
})
test('arquivo inválido é recusado antes de qualquer upload', async () => {
  const calls=[],r=runtime(async p=>{calls.push(p);return null})
  r.render({habilitado:true});await tick()
  const input=nodes(r.render()).find(n=>n.type==='input')
  input.props.onChange({target:{files:[{type:'image/svg+xml',size:50}],value:'arquivo'}})
  assert.match(text(r.render()),/JPEG, PNG ou WebP/)
  assert.ok(button(r.render(),'Enviar').props.disabled);assert.equal(calls.length,1)
})
test('envio e remoção preservam contrato; dupla submissão não repete escrita', async () => {
  const calls=[];let resolveUpload
  const r=runtime(async p=>{calls.push(p);if(p.metodo==='PUT')return new Promise(resolve=>{resolveUpload=resolve});return p.metodo==='DELETE'?{}:imagem})
  r.render({habilitado:true});await tick()
  nodes(r.render()).find(n=>n.type==='input').props.onChange({target:{files:[arquivo]}})
  const enviar=button(r.render(),'Substituir').props.onClick
  const pending=enviar();await enviar();assert.equal(calls.filter(p=>p.metodo==='PUT').length,1)
  resolveUpload({});await pending;r.render();await tick()
  assert.match(text(r.render()),/Imagem atualizada/)
  await button(r.render(),'Remover imagem').props.onClick();r.render();await tick()
  assert.equal(calls.filter(p=>p.metodo==='DELETE').length,1)
})
test('timeout não repete PUT; bloqueia escrita até consulta explícita bem sucedida', async () => {
  const calls=[],r=runtime(async p=>{calls.push(p);if(p.metodo==='PUT')throw Error('Resultado incerto');return null})
  r.render({habilitado:true});await tick()
  nodes(r.render()).find(n=>n.type==='input').props.onChange({target:{files:[arquivo]}})
  await button(r.render(),'Enviar').props.onClick()
  assert.equal(calls.filter(p=>p.metodo==='PUT').length,1);assert.ok(button(r.render(),'Enviar').props.disabled)
  button(r.render(),'Consultar').props.onClick();r.render();await tick()
  assert.ok(!nodes(r.render()).find(n=>n.type==='input').props.disabled)
})
test('URL assinada renova por GET e desmontagem aborta; imagem não é persistida', async () => {
  const calls=[],r=runtime(async p=>{calls.push(p);return imagem})
  r.render({habilitado:true});await tick()
  assert.equal(nodes(r.render()).find(n=>n.type==='img').props.referrerPolicy,'no-referrer')
  assert.equal(r.timers[0].ms,110000);await r.timers[0].fn();assert.equal(calls.length,2)
  r.unmount();assert.ok(calls.every(p=>p.signal.aborted))
})
test('serviço envia binário e JWT só ao Express; rejeita sessão alterada e URL de outro dono', async () => {
  const calls=[];const acessar=load('services/imagensPerfil.js','acessarImagem',{fetch:async(...p)=>{calls.push(p);return{ok:true,json:async()=>({})}}})
  await acessar({token:'token-a',id:7,tipo:'foto',metodo:'PUT',arquivo})
  assert.equal(calls[0][0],'/perfil/imagens/foto');assert.equal(calls[0][1].body,arquivo)
  assert.equal(calls[0][1].headers.Authorization,'Bearer token-a')
  const trocar=load('services/imagensPerfil.js','acessarImagem',{fetch:async()=>({ok:true,json:async()=>({imagem})}),sessionStorage:{getItem:()=> 'token-b'}})
  await assert.rejects(trocar({token:'token-a',id:7,tipo:'foto'}),/sessão/)
  const conferir=load('services/imagensPerfil.js','conferirImagem')
  assert.throws(()=>conferir(imagem,'foto',8),/inválido/)
  assert.throws(()=>conferir({...imagem,url:'http://inseguro.invalid'},'foto',7),/inválido/)
})
test('falha/503 não apresenta sucesso nem repete rede; tamanho/mime validados', async () => {
  let calls=0
  const acessar=load('services/imagensPerfil.js','acessarImagem',{fetch:async()=>{calls++;return{ok:false,status:503}}})
  await assert.rejects(acessar({token:'token-a',id:7,tipo:'capa'}),/indisponíveis/);assert.equal(calls,1)
  const validar=load('services/imagensPerfil.js','validarArquivoImagem')
  assert.throws(()=>validar('foto',{...arquivo,size:5242881}),/limite/)
  assert.doesNotThrow(()=>validar('capa',{...arquivo,size:10485760}))
})
test('imagens reutilizam PerfilPessoal nos quatro perfis e CSS não mascara overflow', () => {
  const source=readFileSync(new URL('../src/components/perfil/PerfilPessoal.jsx',import.meta.url),'utf8')
  assert.match(source,/<ImagensPerfil/)
  for(const file of ['pages/organizador/Perfil.jsx','pages/fornecedor/PortalFornecedor.jsx','components/admin/AdminPortal.jsx','pages/participante/PortalParticipante.jsx','App.jsx']) {
    const s=readFileSync(new URL('../src/'+file,import.meta.url),'utf8')
    if(file==='pages/fornecedor/PortalFornecedor.jsx')assert.match(s,/PerfilFornecedor/)
    else assert.match(s,/PerfilPessoal/)
  }
  const css=postcss.parse(readFileSync(new URL('../src/App.css',import.meta.url),'utf8'))
  const regras=[];css.walkRules(r=>{if(r.selector==='.perfilApresentacaoCorpo')regras.push(r)})
  assert.equal(regras.length,2)
  assert.match(regras[1].parent.params,/700px/)
  for(const width of [1920,1366,768,390,360])assert.ok((width<=700 ? regras[1] : regras[0]).toString().includes('minmax(0, 1fr)'))
})

test('cabeçalho dos quatro perfis usa identidade real e mantém imagens bloqueadas',()=>{
  const cabecalho=load('components/perfil/ImagensPerfil.jsx','ImagensPerfil',{
    acessarImagem(){throw Error('API bloqueada não pode ser consultada')},
  })
  for(const [perfil,rotulo] of [['participante','Participante'],['organizador','Organizador'],['fornecedor','Fornecedor'],['admin','Administrador']]){
    const view=cabecalho({perfil:{id:7,nome:'Identidade de teste',email:'teste@example.invalid',perfil},indicadores:jsx('span',{},'Indicador real')})
    assert.match(text(view),new RegExp(rotulo));assert.match(text(view),/Identidade de teste/);assert.match(text(view),/teste@example.invalid/)
    assert.match(text(view),/Indicador real/);assert.doesNotMatch(text(view),/homologação|Storage|Limpeza física/)
    assert.equal(nodes(view).filter(n=>['input','button','img'].includes(n.type)).length,0)
    const imagens=nodes(view).filter(n=>typeof n.type==='function')
    assert.equal(imagens.length,2)
    assert.ok(imagens.every(n=>n.props.habilitado===false && n.props.integrado===true))
    assert.deepEqual(imagens.map(n=>n.props.tipo),['capa','foto'])
  }
})

test('editor integrado mostra prévia local, aguarda confirmação e permite cancelar',async()=>{
  const calls=[],r=runtime(async p=>{calls.push(p);return null})
  r.render({habilitado:true,integrado:true});await tick()
  const input=nodes(r.render()).find(n=>n.type==='input')
  input.props.onChange({target:{files:[arquivo]}});r.render()
  const v=r.render();assert.ok(nodes(v).some(n=>n.props.role==='dialog'))
  assert.ok(nodes(v).some(n=>n.type==='img' && n.props.src==='blob:previa-local'))
  assert.equal(calls.length,1)
  button(v,'Cancelar').props.onClick();r.render();assert.ok(!nodes(r.render()).some(n=>n.props.role==='dialog'))
  assert.equal(calls.length,1);r.unmount()
})

test('editor integrado salva/substitui e remove via Express sem repetir escrita',async()=>{
  const calls=[];let atual=null,resolver
  const r=runtime(async p=>{calls.push(p);if(p.metodo==='PUT')return new Promise(resolve=>{resolver=()=>{atual=imagem;resolve({mensagem:'Imagem atualizada.'})}});if(p.metodo==='DELETE'){atual=null;return{mensagem:'Imagem removida.'}}return atual})
  r.render({habilitado:true,integrado:true});await tick()
  assert.ok(button(r.render(),'Adicionar foto'))
  nodes(r.render()).find(n=>n.type==='input').props.onChange({target:{files:[arquivo]}});r.render()
  const salvar=button(r.render(),'Salvar imagem').props.onClick
  const pendente=salvar();await salvar();assert.equal(calls.filter(p=>p.metodo==='PUT').length,1)
  resolver();await pendente;r.render();await tick();assert.ok(button(r.render(),'Alterar foto'))
  await button(r.render(),'Remover foto').props.onClick();r.render();await tick()
  assert.equal(calls.filter(p=>p.metodo==='DELETE').length,1);assert.ok(button(r.render(),'Adicionar foto'));r.unmount()
})

test('editor integrado bloqueado não oferece envio ou seleção efetiva',()=>{
  const r=runtime(()=>{throw Error('Não acessar API')});const v=r.render({integrado:true})
  assert.ok(button(v,'Adicionar foto').props.disabled)
  assert.ok(nodes(v).find(n=>n.type==='input').props.disabled)
  assert.equal(button(v,'Salvar imagem'),undefined);assert.equal(button(v,'Remover foto'),undefined);r.unmount()
})

test('503 na consulta inicial mantém edição bloqueada mesmo com montagem candidata habilitada',async()=>{
  const calls=[],r=runtime(async p=>{calls.push(p);throw Error('Imagens indisponíveis')})
  r.render({integrado:true,habilitado:true});await tick();const v=r.render()
  assert.ok(button(v,'Adicionar foto').props.disabled);assert.ok(nodes(v).find(n=>n.type==='input').props.disabled)
  nodes(v).find(n=>n.type==='input').props.onChange({target:{files:[arquivo]}})
  assert.ok(!nodes(r.render()).some(n=>n.props.role==='dialog'));assert.equal(calls.length,1);r.unmount()
})
