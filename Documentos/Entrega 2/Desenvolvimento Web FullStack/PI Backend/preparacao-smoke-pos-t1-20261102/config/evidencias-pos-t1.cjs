'use strict';
// Validacao pura compartilhada: nunca emite capacidade T1 nem altera o diario.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),hash=x=>sha(JSON.stringify(x));
function conferirT1Concluida({estado:e,snapshot:s,current,t1JournalBytes,agora=Date.now()}){
  const t=e.transicao,x=t?.t1;
  assert.ok(Buffer.isBuffer(t1JournalBytes),'POS_T1_DIARIO_AUSENTE');
  const stateRecord={...x};delete stateRecord.journalSha256;
  assert.equal(sha(t1JournalBytes),x?.journalSha256,'POS_T1_DIARIO_ALTERADO');
  assert.deepEqual(JSON.parse(t1JournalBytes),stateRecord);
  assert.ok(x?.etapa==='CONCLUIDA'&&x.cleanupVerified===true&&x.unknownResult===false&&typeof x.run==='string','POS_T1_NAO_CONCLUIDA');
  assert.equal(x.marker,'TT-T1-'+x.run);assert.equal(x.checkpointId,t.checkpointId);assert.equal(x.configuracaoHash,t.configuracaoHash);
  assert.equal(x.pid,t.pidDestino);assert.equal(x.instancia,t.destino);
  assert.equal(x.afterHash,current.hashes.supabase);assert.equal(x.beforeHash,current.hashes.supabase);
  assert.ok(Array.isArray(x.createdEventIds)&&x.createdEventIds.length===1&&Array.isArray(x.createdCostIds)&&x.createdCostIds.length===1);
  assert.ok(x.createdEventIds.every(id=>Number.isSafeInteger(id)&&id>0&&!s.supabase.eventos.some(row=>Number(row.id)===id))&&x.createdCostIds.every(id=>Number.isSafeInteger(id)&&id>0&&!s.supabase.custos_evento.some(row=>Number(row.id)===id)));
  assert.equal(x.retryCount,0);assert.ok(x.autorizacao?.length>=8);
  assert.ok(Number.isSafeInteger(x.terminadoEm)&&x.terminadoEm<=agora,'POS_T1_CONCLUSAO_INVALIDA');
  assert.equal(x.additional10RowsPreserved,true);
  const eventId=x.createdEventIds[0],costId=x.createdCostIds[0];
  assert.deepEqual(x.operacoes.map(q=>[q.method,q.route,q.status]),[['POST','/eventos',201],['PUT','/eventos/'+eventId+'/custos',200],['SQL','LIMPEZA_IDS',200]]);
  assert.equal(new Set(x.operacoes.map(q=>q.id)).size,3);assert.equal(x.verificacoes.length,3);
  for(let i=0;i<3;i++){
    const proof=x.verificacoes[i];assert.equal(proof.baseHash,current.hashes.supabase);assert.equal(proof.mysqlHash,current.hashes.mysql);
    assert.equal(proof.eventosNovos.length,i===2?0:1);assert.equal(proof.custosNovos.length,i===1?1:0);
    for(const ev of proof.eventosNovos){assert.equal(ev.id,eventId);assert.equal(ev.usuario_id,x.organizadorId);assert.equal(ev.nome,x.marker);assert.equal(ev.descricao,x.marker);}
    for(const cost of proof.custosNovos){assert.equal(cost.id,costId);assert.equal(cost.evento_id,eventId);assert.equal(cost.descricao,x.marker);assert.equal(Number(cost.valor_estimado),0.1);}
  }
  return {run:x.run,journalSha256:x.journalSha256,dataHashes:current.hashes};
}
function validarEvidenciasPosT1({estado:e,ambiente,v,agora=Date.now()}){
  const t=e.transicao,d=t?.recuperacao?.decisaoSeguranca;
  assert.ok(e.congelado&&e.selado&&t?.fase==='INICIADA'&&t.ticket===null&&t.recuperacao?.etapa==='PRONTA_SMOKE');
  assert.deepEqual(e.instancias,[t.destino]);assert.equal(require('./startup-controlado.cjs').fingerprint(ambiente),t.configuracaoHash);
  const c=require('./continuidade-controlador.cjs').validarContinuidadeControlador(v.controle,e,agora);
  assert.ok(d?.criterio==='RECONCILIACAO_ATUAL'&&d.continuidadeHistoricaComprovada===false&&d.lacunaHistoricaReconhecida&&d.riscoResidualAceito&&d.controleOperacionalSemLockGlobalAceito);
  assert.ok(d.referenciaAutorizacao?.length>=8);assert.equal(d.checkpointId,t.checkpointId);
  assert.ok(Buffer.isBuffer(v.checkpointBytes));assert.equal(sha(v.checkpointBytes),d.checkpointSha256);
  const saved=JSON.parse(v.checkpointBytes);assert.equal(saved.checkpointId,t.checkpointId);assert.equal(v.backupsVerificados,true);
  const s=v.snapshot;assert.equal(s.projeto,'gnwybroqfvwosiqzsfla');
  for(const key of ['mysqlReadOnly','supabaseReadOnly','tlsVerificado','catalogoConferido'])assert.equal(s[key],true);
  const {conferirEscritores,conferirCapturas,TTL_ATUAL,resumo}=require('../scripts/gate-reconciliacao-recuperacao.cjs');
  conferirEscritores(v.writersBefore,c.backend,agora-TTL_ATUAL,agora);conferirEscritores(v.writersAfter,c.backend,agora-TTL_ATUAL,agora);conferirCapturas(s.capturas,agora-TTL_ATUAL,agora);
  for(const p of ['mysql','supabase'])assert.ok(Math.max(Date.parse(v.writersBefore.local.capturedUtc),Date.parse(v.writersBefore.database.capturedUtc))<=s.capturas[p].inicio&&Math.min(Date.parse(v.writersAfter.local.capturedUtc),Date.parse(v.writersAfter.database.capturedUtc))>=s.capturas[p].fim);
  const normalized={...s,catalogos:{...s.catalogos,supabase:require('../scripts/catalogo-t1.cjs').catalogoT1(saved.checkpoint.catalogos.supabase,s.catalogos.supabase,t.t1||{})}};
  const current=resumo(saved.checkpoint,normalized,v.columns);assert.equal(v.currentStateSha256,hash(e));
  return {...conferirT1Concluida({estado:e,snapshot:s,current,t1JournalBytes:v.t1JournalBytes,agora}),comparison:current};
}
module.exports={conferirT1Concluida,validarEvidenciasPosT1};
