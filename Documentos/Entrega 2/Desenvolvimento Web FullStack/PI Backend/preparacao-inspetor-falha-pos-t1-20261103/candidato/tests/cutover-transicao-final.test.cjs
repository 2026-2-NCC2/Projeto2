"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const {criarSupervisor}=require('../config/supervisor-cutover.cjs'),{criarControlador}=require('../config/controlador-supervisor.cjs'),{anexarIPC}=require('../config/ipc-supervisor.cjs'),startup=require('../config/startup-controlado.cjs');
const antigo={JWT_SECRET:'chave-antiga-ficticia-'+ 'a'.repeat(40),HOMOLOG_JWT_SECRET:'homologacao-ficticia-'+ 'b'.repeat(40)};
const novo={DB_PROVIDER:'supabase',SUPABASE_URL:'https://gnwybroqfvwosiqzsfla.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_ficticia_transicao',JWT_SECRET:'chave-nova-ficticia-'+ 'c'.repeat(40),HOMOLOG_JWT_SECRET:antigo.HOMOLOG_JWT_SECRET};
const gate=()=>({status:'DELTA_APROVADO_SEM_EXECUTAR_CUTOVER',checkpointId:'checkpoint-ficticio',backupsT0Verificados:true});
function memoria(){let e={versao:1,congelado:false,selado:false,instancias:[]};return {ler:()=>structuredClone(e),gravar:x=>{e=structuredClone(x);}};}
function resposta(){const r=new EventEmitter();r.statusCode=200;r.setHeader=()=>{};r.status=n=>{r.statusCode=n;return r;};r.json=()=>{r.emit('finish');return r;};return r;}
function link(estado,instancia,pid){const parent=new EventEmitter(),channel=new EventEmitter();parent.connected=channel.connected=true;parent.pid=pid;const s=criarSupervisor({estado,instancia,pid});parent.send=(m,cb)=>{queueMicrotask(()=>channel.emit('message',m));cb?.();};channel.send=m=>queueMicrotask(()=>parent.emit('message',m));const off=anexarIPC(s,channel);parent.kill=()=>{queueMicrotask(()=>{parent.connected=false;parent.emit('exit',0);});return true;};return {parent,channel,s,off};}
async function cenario(t){const estado=memoria(),old=link(estado,'anterior',101),ctl=criarControlador({principal:old.parent},estado),off=[old.off];t.after(()=>{ctl.fechar();for(const f of off)f();});await ctl.congelar();await ctl.selarEDrenar();let target,ctx;
  async function lancar(){const p=new EventEmitter();p.connected=true;p.pid=202;p.kill=()=>false;
    p.send=(m,cb)=>{if(m.tipo==='cutover-iniciar'){queueMicrotask(()=>{try{ctx=startup.consumirEntrada({estado,env:novo,instancia:m.instancia,ticket:m.ticket,pid:p.pid});assert.equal(startup.validarEntrada(novo,'principal',{estado,contexto:ctx}).provider,'supabase');target=link(estado,m.instancia,p.pid);off.push(target.off);p.send=target.parent.send;target.parent.on('message',msg=>p.emit('message',msg));p.emit('message',{tipo:'cutover-pronta',janela:m.janela,instancia:m.instancia});}catch{p.emit('message',{tipo:'cutover-falha'});}});cb?.();}else throw Error('BOOT_AINDA_NAO_CONSUMIDO');};return p;}
  return {estado,old,ctl,lancar,target:()=>target,ctx:()=>ctx,op:()=>({id:'principal',lancar,validarT0:async()=>gate(),ambienteOrigem:antigo,ambienteNovo:novo,prazo:1000})};}

