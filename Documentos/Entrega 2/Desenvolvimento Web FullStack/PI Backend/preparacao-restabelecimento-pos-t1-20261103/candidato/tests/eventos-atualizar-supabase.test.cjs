"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {criarRepositorioEventos:criar}=require('../repositories/supabase/eventos.cjs');
const {criarRepositorioEventos:criarMysql}=require('../repositories/mysql/eventos.cjs');
const input=Object.freeze({nome:' Evento ',data:'2030-01-01',horario:'10:00',local:' Local ',categoria:' Corporativo ',publico:20,descricao:''});
function mock(result){
  const calls=[],client={};
  for(const method of ['schema','from','update','eq','select'])client[method]=(...args)=>{calls.push([method,...args]);return client;};
  client.retry=value=>{calls.push(['retry',value]);return typeof result==='function'?result():Promise.resolve(result);};
  return {calls,client};
}
test('atualizar: mesmos sete campos e filtros MySQL; retorno numerico 0/1 inclusive dados iguais',async()=>{
  for(const matched of [0,1]){
    const m=mock({data:matched?[{id:13}]:[],error:null});
    const mysql=criarMysql({async execute(sql,args){assert.match(sql,/WHERE id = \? AND usuario_id = \?/);assert.deepEqual(args,[input.nome,input.data,input.horario,input.local,input.categoria,input.publico,input.descricao,13,7]);return [{affectedRows:matched}];}});
    assert.equal(await criar(m.client).atualizar(13,7,input),await mysql.atualizar(13,7,input));
    assert.deepEqual(m.calls,[['schema','public'],['from','eventos'],['update',input],['eq','id',13],['eq','usuario_id',7],['select','id'],['retry',false]]);
  }
});
test('atualizar: status e dono enviados como extras nao entram no UPDATE',async()=>{
  const m=mock({data:[{id:13,extra:'ignorar'}]});assert.equal(await criar(m.client).atualizar(13,7,{...input,status:'Ativo',usuario_id:999,usuarioId:999}),1);assert.deepEqual(m.calls.find(c=>c[0]==='update')[1],input);assert.deepEqual(m.calls.filter(c=>c[0]==='eq'),[['eq','id',13],['eq','usuario_id',7]]);
});
test('atualizar: falhas SQL e rede propagadas, nunca confundidas com ausencia ou repetidas',async()=>{
  for(const code of ['23502','23503','23505','22007','22008','22003','42501','57014','503']){const error={code,message:'simulado'},m=mock({data:[{id:13}],error});await assert.rejects(criar(m.client).atualizar(13,7,input),e=>e===error);assert.equal(m.calls.filter(c=>c[0]==='update').length,1);}
  const error=new Error('network');await assert.rejects(criar(mock(()=>Promise.reject(error)).client).atualizar(13,7,input),e=>e===error);
});
test('atualizar: resposta malformada ou de outro evento e incerta, sem retorno 0 falso',async()=>{
  for(const data of [null,undefined,{},Array(1),[null],[[]],[{}],[{id:'13'}],[{id:14}],[{id:0}],[Object.create({id:13})],[{id:13},{id:13}]]){
    const m=mock({data});await assert.rejects(criar(m.client).atualizar(13,7,input),e=>e.code==='SUPABASE_EVENTO_UPDATE_RESPONSE'&&e.resultadoIncerto===true);assert.equal(m.calls.filter(c=>c[0]==='update').length,1);
  }
});
function harness(repo){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const start=source.indexOf('function permitirPerfis('),guard=source.slice(start,source.indexOf('const eventos = []',start));
  const route=source.slice(source.indexOf('app.put("/eventos/:id",'),source.indexOf('app.delete("/eventos/:id",'));let action,authorize;
  vm.runInNewContext(guard+'\n'+route,{app:{put(name,...args){assert.equal(name,'/eventos/:id');authorize=args[1];action=args.at(-1);}},autenticar(){},eventosRepository:repo,console:{error(){}}});
  return async(req)=>{const res={status(n){this.code=n;return this;},json(body){this.body=JSON.parse(JSON.stringify(body));return this;}};let allowed=false;authorize(req,res,()=>{allowed=true;});if(allowed)await action(req,res);return res;};
}
const request=()=>({params:{id:'13'},usuario:{id:7,perfil:'organizador'},body:{nome:' Evento ',data:'2030-01-01',horario:'10:00',local:' Local ',publico:20,status:'Ativo',usuario_id:999}});
test('handler real: defaults e usuario autenticado preservados, sucesso 200 e ausencia/alheio 404',async()=>{
  for(const matched of [0,1]){const m=mock({data:matched?[{id:13}]:[]}),res=await harness(criar(m.client))(request());
    assert.equal(res.code,matched?200:404);assert.deepEqual(res.body,matched?{mensagem:'Evento atualizado com sucesso!'}:{erro:'Evento não encontrado.'});
    assert.deepEqual(m.calls.find(c=>c[0]==='update')[1],{nome:'Evento',data:'2030-01-01',horario:'10:00',local:'Local',categoria:'Corporativo',publico:20,descricao:''});assert.deepEqual(m.calls.filter(c=>c[0]==='eq'),[['eq','id',13],['eq','usuario_id',7]]);
  }
});
test('middleware real: somente organizador; sem usuario 401 e demais perfis 403, sem UPDATE',async()=>{
  for(const profile of [undefined,'participante','fornecedor','admin']){const m=mock({data:[{id:13}]}),req=request();req.usuario=profile?{id:7,perfil:profile}:undefined;const res=await harness(criar(m.client))(req);assert.equal(res.code,profile?403:401);assert.equal(m.calls.length,0);}
});
test('handler real: ID e campos invalidos retornam 400 antes do transporte',async()=>{
  for(const id of ['0','abc','9007199254740992']){const m=mock({data:[]}),req=request();req.params.id=id;assert.equal((await harness(criar(m.client))(req)).code,400);assert.equal(m.calls.length,0);}
  for(const changes of [{nome:''},{local:null},{data:'abc'},{horario:'24:00'},{publico:0},{publico:'20'},{categoria:null},{descricao:3}]){const m=mock({data:[]}),req=request();Object.assign(req.body,changes);assert.equal((await harness(criar(m.client))(req)).code,400);assert.equal(m.calls.length,0);}
});
test('handler real: erro do banco conserva HTTP 500 e mensagem existente',async()=>{
  const res=await harness(criar(mock({error:{code:'23502'}}).client))(request());assert.equal(res.code,500);assert.deepEqual(res.body,{erro:'Erro interno ao atualizar evento.'});
});
test('SDK real com fetch falso: PATCH HTTPS com ambos filtros; ausencia e 503 sem retry',async()=>{
  const {createClient}=require('@supabase/supabase-js');
  for(const [status,data,expected] of [[200,[{id:13}],1],[200,[],0],[503,{code:'503',message:'simulado'},null]]){let calls=0;
    const client=createClient('https://eventos.invalid','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.protocol,'https:');assert.equal(u.pathname,'/rest/v1/eventos');assert.equal(u.searchParams.get('id'),'eq.13');assert.equal(u.searchParams.get('usuario_id'),'eq.7');assert.equal(u.searchParams.get('select'),'id');assert.equal(options.method,'PATCH');assert.deepEqual(JSON.parse(options.body),input);return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});}}});
    if(status===503)await assert.rejects(criar(client).atualizar(13,7,input),e=>e.code==='503');else assert.equal(await criar(client).atualizar(13,7,input),expected);assert.equal(calls,1);
  }
});
