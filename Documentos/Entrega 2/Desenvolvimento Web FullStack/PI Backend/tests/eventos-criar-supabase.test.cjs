"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {criarRepositorioEventos:criar}=require('../repositories/supabase/eventos.cjs');
const {criarRepositorioEventos:criarMysql}=require('../repositories/mysql/eventos.cjs');
const input=Object.freeze({nome:' Evento ficticio ',data:'2030-01-01',horario:'10:00',local:' Local ',categoria:'Corporativo',publico:20,descricao:'',status:'Em planejamento',usuarioId:7});
const payload=()=>({nome:input.nome,data:input.data,horario:input.horario,local:input.local,categoria:input.categoria,publico:input.publico,descricao:input.descricao,status:input.status,usuario_id:input.usuarioId});
function mock(response) {
  const calls=[],client={};
  for(const method of ['schema','from','insert','select','single']) {
    client[method]=(...args)=>{calls.push([method,...args]);return client;};
  }
  client.retry=value=>{
    calls.push(['retry',value]);
    return typeof response==='function'?response():Promise.resolve(response);
  };
  return {calls,client};
}
test('criar: nove campos, dono e ID iguais ao contrato MySQL sem normalizacao extra',async()=>{
  const m=mock({data:{id:13},error:null});const mysql=criarMysql({async execute(sql,args){assert.match(sql,/INSERT INTO eventos/);assert.deepEqual(args,[input.nome,input.data,input.horario,input.local,input.categoria,input.publico,input.descricao,input.status,input.usuarioId]);return [{insertId:13}];}});
  assert.equal(await criar(m.client).criar(input),await mysql.criar(input));
  assert.deepEqual(m.calls,[['schema','public'],['from','eventos'],['insert',payload()],['select','id'],['single'],['retry',false]]);
});
test('criar: usuarioId confiavel prevalece; campos extras nao sao enviados nem retornados',async()=>{
  const m=mock({data:{id:14,usuario_id:999,nome:'extra'}});assert.equal(await criar(m.client).criar({...input,usuario_id:999,extra:'ignorar'}),14);assert.deepEqual(m.calls.find(c=>c[0]==='insert')[1],payload());
});
test('criar: FK, obrigatorios e demais erros sao propagados sem retry nem mapeamento HTTP novo',async()=>{
  for(const code of ['23503','23502','23505','22007','22008','22P02','22003','42501','57014','503']){const error={code,message:'simulado'},m=mock({data:{id:9},error});await assert.rejects(criar(m.client).criar(input),e=>e===error);assert.equal(m.calls.filter(c=>c[0]==='insert').length,1);}
  const error=new Error('rede simulada');await assert.rejects(criar(mock(()=>Promise.reject(error)).client).criar(input),e=>e===error);
});
test('criar: IDs malformados geram resultado incerto sem afirmar rollback ou repetir',async()=>{
  for(const data of [null,undefined,[],{}, {id:0},{id:-1},{id:1.5},{id:'7'},{id:Number.MAX_SAFE_INTEGER+1},Object.create({id:7})]){const m=mock({data});await assert.rejects(criar(m.client).criar(input),e=>e.code==='SUPABASE_EVENTO_CREATE_RESPONSE'&&e.resultadoIncerto===true);assert.equal(m.calls.filter(c=>c[0]==='insert').length,1);}
});
function handler(repo){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const slice=source.slice(source.indexOf('app.post("/eventos",'),source.indexOf('app.patch("/eventos/:id/publicar",'));let action;
  vm.runInNewContext(slice,{app:{post(route,...args){assert.equal(route,'/eventos');action=args.at(-1);}},autenticar(){},permitirPerfis:()=>()=>{},eventosRepository:repo,console:{error(){}}});return action;
}
const body=()=>({nome:' Evento ficticio ',data:'2030-01-01',horario:'10:00',local:' Local ',publico:20,usuario_id:999,status:'Ativo'});
const response=()=>({status(n){this.code=n;return this;},json(data){this.body=JSON.parse(JSON.stringify(data));return this;}});
test('handler real conserva defaults, trim, status, dono autenticado e resposta 201',async()=>{
  const m=mock({data:{id:13}}),res=response();await handler(criar(m.client))({body:body(),usuario:{id:7}},res);
  assert.equal(res.code,201);assert.deepEqual(res.body,{mensagem:'Evento cadastrado com sucesso!',evento:{id:13,nome:'Evento ficticio',data:input.data,horario:input.horario,local:'Local',categoria:'Corporativo',publico:20,descricao:'',status:'Em planejamento',usuario_id:7}});
  assert.equal(m.calls.find(c=>c[0]==='insert')[1].usuario_id,7);
});
test('handler real rejeita campos invalidos antes do INSERT e mantem HTTP 400',async()=>{
  for(const changes of [{nome:''},{nome:null},{data:'abc'},{horario:'24:00'},{local:' '},{publico:0},{publico:'20'},{publico:1.5},{categoria:null},{descricao:7}]){const m=mock({data:{id:13}}),res=response();await handler(criar(m.client))({body:{...body(),...changes},usuario:{id:7}},res);assert.equal(res.code,400);assert.deepEqual(res.body,{erro:'Informe nome, data, horário, local e público válidos.'});assert.equal(m.calls.length,0);}
});
test('handler real preserva mensagem 500 para FK/NOT NULL/data recusada pelo banco',async()=>{
  for(const code of ['23503','23502','22008']){const m=mock({error:{code}}),res=response();await handler(criar(m.client))({body:body(),usuario:{id:7}},res);assert.equal(res.code,500);assert.deepEqual(res.body,{erro:'Erro interno ao cadastrar evento.'});}
});
test('SDK real com fetch falso envia POST HTTPS unico e seleciona somente ID',async()=>{
  const {createClient}=require('@supabase/supabase-js');
  for(const status of [201,503]){let calls=0;const client=createClient('https://eventos.invalid','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.protocol,'https:');assert.equal(u.pathname,'/rest/v1/eventos');assert.equal(u.searchParams.get('select'),'id');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),payload());return new Response(JSON.stringify(status===201?{id:42}:{code:'503',message:'simulado'}),{status,headers:{'content-type':'application/json'}});}}});if(status===201)assert.equal(await criar(client).criar(input),42);else await assert.rejects(criar(client).criar(input),e=>e.code==='503');assert.equal(calls,1);}
});
