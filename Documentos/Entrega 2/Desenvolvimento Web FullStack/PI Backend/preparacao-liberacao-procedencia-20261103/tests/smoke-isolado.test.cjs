'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),jwt=require('jsonwebtoken'),http=require('node:http');
const {criarSupervisor}=require('../config/supervisor-cutover.cjs'),{criarCanalSmokeIsolado}=require('../config/smoke-isolado.cjs'),{executarSmokeFinalIsolado}=require('../scripts/smoke-final-isolado.cjs');
const secret='jwt-ficticio-do-smoke-isolado-'+ 'a'.repeat(40),password='senha-ficticia-local';
const contas=['admin','organizador','fornecedor','participante'].map((perfil,i)=>({id:i+1,perfil,email:perfil+'@example.invalid',password,nome:'Fixture '+i}));
async function fixture(t){
  let data={versao:1,congelado:true,selado:true,instancias:['boot-ficticio'],transicao:{id:'janela-ficticia',fase:'INICIADA',pidDestino:1234,destino:'boot-ficticio',checkpointId:'checkpoint-ficticio',recuperacao:{id:'rec-ficticia',etapa:'PRONTA_SMOKE'}}};
  const estado={ler:()=>structuredClone(data),gravar:x=>{data=structuredClone(x);}},s=criarSupervisor({estado,instancia:'boot-ficticio',pid:1234}),app=express();let writes=0,reads=0;
  s.instalar(app);app.use(express.json());
  app.post('/login',async(req,res)=>{await s.executarPersistencia(async()=>{reads++;},false);const a=contas.find(x=>x.email===req.body.email&&x.password===req.body.senha);return a?res.json({token:jwt.sign({id:a.id,perfil:a.perfil},secret,{algorithm:'HS256',expiresIn:'1h'})}):res.status(401).json({erro:'Credenciais invalidas'});});
  app.use(async(req,res,next)=>{try{const c=jwt.verify((req.headers.authorization||'').replace(/^Bearer /,''),secret,{algorithms:['HS256']});req.conta=contas.find(x=>x.id===c.id&&x.perfil===c.perfil);if(!req.conta)throw Error();await s.executarPersistencia(async()=>{reads++;},false);next();}catch{return res.status(401).json({erro:'Nao autorizado'});}});
  app.get('/perfil',(req,res)=>res.json({id:req.conta.id,nome:req.conta.nome,email:req.conta.email}));
  const roles={'/admin/eventos':'admin','/cotacoes':'organizador','/fornecedor/cotacoes':'fornecedor','/participante/eventos':'participante','/usuarios':'admin'};
  for(const [route,role] of Object.entries(roles))app.get(route,(req,res)=>req.conta.perfil===role?res.json([]):res.status(403).json({erro:'Proibido'}));
  for(const method of ['post','put','patch','delete'])app[method]('/eventos',async(req,res)=>{await s.executarPersistencia(async()=>{writes++;});res.json({});});
  const main=await new Promise(resolve=>{const x=app.listen(0,'127.0.0.1',()=>resolve(x));});t.after(async()=>{main.closeAllConnections();await new Promise(r=>main.close(r));});
  const publicRequest=async(method='GET',route='/perfil',headers={})=>{const r=await fetch('http://127.0.0.1:'+main.address().port+route,{method,headers:{connection:'close',...headers}});await r.arrayBuffer();return r.status;};
  const open=async(op={})=>{const c=await criarCanalSmokeIsolado({app,supervisor:s,janela:'janela-ficticia',recuperacaoId:'rec-ficticia',...op});t.after(()=>c.fechar());return c;};
  return {estado,s,app,open,publicRequest,counts:()=>({writes,reads})};
}
test('smoke privado valida quatro papeis sem retirar 503 principal ou alterar estado',async t=>{
  const f=await fixture(t),before=f.estado.ler(),canal=await f.open();
  for(const [method,route] of [['GET','/perfil'],['POST','/login'],['POST','/eventos']])assert.equal(await f.publicRequest(method,route),503);
  const result=await executarSmokeFinalIsolado({canal,contas,jwtSecret:secret,tokensAntigos:['jwt-principal-antigo-ficticio','jwt-homolog-antigo-ficticio'].map(key=>jwt.sign({id:1,perfil:'admin'},key))});
  assert.equal(result.status,'SMOKE_ISOLADO_LEITURA_APROVADO');assert.equal(result.http.length,26);assert.equal(result.escritasBloqueadas,true);assert.equal(f.counts().writes,0);assert.ok(f.counts().reads>0);assert.deepEqual(f.estado.ler(),before);assert.equal(await f.publicRequest(),503);
  const serialized=JSON.stringify(result);for(const value of [secret,password,contas[0].email,'Bearer '])assert.ok(!serialized.includes(value));assert.equal(f.s.status().requisicoesPendentes,0);assert.equal(f.s.status().resultadosIncertos,0);
});
test('header publico nao concede admissao e operacao background permanece bloqueada',async t=>{
  const f=await fixture(t);await f.open();assert.equal(await f.publicRequest('GET','/perfil',{'x-trocaticket-smoke-privado':'a'.repeat(64)}),503);
  await assert.rejects(f.s.executarPersistencia(async()=>assert.fail('leitura background admitida'),false),{code:'FREEZE_NOVA_OPERACAO_BLOQUEADA'});
  await assert.rejects(f.s.executarPersistencia(async()=>assert.fail('escrita admitida'),true),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});
});
test('transporte privado recusa capacidade ausente errada ou multibyte',async t=>{
  const f=await fixture(t),original=http.createServer;let server;
  http.createServer=function(...args){server=original.apply(this,args);return server;};let canal;
  try{canal=await f.open();}finally{http.createServer=original;}
  for(const value of [undefined,'a'.repeat(64),'é'.repeat(64)]){const r=await fetch('http://127.0.0.1:'+server.address().port+'/perfil',{headers:{connection:'close',...(value===undefined?{}:{'x-trocaticket-smoke-privado':value})}});await r.arrayBuffer();assert.equal(r.status,503);}
  assert.equal((await canal.requisitar({route:'/perfil'})).status,401);assert.equal(f.counts().writes,0);
});
const invalid=[['fase INCERTA',e=>{e.transicao.fase='INCERTA';}],['fase LEITURA',e=>{e.transicao.fase='LEITURA';}],['sem freeze',e=>{e.congelado=false;}],['sem selagem',e=>{e.selado=false;}],['outro PID',e=>{e.transicao.pidDestino=999;}],['outro boot',e=>{e.transicao.destino='outro';}],['recuperacao incompleta',e=>{e.transicao.recuperacao.etapa='ENCERRANDO';}],['sem recuperacao',e=>{delete e.transicao.recuperacao;}]];
for(const [name,mutate] of invalid)test('gate privado bloqueia '+name,async t=>{const f=await fixture(t),e=f.estado.ler();mutate(e);f.estado.gravar(e);await assert.rejects(f.open());assert.equal(f.counts().writes,0);assert.equal(await f.publicRequest(),503);});
test('capacidade privada confere janela recuperacao e alteracoes posteriores',async t=>{
  const f=await fixture(t);await assert.rejects(f.open({janela:'outra'}));await assert.rejects(f.open({recuperacaoId:'outra'}));const c=await f.open(),e=f.estado.ler();e.transicao.recuperacao.id='outra';f.estado.gravar(e);assert.equal((await c.requisitar({route:'/perfil'})).status,503);assert.equal(f.counts().reads,0);
});
test('fechamento revoga capacidade e recusa novo uso sem tocar na manutencao',async t=>{
  const f=await fixture(t),c=await f.open();await c.fechar();await c.fechar();await assert.rejects(c.requisitar({route:'/perfil'}));assert.equal(await f.publicRequest(),503);assert.equal(f.counts().writes,0);
});
test('prazo encerra transporte e recusa reutilizacao mantendo HTTP publico selado',async t=>{
  const f=await fixture(t),c=await f.open({prazoMs:20});await new Promise(r=>setTimeout(r,40));await assert.rejects(c.requisitar({route:'/perfil'}));assert.equal(await f.publicRequest(),503);assert.equal(f.counts().writes,0);
});
test('IPC herdado executa smoke sem devolver tokens ou credenciais e preserva 503',async t=>{
  const f=await fixture(t),{EventEmitter}=require('node:events'),channel=new EventEmitter();channel.connected=true;
  const old=process.env.JWT_SECRET;process.env.JWT_SECRET=secret;t.after(()=>{if(old===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=old;});
  const reply=new Promise(resolve=>{channel.send=resolve;});const off=require('../scripts/canal-smoke-isolado.cjs').anexarSmokeIsolado(f.app,channel);t.after(off);
  channel.emit('message',{tipo:'cutover-smoke-isolado',id:'pedido-ficticio',janela:'janela-ficticia',recuperacaoId:'rec-ficticia',contas,tokensAntigos:['antigo-a','antigo-b'].map(k=>jwt.sign({id:1,perfil:'admin'},k))});
  const r=await reply;assert.equal(r.ok,true);assert.equal(r.result.perfisAprovados,4);assert.equal(await f.publicRequest(),503);assert.ok(!JSON.stringify(r).includes(password));assert.ok(!JSON.stringify(r).includes(secret));assert.equal(f.counts().writes,0);
});
test('IPC ausente ou janela divergente nao cria acesso privado',async t=>{
  const f=await fixture(t),{EventEmitter}=require('node:events'),channel=new EventEmitter(),{anexarSmokeIsolado}=require('../scripts/canal-smoke-isolado.cjs');assert.throws(()=>anexarSmokeIsolado(f.app,channel));channel.connected=true;
  const reply=new Promise(resolve=>{channel.send=resolve;});const off=anexarSmokeIsolado(f.app,channel);t.after(off);channel.emit('message',{tipo:'cutover-smoke-isolado',id:'pedido-ficticio',janela:'outra',recuperacaoId:'rec-ficticia',contas:[],tokensAntigos:[]});assert.equal((await reply).ok,false);assert.equal(f.counts().reads,0);assert.equal(await f.publicRequest(),503);
});
test('IPC reprova importacao MySQL mesmo com smoke de leitura aprovado',async t=>{
  const f=await fixture(t),{EventEmitter}=require('node:events'),channel=new EventEmitter(),key=require('node:path').resolve(__dirname,'../db.js');channel.connected=true;
  const oldEnv=process.env.JWT_SECRET,oldCache=require.cache[key];process.env.JWT_SECRET=secret;require.cache[key]={exports:{}};
  t.after(()=>{if(oldEnv===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldEnv;if(oldCache===undefined)delete require.cache[key];else require.cache[key]=oldCache;});
  const reply=new Promise(resolve=>{channel.send=resolve;});const off=require('../scripts/canal-smoke-isolado.cjs').anexarSmokeIsolado(f.app,channel);t.after(off);channel.emit('message',{tipo:'cutover-smoke-isolado',id:'pedido-ficticio',janela:'janela-ficticia',recuperacaoId:'rec-ficticia',contas,tokensAntigos:['antigo-a','antigo-b'].map(k=>jwt.sign({id:1,perfil:'admin'},k))});assert.equal((await reply).ok,false);assert.equal(await f.publicRequest(),503);assert.equal(f.counts().writes,0);
});
test('bootstrap so instala IPC isolado depois de consumir admissao legitima',()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),p=new EventEmitter(),events=[];p.connected=true;p.env={TROCATICKET_SUPERVISOR_IPC:'1',PORT:'3001'};p.send=m=>events.push(m.tipo);p.disconnect=()=>{};
  const app={locals:{supervisorCutover:{status:()=>({instancia:'boot',selado:true})}},listen(port,host,cb){events.push('bind');assert.equal(port,3001);assert.equal(host,'127.0.0.1');cb();return new EventEmitter();}};
  const req=name=>{if(name==='../config/estado-supervisor.cjs')return {criarEstadoPrivado:()=>({})};if(name==='../config/startup-controlado.cjs')return {consumirEntrada(){events.push('capacidade-consumida');}};if(name==='../server.js'){events.push('app');return app;}if(name==='./canal-smoke-isolado.cjs')return {anexarSmokeIsolado(a){assert.equal(a,app);events.push('ipc-smoke');}};if(name==='./canal-t1-isolado.cjs')return {anexarT1Isolado(a){assert.equal(a,app);events.push('ipc-t1');}};throw Error('IMPORTACAO_INESPERADA');};
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../scripts/iniciar-instancia-planejada.cjs'),'utf8'),{require:req,process:p});assert.deepEqual(events,['cutover-aguardando']);p.emit('message',{tipo:'cutover-iniciar',instancia:'boot',janela:'janela',ticket:'ficticio'});assert.deepEqual(events,['cutover-aguardando','capacidade-consumida','app','ipc-smoke','ipc-t1','bind','cutover-pronta']);
});
test('falha no contrato interrompe sem repetir requests nem abrir escritas',async()=>{
  let calls=0;await assert.rejects(executarSmokeFinalIsolado({canal:{async requisitar(){calls++;return {status:500,body:{}};}},contas,jwtSecret:secret,tokensAntigos:['a','b']}));assert.equal(calls,1);
});
test('smoke recusa retorno perfil artificial ou conta divergente pelo contrato real',()=>{
  const {validarRespostaPerfil}=require('../scripts/smoke-perfil.cjs');assert.throws(()=>validarRespostaPerfil({id:999,nome:'Teste',email:contas[0].email,perfil:'admin'},contas[0]));assert.doesNotThrow(()=>validarRespostaPerfil({id:contas[0].id,nome:'Teste',email:contas[0].email},contas[0]));
});
