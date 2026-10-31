"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const startup=require('../config/startup-controlado.cjs'),{criarSupervisor}=require('../config/supervisor-cutover.cjs'),{identidadeSupervisor}=require('../config/identidade-supervisor.cjs'),{criarRestabelecimento,validarPreAdmissao}=require('../scripts/restabelecer-supervisor-selado.cjs'),{resumo}=require('../scripts/gate-reconciliacao-recuperacao.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(){
  const now=Date.UTC(2026,9,31,20),iso=x=>new Date(x).toISOString(),env={DB_PROVIDER:'supabase',SUPABASE_URL:'https://gnwybroqfvwosiqzsfla.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_ficticia_restabelecer',JWT_SECRET:'jwt-ficticio-'+ 'a'.repeat(64),HOMOLOG_JWT_SECRET:'homolog-ficticio-'+ 'b'.repeat(64)};
  let data={versao:1,congelado:true,selado:true,instancias:['boot-historico'],transicao:{id:'janela-ficticia',fase:'INCERTA',pidDestino:101,destino:'boot-historico',ticket:null,checkpointId:'checkpoint-ficticio',configuracaoHash:startup.fingerprint(env)}};
  const estado={ler:()=>structuredClone(data),gravar:e=>{data=structuredClone(e);}},original=estado.ler();
  const mysql={usuarios:[{id:'1',email:'ficticio@example.invalid',perfil:'admin',senha:'hash-ficticio'}],eventos:[{id:'1',usuario_id:'1',nome:'Evento ficticio'}],custos_evento:[{id:'1',evento_id:'1',valor_estimado:'1.00'}],cotacoes:[{id:'1',evento_id:'1'}],itens_cotacao:[{id:'1',cotacao_id:'1'}],propostas:[{id:'1',cotacao_id:'1',fornecedor_id:'1'}],inscricoes:[{id:'1',usuario_id:'1',evento_id:'1'}],solicitacoes_acesso:[{id:'1',usuario_id:'1'}]},supabase=structuredClone(mysql);for(let id=2;id<=11;id++)supabase.eventos.push({id:String(id),usuario_id:'1',nome:'Adicional '+id});
  const catalogos={mysql:{schema:'ficticio'},supabase:{schema:'ficticio'}},checkpoint={mysql,supabase,catalogos},columns=Object.fromEntries(Object.entries(mysql).map(([t,rows])=>[t,Object.keys(rows[0])])),checkpointBytes=Buffer.from(JSON.stringify({checkpointId:original.transicao.checkpointId,checkpoint}));
  const respondedor={pid:303,parentPid:300,criadoEm:iso(now-60000),role:'MANUTENCAO_SEM_BACKEND',backendSupervisor:false,entradaConhecida:true,portaExclusivaLocal:true,boot:'boot-respondedor'};
  const database=time=>({capturedUtc:iso(time),mysql:{otherClients:0,otherTransactions:0,enabledJobs:0,scheduler:'OFF'},supabase:{sessions:[{usename:'authenticator',state:'idle',transaction_open:false}],activeCron:0,httpQueue:0,tlsVerified:true}});
  const local=time=>({capturedUtc:iso(time),knownMaintenanceResponder:structuredClone(respondedor),knownBackend:null,backendSupervisorPresent:false,unknownProcessCount:0,tasks:0,mysqlClientPids:[],httpStatus:503});
  const snapshot={...structuredClone(checkpoint),projeto:'gnwybroqfvwosiqzsfla',mysqlReadOnly:true,supabaseReadOnly:true,tlsVerificado:true,catalogoConferido:true,capturas:{mysql:{inicio:now-6000,fim:now-5900},supabase:{inicio:now-5890,fim:now-5800}}};
  const r={schemaVersion:2,scopeType:'PRE_RECUPERACAO_SEM_SUPERVISOR',recoveryGateApproved:false,reconciliationApproved:true,historicalAbsenceOfWritesProven:false,historicalGapExplicitlyAcknowledged:true,checkpointId:original.transicao.checkpointId,checkpointSha256:sha(checkpointBytes),estadoSha256:sha(JSON.stringify(original)),configuracaoHash:original.transicao.configuracaoHash,janelaId:original.transicao.id,startedUtc:iso(now-60000),finishedUtc:iso(now-50000),dataHashes:resumo(checkpoint,snapshot,columns).hashes};
  for(const key of ['recoveryExecuted','maintenanceReleased','dataWrites','jwtRotated','checkpointCreated','backupsGenerated'])r[key]=false;
  const v={origemOriginalAusente:true,janelaExclusivaConfirmada:true,historicoComprovado:false,riscoResidualAceito:true,referenciaAutorizacao:'autorizacao-ficticia-somente-teste',checkpointBytes,respondedor,writersBefore:{local:local(now-7000),database:database(now-7000)},writersAfter:{local:local(now-4000),database:database(now-4000)},snapshot,columns};
  function seal(){v.evidenciaBytes=Buffer.from(JSON.stringify(r));v.evidenciaSha256=sha(v.evidenciaBytes);}seal();
  let port=303,locks=false,supervisor,contexto;const events=[],counts={launch:0,stop:0,listen:0,evidence:0};
  const hooks={estado,ambiente:env,agora:()=>now,inspecionar:async()=>v,adquirirExclusivo(){assert.equal(locks,false,'TRAVA_OCUPADA');locks=true;return ()=>{locks=false;};},
    lancarPausado:async()=>{counts.launch++;events.push('candidato-pausado');assert.equal(port,303);return {connected:true,pid:202};},
    admitirSemEscutar:async m=>{assert.equal(port,303);events.push('admitido-sem-porta');contexto=startup.consumirRestabelecimento({estado,env,instancia:m.instancia,ticket:m.ticket,pid:202});assert.equal(startup.validarEntrada(env,'principal',{estado,contexto}).provider,'supabase');supervisor=criarSupervisor({estado,instancia:m.instancia,pid:202,agora:()=>now});},
    consultar:async()=>supervisor.status(),
    encerrarRespondedor:async p=>{assert.deepEqual(p,respondedor);assert.equal(port,303);assert.equal(estado.ler().transicao.restabelecimento.etapa,'AGUARDANDO_PORTA');counts.stop++;events.push('respondedor-encerrado');port=null;return {pid:303,encerrado:true};},
    portaLivre:async()=>port===null,
    ouvir:async()=>{assert.equal(port,null,'DOIS_PROCESSOS_NA_PORTA');counts.listen++;events.push('supervisor-na-porta');port=202;},
    gerarEvidenciaV2:async()=>{counts.evidence++;events.push('evidencia-v2');const atual=identidadeSupervisor(estado.ler());assert.equal(atual.pid,202);assert.equal(atual.tipo,'RESTABELECIDO_SELADO');return {schemaVersion:2,supervisorAdmitido:true,pid:202,httpStatus:503,checkpointId:original.transicao.checkpointId,semDivergencias:true};},
    manter503EmFalha:async()=>{events.push('protecao503');if(port===null||port===202)port=303;}
  };
  return {env,estado,original,r,v,now,seal,hooks,api:()=>criarRestabelecimento(hooks),supervisor:()=>supervisor,contexto:()=>contexto,counts,events,port:()=>port,setPort:p=>{port=p;}};
}
function http(s,method){const r=new EventEmitter();r.statusCode=200;r.setHeader=()=>{};r.status=n=>{r.statusCode=n;return r;};r.json=()=>r;let admitted=false;s.middleware({method,path:method==='POST'?'/login':'/perfil'},r,()=>{admitted=true;});r.emit('finish');return {status:r.statusCode,admitted};}
test('planejamento sem efeitos e execucao exige autorizacao explicita',async()=>{
  const f=fixture(),a=f.api(),before=f.estado.ler(),p=await a.planejar();assert.equal(p.historicoComprovado,false);assert.deepEqual(f.estado.ler(),before);await assert.rejects(a.executar(p),/NAO_AUTORIZADO/);assert.deepEqual(f.counts,{launch:0,stop:0,listen:0,evidence:0});
});
test('handoff simulado mantem INCERTA e nunca tem dois donos da porta',async()=>{
  const f=fixture(),a=f.api(),p=await a.planejar(),env=structuredClone(f.env);assert.equal((await a.executar(p,{autorizarAdmissao:true})).status,'ADMITIDA_SELADA');
  assert.deepEqual(f.events,['candidato-pausado','admitido-sem-porta','respondedor-encerrado','supervisor-na-porta','evidencia-v2']);assert.equal(f.port(),202);assert.deepEqual(f.env,env);
  const e=f.estado.ler(),{restabelecimento,...t}=e.transicao;assert.deepEqual(t,f.original.transicao);assert.equal(restabelecimento.ticket,null);assert.equal(restabelecimento.etapa,'ADMITIDA_SELADA');assert.equal(e.transicao.fase,'INCERTA');assert.ok(e.congelado&&e.selado);assert.equal(e.transicao.recuperacao,undefined);
  for(const method of ['GET','POST','PUT','DELETE'])assert.deepEqual(http(f.supervisor(),method),{status:503,admitted:false});
  await assert.rejects(f.supervisor().executarPersistencia(async()=>assert.fail('escrita admitida')),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});assert.throws(()=>f.supervisor().abrirLeitura(e.transicao.id));assert.throws(()=>f.supervisor().liberarEscritas(e.transicao.id));await assert.rejects(f.supervisor().aguardarDrenagem(),{code:'FREEZE_RESULTADO_INCERTO'});
  const s=f.supervisor().status();assert.equal(s.incertezasOperacionais,0);assert.equal(s.incertezaTransicao,1);assert.equal(s.resultadosIncertos,1);
});
test('repeticao depois de admitido e idempotente sem nova parada ou evidencia',async()=>{
  const f=fixture(),a=f.api(),p=await a.planejar();await a.executar(p,{autorizarAdmissao:true});assert.equal((await a.executar(p,{autorizarAdmissao:true})).reutilizada,true);assert.deepEqual(f.counts,{launch:1,stop:1,listen:1,evidence:1});
});
test('concorrente desconhecido na porta impede bind sem encerra-lo',async()=>{
  const f=fixture(),close=f.hooks.encerrarRespondedor;f.hooks.encerrarRespondedor=async p=>{const r=await close(p);f.setPort(404);return r;};const a=f.api(),p=await a.planejar();await assert.rejects(a.executar(p,{autorizarAdmissao:true}),/PORTA_OCUPADA/);assert.equal(f.port(),404);assert.equal(f.counts.listen,0);assert.equal(f.counts.stop,1);assert.equal(f.estado.ler().transicao.fase,'INCERTA');assert.equal(f.estado.ler().transicao.restabelecimento.etapa,'FALHA');await assert.rejects(a.executar(p,{autorizarAdmissao:true}),/SEM_RETRY/);assert.equal(f.counts.launch,1);
});
test('falha antes da troca deixa respondedor e checkpoint preservados',async()=>{
  const f=fixture();f.hooks.lancarPausado=async()=>{throw Error('TIMEOUT_FICTICIO');};const a=f.api(),p=await a.planejar();await assert.rejects(a.executar(p,{autorizarAdmissao:true}),/TIMEOUT_FICTICIO/);assert.equal(f.port(),303);assert.equal(f.counts.stop,0);assert.equal(f.estado.ler().transicao.checkpointId,f.original.transicao.checkpointId);assert.equal(f.estado.ler().transicao.fase,'INCERTA');
});
test('persistencia incerta no candidato bloqueia remocao do respondedor',async()=>{
  const f=fixture(),consult=f.hooks.consultar;f.hooks.consultar=async()=>({...await consult(),incertezasOperacionais:1,resultadosIncertos:2});const a=f.api(),p=await a.planejar();await assert.rejects(a.executar(p,{autorizarAdmissao:true}),/DRENAGEM_RECUSADA/);assert.equal(f.counts.stop,0);assert.equal(f.counts.listen,0);
});
const preRejected=[
  ['origem ainda viva',f=>{f.v.origemOriginalAusente=false;}],['janela nao exclusiva',f=>{f.v.janelaExclusivaConfirmada=false;}],['risco nao aceito',f=>{f.v.riscoResidualAceito=false;}],['historico falsamente comprovado',f=>{f.v.historicoComprovado=true;}],['evidencia adulterada',f=>{f.v.evidenciaBytes=Buffer.from('{}');}],['evidencia expirada',f=>{f.r.startedUtc='2026-10-31T10:00:00Z';f.seal();}],['contagens iguais com campo alterado',f=>{f.v.snapshot.mysql.eventos[0].nome='Outro';}],['sessao ativa',f=>{f.v.writersAfter.database.supabase.sessions[0].state='active';}],['job ativo',f=>{f.v.writersBefore.database.mysql.enabledJobs=1;}],['respondedor tratado como backend',f=>{f.v.respondedor.backendSupervisor=true;}],['inventario expirado',f=>{f.v.writersBefore.local.capturedUtc='2026-10-31T10:00:00Z';}],['checkpoint alterado',f=>{f.v.checkpointBytes=Buffer.from('{}');}]
];
for(const [name,mutate] of preRejected)test('pre-admissao rejeita '+name,()=>{const f=fixture(),before=f.estado.ler();mutate(f);assert.throws(()=>validarPreAdmissao(f.estado.ler(),f.env,f.v,f.now));assert.deepEqual(f.estado.ler(),before);assert.equal(f.counts.launch,0);});
test('pre-admissao rejeita capturas ausentes e instancia inesperada',()=>{
  const f=fixture();f.v.snapshot.capturas={};assert.throws(()=>validarPreAdmissao(f.estado.ler(),f.env,f.v,f.now));const g=fixture();g.estado.gravar({...g.estado.ler(),instancias:['desconhecida']});assert.throws(()=>validarPreAdmissao(g.estado.ler(),g.env,g.v,g.now));assert.equal(g.counts.launch,0);
});
test('pre-admissao rejeita porta configurada diferente de 3001',()=>{const f=fixture();f.env.PORT='3107';assert.throws(()=>validarPreAdmissao(f.estado.ler(),f.env,f.v,f.now),/PORTA_CONFIG_DIVERGENTE/);assert.equal(f.counts.launch,0);});
function arm(f){const e=f.estado.ler();f.estado.gravar({...e,transicao:{...e.transicao,restabelecimento:{id:'admissao-ficticia',etapa:'PREPARADA',janelaId:e.transicao.id,checkpointId:e.transicao.checkpointId,configuracaoHash:e.transicao.configuracaoHash,pidDestino:202,destino:'boot-novo',ticket:'a'.repeat(64)}}});}
test('capacidade nova e de uso unico e nao admite boot normal sem contexto',()=>{
  const f=fixture();arm(f);const ctx=startup.consumirRestabelecimento({estado:f.estado,env:f.env,instancia:'boot-novo',ticket:'a'.repeat(64),pid:202});assert.equal(startup.validarEntrada(f.env,'principal',{estado:f.estado,contexto:ctx}).provider,'supabase');assert.throws(()=>startup.consumirRestabelecimento({estado:f.estado,env:f.env,instancia:'boot-novo',ticket:'a'.repeat(64),pid:202}));assert.throws(()=>startup.validarEntrada(f.env,'principal',{estado:f.estado}));assert.throws(()=>startup.validarEntrada(f.env,'principal',{estado:f.estado,contexto:{...ctx}}));
});
const guardRejected=[['PID errado',{},203],['ticket errado',{ticket:'b'.repeat(64)}],['projeto errado',{env:{SUPABASE_URL:'https://outro.supabase.co'}}],['JWT diferente',{env:{JWT_SECRET:'c'.repeat(64)}}],['homologacao',{env:{TROCATICKET_HOMOLOGACAO:'leitura'}}],['checkpoint divergente',{},202,f=>{f.estado.gravar({...f.estado.ler(),transicao:{...f.estado.ler().transicao,checkpointId:'outro'}});}]];
for(const [name,override,pid=202,mutate] of guardRejected)test('guard de admissao rejeita '+name,()=>{const f=fixture();arm(f);mutate?.(f);const before=f.estado.ler();assert.throws(()=>startup.consumirRestabelecimento({estado:f.estado,env:{...f.env,...override.env},instancia:'boot-novo',ticket:override.ticket||'a'.repeat(64),pid}));assert.deepEqual(f.estado.ler(),before);});
test('gate v2 aceita somente identidade legitimamente readmitida sem reusar PID historico',async()=>{
  const f=fixture(),a=f.api(),p=await a.planejar();await a.executar(p,{autorizarAdmissao:true});const e=f.estado.ler(),current=identidadeSupervisor(e),iso=n=>new Date(n).toISOString();
  const processProof={pid:202,parentPid:200,criadoEm:iso(f.now-25000),entradaConhecida:true,portaExclusivaLocal:true};
  const writers=time=>({local:{capturedUtc:iso(time),knownBackend:processProof,unknownProcessCount:0,tasks:0,mysqlClientPids:[],httpStatus:503},database:{...structuredClone(f.v.writersBefore.database),capturedUtc:iso(time)}});
  const captures=time=>({mysql:{inicio:time,fim:time+100},supabase:{inicio:time+101,fim:time+200}});
  const summary=resumo(JSON.parse(f.v.checkpointBytes).checkpoint,f.v.snapshot,f.v.columns),report={schemaVersion:2,status:'RECONCILIACAO_ATUAL_APROVADA',run:'run-ficticio',janelaId:e.transicao.id,configuracaoHash:e.transicao.configuracaoHash,estadoSha256:sha(JSON.stringify(e)),checkpointId:e.transicao.checkpointId,checkpointSha256:sha(f.v.checkpointBytes),startedUtc:iso(f.now-20000),finishedUtc:iso(f.now-10000),historicalAbsenceOfWritesProven:false,historicalGapExplicitlyAcknowledged:true,currentOperationalWriterControlConfirmed:true,databaseEnforcedGlobalWriteLock:false,readOnly:true,existingBackupIntegrityVerified:true,catalogsMatchCheckpoint:true,writersBefore:writers(f.now-19000),writersAfter:writers(f.now-11000),firstCapture:captures(f.now-18000),secondCapture:captures(f.now-15000),dataHashes:summary.hashes,comparison:{counts:summary.counts,additionalIds:summary.additionalIds,mysqlRows:summary.mysqlRows,supabaseRows:summary.supabaseRows,sharedRecordsIdentical:summary.mysqlRows,additionalRecordsPreserved:10,identitiesProfilesAndPasswordHashesEqual:true,uniqueIdsAndEmails:true,foreignKeysValid:true,allPersistedFieldsEqual:true}};
  for(const k of ['recoveryExecuted','maintenanceReleased','deltaOrchestratorExecuted','backupsGenerated','checkpointCreated','jwtRotated','dataWrites','rollbackExecuted','commitsCreated'])report[k]=false;
  const original={run:'run-ficticio',status:'INTERROMPIDA',failure:{stage:'smoke_leitura_jwt_permissoes',code:'ERR_ASSERTION'},jwtRotated:true,startupPatchApplied:true,configurationProvider:'supabase',supabaseBackendPid:101,checkpointId:e.transicao.checkpointId,t1Attempted:false,rollbackExecuted:false,createdIds:{eventos:[],custos_evento:[]},checks:['backups T0 completos e delta final aprovados'],http:[{method:'GET',route:'/perfil',status:200,write:false}]},bytes=Buffer.from(JSON.stringify(report));
  const v={relatorio:original,diario:structuredClone(original),causaConfirmada:'SMOKE_PERFIL_CAMPO_INEXISTENTE',checkpointId:e.transicao.checkpointId,checkpointSha256:report.checkpointSha256,escritoresControlados:true,controleMantidoDesdeFalha:false,processo:processProof,httpManutencao:503,reconciliacao:{bytes,aceitacao:{criterio:'EQUIVALENCIA_ATUAL',reconheceLacunaHistorica:true,aceitaRiscoResidual:true,aceitaControleOperacionalSemLockGlobal:true,referenciaAutorizacao:'autorizacao-ficticia-para-teste',aceitoEm:iso(f.now-9000),evidenciaSha256:sha(bytes),checkpointId:e.transicao.checkpointId,checkpointSha256:report.checkpointSha256,janelaId:e.transicao.id,configuracaoHash:e.transicao.configuracaoHash}},verificacaoAtual:{checkpointBytes:f.v.checkpointBytes,checkpointId:e.transicao.checkpointId,checkpointSha256:report.checkpointSha256,columns:f.v.columns,snapshot:f.v.snapshot,writersBefore:writers(f.now-7000),writersAfter:writers(f.now-4000)}};
  const {conferirEvidencias}=require('../scripts/recuperacao-supervisor.cjs'),approved=conferirEvidencias(e,f.env,v,f.now);assert.equal(approved.pidAnterior,202);assert.equal(approved.instanciaAnterior,current.instancia);assert.equal(approved.decisaoSeguranca.continuidadeHistoricaComprovada,false);
  for(const pid of [101,303]){const wrong={...v,processo:{...processProof,pid}};assert.throws(()=>conferirEvidencias(e,f.env,wrong,f.now));}
  assert.equal(f.estado.ler().transicao.fase,'INCERTA');assert.equal(f.estado.ler().transicao.pidDestino,101);
});
test('adapters de restabelecimento sao inertes ate chamadas explicitas',()=>{
  const {criarAdaptersRestabelecimento}=require('../scripts/adapters-restabelecimento-selado.cjs');const op=criarAdaptersRestabelecimento({estado:{ler(){assert.fail('estado lido');},gravar(){assert.fail('estado alterado');}},ambiente:{}});assert.equal(op.obterControlador(),undefined);
});
function bootstrapFixture(){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),f=fixture();arm(f);const channel=new EventEmitter(),sent=[];channel.pid=202;channel.connected=true;channel.env={...f.env,TROCATICKET_SUPERVISOR_IPC:'1'};channel.send=m=>sent.push(m);let factories=0,listens=0,s,ctx;
  const app={locals:{},listen(port,host,callback){assert.equal(port,3001);assert.equal(host,'127.0.0.1');listens++;callback();return new EventEmitter();}};
  const context={process:channel,require(name){
    if(name==='node:assert/strict')return assert;
    if(name==='../config/startup-controlado.cjs')return {consumirRestabelecimento:op=>{ctx=startup.consumirRestabelecimento({...op,pid:202,instalar:false});}};
    if(name==='../config/estado-supervisor.cjs')return {criarEstadoPrivado:()=>f.estado};
    if(name==='../config/identidade-supervisor.cjs')return require('../config/identidade-supervisor.cjs');
    if(name==='../server.js'){factories++;startup.validarEntrada(f.env,'principal',{estado:f.estado,contexto:ctx});s=criarSupervisor({estado:f.estado,instancia:'boot-novo',pid:202});app.locals.supervisorCutover=s;return app;}
    assert.fail('importacao inesperada');
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/iniciar-supervisor-restabelecido.cjs'),'utf8'),context);
  return {...f,channel,sent,factories:()=>factories,listens:()=>listens};
}
test('bootstrap importa guardado e nao escuta antes da ordem privada de handoff',()=>{
  const f=bootstrapFixture();assert.equal(f.factories(),0);assert.equal(f.listens(),0);f.channel.emit('message',{tipo:'restabelecimento-admitir',id:'admissao-ficticia',janela:'janela-ficticia',instancia:'boot-novo',ticket:'a'.repeat(64)});assert.equal(f.factories(),1);assert.equal(f.listens(),0);assert.equal(f.sent.at(-1).tipo,'restabelecimento-selado');const e=f.estado.ler();f.estado.gravar({...e,transicao:{...e.transicao,restabelecimento:{...e.transicao.restabelecimento,etapa:'AGUARDANDO_PORTA'}}});f.channel.emit('message',{tipo:'restabelecimento-ouvir',id:'admissao-ficticia'});assert.equal(f.listens(),1);assert.equal(f.sent.at(-1).tipo,'restabelecimento-pronto');f.channel.emit('message',{tipo:'restabelecimento-ouvir',id:'admissao-ficticia'});assert.equal(f.listens(),1);assert.equal(f.sent.at(-1).tipo,'restabelecimento-falhou');
});
test('bootstrap com ticket invalido nao importa servidor nem abre porta',()=>{
  const f=bootstrapFixture(),before=f.estado.ler();f.channel.emit('message',{tipo:'restabelecimento-admitir',id:'admissao-ficticia',janela:'janela-ficticia',instancia:'boot-novo',ticket:'b'.repeat(64)});assert.equal(f.factories(),0);assert.equal(f.listens(),0);assert.equal(f.sent.at(-1).tipo,'restabelecimento-falhou');assert.deepEqual(f.estado.ler(),before);
});