test('transicao integrada fecha origem drenada, admite novo boot selado e libera apenas apos gates',async t=>{
  const x=await cenario(t);const initial=await x.ctl.substituirPlanejado(x.op());assert.equal(x.old.parent.connected,false);assert.equal(initial.congelado,true);assert.equal(initial.selado,false);assert.equal(initial.resultadosIncertos,0);
  let reads=0;const r=resposta();x.target().s.middleware({method:'GET',path:'/perfil'},r,()=>reads++);r.emit('finish');assert.equal(reads,1);await assert.rejects(x.target().s.executarPersistencia(async()=>1),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});
  const result=await x.ctl.liberarPlanejado({id:'principal',autorizarEscritas:true,validarSmoke:async()=>({jwtAntigosRecusados:true,perfisGetAprovados:true,mysqlIsolado:true}),validarDelta:async()=>gate()});assert.equal(result.congelado,false);assert.equal(result.selado,false);assert.equal(await x.target().s.executarPersistencia(async()=>37),37);assert.equal(x.estado.ler().transicao.fase,'CONCLUIDA');
  assert.equal(startup.validarEntrada(novo,'principal',{estado:x.estado}).provider,'supabase');assert.throws(()=>startup.validarEntrada({JWT_SECRET:antigo.JWT_SECRET},'principal',{estado:x.estado}),/STARTUP_MYSQL_APOS_ATIVACAO_RECUSADO/);
});

test('substituicao recusa JWT reutilizado ou T0 reprovado sem encerrar processo antigo',async t=>{
  const x=await cenario(t);await assert.rejects(x.ctl.substituirPlanejado({...x.op(),ambienteNovo:{...novo,JWT_SECRET:antigo.JWT_SECRET}}));assert.equal(x.old.parent.connected,true);assert.equal(x.estado.ler().transicao,undefined);
  await assert.rejects(x.ctl.substituirPlanejado({...x.op(),validarT0:async()=>({status:'BLOQUEADO'})}));assert.equal(x.old.parent.connected,true);assert.equal(x.estado.ler().congelado,true);
});

test('ticket de boot e unico e vinculado a PID, projeto e configuracao',()=>{
  const estado=memoria();estado.gravar({versao:1,congelado:true,selado:true,instancias:['antigo'],transicao:{id:'j',destino:'novo',pidDestino:202,ticket:'ficticio',fase:'PREPARADA',configuracaoHash:startup.fingerprint(novo)}});
  assert.throws(()=>startup.consumirEntrada({estado,env:novo,instancia:'novo',ticket:'ficticio',pid:203}));assert.throws(()=>startup.consumirEntrada({estado,env:{...novo,SUPABASE_URL:'https://outro.supabase.co'},instancia:'novo',ticket:'ficticio',pid:202}));
  const ctx=startup.consumirEntrada({estado,env:novo,instancia:'novo',ticket:'ficticio',pid:202});assert.throws(()=>startup.consumirEntrada({estado,env:novo,instancia:'novo',ticket:'ficticio',pid:202}));assert.equal(startup.validarEntrada(novo,'principal',{estado,contexto:ctx}).provider,'supabase');assert.throws(()=>startup.validarEntrada({...novo,JWT_SECRET:'d'.repeat(64)},'principal',{estado,contexto:ctx}));
});

test('falha no smoke conserva selagem e impede reaplicacao automatica da transicao',async t=>{
  const x=await cenario(t);await x.ctl.substituirPlanejado(x.op());await assert.rejects(x.ctl.liberarPlanejado({id:'principal',autorizarEscritas:true,validarSmoke:async()=>({jwtAntigosRecusados:false}),validarDelta:async()=>gate()}));assert.equal(x.estado.ler().congelado,true);assert.equal(x.estado.ler().selado,true);assert.equal(x.estado.ler().transicao.fase,'INCERTA');await assert.rejects(x.target().s.executarPersistencia(async()=>1));await assert.rejects(x.ctl.substituirPlanejado(x.op()));
});

