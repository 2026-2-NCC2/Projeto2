import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers'
import { transformSync } from 'rolldown/utils'
const jsx=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})
const nodes=v=>v&&typeof v==='object'?[v,...(v.children||[]).flatMap(nodes)]:[]
const text=v=>v&&typeof v==='object'?(v.children||[]).map(text).join(' '):String(v??'')
const botao=(v,t)=>nodes(v).find(n=>n.type==='button'&&text(n).includes(t))
const tick=()=>new Promise(r=>setImmediate(r))
const item={id:'00000000-0000-4000-8000-000000000001',fornecedor_id:7,titulo:'Trabalho de teste',descricao:'Descrição de teste',categoria:'Categoria de teste',versao:1}
const pagina=itens=>({itens,total:itens.length,pagina:1,totalPaginas:1})
function load(file,name,env={}){
  const fonte=readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replaceAll('export function ','function ').replaceAll('export async function ','async function ')
  const r=transformSync(file,fonte,{jsx:{runtime:'classic',pragma:'jsx',pragmaFrag:'Fragment'}})
  return vm.runInNewContext(r.code+'\n'+name,{jsx,Fragment:'fragment',AbortController,apiUrl:x=>x,sessionStorage:{getItem:()=> 'token-a'},window:{confirm:()=>true},...env})
}
function runtime(env){
  const cells=[],deps=[],cleanups=[],efeitos=[];let cursor=0,effect=0
  const fn=load('components/portfolio/Portfolio.jsx','Portfolio',{
    useState(v){const i=cursor++;if(!(i in cells))cells[i]=typeof v==='function'?v():v;return[cells[i],v=>{cells[i]=typeof v==='function'?v(cells[i]):v}]},
    useRef(v){const i=cursor++;if(!(i in cells))cells[i]={current:v};return cells[i]},
    useEffect(fn,d){const i=effect++;if(!deps[i]||d.some((v,j)=>v!==deps[i][j])){deps[i]=d;efeitos.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}},...env,
  })
  return{render(props={donoId:7,editar:true}){cursor=0;effect=0;const v=fn(props);efeitos.splice(0).forEach(f=>f());return v},unmount(){cleanups.forEach(f=>f?.())}}
}
test('migração pendente não aparece como portfólio vazio e bloqueia formulário',async()=>{
  const r=runtime({consultarPortfolio:async()=>{throw Error('Banco pendente')}});r.render();await tick();const v=r.render()
  assert.match(text(v),/Banco pendente/);assert.doesNotMatch(text(v),/Nenhum trabalho/);assert.ok(botao(v,'Cadastrar').props.disabled)
});
test('lista vazia confirmada permite cadastrar texto; upload permanece desabilitado',async()=>{
  let resolver,calls=0;const r=runtime({consultarPortfolio:async()=>pagina([]),salvarItemPortfolio:()=>{calls++;return new Promise(r=>{resolver=r})}})
  r.render();await tick();assert.match(text(r.render()),/Nenhum trabalho/)
  const campos=nodes(r.render()).filter(n=>n.type==='input'&&n.props.type!=='file'||n.type==='textarea')
  for(const [i,v]of ['Título real','Categoria','Descrição real'].entries())campos[i].props.onChange({target:{value:v}})
  const submit=nodes(r.render()).find(n=>n.type==='form').props.onSubmit
  submit({preventDefault(){}});submit({preventDefault(){}});assert.equal(calls,1)
  assert.doesNotMatch(text(r.render()),/Operação confirmada/);resolver(item);await tick()
  assert.match(text(r.render()),/Operação confirmada/)
  assert.ok(nodes(r.render()).find(n=>n.props.type==='file').props.disabled)
});
test('conflito preserva rascunho e exige consulta explícita, sem retry de escrita',async()=>{
  let calls=0;const r=runtime({consultarPortfolio:async()=>pagina([item]),salvarItemPortfolio:async()=>{calls++;throw Object.assign(Error('Conflito'),{incerto:true})}})
  r.render();await tick();botao(r.render(),'Editar').props.onClick()
  nodes(r.render()).find(n=>n.type==='input').props.onChange({target:{value:'Rascunho'}})
  nodes(r.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick()
  assert.equal(calls,1);assert.equal(nodes(r.render()).find(n=>n.type==='input').props.value,'Rascunho');assert.ok(botao(r.render(),'Salvar alterações').props.disabled)
  botao(r.render(),'Recarregar').props.onClick();r.render();await tick();assert.equal(calls,1)
});
test('consulta de terceiros não oferece controles de alteração',async()=>{
  const r=runtime({consultarPortfolio:async()=>({...pagina([item]),fornecedor:{id:7,nome:'Fornecedor teste'}})})
  r.render({donoId:7,editar:false});await tick();const v=r.render({donoId:7,editar:false})
  assert.match(text(v),/Trabalho de teste/);assert.equal(nodes(v).filter(n=>n.type==='form'||n.type==='input').length,0)
  assert.ok(!botao(v,'Remover'));assert.ok(!botao(v,'Editar'))
});

test('edição e remoção confirmadas atualizam a lista sem habilitar imagens',async()=>{
  let itens=[{...item}],edicoes=0,exclusoes=0;
  const r=runtime({consultarPortfolio:async()=>pagina(itens),
    salvarItemPortfolio:async({item:anterior,dados})=>{edicoes++;assert.equal(anterior.versao,1);itens=[{...anterior,...dados,versao:2}];return itens[0]},
    removerItemPortfolio:async({item:atual})=>{exclusoes++;assert.equal(atual.versao,2);itens=[];return{mensagem:'Item removido.'}}});
  r.render();await tick();botao(r.render(),'Editar').props.onClick();
  nodes(r.render()).find(n=>n.type==='input').props.onChange({target:{value:'Título editado'}});
  nodes(r.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();
  r.render();await tick();assert.match(text(r.render()),/Título editado/);assert.equal(edicoes,1);
  botao(r.render(),'Remover').props.onClick();await tick();r.render();await tick();
  const v=r.render();assert.equal(exclusoes,1);assert.match(text(v),/Nenhum trabalho/);
  assert.ok(nodes(v).find(n=>n.props.type==='file').props.disabled);r.unmount();
});
test('serviço envia só campos permitidos e confirma dono/versão, sem retries',async()=>{
  const calls=[];const salvar=load('services/portfolio.js','salvarItemPortfolio',{fetch:async(...p)=>{calls.push(p);return{ok:true,json:async()=>item}}})
  await salvar({token:'token-a',donoId:7,dados:{titulo:item.titulo,descricao:item.descricao,categoria:item.categoria,fornecedor_id:8,imagem:'proibida'}})
  const body=JSON.parse(calls[0][1].body);assert.deepEqual(Object.keys(body),['titulo','descricao','categoria']);assert.equal(calls[0][1].headers.Authorization,'Bearer token-a');assert.equal(calls.length,1)
  const divergente=load('services/portfolio.js','salvarItemPortfolio',{fetch:async()=>({ok:true,json:async()=>({...item,fornecedor_id:8})})})
  await assert.rejects(divergente({token:'token-a',donoId:7,dados:item}),e=>e.incerto===true)
});
test('diretório só monta consulta por ação explícita; imagens não ganham ativação',()=>{
  let aberto=false;const consulta=load('components/portfolio/Portfolio.jsx','ConsultaPortfolios',{useState:()=>[aberto,v=>{aberto=v(aberto)}]})
  const a=consulta({});assert.equal(a.props.className,'portfolioConsulta');assert.equal(nodes(a).filter(n=>typeof n.type==='function').length,0)
  botao(a,'Consultar').props.onClick();assert.equal(aberto,true)
  const s=readFileSync(new URL('../src/pages/fornecedor/PortalFornecedor.jsx',import.meta.url),'utf8');assert.ok(s.includes('<PortfolioFornecedor />'));assert.ok(!s.includes("['catalogo','Portfólio profissional',true]"))
});
