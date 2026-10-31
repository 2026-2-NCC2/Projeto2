"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {criarRepositorioUsuarios:criar}=require('../repositories/supabase/usuarios.cjs');
const {criarRepositorioUsuarios:criarMysql}=require('../repositories/mysql/usuarios.cjs');
const input=Object.freeze({nome:' Pessoa ficticia ',email:'PESSOA@example.invalid',senhaHash:'hash-exclusivamente-sintetico',perfil:'participante'});
function mock(result){const calls=[];return {calls,client:{schema(s){calls.push(['schema',s]);return {from(t){calls.push(['from',t]);return {insert(p){calls.push(['insert',p]);return {select(s){calls.push(['select',s]);return {single(){calls.push(['single']);return {retry(v){calls.push(['retry',v]);return typeof result==='function'?result():Promise.resolve(result);}};}};}};}};}};}}};}
test('criar: campos e ID correspondem ao contrato MySQL sem normalizar ou reprocessar hash',async()=>{
  const m=mock({data:{id:42},error:null});
  const mysql=criarMysql({async execute(sql,params){assert.match(sql,/INSERT INTO usuarios/);assert.deepEqual(params,[input.nome,input.email,input.senhaHash,input.perfil]);return [{insertId:42}];}});
  assert.equal(await criar(m.client).criar(input),await mysql.criar(input));
  assert.deepEqual(m.calls,[['schema','public'],['from','usuarios'],['insert',{nome:input.nome,email:input.email,senha:input.senhaHash,perfil:input.perfil}],['select','id'],['single'],['retry',false]]);
});
test('criar: retorna somente ID e nao inclui campos extras do argumento ou resposta',async()=>{
  const m=mock({data:{id:9,senha:'nao-devolver',email:'nao-devolver'}});
  assert.equal(await criar(m.client).criar({...input,senha:'nao-utilizar',usuario_id:999}),9);
  assert.deepEqual(Object.keys(m.calls.find(c=>c[0]==='insert')[1]),['nome','email','senha','perfil']);
});
test('criar: 23505 vira ER_DUP_ENTRY para o 409 existente, inclusive corrida e dados parciais',async()=>{
  const duplicate={code:'23505',message:'conteudo-privado',details:'conteudo-privado',hint:'conteudo-privado'};
  for(const response of [{data:null,error:duplicate},{data:{id:7},error:duplicate},()=>Promise.reject(duplicate)]){
    const m=mock(response);await assert.rejects(criar(m.client).criar(input),e=>{assert.equal(e.code,'ER_DUP_ENTRY');assert.ok(!e.message.includes('conteudo-privado'));assert.equal(e.details,undefined);assert.equal(e.cause,undefined);return true;});assert.equal(m.calls.filter(c=>c[0]==='insert').length,1);
  }
});
test('criar: erros distintos de unicidade mantem o caminho 500, sem fallback ou retry',async()=>{
  for(const code of ['23502','23503','22P02','42501','57014','503',['23505']]){const error={code,message:'simulado'},m=mock({error});await assert.rejects(criar(m.client).criar(input),e=>e===error);assert.equal(m.calls.filter(c=>c[0]==='insert').length,1);}
  const error=new Error('rede simulada'),m=mock(()=>Promise.reject(error));await assert.rejects(criar(m.client).criar(input),e=>e===error);
});
test('criar: resposta invalida nao vira sucesso, nem confirma rollback ou reenvia INSERT',async()=>{
  for(const data of [null,undefined,[],{}, {id:0},{id:-1},{id:1.5},{id:'7'},{id:Number.MAX_SAFE_INTEGER+1},Object.create({id:7})]){const m=mock({data,error:null});await assert.rejects(criar(m.client).criar(input),e=>e.code==='SUPABASE_USUARIO_CREATE_RESPONSE'&&e.resultadoIncerto===true);assert.equal(m.calls.filter(c=>c[0]==='insert').length,1);}
});
test('criar: SDK real com fetch falso envia POST HTTPS e solicita apenas id',async()=>{
  const {createClient}=require('@supabase/supabase-js');let calls=0;
  const client=createClient('https://cadastro.invalid','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.protocol,'https:');assert.equal(u.pathname,'/rest/v1/usuarios');assert.equal(u.searchParams.get('select'),'id');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{nome:input.nome,email:input.email,senha:input.senhaHash,perfil:input.perfil});return new Response(JSON.stringify({id:81}),{status:201,headers:{'content-type':'application/json'}});}}});
  assert.equal(await criar(client).criar(input),81);assert.equal(calls,1);
});
test('criar: SDK real preserva duplicidade e nao repete indisponibilidade',async()=>{
  const {createClient}=require('@supabase/supabase-js');
  for(const [status,code] of [[409,'23505'],[503,'503']]){let calls=0;const client=createClient('https://cadastro.invalid','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async()=>{calls++;return new Response(JSON.stringify({code,message:'erro-sintetico'}),{status,headers:{'content-type':'application/json'}});}}});await assert.rejects(criar(client).criar(input),e=>e.code===(code==='23505'?'ER_DUP_ENTRY':code));assert.equal(calls,1);}
});
test('handler atual com criar Supabase preserva 201, 409 e 500 sem expor hash',async()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const handlerSource=source.slice(source.indexOf('app.post("/usuarios",'),source.indexOf('// Login'));
  for(const [response,status] of [[{data:{id:8}},201],[{error:{code:'23505'}},409],[{error:{code:'42501'}},500]]){
    const m=mock(response);let handler;
    vm.runInNewContext(handlerSource,{app:{post(route,...args){assert.equal(route,'/usuarios');handler=args.at(-1);}},limitarFrequencia:()=>()=>{},usuariosRepository:{async buscarIdPorEmail(email){assert.equal(email,'pessoa@example.invalid');return undefined;},criar:criar(m.client).criar},bcrypt:{async hash(password,cost){assert.equal(password,'12345678');assert.equal(cost,12);return input.senhaHash;}},Buffer,console:{error(){}}});
    const res={status(n){this.code=n;return this;},json(body){this.body=JSON.parse(JSON.stringify(body));return this;}};
    await handler({body:{nome:' Pessoa ficticia ',email:' PESSOA@example.invalid ',senha:'12345678',perfil:'participante'}},res);
    assert.equal(res.code,status);
    if(status===201)assert.deepEqual(res.body,{mensagem:'Usuário cadastrado com sucesso!',usuario:{id:8,nome:'Pessoa ficticia',email:'pessoa@example.invalid',perfil:'participante'}});
    else assert.deepEqual(res.body,{erro:status===409?'Email já cadastrado!':'Erro interno no cadastro.'});
    assert.ok(!JSON.stringify(res.body).includes(input.senhaHash));
  }
});
