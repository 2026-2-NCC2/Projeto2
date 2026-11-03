"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {criarSupervisor}=require('../config/supervisor-cutover.cjs');
function memoria(){let e={versao:1,congelado:false,selado:false,instancias:[]};return {ler:()=>structuredClone(e),gravar:x=>{e=structuredClone(x);}};}
function resposta(){const r=new EventEmitter();r.statusCode=200;r.setHeader=()=>{};r.status=n=>{r.statusCode=n;return r;};r.json=x=>{r.body=x;r.emit('finish');return r;};return r;}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('supervisor acompanha operacao apos fim HTTP e impede escritas novas antes do parser',async()=>{
  const s=criarSupervisor({estado:memoria()}),d=deferred(),r=resposta();let pending;
  s.middleware({method:'POST',path:'/eventos'},r,()=>{pending=s.executarPersistencia(()=>d.promise);});r.emit('finish');s.congelar();
  assert.equal(s.status().requisicoesPendentes,0);assert.equal(s.status().operacoesPersistenciaPendentes,1);
  let parsed=0;const blocked=resposta();s.middleware({method:'POST',path:'/eventos'},blocked,()=>parsed++);assert.equal(blocked.statusCode,503);assert.equal(parsed,0);
  const drain=s.aguardarDrenagem();d.resolve('ok');assert.equal(await pending,'ok');await drain;assert.equal(s.status().operacoesPersistenciaPendentes,0);
});
test('operacao admitida continua apos freeze; contexto encerrado nao inicia escrita tardia',async()=>{
  const s=criarSupervisor({estado:memoria()}),d=deferred(),r=resposta();let work,late;
  s.middleware({method:'PUT',path:'/eventos/1'},r,()=>{work=(async()=>{await d.promise;return s.executarPersistencia(async()=>17);})();late=()=>s.executarPersistencia(async()=>18);});
  s.congelar();d.resolve();assert.equal(await work,17);r.emit('finish');await s.aguardarDrenagem();
  // Fora de requisicao admitida e em rotas de leitura, o gate recusa mutacao.
  await assert.rejects(late(),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});
  let p;const read=resposta();s.middleware({method:'GET',path:'/eventos'},read,()=>{p=s.executarPersistencia(async()=>19);});await assert.rejects(p,{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});read.emit('finish');
});
test('reinicio e novo processo herdam fence persistente e nao aprovam drenagem',async()=>{
  const estado=memoria(),a=criarSupervisor({estado,instancia:'boot-a'});a.congelar();
  const b=criarSupervisor({estado,instancia:'boot-b'});assert.equal(b.status().congelado,true);assert.equal(b.status().resultadosIncertos,1);
  await assert.rejects(b.executarPersistencia(async()=>1),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});await assert.rejects(b.aguardarDrenagem(),{code:'FREEZE_RESULTADO_INCERTO'});
});
test('selagem bloqueia novas leituras e login; timeout nao remove fence',async()=>{
  const s=criarSupervisor({estado:memoria()}),d=deferred();const p=s.executarPersistencia(()=>d.promise);s.congelar();s.selar();
  for(const [method,path] of [['GET','/eventos'],['POST','/login']]){const r=resposta();s.middleware({method,path},r,()=>assert.fail());assert.equal(r.statusCode,503);}
  await assert.rejects(s.aguardarDrenagem(5),{code:'FREEZE_TIMEOUT'});assert.equal(s.status().selado,true);d.resolve();await p;await s.aguardarDrenagem();
});
test('instrumentacao cobre servicos/RPC e repositorios, preserva identidade e erros',async()=>{
  const s=criarSupervisor({estado:memoria()}),d=deferred();const repo={async criar(){return 1;},async listar(){return ['ok'];}},service={async publicar(){return d.promise;}};
  const p=s.instrumentar({repositorios:{provider:'mysql',usuarios:repo},servicos:{cotacoes:service}});assert.equal(p.repositorios.usuarios,repo);
  const work=p.servicos.cotacoes.publicar();assert.equal(s.status().operacoesPersistenciaPendentes,1);s.congelar();await assert.rejects(repo.criar(),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});assert.deepEqual(await repo.listar(),['ok']);d.resolve(4);assert.equal(await work,4);await s.aguardarDrenagem();
  const e=Object.assign(Error('ficticio'),{resultadoIncerto:true}),u=criarSupervisor({estado:memoria()});await assert.rejects(u.executarPersistencia(async()=>{throw e;}),x=>x===e);u.congelar();await assert.rejects(u.aguardarDrenagem(),{code:'FREEZE_RESULTADO_INCERTO'});
});
test('IPC privado congela conjunto esperado e falha sem liberar fence se filho cair',async()=>{
  const {anexarIPC}=require('../config/ipc-supervisor.cjs'),{criarControlador}=require('../config/controlador-supervisor.cjs');
  const estado=memoria(),s=criarSupervisor({estado,instancia:'child-1'}),parent=new EventEmitter(),child=new EventEmitter();parent.connected=child.connected=true;
  parent.send=(m,cb)=>{queueMicrotask(()=>child.emit('message',m));cb?.();};child.send=m=>queueMicrotask(()=>parent.emit('message',m));
  const detach=anexarIPC(s,child),c=criarControlador({replica:parent},estado);
  try{assert.equal((await c.status()).replica.congelado,false);await c.congelar();const drained=await c.selarEDrenar();assert.equal(drained.replica.selado,true);parent.connected=false;parent.emit('disconnect');await assert.rejects(c.status());assert.equal(estado.ler().congelado,true);}finally{c.fechar();detach();}
});
test('integracao Express real bloqueia mutacoes no servidor antes de JSON sem atingir driver',async t=>{
  const s=criarSupervisor({estado:memoria()}),{iniciar}=require('./helpers/http-autenticacao.cjs');const a=await iniciar(t,'mysql',{supervisor:s});
  assert.equal(a.app.locals.supervisorCutover,s);const calls=a.calls.length;s.congelar();
  for(const method of ['POST','PUT','PATCH','DELETE']){const r=await a.request(method,'/eventos','{JSON-INVALIDO',undefined,true);assert.equal(r.status,503);}
  assert.equal(a.calls.length,calls);assert.equal(s.status().operacoesPersistenciaPendentes,0);
});