test('patch preparado executa guard real antes da fabrica sem habilitar servidor atual',()=>{
  const base=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8'),old='if (!homologacao) validarInicializacaoBanco(process.env, modoExecucao());',replacement='if (!homologacao) require("./config/startup-controlado.cjs").validarEntrada(process.env, modoExecucao());';assert.ok(base.includes(old));assert.ok(fs.readFileSync(path.join(__dirname,'../fixtures/cutover-startup.proposta.patch'),'utf8').includes('+'+replacement));
  const estado=memoria();let factories=0;function executar(env,contexto){const app={locals:{},use(){}};for(const k of ['get','post','put','patch','delete'])app[k]=()=>{};const context={module:{exports:{}},process:{env},Buffer,console:{log(){},error(){}},require(name){if(name==='express')return Object.assign(()=>app,{json:()=>()=>{}});if(name==='cors')return ()=>()=>{};if(name==='bcryptjs'||name==='jsonwebtoken')return {};if(name==='dotenv')return {config(){}};if(name==='./isolamento.cjs')return {modoExecucao:()=> 'principal'};if(name==='./config/banco.cjs')return require('../config/banco.cjs');if(name==='./config/startup-controlado.cjs')return {validarEntrada:(e,m)=>startup.validarEntrada(e,m,{estado,contexto})};if(name==='./repositories/index.cjs')return {criarPersistencia(){factories++;return {repositorios:{},servicos:{}};}};if(name==='./services/suporte-transacoes.cjs')return require('../services/suporte-transacoes.cjs');throw Error('IMPORTACAO_PROIBIDA');}};vm.runInNewContext(base.replace(old,replacement),context);return app;}
  assert.throws(()=>executar(novo),e=>e.code==='DB_PROVIDER_NOT_IMPLEMENTED');assert.equal(factories,0);
  estado.gravar({versao:1,congelado:true,selado:true,instancias:['old'],transicao:{id:'j',destino:'new',pidDestino:202,ticket:'ficticio',fase:'PREPARADA',configuracaoHash:startup.fingerprint(novo)}});const ctx=startup.consumirEntrada({estado,env:novo,instancia:'new',ticket:'ficticio',pid:202});executar(novo,ctx);assert.equal(factories,1);
  assert.throws(()=>require('../config/banco.cjs').validarInicializacaoBanco(novo),e=>e.code==='DB_PROVIDER_NOT_IMPLEMENTED');assert.ok(fs.readFileSync(path.join(__dirname,'../server.js'),'utf8').includes(old));
});

