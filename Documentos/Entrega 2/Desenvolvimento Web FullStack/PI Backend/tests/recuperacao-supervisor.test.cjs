"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {criarRecuperacao}=require('../scripts/recuperacao-supervisor.cjs'),startup=require('../config/startup-controlado.cjs'),{criarSupervisor}=require('../config/supervisor-cutover.cjs');
const crypto=require('node:crypto');
const {resumo}=require('../scripts/gate-reconciliacao-recuperacao.cjs');
const {conferirEvidencias}=require('../scripts/recuperacao-supervisor.cjs');
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function fixture(){
  const env={DB_PROVIDER:'supabase',SUPABASE_URL:'https://gnwybroqfvwosiqzsfla.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_ficticia_recuperacao',JWT_SECRET:'jwt-ficticio-recuperacao-'+ 'a'.repeat(40),HOMOLOG_JWT_SECRET:'homolog-ficticio-'+ 'b'.repeat(40)};
  let data={versao:1,congelado:true,selado:true,instancias:['boot-anterior'],transicao:{id:'janela-ficticia',fase:'INCERTA',destino:'boot-anterior',pidDestino:101,ticket:null,checkpointId:'checkpoint-ficticio',configuracaoHash:startup.fingerprint(env)}};
  const estado={ler:()=>structuredClone(data),gravar:e=>{data=structuredClone(e);}};
  const r={run:'run-ficticio',status:'INTERROMPIDA',failure:{stage:'smoke_leitura_jwt_permissoes',code:'ERR_ASSERTION'},jwtRotated:true,startupPatchApplied:true,configurationProvider:'supabase',supabaseBackendPid:101,checkpointId:'checkpoint-ficticio',t1Attempted:false,rollbackExecuted:false,createdIds:{eventos:[],custos_evento:[]},checks:['backups T0 completos e delta final aprovados'],http:[{method:'GET',route:'/perfil',status:200,write:false}]};
  const v={relatorio:r,diario:structuredClone(r),causaConfirmada:'SMOKE_PERFIL_CAMPO_INEXISTENTE',checkpointId:r.checkpointId,checkpointSha256:'c'.repeat(64),escritoresControlados:true,controleMantidoDesdeFalha:true,httpManutencao:503,processo:{pid:101,parentPid:100,criadoEm:'2026-10-31T00:00:00Z',entradaConhecida:true,portaExclusivaLocal:true}};
  let target,stop=0,launch=0,locked=false;const hooks={
    adquirirExclusivo(){assert.equal(locked,false,'TRAVA_OCUPADA');locked=true;return ()=>{locked=false;};},
    estado,ambiente:env,inspecionar:async()=>structuredClone(v),
    encerrarConhecido:async proof=>{assert.deepEqual(proof,v.processo);stop++;return {pid:101,encerrado:true,portaLivre:true};},
    lancarSelado:async proof=>{
      launch++;const e=estado.ler();assert.equal(e.transicao.id,proof.janela);assert.equal(e.transicao.configuracaoHash,proof.configuracaoHash);
      estado.gravar({...e,transicao:{...e.transicao,fase:'PREPARADA',pidDestino:202,destino:'boot-novo',ticket:'ticket-ficticio-uso-unico'}});
      startup.consumirEntrada({estado,env,instancia:'boot-novo',ticket:'ticket-ficticio-uso-unico',pid:202});target=criarSupervisor({estado,instancia:'boot-novo',pid:202});return {pid:202,instancia:'boot-novo'};
    },consultar:async()=>target.status(),abrirLeitura:async janela=>target.abrirLeitura(janela)
  };
  const api=()=>criarRecuperacao(hooks);
  return {env,estado,v,hooks,api,target:()=>target,counts:()=>({stop,launch})};
}
function request(supervisor,method,path){const res=new EventEmitter();res.statusCode=200;res.setHeader=()=>{};res.status=n=>{res.statusCode=n;return res;};res.json=()=>res;let admitted=false;supervisor.middleware({method,path},res,()=>{admitted=true;});res.emit('finish');return {status:res.statusCode,admitted};}
test('planejamento inerte e autorizacao obrigatoria antes de qualquer alteracao',async()=>{
  const f=fixture(),a=f.api(),before=f.estado.ler(),p=await a.planejar();assert.equal(p.pidAnterior,101);assert.deepEqual(f.estado.ler(),before);
  await assert.rejects(a.recuperar(p),/NAO_AUTORIZADA/);assert.deepEqual(f.counts(),{stop:0,launch:0});assert.deepEqual(f.estado.ler(),before);
});
test('recuperacao selada preserva JWT checkpoint e janela e repeticao e idempotente',async()=>{
  const f=fixture(),a=f.api(),env=structuredClone(f.env),p=await a.planejar();assert.equal((await a.recuperar(p,{autorizar:true})).status,'PRONTA_SMOKE');
  assert.equal(request(f.target(),'GET','/perfil').status,503);assert.equal(request(f.target(),'POST','/login').status,503);assert.equal(request(f.target(),'POST','/eventos').status,503);
  assert.deepEqual(f.env,env);assert.equal(f.estado.ler().transicao.checkpointId,p.checkpointId);assert.equal(f.estado.ler().transicao.id,'janela-ficticia');
  assert.equal((await a.recuperar(p,{autorizar:true})).reutilizada,true);assert.deepEqual(f.counts(),{stop:1,launch:1});
});
test('retomada autorizada do smoke admite leituras e login e conserva bloqueio de escritas',async()=>{
  const f=fixture(),a=f.api(),p=await a.planejar();await a.recuperar(p,{autorizar:true});await assert.rejects(a.abrirSmoke(p),/NAO_AUTORIZADO/);
  assert.deepEqual(await a.abrirSmoke(p,{autorizar:true}),{status:'SOMENTE_LEITURA',escritasLiberadas:false});
  assert.equal(request(f.target(),'GET','/perfil').admitted,true);assert.equal(request(f.target(),'POST','/login').admitted,true);assert.equal(request(f.target(),'POST','/eventos').status,503);
  await assert.rejects(f.target().executarPersistencia(async()=>assert.fail('escrita executada')),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});
});
test('T1 incerteza HTTP e identidades divergentes sao recusados sem encerrar processos',async()=>{
  const mutations=[f=>{f.v.relatorio.t1Attempted=true;},f=>{f.v.diario.http[0].status='ENVIANDO';},f=>{f.v.processo.pid=999;},f=>{f.v.escritoresControlados=false;},f=>{f.v.checkpointId='outro';},f=>{f.env.JWT_SECRET+='alterado';},f=>{f.v.causaConfirmada='DESCONHECIDA';}];
  for(const mutate of mutations){const f=fixture();mutate(f);await assert.rejects(f.api().planejar());assert.deepEqual(f.counts(),{stop:0,launch:0});assert.equal(f.estado.ler().transicao.fase,'INCERTA');}
});
test('plano obsoleto e recusado antes de modificar o estado',async()=>{
  const f=fixture(),a=f.api(),p=await a.planejar();f.v.processo.criadoEm='outro-processo';const before=f.estado.ler();await assert.rejects(a.recuperar(p,{autorizar:true}),/PLANO_OBSOLETO/);assert.deepEqual(f.counts(),{stop:0,launch:0});assert.deepEqual(f.estado.ler(),before);
});
test('falha durante admissao conserva INCERTA e nao repete encerramento nem boot',async()=>{
  const f=fixture();f.hooks.lancarSelado=async()=>{throw Error('TIMEOUT_FICTICIO');};const a=f.api(),p=await a.planejar();await assert.rejects(a.recuperar(p,{autorizar:true}),/TIMEOUT_FICTICIO/);
  assert.equal(f.estado.ler().transicao.fase,'INCERTA');assert.equal(f.estado.ler().selado,true);await assert.rejects(a.recuperar(p,{autorizar:true}),/SEM_RETRY/);assert.equal(f.counts().stop,1);
});
test('incerteza de persistencia no novo boot impede reabertura',async()=>{
  const f=fixture();f.hooks.consultar=async()=>({...f.target().status(),resultadosIncertos:1});const a=f.api(),p=await a.planejar();await assert.rejects(a.recuperar(p,{autorizar:true}),/DRENAGEM_PENDENTE/);assert.equal(f.estado.ler().transicao.fase,'INCERTA');assert.equal(f.estado.ler().selado,true);assert.equal(request(f.target(),'GET','/perfil').status,503);
});
test('adapters locais permanecem inertes e exigem confirmacao de controle e continuidade',async()=>{
  const {criarAdaptersLocais}=require('../scripts/adapters-recuperacao-local.cjs');
  const estado={ler(){assert.fail('estado real lido');},gravar(){assert.fail('estado real alterado');}};
  const op={estado,ambiente:{},relatorioFile:'NAO_EXISTE'};
  const a=criarAdaptersLocais(op);assert.equal(a.obterControlador(),undefined);await assert.rejects(a.inspecionar(),/JANELA_NAO_CONFIRMADA/);
  const b=criarAdaptersLocais({...op,confirmarJanelaExclusiva:true});await assert.rejects(b.inspecionar(),/CONTINUIDADE_NAO_CONFIRMADA/);
});
test('falha ao abrir leitura devolve INCERTA e selagem persistente sem liberar escrita',async()=>{
  const f=fixture();f.hooks.abrirLeitura=async()=>{throw Error('IPC_FICTICIO_FALHOU');};const a=f.api(),p=await a.planejar();await a.recuperar(p,{autorizar:true});await assert.rejects(a.abrirSmoke(p,{autorizar:true}),/IPC_FICTICIO_FALHOU/);assert.equal(f.estado.ler().selado,true);assert.equal(f.estado.ler().transicao.fase,'INCERTA');assert.equal(request(f.target(),'GET','/perfil').status,503);
});
test('dois controladores concorrentes nao repetem o encerramento ou boot',async()=>{
  const f=fixture(),a=f.api(),b=f.api(),p=await a.planejar(),pausar=f.hooks.encerrarConhecido;let release,entered;
  const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
  f.hooks.encerrarConhecido=async proof=>{entered();await gate;return pausar(proof);};
  // Criar depois do hook para capturar o adapter lento.
  const c=f.api(),running=c.recuperar(p,{autorizar:true});await started;
  await assert.rejects(b.recuperar(p,{autorizar:true}),/TRAVA_OCUPADA/);release();await running;
  assert.deepEqual(f.counts(),{stop:1,launch:1});
});

