"use strict";
// Avaliacao pura: nenhum arquivo, banco, processo ou estado e alterado aqui.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {TABLES,validar,fingerprint}=require('./delta-cutover.cjs');
const {canonical}=require('./backup-postgres-isolado.cjs');
const {fingerprint:configHash}=require('../config/startup-controlado.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const TTL_RECONCILIACAO=15*60*1000,TTL_ATUAL=30000;
function instante(x){const n=Date.parse(x);assert.ok(Number.isSafeInteger(n),'RECONCILIACAO_HORARIO_INVALIDO');return n;}
function escritores(w,processo,min,max){
  assert.ok(w?.local&&w.database,'RECONCILIACAO_ESCRITORES_AUSENTES');
  for(const t of [w.local.capturedUtc,w.database.capturedUtc])assert.ok(instante(t)>=min&&instante(t)<=max,'RECONCILIACAO_ESCRITORES_EXPIRADOS');
  const l=w.local,m=w.database.mysql,p=w.database.supabase;
  assert.deepEqual(l.knownBackend,processo,'RECONCILIACAO_PROCESSO_DIVERGENTE');assert.equal(l.unknownProcessCount,0);assert.equal(l.tasks,0);assert.deepEqual(l.mysqlClientPids,[]);assert.equal(l.httpStatus,503);
  assert.ok(processo.entradaConhecida&&processo.portaExclusivaLocal);assert.equal(m?.otherClients,0);assert.equal(m.otherTransactions,0);assert.equal(m.enabledJobs,0);assert.equal(m.scheduler,'OFF');
  assert.equal(p?.activeCron,0);assert.equal(p.httpQueue,0);assert.equal(p.tlsVerified,true);assert.ok(Array.isArray(p.sessions));
  const roles=new Set(['supabase_admin','pgbouncer','authenticator','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin']);
  assert.ok(p.sessions.every(s=>roles.has(s.usename)&&s.state==='idle'&&s.transaction_open===false),'RECONCILIACAO_SESSAO_ATIVA');
}
function capturas(c,min,max){
  for(const k of ['mysql','supabase'])assert.ok(Number.isSafeInteger(c?.[k]?.inicio)&&Number.isSafeInteger(c[k].fim)&&c[k].inicio>=min&&c[k].fim>=c[k].inicio&&c[k].fim<=max,'RECONCILIACAO_CAPTURA_INVALIDA');
}
function resumo(checkpoint,atual,columns){
  const hashes={},counts={},additionalIds={};let mysqlRows=0,supabaseRows=0;
  for(const provider of ['mysql','supabase']){
    const old=validar(checkpoint[provider],columns),now=validar(atual[provider],columns);
    assert.equal(fingerprint(now),fingerprint(old),'RECONCILIACAO_DADOS_DIVERGENTES');hashes[provider]=fingerprint(now);
  }
  assert.ok(canonical(atual.catalogos)===canonical(checkpoint.catalogos),'RECONCILIACAO_CATALOGO_DIVERGENTE');
  const my=validar(atual.mysql,columns),pg=validar(atual.supabase,columns);
  for(const t of TABLES){const byId=new Map(pg[t].map(r=>[r.id,r]));for(const r of my[t])assert.ok(canonical(byId.get(r.id))===canonical(r),'RECONCILIACAO_PROVEDORES_DIVERGENTES');
    counts[t]={mysql:my[t].length,supabase:pg[t].length};mysqlRows+=my[t].length;supabaseRows+=pg[t].length;additionalIds[t]=pg[t].filter(r=>!my[t].some(m=>m.id===r.id)).map(r=>Number(r.id));
  }
  assert.equal(supabaseRows-mysqlRows,10,'RECONCILIACAO_ADICIONAIS_DIVERGENTES');
  return {hashes:{...hashes,catalogos:sha(canonical(atual.catalogos))},counts,additionalIds,mysqlRows,supabaseRows};
}
function validarReconciliacao({estado,env,v,agora=Date.now(),estadoBaseHash,processoBase}){
  assert.ok(Number.isSafeInteger(agora));const t=estado.transicao,rec=v.reconciliacao,a=rec?.aceitacao;
  assert.ok(rec&&Buffer.isBuffer(rec.bytes)&&a,'RECONCILIACAO_EVIDENCIA_AUSENTE');
  const evidenceHash=sha(rec.bytes);assert.equal(a.evidenciaSha256,evidenceHash,'RECONCILIACAO_ARQUIVO_ALTERADO');
  const r=JSON.parse(rec.bytes.toString('utf8'));
  assert.equal(r.schemaVersion,2,'RECONCILIACAO_SCHEMA_INSUFICIENTE');assert.equal(r.status,'RECONCILIACAO_ATUAL_APROVADA');
  assert.equal(a.criterio,'EQUIVALENCIA_ATUAL');assert.equal(a.reconheceLacunaHistorica,true);assert.equal(a.aceitaRiscoResidual,true);assert.equal(a.aceitaControleOperacionalSemLockGlobal,true);
  assert.ok(typeof a.referenciaAutorizacao==='string'&&a.referenciaAutorizacao.trim().length>=8,'RECONCILIACAO_ACEITACAO_AUSENTE');
  assert.equal(r.historicalAbsenceOfWritesProven,false);assert.equal(r.historicalGapExplicitlyAcknowledged,true);assert.equal(r.currentOperationalWriterControlConfirmed,true);assert.equal(r.databaseEnforcedGlobalWriteLock,false);
  for(const key of ['recoveryExecuted','maintenanceReleased','deltaOrchestratorExecuted','backupsGenerated','checkpointCreated','jwtRotated','dataWrites','rollbackExecuted','commitsCreated'])assert.equal(r[key],false,'RECONCILIACAO_EFEITO_NAO_PERMITIDO');
  assert.equal(r.readOnly,true);assert.equal(r.existingBackupIntegrityVerified,true);assert.equal(r.catalogsMatchCheckpoint,true);
  assert.equal(r.checkpointId,t.checkpointId);assert.equal(r.checkpointSha256,v.checkpointSha256);assert.equal(a.checkpointId,t.checkpointId);assert.equal(a.checkpointSha256,v.checkpointSha256);
  assert.equal(r.janelaId,t.id);assert.equal(a.janelaId,t.id);assert.equal(r.run,v.relatorio.run);
  assert.equal(r.configuracaoHash,configHash(env));assert.equal(r.configuracaoHash,t.configuracaoHash);assert.equal(a.configuracaoHash,t.configuracaoHash);
  assert.equal(r.estadoSha256,estadoBaseHash||sha(JSON.stringify(estado)),'RECONCILIACAO_ESTADO_DIVERGENTE');
  const start=instante(r.startedUtc),end=instante(r.finishedUtc);assert.ok(start<=end&&end<=agora&&agora-start<=TTL_RECONCILIACAO,'RECONCILIACAO_EXPIRADA');
  const accepted=instante(a.aceitoEm);assert.ok(accepted>=end&&accepted<=agora,'RECONCILIACAO_ACEITACAO_INVALIDA');
  const original=processoBase||v.processo;escritores(r.writersBefore,original,start,end);escritores(r.writersAfter,original,start,end);
  capturas(r.firstCapture,start,end);capturas(r.secondCapture,start,end);
  assert.ok(r.firstCapture.supabase.fim<=r.secondCapture.mysql.inicio,'RECONCILIACAO_CAPTURAS_FORA_ORDEM');
  assert.ok(Math.max(instante(r.writersBefore.local.capturedUtc),instante(r.writersBefore.database.capturedUtc))<=Math.min(r.firstCapture.mysql.inicio,r.firstCapture.supabase.inicio)&&Math.min(instante(r.writersAfter.local.capturedUtc),instante(r.writersAfter.database.capturedUtc))>=Math.max(r.secondCapture.mysql.fim,r.secondCapture.supabase.fim),'RECONCILIACAO_ESCRITORES_FORA_JANELA');
  const atual=v.verificacaoAtual;assert.ok(Buffer.isBuffer(atual?.checkpointBytes)&&atual.snapshot&&atual.columns,'RECONCILIACAO_VERIFICACAO_ATUAL_AUSENTE');
  assert.equal(atual.checkpointId,t.checkpointId);assert.equal(atual.checkpointSha256,v.checkpointSha256);
  assert.equal(sha(atual.checkpointBytes),v.checkpointSha256,'RECONCILIACAO_CHECKPOINT_ALTERADO');const saved=JSON.parse(atual.checkpointBytes.toString('utf8'));assert.equal(saved.checkpointId,t.checkpointId);
  assert.equal(atual.snapshot.projeto,'gnwybroqfvwosiqzsfla');assert.equal(atual.snapshot.mysqlReadOnly,true);assert.equal(atual.snapshot.supabaseReadOnly,true);assert.equal(atual.snapshot.tlsVerificado,true);assert.equal(atual.snapshot.catalogoConferido,true);
  escritores(atual.writersBefore,v.processo,agora-TTL_ATUAL,agora);escritores(atual.writersAfter,v.processo,agora-TTL_ATUAL,agora);capturas(atual.snapshot.capturas,agora-TTL_ATUAL,agora);
  for(const k of ['mysql','supabase'])assert.ok(Math.max(instante(atual.writersBefore.local.capturedUtc),instante(atual.writersBefore.database.capturedUtc))<=atual.snapshot.capturas[k].inicio&&Math.min(instante(atual.writersAfter.local.capturedUtc),instante(atual.writersAfter.database.capturedUtc))>=atual.snapshot.capturas[k].fim,'RECONCILIACAO_ESCRITORES_FORA_JANELA');
  const s=resumo(saved.checkpoint,atual.snapshot,atual.columns);
  assert.deepEqual(r.dataHashes,s.hashes,'RECONCILIACAO_CONTEUDO_NAO_COMPROVADO');assert.deepEqual(r.comparison.counts,s.counts);assert.deepEqual(r.comparison.additionalIds,s.additionalIds);
  assert.equal(r.comparison.mysqlRows,s.mysqlRows);assert.equal(r.comparison.supabaseRows,s.supabaseRows);assert.equal(r.comparison.sharedRecordsIdentical,s.mysqlRows);assert.equal(r.comparison.additionalRecordsPreserved,10);
  for(const key of ['identitiesProfilesAndPasswordHashesEqual','uniqueIdsAndEmails','foreignKeysValid','allPersistedFieldsEqual'])assert.equal(r.comparison[key],true);
  return {criterio:'RECONCILIACAO_ATUAL',continuidadeHistoricaComprovada:false,lacunaHistoricaReconhecida:true,riscoResidualAceito:true,controleOperacionalSemLockGlobalAceito:true,evidenciaSha256:evidenceHash,checkpointId:t.checkpointId,checkpointSha256:v.checkpointSha256,referenciaAutorizacao:a.referenciaAutorizacao,aceitoEm:a.aceitoEm};
}
module.exports={validarReconciliacao,resumo,TTL_RECONCILIACAO,TTL_ATUAL};
