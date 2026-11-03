"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {criarRepositorioEventos:criar}=require('../repositories/supabase/eventos.cjs');
const {criarRepositorioEventos:criarMysql}=require('../repositories/mysql/eventos.cjs');
function mock(result){
  const calls=[],client={};
  for(const method of ['schema','from','delete','eq','select'])client[method]=(...args)=>{calls.push([method,...args]);return client;};
  client.retry=value=>{calls.push(['retry',value]);return typeof result==='function'?result():Promise.resolve(result);};return {calls,client};
}
test('excluir: DELETE unico em eventos por id e dono, retorno 0/1 igual ao MySQL',async()=>{
  for(const affectedRows of [0,1]){const m=mock({data:affectedRows?[{id:13}]:[]});
    const mysql=criarMysql({async execute(sql,args){assert.match(sql,/DELETE FROM eventos\s+WHERE id = \? AND usuario_id = \?/);assert.deepEqual(args,[13,7]);return [{affectedRows}];}});
    assert.equal(await criar(m.client).excluir(13,7),await mysql.excluir(13,7));
    assert.deepEqual(m.calls,[['schema','public'],['from','eventos'],['delete'],['eq','id',13],['eq','usuario_id',7],['select','id'],['retry',false]]);
  }
});
test('excluir: evento alheio permanece indistinguivel de ausente sem remover dependencias',async()=>{
  const m=mock({data:[]});assert.equal(await criar(m.client).excluir(13,99),0);assert.deepEqual(m.calls.filter(c=>c[0]==='eq'),[['eq','id',13],['eq','usuario_id',99]]);assert.deepEqual(m.calls.filter(c=>c[0]==='from'),[['from','eventos']]);
});
test('excluir: FK e outros erros propagam, sem falso 0/sucesso, retry ou remocao manual',async()=>{
  for(const code of ['23503','42501','40P01','57014','503']){const error={code,message:'simulado'},m=mock({data:[{id:13}],error});await assert.rejects(criar(m.client).excluir(13,7),e=>e===error);assert.equal(m.calls.filter(c=>c[0]==='delete').length,1);assert.equal(m.calls.filter(c=>c[0]==='from').length,1);}
  const error=new Error('network');await assert.rejects(criar(mock(()=>Promise.reject(error)).client).excluir(13,7),e=>e===error);
});
test('excluir: resposta invalida nao afirma rollback nem repete DELETE',async()=>{
  for(const data of [null,undefined,{},Array(1),[null],[[]],[{}],[{id:'13'}],[{id:0}],[{id:14}],[Object.create({id:13})],[{id:13},{id:13}]]){const m=mock({data});await assert.rejects(criar(m.client).excluir(13,7),e=>e.code==='SUPABASE_EVENTO_DELETE_RESPONSE'&&e.resultadoIncerto===true);assert.equal(m.calls.filter(c=>c[0]==='delete').length,1);}
});
function harness(repo){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const i=source.indexOf('function permitirPerfis('),guard=source.slice(i,source.indexOf('const eventos = []',i));
  const route=source.slice(source.indexOf('app.delete("/eventos/:id",'),source.indexOf('if (!process.env.JWT_SECRET'));let action,authorize;
  vm.runInNewContext(guard+'\n'+route,{app:{delete(name,...args){assert.equal(name,'/eventos/:id');authorize=args[1];action=args.at(-1);}},autenticar(){},eventosRepository:repo,console:{error(){}}});
  return async req=>{const res={status(n){this.code=n;return this;},json(body){this.body=JSON.parse(JSON.stringify(body));return this;}};let allowed=false;authorize(req,res,()=>{allowed=true;});if(allowed)await action(req,res);return res;};
}
const request=()=>({params:{id:'13'},usuario:{id:7,perfil:'organizador'},body:{usuario_id:999}});
test('handler real: sucesso 200, ausente/alheio 404 e FK 500 com mensagens existentes',async()=>{
  for(const [response,code,body] of [[{data:[{id:13}]},200,{mensagem:'Evento excluído com sucesso!'}],[{data:[]},404,{erro:'Evento não encontrado.'}],[{error:{code:'23503'}},500,{erro:'Erro interno ao excluir evento.'}]]){const m=mock(response),res=await harness(criar(m.client))(request());assert.equal(res.code,code);assert.deepEqual(res.body,body);assert.deepEqual(m.calls.filter(c=>c[0]==='eq'),[['eq','id',13],['eq','usuario_id',7]]);}
});
test('middleware real conserva perfis: 401/403 sem DELETE',async()=>{
  for(const perfil of [undefined,'participante','fornecedor','admin']){const m=mock({data:[]}),req=request();req.usuario=perfil?{id:7,perfil}:undefined;assert.equal((await harness(criar(m.client))(req)).code,perfil?403:401);assert.equal(m.calls.length,0);}
});
test('handler real rejeita ID invalido antes da exclusao',async()=>{
  for(const id of ['0','-1','abc','1.5','9007199254740992']){const m=mock({data:[]}),req=request();req.params.id=id;const res=await harness(criar(m.client))(req);assert.equal(res.code,400);assert.deepEqual(res.body,{erro:'ID do evento inválido.'});assert.equal(m.calls.length,0);}
});
test('dependencias: esquema existente delega cascatas e bloqueios ao banco, sem executa-los',()=>{
  const fs=require('node:fs'),path=require('node:path');const ddl=fs.readFileSync(path.join(__dirname,'../../Banco de dados/trocaticket_supabase.sql'),'utf8');
  // Assert booleano evita imprimir dump com registros em eventual falha.
  assert.ok(ddl.includes('"fk_custos_evento_evento" FOREIGN KEY ("evento_id") REFERENCES public."eventos" ("id") ON DELETE CASCADE'));
  assert.ok(ddl.includes('"fk_cotacao_evento" FOREIGN KEY ("evento_id") REFERENCES public."eventos" ("id") ON DELETE CASCADE'));
  assert.ok(ddl.includes('"fk_item_cotacao" FOREIGN KEY ("cotacao_id") REFERENCES public."cotacoes" ("id") ON DELETE CASCADE'));
  assert.ok(ddl.includes('"fk_inscricao_evento" FOREIGN KEY ("evento_id") REFERENCES public."eventos" ("id"),'));
  assert.ok(ddl.includes('"fk_propostas_cotacao" FOREIGN KEY ("cotacao_id") REFERENCES public."cotacoes" ("id"),'));
});
test('SDK real com fetch falso: DELETE HTTPS filtrado, retornos 0/1 e erro FK sem retry',async()=>{
  const {createClient}=require('@supabase/supabase-js');
  for(const [status,data,expected] of [[200,[{id:13}],1],[200,[],0],[409,{code:'23503',message:'simulado'},null],[503,{code:'503',message:'simulado'},null]]){let calls=0;
    const client=createClient('https://eventos.invalid','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{calls++;const u=new URL(url);assert.equal(u.protocol,'https:');assert.equal(u.pathname,'/rest/v1/eventos');assert.equal(u.searchParams.get('id'),'eq.13');assert.equal(u.searchParams.get('usuario_id'),'eq.7');assert.equal(u.searchParams.get('select'),'id');assert.equal(options.method,'DELETE');assert.equal(options.body,undefined);return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});}}});
    if(status>=400)await assert.rejects(criar(client).excluir(13,7),e=>e.code===data.code);else assert.equal(await criar(client).excluir(13,7),expected);assert.equal(calls,1);
  }
});