function formal(){
  const f=fixture(),now=Date.UTC(2026,9,31,18);f.hooks.agora=()=>now;f.v.controleMantidoDesdeFalha=false;
  const mysql={usuarios:[{id:'1',email:'ficticio@example.invalid',perfil:'admin',senha:'hash-ficticio'}],eventos:[{id:'1',usuario_id:'1',nome:'Evento ficticio'}],custos_evento:[{id:'1',evento_id:'1',valor_estimado:'1.00'}],cotacoes:[{id:'1',evento_id:'1'}],itens_cotacao:[{id:'1',cotacao_id:'1'}],propostas:[{id:'1',cotacao_id:'1',fornecedor_id:'1'}],inscricoes:[{id:'1',usuario_id:'1',evento_id:'1'}],solicitacoes_acesso:[{id:'1',usuario_id:'1'}]};
  const supabase=structuredClone(mysql);for(let id=2;id<=11;id++)supabase.eventos.push({id:String(id),usuario_id:'1',nome:'Adicional ficticio '+id});
  const columns=Object.fromEntries(Object.entries(mysql).map(([t,rows])=>[t,Object.keys(rows[0])])),catalogos={mysql:{schema:'ficticio'},supabase:{schema:'ficticio'}};
  const checkpoint={mysql,supabase,catalogos},checkpointBytes=Buffer.from(JSON.stringify({checkpointId:f.v.checkpointId,checkpoint}));f.v.checkpointSha256=digest(checkpointBytes);
  const iso=n=>new Date(n).toISOString();
  function writers(time,processo=f.v.processo){return {local:{capturedUtc:iso(time),knownBackend:structuredClone(processo),unknownProcessCount:0,tasks:0,mysqlClientPids:[],httpStatus:503},database:{capturedUtc:iso(time),mysql:{otherClients:0,otherTransactions:0,enabledJobs:0,scheduler:'OFF'},supabase:{sessions:[{usename:'authenticator',state:'idle',transaction_open:false}],activeCron:0,httpQueue:0,tlsVerified:true}}};}
  function captures(time){return {mysql:{inicio:time,fim:time+100},supabase:{inicio:time+101,fim:time+200}};}
  const snapshot={...structuredClone(checkpoint),projeto:'gnwybroqfvwosiqzsfla',mysqlReadOnly:true,supabaseReadOnly:true,tlsVerificado:true,catalogoConferido:true,capturas:captures(now-6000)};
  const summary=resumo(checkpoint,snapshot,columns),t=f.estado.ler().transicao;
  const r={schemaVersion:2,status:'RECONCILIACAO_ATUAL_APROVADA',run:f.v.relatorio.run,janelaId:t.id,configuracaoHash:t.configuracaoHash,estadoSha256:digest(JSON.stringify(f.estado.ler())),checkpointId:t.checkpointId,checkpointSha256:f.v.checkpointSha256,startedUtc:iso(now-60000),finishedUtc:iso(now-40000),historicalAbsenceOfWritesProven:false,historicalGapExplicitlyAcknowledged:true,currentOperationalWriterControlConfirmed:true,databaseEnforcedGlobalWriteLock:false,readOnly:true,existingBackupIntegrityVerified:true,catalogsMatchCheckpoint:true,writersBefore:writers(now-59000),writersAfter:writers(now-41000),firstCapture:captures(now-55000),secondCapture:captures(now-50000),dataHashes:summary.hashes,comparison:{counts:summary.counts,additionalIds:summary.additionalIds,mysqlRows:summary.mysqlRows,supabaseRows:summary.supabaseRows,sharedRecordsIdentical:summary.mysqlRows,additionalRecordsPreserved:10,identitiesProfilesAndPasswordHashesEqual:true,uniqueIdsAndEmails:true,foreignKeysValid:true,allPersistedFieldsEqual:true}};
  for(const key of ['recoveryExecuted','maintenanceReleased','deltaOrchestratorExecuted','backupsGenerated','checkpointCreated','jwtRotated','dataWrites','rollbackExecuted','commitsCreated'])r[key]=false;
  f.v.reconciliacao={bytes:Buffer.from(JSON.stringify(r)),aceitacao:{criterio:'EQUIVALENCIA_ATUAL',reconheceLacunaHistorica:true,aceitaRiscoResidual:true,aceitaControleOperacionalSemLockGlobal:true,referenciaAutorizacao:'autorizacao-ficticia-para-testes',aceitoEm:iso(now-30000),checkpointId:t.checkpointId,checkpointSha256:f.v.checkpointSha256,janelaId:t.id,configuracaoHash:t.configuracaoHash}};
  f.v.verificacaoAtual={checkpointBytes,checkpointId:t.checkpointId,checkpointSha256:f.v.checkpointSha256,columns,snapshot,writersBefore:writers(now-7000),writersAfter:writers(now-4000)};
  function seal(){f.v.reconciliacao.bytes=Buffer.from(JSON.stringify(r));f.v.reconciliacao.aceitacao.evidenciaSha256=digest(f.v.reconciliacao.bytes);}
  seal();
  f.hooks.inspecionar=async()=>{
    const e=f.estado.ler();if(e.transicao.pidDestino!==101){f.v.processo={...f.v.processo,pid:e.transicao.pidDestino,criadoEm:'2026-10-31T18:00:00Z'};f.v.verificacaoAtual.writersBefore=writers(now-7000);f.v.verificacaoAtual.writersAfter=writers(now-4000);}
    return f.v;
  };
  return {...f,now,r,seal,verify:()=>conferirEvidencias(f.estado.ler(),f.env,f.v,now)};
}
test('gate formal aceita equivalencia completa e conserva historico nao comprovado',()=>{
  const f=formal(),before=f.estado.ler(),p=f.verify();assert.equal(p.decisaoSeguranca.criterio,'RECONCILIACAO_ATUAL');assert.equal(p.decisaoSeguranca.continuidadeHistoricaComprovada,false);assert.equal(p.decisaoSeguranca.lacunaHistoricaReconhecida,true);assert.equal(p.decisaoSeguranca.riscoResidualAceito,true);assert.deepEqual(f.estado.ler(),before);assert.deepEqual(f.counts(),{stop:0,launch:0});
});
const rejectedFormal=[
  ['sem evidencia e sem continuidade',f=>{delete f.v.reconciliacao;}],
  ['aceitacao ausente',f=>{delete f.v.reconciliacao.aceitacao;}],
  ['risco residual nao aceito',f=>{f.v.reconciliacao.aceitacao.aceitaRiscoResidual=false;}],
  ['lacuna nao reconhecida',f=>{f.v.reconciliacao.aceitacao.reconheceLacunaHistorica=false;}],
  ['evidencia adulterada',f=>{f.v.reconciliacao.bytes=Buffer.from('{}');}],
  ['schema antigo sem vinculacoes',f=>{delete f.r.schemaVersion;f.seal();}],
  ['apenas contagens sem hashes',f=>{delete f.r.dataHashes;f.seal();}],
  ['historico falsamente comprovado',f=>{f.r.historicalAbsenceOfWritesProven=true;f.seal();}],
  ['reconciliacao expirada',f=>{f.r.startedUtc='2026-10-31T16:00:00Z';f.seal();}],
  ['reconciliacao futura',f=>{f.r.finishedUtc='2026-10-31T19:00:00Z';f.seal();}],
  ['checkpoint diferente',f=>{f.r.checkpointId='outro';f.seal();}],
  ['janela diferente',f=>{f.r.janelaId='outra';f.seal();}],
  ['JWT diferente',f=>{f.env.JWT_SECRET+='alterado';}],
  ['estado diferente',f=>{f.r.estadoSha256='f'.repeat(64);f.seal();}],
  ['controle exclusivo ausente',f=>{f.r.currentOperationalWriterControlConfirmed=false;f.seal();}],
  ['processo desconhecido',f=>{f.v.verificacaoAtual.writersAfter.local.unknownProcessCount=1;}],
  ['job ativo',f=>{f.v.verificacaoAtual.writersBefore.database.mysql.enabledJobs=1;}],
  ['sessao REST ativa',f=>{f.v.verificacaoAtual.writersAfter.database.supabase.sessions[0].state='active';}],
  ['transacao aberta',f=>{f.v.verificacaoAtual.writersBefore.database.supabase.sessions[0].transaction_open=true;}],
  ['observacao de escritores expirada',f=>{f.v.verificacaoAtual.writersBefore.local.capturedUtc='2026-10-31T17:00:00Z';}],
  ['observacao local depois da captura',f=>{f.v.verificacaoAtual.writersBefore.local.capturedUtc=new Date(f.now-1000).toISOString();}],
  ['observacao formal depois da captura',f=>{f.r.writersBefore.local.capturedUtc=f.r.finishedUtc;f.seal();}],
  ['verificacao atual ausente',f=>{delete f.v.verificacaoAtual;}],
  ['captura atual expirada',f=>{f.v.verificacaoAtual.snapshot.capturas.mysql.inicio=f.now-60000;}],
  ['consulta nao declarada read only',f=>{f.v.verificacaoAtual.snapshot.mysqlReadOnly=false;}],
  ['TLS nao comprovado',f=>{f.v.verificacaoAtual.snapshot.tlsVerificado=false;}],
  ['conteudo alterado com contagem igual',f=>{f.v.verificacaoAtual.snapshot.mysql.eventos[0].nome='Outro nome';}],
  ['relacionamento invalido',f=>{f.v.verificacaoAtual.snapshot.supabase.eventos[0].usuario_id='999';}],
  ['adicional alterado',f=>{f.v.verificacaoAtual.snapshot.supabase.eventos[1].nome='Alterado';}],
  ['catalogo alterado',f=>{f.v.verificacaoAtual.snapshot.catalogos.mysql.schema='alterado';}],
  ['bytes do checkpoint alterados',f=>{f.v.verificacaoAtual.checkpointBytes=Buffer.from('{}');}],
  ['T1 mesmo com reconciliacao valida',f=>{f.v.relatorio.t1Attempted=true;}],
  ['resultado HTTP incerto',f=>{f.v.diario.http[0].status='ENVIANDO';}]
];
for(const [name,mutate] of rejectedFormal)test('gate formal rejeita '+name,()=>{const f=formal(),before=f.estado.ler();mutate(f);assert.throws(f.verify);assert.deepEqual(f.estado.ler(),before);assert.deepEqual(f.counts(),{stop:0,launch:0});});
test('alteracao posterior ao plano bloqueia recuperacao sem encerrar processo',async()=>{
  const f=formal(),a=f.api(),p=await a.planejar();f.v.verificacaoAtual.snapshot.supabase.eventos[0].nome='Mudou depois';await assert.rejects(a.recuperar(p,{autorizar:true}),/DADOS_DIVERGENTES/);assert.deepEqual(f.counts(),{stop:0,launch:0});assert.equal(f.estado.ler().selado,true);
});
test('gate formal simulado registra aceitacao preserva 503 e idempotencia',async()=>{
  const f=formal(),a=f.api(),p=await a.planejar();await a.recuperar(p,{autorizar:true});const rec=f.estado.ler().transicao.recuperacao;assert.equal(rec.decisaoSeguranca.continuidadeHistoricaComprovada,false);assert.equal(rec.decisaoSeguranca.riscoResidualAceito,true);assert.equal(request(f.target(),'GET','/perfil').status,503);assert.equal((await a.recuperar(p,{autorizar:true})).reutilizada,true);assert.deepEqual(f.counts(),{stop:1,launch:1});
});
test('mudanca depois do boot impede abertura do smoke e conserva 503',async()=>{
  const f=formal(),a=f.api(),p=await a.planejar();await a.recuperar(p,{autorizar:true});f.v.verificacaoAtual.snapshot.mysql.eventos[0].nome='Mudou antes do smoke';await assert.rejects(a.abrirSmoke(p,{autorizar:true}),/DADOS_DIVERGENTES/);assert.equal(request(f.target(),'GET','/perfil').status,503);assert.equal(f.estado.ler().congelado,true);
});
test('adapter formal integra leituras atuais sem afirmar continuidade historica',async()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),f=formal();
  const old={...f.v.relatorio,journalDirectory:'/ficticio/journal',t0Directory:'/ficticio/t0'};
  const files=new Map([['/ficticio/report.json',Buffer.from(JSON.stringify(old))],[path.join(old.journalDirectory,'janela-relatorio.json'),Buffer.from(JSON.stringify(f.v.diario))],[path.join(old.t0Directory,'checkpoint-t0.privado.json'),f.v.verificacaoAtual.checkpointBytes],['/ficticio/reconciliacao.json',f.v.reconciliacao.bytes]]);
  let dbReads=0,collections=0,localReads=0,helperCalls=0;
  const code=fs.readFileSync(path.join(__dirname,'../scripts/adapters-recuperacao-local.cjs'),'utf8');
  const context={module:{exports:{}},Buffer,structuredClone,process:{pid:12345},AbortSignal,Date:class extends Date{constructor(...args){super(...(args.length?args:[f.now-(localReads++===0?8000:3000)]));}},fetch:async()=>({status:503,arrayBuffer:async()=>new ArrayBuffer(0)}),require(name){
    if(name==='node:fs')return {readFileSync(file,encoding){assert.ok(files.has(file),'arquivo ficticio desconhecido');const b=files.get(file);return encoding?b.toString('utf8'):b;}};
    if(name==='./helper-powershell.cjs')return {executarHelper:async name=>{helperCalls++;return Buffer.from(JSON.stringify(name==='processo-recuperacao.ps1'?f.v.processo:{processes:[{pid:101,category:'BACKEND_POSSIVEL'},{pid:100,category:'BACKEND_POSSIVEL'}],tasks:[],listeners:[{pid:101,port:3001}],mysqlClients:[]}));}};
    if(name==='./lancador-planejado.cjs')return {criarLancadorPlanejado(){assert.fail('processo iniciado');}};
    if(name==='../config/controlador-supervisor.cjs')return {criarControlador(){assert.fail('IPC real criado');}};
    if(name==='./inspecao-escritores-readonly.cjs')return {conferirEscritoresBanco:async()=>structuredClone((dbReads++===0?f.v.verificacaoAtual.writersBefore:f.v.verificacaoAtual.writersAfter).database)};
    if(name==='./coletar-delta-readonly.cjs')return {criarColetorReadOnly(env,cols){assert.equal(env,f.env);assert.deepEqual(JSON.parse(JSON.stringify(cols)),f.v.verificacaoAtual.columns);return async op=>{assert.equal(op.somenteLeitura,true);collections++;return structuredClone(f.v.verificacaoAtual.snapshot);};}};
    if(name==='./delta-cutover.cjs')return require('../scripts/delta-cutover.cjs');
    if(name==='../config/identidade-supervisor.cjs')return require('../config/identidade-supervisor.cjs');
    if(name.startsWith('node:'))return require(name);assert.fail('importacao inesperada');
  }};
  vm.runInNewContext(code,context);
  const adapter=context.module.exports.criarAdaptersLocais({estado:f.estado,ambiente:f.env,relatorioFile:'/ficticio/report.json',confirmarJanelaExclusiva:true,reconciliacaoFile:'/ficticio/reconciliacao.json',aceitacaoReconciliacao:f.v.reconciliacao.aceitacao});
  const raw=await adapter.inspecionar(),v=structuredClone(raw);v.reconciliacao.bytes=Buffer.from(raw.reconciliacao.bytes);v.verificacaoAtual.checkpointBytes=Buffer.from(raw.verificacaoAtual.checkpointBytes);assert.equal(v.controleMantidoDesdeFalha,false);assert.equal(conferirEvidencias(f.estado.ler(),f.env,v,f.now).decisaoSeguranca.continuidadeHistoricaComprovada,false);assert.equal(dbReads,2);assert.equal(collections,1);assert.equal(helperCalls,4);assert.deepEqual(f.counts(),{stop:0,launch:0});
});
test('adapter formal nao recorre a continuidade declarada quando falta aceite',async()=>{
  const {criarAdaptersLocais}=require('../scripts/adapters-recuperacao-local.cjs');const a=criarAdaptersLocais({estado:{ler(){assert.fail();}},ambiente:{},relatorioFile:'ficticio',confirmarJanelaExclusiva:true,confirmarContinuidadeSemEscritas:true,reconciliacaoFile:'ficticio'});await assert.rejects(a.inspecionar(),/ACEITACAO_RECONCILIACAO_AUSENTE/);
});
