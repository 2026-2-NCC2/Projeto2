'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),jwt=require('jsonwebtoken');
const {instalarContratacoes}=require('../contratacoes-http.cjs');
const {criarRepositorioUsuarios}=require('../repositories/supabase/usuarios.cjs');
// Executa exatamente o middleware de produção, sem carregar app/.env/drivers.
const fonte=readFileSync(join(__dirname,'../server.js'),'utf8');
const inicio=fonte.indexOf('async function autenticar('),fim=fonte.indexOf("require('./portfolio.cjs').instalarPortfolio",inicio);
assert.ok(inicio>0&&fim>inicio);
function ambiente(perfil) {
  const segredo='somente-fixture-f82-nenhuma-credencial-real';
  let usuario={id:7,nome:'Pessoa sintética',email:'pessoa@example.invalid',perfil},estado=null;
  const cliente={schema(s){assert.equal(s,'public');return {from(tabela){
    assert.ok(['usuarios','contas_teste_imagens'].includes(tabela));
    const q={select(){return q;},eq(campo,id){assert.equal(id,7);assert.equal(campo,tabela==='usuarios'?'id':'usuario_id');return q;},
      async maybeSingle(){return {data:tabela==='usuarios'?usuario:estado?{estado}:null,error:null};}};return q;
  }}}};
  const autenticar=vm.runInNewContext('('+fonte.slice(inicio,fim).trim()+')',{
    jwt,process:{env:{JWT_SECRET:segredo}},usuariosRepository:criarRepositorioUsuarios(cliente,{contasTeste:true}),console:{error(){}},
  });
  const token=jwt.sign({id:7,perfil},segredo),rotas=new Map(),calls=[];
  instalarContratacoes(Object.fromEntries(['get','post','patch'].map(m=>[m,(p,...h)=>rotas.set(m+' '+p,h)])),{
    autenticar,ativo:true,repositorios:{contratacoes:Object.fromEntries(['capacidades','listar','formalizar','alterar'].map(m=>[m,async(...args)=>{
      calls.push([m,...args]);return m==='capacidades'?{disponivel:true}:m==='listar'?[]:{id:12};
    }]))},
  });
  return {calls,perfil(p){usuario={...usuario,perfil:p};},encerrar(e){estado=e;},remover(){usuario=null;},async pedir(rota){
    const req={headers:{authorization:'Bearer '+token},body:rota.startsWith('post')?{proposta_id:9}:{estado:'concluido',motivo:'Entregue',versao:1},query:{},params:{id:'12'}};
    const res={codigo:200,setHeader(){},status(c){this.codigo=c;return this;},json(b){this.body=b;return this;}};
    for(const h of rotas.get(rota)){let seguir=false;await h(req,res,()=>{seguir=true;});if(!seguir)break;}
    return res;
  }};
}
test('JWT antigo não conserva permissões de organizador; admin mantém apenas consulta',async()=>{
  const a=ambiente('organizador');assert.equal((await a.pedir('post /contratacoes')).codigo,201);
  for(const perfil of ['participante','fornecedor','admin']){
    a.perfil(perfil);const antes=a.calls.length;
    assert.equal((await a.pedir('post /contratacoes')).codigo,403);
    assert.equal((await a.pedir('patch /contratacoes/:id')).codigo,403);assert.equal(a.calls.length,antes);
    assert.equal((await a.pedir('get /contratacoes')).codigo,perfil==='participante'?403:200);
    if(perfil!=='participante')assert.equal(a.calls.at(-1)[1].perfil,perfil);
  }
});
test('JWT antigo de fornecedor não conserva consulta após perda do perfil',async()=>{
  const a=ambiente('fornecedor');assert.equal((await a.pedir('get /contratacoes')).codigo,200);
  a.perfil('participante');assert.equal((await a.pedir('get /contratacoes')).codigo,403);assert.equal(a.calls.length,1);
});
for(const estado of ['encerrando','excluida'])test(`marca ${estado} impede novas operações com JWT ainda válido`,async()=>{
  const a=ambiente('organizador');a.encerrar(estado);
  for(const r of ['get /contratacoes','get /contratacoes/capacidades','post /contratacoes','patch /contratacoes/:id'])assert.equal((await a.pedir(r)).codigo,401);
  assert.equal(a.calls.length,0);
});
test('identidade removida não é recriada ou substituída pelo conteúdo do JWT',async()=>{
  const a=ambiente('fornecedor');a.remover();assert.equal((await a.pedir('get /contratacoes')).codigo,401);assert.equal(a.calls.length,0);
});
