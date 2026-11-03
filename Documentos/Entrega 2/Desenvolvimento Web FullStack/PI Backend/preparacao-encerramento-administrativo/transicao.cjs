'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function validar(e,env,v,agora=Date.now(),{processosEncerrados=false}={}){
 const t=e.transicao,r=e.controleSelado,x=t?.t1;
 assert.ok(e.congelado&&e.selado&&t?.fase==='INCERTA'&&t.ticket===null&&['ATIVO','FALHA'].includes(r?.etapa),'ADMIN_ESTADO_RECUSADO');
 assert.equal(env.DB_PROVIDER,'supabase');assert.equal(require('../config/startup-controlado.cjs').fingerprint(env),t.configuracaoHash);assert.deepEqual(e.instancias,[t.destino]);assert.equal(r.ticketControlador,null);assert.equal(r.ticketSupervisor,null);
 // Normalizacao so para conferir procedencia do registro; nao fabrica historia nem autoridade.
 require('../config/procedencia-t1-selada.cjs').conferirProcedenciaT1({...e,transicao:{...t,fase:'INICIADA'}},{destino:true});
 assert.ok(x.etapa==='CONCLUIDA'&&x.cleanupVerified===true&&x.unknownResult===false&&x.retryCount===0,'ADMIN_T1_INSEGURA');assert.equal(sha(v.journalBytes),x.journalSha256);const record={...x};delete record.journalSha256;assert.deepEqual(JSON.parse(v.journalBytes),record);
 assert.deepEqual(JSON.parse(v.stateBytes),e);assert.equal(sha(v.checkpointBytes),t.recuperacao.decisaoSeguranca.checkpointSha256);const saved=JSON.parse(v.checkpointBytes);assert.equal(saved.checkpointId,t.checkpointId);assert.equal(v.backupsVerified,true);
 const s=v.snapshot;assert.equal(s.projeto,'gnwybroqfvwosiqzsfla');for(const key of ['mysqlReadOnly','supabaseReadOnly','tlsVerificado','catalogoConferido'])assert.equal(s[key],true);
 const gate=require('../scripts/gate-reconciliacao-recuperacao.cjs');gate.conferirCapturas(s.capturas,agora-30000,agora);
 for(const [local,db] of [[v.beforeLocal,v.beforeDb],[v.afterLocal,v.afterDb]]){
  assert.equal(local.processosEncerrados,processosEncerrados);assert.equal(local.httpStatus,processosEncerrados?null:503);assert.deepEqual(local.identidades,r);
  // Reutiliza verificacao de sessoes/jobs; nao apresenta porta livre como HTTP503 real.
  const actor={...r.supervisor,portaExclusivaLocal:true,entradaConhecida:true};gate.conferirEscritores({local:{...local,httpStatus:503,knownBackend:actor},database:db},actor,agora-30000,agora);
 }
 for(const p of ['mysql','supabase'])assert.ok(Math.max(Date.parse(v.beforeLocal.capturedUtc),Date.parse(v.beforeDb.capturedUtc))<=s.capturas[p].inicio&&Math.min(Date.parse(v.afterLocal.capturedUtc),Date.parse(v.afterDb.capturedUtc))>=s.capturas[p].fim,'ADMIN_CAPTURA_FORA_CONTROLE');
 const normalized={...s,catalogos:{...s.catalogos,supabase:require('../scripts/catalogo-t1.cjs').catalogoT1(saved.checkpoint.catalogos.supabase,s.catalogos.supabase,x)}};
 const current=gate.resumo(saved.checkpoint,normalized,v.columns);assert.equal(x.beforeHash,current.hashes.supabase);assert.equal(x.afterHash,current.hashes.supabase);
 assert.ok(x.createdEventIds.every(id=>!s.supabase.eventos.some(row=>Number(row.id)===id))&&x.createdCostIds.every(id=>!s.supabase.custos_evento.some(row=>Number(row.id)===id)),'ADMIN_RESIDUO_T1');
 return {...current,stateSha256:sha(v.stateBytes),checkpointSha256:sha(v.checkpointBytes),journalSha256:sha(v.journalBytes),environmentSha256:v.environmentSha256,controller:r.controlador,supervisor:r.supervisor,verifiedAt:agora};
}
async function encerrar({estado,env,v,auth,arquivar,confirmarAusencia,adquirirExclusivo,agora=Date.now}){
 assert.ok(auth?.autorizarEncerramento===true&&auth.aceitarReconciliacaoAtual===true&&auth.reconhecerLacunaHistorica===true&&auth.reconhecerSnapshotAusente===true&&auth.referencia?.trim().length>=8,'ADMIN_NAO_AUTORIZADO');
 const soltar=await adquirirExclusivo();assert.equal(typeof soltar,'function');try{
 const e=estado.ler(),result=validar(e,env,v,agora(),{processosEncerrados:true});
 await confirmarAusencia(result.controller,result.supervisor);assert.deepEqual(estado.ler(),e,'ADMIN_ESTADO_MUDOU');
 const archive=await arquivar(v.stateBytes);assert.equal(archive.sha256,result.stateSha256);assert.ok(typeof archive.file==='string'&&archive.file.length>0);assert.deepEqual(estado.ler(),e);
 // Revalida o prazo e a ausencia imediatamente antes da unica publicacao.
 validar(e,env,v,agora(),{processosEncerrados:true});await confirmarAusencia(result.controller,result.supervisor);assert.deepEqual(estado.ler(),e);
 const next={...e,congelado:false,selado:false,instancias:[],controleSelado:{...e.controleSelado,etapa:'ENCERRADO_ADMINISTRATIVAMENTE'},transicao:{...e.transicao,fase:'CONCLUIDA'},encerramentoAdministrativo:{criterio:'RECONCILIACAO_ATUAL',faseAnterior:'INCERTA',historicoArquivado:archive.file,historicoSha256:archive.sha256,historicoDeEscritasComprovado:false,lacunaHistoricaAceita:true,snapshotAnteriorAusenteReconhecido:true,referencia:auth.referencia,concluidoEm:agora(),hashes:result.hashes}};
 estado.gravar(next);assert.deepEqual(estado.ler(),next,'ADMIN_PUBLICACAO_DIVERGENTE');return {status:'CUTOVER_ENCERRADO_ADMINISTRATIVAMENTE',backendStarted:false};
 }finally{soltar();}
}
module.exports={validar,encerrar};