test('falha ao persistir freeze conserva bloqueio local e reprova drenagem',async()=>{
  const estado=memoria();estado.gravar=()=>{throw Error('DISCO_FICTICIO');};const s=criarSupervisor({estado});assert.throws(()=>s.congelar());assert.equal(s.status().congelado,true);
  await assert.rejects(s.executarPersistencia(async()=>1),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});await assert.rejects(s.aguardarDrenagem(),{code:'FREEZE_RESULTADO_INCERTO'});
});

test('estado privado atomico recusa arquivo perdido ou corrompido, sem criar estado ativo',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tt-supervisor-')),{criarEstadoPrivado}=require('../config/estado-supervisor.cjs'),store=criarEstadoPrivado(dir),file=path.join(dir,'estado.json');
  try{assert.throws(()=>store.ler());store.gravar({versao:1,congelado:true,selado:true,instancias:['ficticia']});assert.equal(store.ler().congelado,true);assert.deepEqual(fs.readdirSync(dir),['estado.json']);fs.writeFileSync(file,'invalido');assert.throws(()=>store.ler());fs.unlinkSync(file);assert.throws(()=>store.ler());}finally{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);}
});

test('duas replicas: falha parcial deixa marker duravel protegendo filho sem resposta',async()=>{
  const {anexarIPC}=require('../config/ipc-supervisor.cjs'),{criarControlador}=require('../config/controlador-supervisor.cjs');const estado=memoria(),filhos={},off=[];
  for(const id of ['a','b']){const p=new EventEmitter(),c=new EventEmitter();p.connected=c.connected=true;p.send=(m,cb)=>{if(id==='b'&&m.acao==='congelar'){cb?.(Error('FALHA_FICTICIA'));return;}queueMicrotask(()=>c.emit('message',m));cb?.();};c.send=m=>queueMicrotask(()=>p.emit('message',m));off.push(anexarIPC(criarSupervisor({estado,instancia:id}),c));filhos[id]=p;}
  const ctl=criarControlador(filhos,estado);try{await assert.rejects(ctl.congelar());assert.deepEqual(estado.ler().instancias.sort(),['a','b']);const restart=criarSupervisor({estado,instancia:'b-reiniciado'});await assert.rejects(restart.executarPersistencia(async()=>1),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});}finally{ctl.fechar();for(const f of off)f();}
});

test('execucao do delta revalida supervisor antes/depois e impede replica reiniciada',async()=>{
  const {TABLES,FKS}=require('../scripts/delta-cutover.cjs'),{EXTRAS}=require('../scripts/verificar-delta-final.cjs'),{executarDeltaFinal}=require('../scripts/executar-delta-final.cjs');const rows=Object.fromEntries(TABLES.map(t=>[t,[]])),columns=Object.fromEntries(TABLES.map(t=>[t,t==='usuarios'?['id','email']:['id',...Object.keys(FKS[t]||{})]]));rows.usuarios=[{id:'1',email:'base@example.invalid'}];const pg=structuredClone(rows);
  for(const t of TABLES)for(const id of EXTRAS[t])pg[t].push(t==='usuarios'?{id,email:'extra@example.invalid'}:{id,...Object.fromEntries(Object.entries(FKS[t]).map(([k,p])=>[k,EXTRAS[p][0]]))});
  let calls=0,restart=false;const now=123456,base={instancia:'a',coletadoEm:now,congelado:true,selado:true,requisicoesPendentes:0,escritasPendentes:0,operacoesPersistenciaPendentes:0,resultadosIncertos:0};
  const options={inventario:{completoConfirmado:true,responsavel:'Ficticio',processos:[{id:'replica',instancia:'a'}],escritoresExternos:[]},supervisores:{async status(){calls++;return {replica:{...base,instancia:restart&&calls%2===0?'reiniciada':'a'}};}},evidenciasExternas:async()=>[],conferirPersistencia:async()=>({escritoresAtivos:0,incerto:false,coletadoEm:now}),coletarReadOnly:async()=>({projeto:'gnwybroqfvwosiqzsfla',mysql:rows,supabase:pg,mysqlReadOnly:true,supabaseReadOnly:true,tlsVerificado:true,catalogoConferido:true,capturas:{mysql:{inicio:now,fim:now},supabase:{inicio:now,fim:now}}}),checkpoints:{mysql:rows,supabase:pg},columns,agora:()=>now};
  assert.equal((await executarDeltaFinal(options)).status,'DELTA_APROVADO_SEM_EXECUTAR_CUTOVER');assert.equal(calls,2);restart=true;calls=0;await assert.rejects(executarDeltaFinal(options));
});

