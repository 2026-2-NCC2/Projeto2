"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),jwt=require('jsonwebtoken');
const {instalarPortfolio,validarItem}=require('../portfolio.cjs');
const {criarRepositorioPortfolio}=require('../repositories/supabase/portfolio.cjs');
const segredo='segredo-ficticio-portfolio-testes-nao-producao';
const id='00000000-0000-4000-8000-000000000001';
const dados={titulo:'Serviço de teste',descricao:'Descrição sintética do trabalho.',categoria:'Categoria de teste'};
const item={id,fornecedor_id:7,...dados,versao:1,criado_em:'2030-01-01T00:00:00Z',atualizado_em:'2030-01-01T00:00:00Z'};
async function appFixture(t,ativo=true){
  const app=express();app.use(express.json());const itens=new Map([[id,{...item}]]),calls=[];
  const repo={listarPorFornecedor:async dono=>({itens:[...itens.values()].filter(i=>i.fornecedor_id===dono),total:[...itens.values()].filter(i=>i.fornecedor_id===dono).length,pagina:1,totalPaginas:1}),
    listar:async()=>({itens:[{id:7,nome:'Fornecedor de teste'}],total:1,pagina:1,totalPaginas:1}),buscarPerfil:async dono=>dono===7?{id:7,nome:'Fornecedor de teste'}:null,
    criar:async(dono,v)=>{calls.push(['criar',dono]);return{...item,...v,id:'00000000-0000-4000-8000-000000000002',fornecedor_id:dono};},
    atualizar:async(dono,i,v)=>{calls.push(['atualizar',dono]);const anterior=itens.get(i);if(anterior?.fornecedor_id!==dono||anterior.versao!==v.versao)return null;const novo={...anterior,...v,versao:v.versao+1};itens.set(i,novo);return novo;},
    excluir:async(dono,i,v)=>{calls.push(['excluir',dono]);const anterior=itens.get(i);if(anterior?.fornecedor_id!==dono||anterior.versao!==v)return null;itens.delete(i);return anterior;}};
  const autenticar=(req,res,next)=>{try{req.usuario=jwt.verify((req.headers.authorization||'').replace(/^Bearer /,''),segredo,{algorithms:['HS256']});next();}catch{res.status(401).json({erro:'Não autenticado.'});}};
  const permitirPerfis=(...roles)=>(req,res,next)=>roles.includes(req.usuario.perfil)?next():res.status(403).json({erro:'Sem permissão.'});
  instalarPortfolio(app,{autenticar,permitirPerfis,repo:ativo?repo:undefined});
  const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>{s.closeAllConnections();s.close(r);}));
  const request=(metodo,rota,body,usuario={id:7,perfil:'fornecedor'})=>fetch(`http://127.0.0.1:${s.address().port}`+rota,{method:metodo,
    headers:{...(usuario?{Authorization:'Bearer '+jwt.sign(usuario,segredo,{expiresIn:'1h'})}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return{request,calls,itens,repo};
}
test('campos são obrigatórios; identidade, imagens e campos extras são recusados',()=>{
  assert.deepEqual(validarItem({...dados,titulo:'  Título  '}),{...dados,titulo:'Título'});
  for(const body of [{...dados,titulo:''},{...dados,categoria:'x'.repeat(81)},{...dados,descricao:'x'.repeat(2001)},{...dados,fornecedor_id:8},{...dados,imagem:'https://ficticio.invalid/a'},{...dados,versao:0}])assert.throws(()=>validarItem(body));
});
test('JWT obrigatório e recurso não ativado não consulta/grava banco',async t=>{
  const a=await appFixture(t,false);assert.equal((await a.request('GET','/portfolio',undefined,null)).status,401);
  for(const [method,url,body]of [['GET','/portfolio'],['POST','/portfolio',dados],['PATCH','/portfolio/'+id,{...dados,versao:1}],['DELETE','/portfolio/'+id,{versao:1}],['GET','/fornecedores'],['GET','/fornecedores/7/portfolio']])assert.equal((await a.request(method,url,body)).status,503);
  assert.equal(a.calls.length,0);
});
test('fornecedor cadastra, edita e remove o próprio item; sucesso vem após confirmação',async t=>{
  const a=await appFixture(t);const r=await a.request('POST','/portfolio',dados);assert.equal(r.status,201);assert.equal((await r.json()).fornecedor_id,7);
  assert.equal((await a.request('PATCH','/portfolio/'+id,{...dados,titulo:'Atualizado',versao:1})).status,200);
  assert.equal((await a.request('DELETE','/portfolio/'+id,{versao:2})).status,200);assert.equal(a.itens.size,0);
});
test('outro fornecedor e demais perfis não modificam registros alheios',async t=>{
  const a=await appFixture(t);
  for(const perfil of ['admin','organizador','participante']) {
    assert.equal((await a.request('POST','/portfolio',dados,{id:9,perfil})).status,403);
  }
  assert.equal(a.calls.length,0);
  for(const method of ['PATCH','DELETE']) {
    assert.equal((await a.request(method,'/portfolio/'+id,method==='PATCH'?{...dados,versao:1}:{versao:1},{id:8,perfil:'fornecedor'})).status,409);
    for(const perfil of ['admin','organizador','participante'])assert.equal((await a.request(method,'/portfolio/'+id,{...dados,versao:1},{id:9,perfil})).status,403);
  }
  assert.equal(a.itens.get(id).titulo,dados.titulo);
  assert.equal((await a.request('POST','/portfolio',{...dados,fornecedor_id:8})).status,400);
});
test('duas edições com a mesma versão não sobrescrevem silenciosamente',async t=>{
  const a=await appFixture(t);const r=await Promise.all([a.request('PATCH','/portfolio/'+id,{...dados,titulo:'A',versao:1}),a.request('PATCH','/portfolio/'+id,{...dados,titulo:'B',versao:1})]);
  assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.equal(a.itens.get(id).versao,2);
});
test('consulta autenticada funciona nos quatro perfis sem expor dados privados',async t=>{
  const a=await appFixture(t);
  for(const perfil of ['participante','organizador','fornecedor','admin']) {
    const r=await a.request('GET','/fornecedores/7/portfolio',undefined,{id:9,perfil});assert.equal(r.status,200);
    const body=await r.json();assert.deepEqual(Object.keys(body.fornecedor),['id','nome']);assert.ok(!JSON.stringify(body).includes('senha'));
  }
  assert.equal((await a.request('GET','/fornecedores/999/portfolio')).status,404);
});
function clienteFixture(resultado){
  const calls=[];const chain={};
  for(const method of ['schema','from','select','eq','order','range','insert','update','delete','single','maybeSingle','retry'])chain[method]=(...args)=>{calls.push([method,...args]);return chain;};
  chain.then=(ok,no)=>Promise.resolve(typeof resultado==='function'?resultado(calls):resultado).then(ok,no);
  return{cliente:chain,calls};
}
test('adaptador Supabase filtra dono e versão em PATCH/DELETE e desativa retry',async()=>{
  for(const acao of ['atualizar','excluir']) {
    const f=clienteFixture({data:null,error:null}),repo=criarRepositorioPortfolio(f.cliente);
    await (acao==='atualizar'?repo.atualizar(7,id,{...dados,versao:1}):repo.excluir(7,id,1));
    assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]==='fornecedor_id'&&c[2]===7));assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]==='versao'&&c[2]===1));
    assert.deepEqual(f.calls.at(-1),['retry',false]);
  }
});
test('adaptador cria UUID do servidor, confirma conteúdo e trata migração ausente',async()=>{
  const f=clienteFixture(calls=>{const v=calls.find(c=>c[0]==='insert')[1];return{data:{...item,...v},error:null};});
  const r=await criarRepositorioPortfolio(f.cliente).criar(7,dados);assert.match(r.id,/^[a-f0-9-]{36}$/);assert.equal(r.fornecedor_id,7);
  const faltando=clienteFixture({data:null,error:{code:'42P01',message:'SEGREDO_FICTICIO'}});
  await assert.rejects(criarRepositorioPortfolio(faltando.cliente).listarPorFornecedor(7),{code:'42P01',resultadoIncerto:false});
});
test('resposta divergente não confirma sucesso',async()=>{
  const f=clienteFixture({data:{...item,fornecedor_id:8},error:null});await assert.rejects(criarRepositorioPortfolio(f.cliente).atualizar(7,id,{...dados,versao:1}),{status:503});
});