function fixtureT0(t){
  const {TABLES,FKS}=require('../scripts/delta-cutover.cjs'),{EXTRAS}=require('../scripts/verificar-delta-final.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tt-t0-'));t.after(()=>{for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir);});
  const columns=Object.fromEntries(TABLES.map(name=>[name,name==='usuarios'?['id','email']:['id',...Object.keys(FKS[name]||{})]]));const mysql=Object.fromEntries(TABLES.map(name=>[name,[name==='usuarios'?{id:'1',email:'base@example.invalid'}:{id:'1',...Object.fromEntries(Object.keys(FKS[name]).map(k=>[k,'1']))}]])),supabase=structuredClone(mysql);
  for(const name of TABLES)for(const id of EXTRAS[name])supabase[name].push(name==='usuarios'?{id,email:'extra@example.invalid'}:{id,...Object.fromEntries(Object.entries(FKS[name]).map(([k,parent])=>[k,EXTRAS[parent][0]]))});
  const sql=TABLES.map(name=>'INSERT INTO `'+name+'` ('+columns[name].map(c=>'`'+c+'`').join(',')+') VALUES '+mysql[name].map(r=>'('+columns[name].map(c=>"'"+r[c]+"'").join(',')+')').join(',')+';').join('\n');
  const copy=TABLES.map(name=>'COPY public.'+name+' ('+columns[name].join(', ')+') FROM stdin;\n'+supabase[name].map(r=>columns[name].map(c=>r[c]).join('\t')).join('\n')+'\n\\.\n').join('\n');
  const files={'mysql.sql':sql,'pg.dump':'PGDMP-ficticio','roles.sql':'-- ficticio','toc.txt':'-- ficticio','copy.sql':copy};for(const [file,body] of Object.entries(files))fs.writeFileSync(path.join(dir,file),body);
  const backups={directory:dir,mysqlDataFile:path.join(dir,'mysql.sql'),postgresDataFile:path.join(dir,'copy.sql'),privateAclVerified:true,schemaComplete:true,rolesWithoutPasswords:true,restoreTestsRepeated:false,artifacts:Object.keys(files).map(file=>({file:path.join(dir,file),bytes:fs.statSync(path.join(dir,file)).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex')}))};
  const now=123456,base={instancia:'s',congelado:true,selado:true,requisicoesPendentes:0,escritasPendentes:0,operacoesPersistenciaPendentes:0,resultadosIncertos:0,coletadoEm:now};let produced=0;
  const options={inventario:{completoConfirmado:true,responsavel:'ficticio',processos:[{id:'principal',instancia:'s'}],escritoresExternos:[]},supervisores:{status:async()=>({principal:base})},evidenciasExternas:async()=>[],conferirPersistencia:async()=>({escritoresAtivos:0,incerto:false,coletadoEm:now}),produzirBackups:async flags=>{assert.deepEqual(flags,{somenteLeitura:true,semRepetirRestauracoes:true});produced++;return backups;},coletarReadOnly:async()=>({projeto:'gnwybroqfvwosiqzsfla',mysql,supabase,mysqlReadOnly:true,supabaseReadOnly:true,tlsVerificado:true,catalogoConferido:true,capturas:{mysql:{inicio:now,fim:now},supabase:{inicio:now,fim:now}}}),columns,agora:()=>now};return {dir,backups,options,produced:()=>produced,base};
}

test('T0 simulado verifica hashes, compara dados dos dumps e prepara delta sem restauracoes',async t=>{
  const x=fixtureT0(t),{prepararT0Delta}=require('../scripts/preparar-t0-delta.cjs');const r=await prepararT0Delta(x.options);assert.equal(r.backupsT0Verificados,true);assert.equal(r.cutoverExecutado,false);assert.equal(r.restoreTestsRepeated,false);assert.equal(x.produced(),1);const checkpoint=JSON.parse(fs.readFileSync(path.join(x.dir,'checkpoint-t0.privado.json')));assert.equal(checkpoint.checkpointId,r.checkpointId);assert.equal(checkpoint.checkpoint.supabase.usuarios.length,2);
});

test('T0 nao produz backup antes da drenagem nem aprova arquivo adulterado',async t=>{
  const x=fixtureT0(t),{prepararT0Delta}=require('../scripts/preparar-t0-delta.cjs');x.base.operacoesPersistenciaPendentes=1;await assert.rejects(prepararT0Delta(x.options));assert.equal(x.produced(),0);x.base.operacoesPersistenciaPendentes=0;fs.appendFileSync(x.backups.mysqlDataFile,'-- alterado');await assert.rejects(prepararT0Delta(x.options));assert.equal(fs.existsSync(path.join(x.dir,'checkpoint-t0.privado.json')),false);
});

test('COPY T0 preserva null, controles, barras e Unicode incluindo octal UTF8',()=>{
  const {TABLES}=require('../scripts/delta-cutover.cjs'),{lerCopyPublic}=require('../scripts/ler-copy-t0.cjs');const sql=TABLES.map(name=>'COPY public.'+name+' (id, value) FROM stdin;\n1\t'+(name==='usuarios'?'\\303\\251\\tlinha\\nbarra\\\\': '\\N')+'\n\\.\n').join('');const r=lerCopyPublic(sql);assert.equal(r.usuarios[0].value,'é\tlinha\nbarra\\');assert.equal(r.eventos[0].value,null);assert.throws(()=>lerCopyPublic(sql.replace('\\303\\251','\\377')));
});

test('transicao com operacao pendente nao encerra origem nem consome T0',async t=>{
  const estado=memoria(),old=link(estado,'antiga',101),ctl=criarControlador({principal:old.parent},estado);t.after(()=>{ctl.fechar();old.off();});let finish;const work=old.s.executarPersistencia(()=>new Promise(r=>{finish=r;}));await ctl.congelar();let checked=0;
  try{await assert.rejects(ctl.substituirPlanejado({id:'principal',lancar:async()=>assert.fail(),validarT0:async()=>{checked++;return gate();},ambienteOrigem:antigo,ambienteNovo:novo}));assert.equal(checked,0);assert.equal(old.parent.connected,true);}finally{finish();await work;}
});

test('resposta ou disconnect atrasado da origem nao cancela pedido da substituta',async t=>{
  const x=await cenario(t);await x.ctl.substituirPlanejado(x.op());const p=x.ctl.status();x.old.parent.emit('disconnect');const current=await p;assert.equal(current.principal.pid,202);assert.equal(current.principal.resultadosIncertos,0);
});

test('startup planejado preserva isolamento e recusa flags de homologacao',()=>{
  assert.equal(startup.validarEntrada({},'isolado',{estado:{ler(){assert.fail('Estado principal lido');}}}).provider,'mysql');assert.throws(()=>startup.fingerprint({...novo,TROCATICKET_HOMOLOGACAO:'escrita-descartavel'}));
});

test('artefato T0 dentro do repositorio e recusado antes de copiar dados privados',()=>{
  assert.throws(()=>require('../scripts/backups-t0.cjs').validarArtefatosT0({directory:__dirname}),/T0_PRIVADO_FORA_REPO/);
});

test('cliente de dump com timeout so pode ser removido com ID e label proprios',async()=>{
  const {limparClienteT0}=require('../scripts/backups-t0.cjs'),id='a'.repeat(64);let removed=0,own=false;
  const fake=async(_bin,args)=>{if(args[0]==='ps')return Buffer.from(id);if(args[0]==='inspect')return Buffer.from(JSON.stringify([{Id:id,Config:{Labels:{'tt.cutover.t0':own?'t0-proprio':'OUTRO'}},HostConfig:{ReadonlyRootfs:true}}]));if(args[0]==='rm'){assert.deepEqual(args,['rm','-f',id]);removed++;return Buffer.from('');}assert.fail();};
  await assert.rejects(limparClienteT0(id,'t0-proprio',fake));assert.equal(removed,0);own=true;await limparClienteT0(id,'t0-proprio',fake);assert.equal(removed,1);
});

test('delta final reprovado durante liberacao deixa incerteza persistente e escrita bloqueada',async t=>{
  const x=await cenario(t);await x.ctl.substituirPlanejado(x.op());await assert.rejects(x.ctl.liberarPlanejado({id:'principal',autorizarEscritas:true,validarSmoke:async()=>({jwtAntigosRecusados:true,perfisGetAprovados:true,mysqlIsolado:true}),validarDelta:async()=>({...gate(),checkpointId:'outro'})}));const s=x.target().s.status();assert.equal(s.congelado,true);assert.equal(s.selado,true);assert.ok(s.resultadosIncertos>0);await assert.rejects(x.target().s.aguardarDrenagem(),{code:'FREEZE_RESULTADO_INCERTO'});
});

test('selagem nao admite leituras tardias de background, mas drena GET ja admitido',async()=>{
  const s=criarSupervisor({estado:memoria()}),r=resposta();let resume;let work;const wait=new Promise(resolve=>{resume=resolve;});s.middleware({method:'GET',path:'/perfil'},r,()=>{work=(async()=>{await wait;return s.executarPersistencia(async()=>11,false);})();});s.congelar();s.selar();await assert.rejects(s.executarPersistencia(async()=>12,false),{code:'FREEZE_NOVA_OPERACAO_BLOQUEADA'});const drain=s.aguardarDrenagem();resume();assert.equal(await work,11);r.emit('finish');await drain;assert.equal(s.status().requisicoesPendentes,0);
});

test('etapa final integra T0 privado, revalidacao, substituicao e liberacao com adapters simulados',async t=>{
  const x=await cenario(t),f=fixtureT0(t),{criarEtapaFinal}=require('../scripts/etapa-final-cutover.cjs');const collect=f.options.coletarReadOnly;f.options.agora=Date.now;f.options.inventario.processos[0].instancia='anterior';f.options.supervisores=x.ctl;f.options.conferirPersistencia=async()=>({escritoresAtivos:0,incerto:false,coletadoEm:Date.now()});f.options.coletarReadOnly=async()=>{const r=await collect();const now=Date.now();r.capturas={mysql:{inicio:now,fim:now},supabase:{inicio:now,fim:now}};return r;};
  const etapa=criarEtapaFinal({controlador:x.ctl,estado:x.estado,opcoesT0:f.options,ambienteOrigem:antigo,ambienteNovo:novo,lancar:x.lancar,validarSmoke:async()=>{assert.equal(x.target().s.status().selado,false);return {jwtAntigosRecusados:true,perfisGetAprovados:true,mysqlIsolado:true};}});
  const checkpoint=await etapa.prepararT0();assert.ok(checkpoint.checkpointFile.startsWith(f.dir));await etapa.transicionar();const released=await etapa.liberar({autorizarEscritas:true});assert.equal(released.faseTransicao,'CONCLUIDA');assert.equal(released.congelado,false);assert.equal(f.produced(),1);
});

test('T0 recusa parecer de integridade falso antes de gravar checkpoint ou aprovar delta',async t=>{
  const x=fixtureT0(t);await assert.rejects(require('../scripts/preparar-t0-delta.cjs').prepararT0Delta({...x.options,validarArtefatos:async()=>false}));assert.equal(fs.existsSync(path.join(x.dir,'checkpoint-t0.privado.json')),false);
});