test('coletor final so abre drivers apos gate, usa READ ONLY e encerra ambas sessoes',async()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{TABLES}=require('../scripts/delta-cutover.cjs');const columns=Object.fromEntries(TABLES.map(t=>[t,['id']])),expected=Object.fromEntries(TABLES.map(t=>[t,'DDL_'+t]));let created=0,ended=0,released=0;const queries=[];
  const my={async query(o){const s=o.sql;queries.push(s);if(s.startsWith('SHOW CREATE TABLE')){const t=s.match(/`([a-z_]+)`/)[1];return [[{'Create Table':expected[t]}]];}return [[]];},async execute(){return [TABLES.map(()=>({ENGINE:'InnoDB'}))];},async rollback(){queries.push('MYSQL_ROLLBACK');},async end(){ended++;}};
  const pg={connection:{stream:{encrypted:true,authorized:true}},async query(o){queries.push(o.text);return {rows:o.text.includes('AS catalogo')?[{catalogo:{}}]:[]};},release(){released++;}};
  const context={module:{exports:{}},Date,require(name){if(name==='mysql2/promise')return {async createConnection(){created++;return my;}};if(name==='../db-postgres.js')return {criarPoolPostgres(){created++;return {async connect(){return pg;},async end(){ended++;}};}};return require(name.startsWith('./')?path.resolve(__dirname,'../scripts',name):name);}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/coletar-delta-readonly.cjs'),'utf8'),context);
  const collect=context.module.exports.criarColetorReadOnly({DB_HOST:'localhost',DB_NAME:'ficticio',PGHOST:'regiao.pooler.supabase.com',PGUSER:'postgres.gnwybroqfvwosiqzsfla',PGPORT:'5432',PGDATABASE:'postgres'},columns,{mysql:expected,supabase:{}},'ca-ficticia');assert.equal(created,0);
  const result=await collect({projeto:'gnwybroqfvwosiqzsfla',somenteLeitura:true});assert.equal(created,2);assert.equal(ended,2);assert.equal(released,1);assert.ok(result.mysqlReadOnly&&result.supabaseReadOnly&&result.catalogoConferido);assert.ok(queries.includes('START TRANSACTION READ ONLY'));assert.ok(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert.ok(queries.every(q=>!/^(?:INSERT|UPDATE|DELETE|CALL|CREATE|ALTER|TRUNCATE)\b/i.test(q)));
});

test('estado selado sem congelamento e recusado como inconsistente',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{criarEstadoPrivado}=require('../config/estado-supervisor.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tt-estado-'));
  try{assert.throws(()=>criarEstadoPrivado(dir).gravar({versao:1,congelado:false,selado:true,instancias:[]}));assert.deepEqual(fs.readdirSync(dir),[]);}finally{fs.rmdirSync(dir);}
});

test('JSON real conserva admissao async durante selagem; callback herdado apos resposta e bloqueado',async t=>{
  const express=require('express'),s=criarSupervisor({estado:memoria()}),app=express(),ready=deferred(),continuar=deferred(),dispararTarde=deferred();let tardio;
  s.instalar(app);app.use(express.json());app.post('/fixture',async(req,res)=>{
    ready.resolve();await continuar.promise;const n=await s.executarPersistencia(async()=>req.body.n);
    tardio=(async()=>{await dispararTarde.promise;return s.executarPersistencia(async()=>99);})();res.status(201).json({n});
  });
  const server=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
  const pending=fetch('http://127.0.0.1:'+server.address().port+'/fixture',{method:'POST',headers:{'content-type':'application/json'},body:'{"n":23}'});await ready.promise;s.congelar();s.selar();const drain=s.aguardarDrenagem();continuar.resolve();const response=await pending;assert.equal(response.status,201);assert.deepEqual(await response.json(),{n:23});await drain;
  const rejected=assert.rejects(tardio,{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});dispararTarde.resolve();await rejected;assert.equal(s.status().operacoesPersistenciaPendentes,0);
});
