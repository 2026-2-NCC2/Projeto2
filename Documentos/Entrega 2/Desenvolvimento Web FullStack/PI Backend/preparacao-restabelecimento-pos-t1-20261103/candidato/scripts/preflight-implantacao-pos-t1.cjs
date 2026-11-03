'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x));
function conferirDadosPosT1(e,v,agora,{maintenance=false}={}){
  assert.ok(Buffer.isBuffer(v.checkpointBytes)&&Buffer.isBuffer(v.t1JournalBytes));
  const d=e.transicao.recuperacao.decisaoSeguranca,saved=JSON.parse(v.checkpointBytes);assert.equal(saved.checkpointId,e.transicao.checkpointId);assert.equal(sha(v.checkpointBytes),d.checkpointSha256);assert.equal(v.backupsVerificados,true);
  assert.ok(d.criterio==='RECONCILIACAO_ATUAL'&&d.continuidadeHistoricaComprovada===false&&d.lacunaHistoricaReconhecida&&d.riscoResidualAceito&&d.controleOperacionalSemLockGlobalAceito);
  const s=v.snapshot;assert.equal(s.projeto,'gnwybroqfvwosiqzsfla');for(const k of ['mysqlReadOnly','supabaseReadOnly','tlsVerificado','catalogoConferido'])assert.equal(s[k],true);
  const api=require('./gate-reconciliacao-recuperacao.cjs');
  for(const w of [v.writersBefore,v.writersAfter]){
    if(maintenance){assert.ok(v.respondedor?.entradaConhecida&&v.respondedor.portaExclusivaLocal&&v.respondedor.role==='MANUTENCAO_SEM_BACKEND'&&v.respondedor.backendSupervisor===false);assert.equal(w.local.knownBackend,null);assert.deepEqual(w.local.knownMaintenanceResponder,v.respondedor);const adapted={...w,local:{...w.local,knownBackend:{...v.respondedor,entradaConhecida:true,portaExclusivaLocal:true}}};api.conferirEscritores(adapted,adapted.local.knownBackend,agora-30000,agora);}
    else api.conferirEscritores(w,v.origem.backend,agora-30000,agora);
  }
  api.conferirCapturas(s.capturas,agora-30000,agora);for(const p of ['mysql','supabase'])assert.ok(Math.max(Date.parse(v.writersBefore.local.capturedUtc),Date.parse(v.writersBefore.database.capturedUtc))<=s.capturas[p].inicio&&Math.min(Date.parse(v.writersAfter.local.capturedUtc),Date.parse(v.writersAfter.database.capturedUtc))>=s.capturas[p].fim);
  const normalized={...s,catalogos:{...s.catalogos,supabase:require('./catalogo-t1.cjs').catalogoT1(saved.checkpoint.catalogos.supabase,s.catalogos.supabase,e.transicao.t1)}};
  const current=api.resumo(saved.checkpoint,normalized,v.columns);
  require('../config/evidencias-pos-t1.cjs').conferirT1Concluida({estado:e,snapshot:s,current,t1JournalBytes:v.t1JournalBytes,agora});return current;
}
function validarImplantacaoPosT1(e,env,v,agora){
  const r=e.controleSelado,t=e.transicao;assert.ok(e.congelado&&e.selado&&t?.fase==='INICIADA'&&t.ticket===null&&r?.etapa==='ATIVO'&&!r.procedenciaT1,'IMPLANTACAO_POS_T1_ESTADO_RECUSADO');
  assert.equal(require('../config/startup-controlado.cjs').fingerprint(env),t.configuracaoHash);assert.equal(Number(env.PORT||3001),3001);
  assert.ok(v.autorizacao?.implantarPosT1===true&&v.autorizacao.referencia?.trim().length>=8,'IMPLANTACAO_POS_T1_NAO_AUTORIZADA');
  for(const [actual,expected] of [[v.origem.backend,r.supervisor],[v.origem.controlador,r.controlador]])for(const k of ['pid','parentPid','criadoEm','boot'])assert.equal(actual[k],expected[k]);
  const c=v.candidato;assert.ok(c?.canalRetomavelInstalado&&c.entradaConhecida&&Number.isSafeInteger(c.pid)&&c.pid>0&&Number.isSafeInteger(c.parentPid)&&c.parentPid>0&&c.boot&&Date.parse(c.criadoEm)<=agora);assert.ok(![r.supervisor.pid,r.controlador.pid].includes(c.pid));
  assert.equal(v.pacote.schemaVersion,1);assert.equal(v.pacote.manifestBefore,r.controlador.codigoSha256);assert.equal(v.pacote.manifestAfter,c.codigoSha256);assert.notEqual(v.pacote.manifestBefore,v.pacote.manifestAfter);assert.equal(v.pacote.appliedFilesVerified,true);
  // Observacao operacional do canal antigo: nunca e tratada como recibo WeakMap
  // ou capacidade de admissao. Somente novos tickets autorizam o novo pai real.
  assert.ok(Buffer.isBuffer(v.statusOrigemBytes));const status=JSON.parse(v.statusOrigemBytes);
  assert.ok(status.ok===true&&status.controllerPid===r.controlador.pid&&status.supervisorPid===r.supervisor.pid&&Number.isSafeInteger(status.verificadoEm)&&status.verificadoEm<=agora&&agora-status.verificadoEm<=30000,'IMPLANTACAO_STATUS_ORIGEM_EXPIRADO');
  assert.match(status.pedido,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.match(status.nonce,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.equal(t.t1.pid,r.supervisor.pid);assert.equal(t.t1.instancia,r.supervisor.boot);
  assert.ok(v.origem.backend.parentPid===v.origem.controlador.pid&&v.origem.backend.portaExclusivaLocal);
  const current=conferirDadosPosT1(e,v,agora);assert.equal(v.estadoSha256,hash(e));assert.ok(Buffer.isBuffer(v.estadoBytes));assert.deepEqual(JSON.parse(v.estadoBytes),e);
  assert.ok(Buffer.isBuffer(v.relatorioBytes));assert.equal(sha(v.relatorioBytes),v.relatorioSha256);
  const report=JSON.parse(v.relatorioBytes);assert.equal(report.supervisorPid,r.supervisor.pid);assert.equal(report.controllerPid,r.controlador.pid);assert.equal(report.status,'RECUPERACAO_E_SMOKE_ISOLADO_APROVADOS');assert.equal(report.maintenanceReleased,false);assert.equal(report.historicalAbsenceOfWritesProven,false);assert.equal(report.startupProvider,'supabase');assert.equal(report.mysqlModulesLoaded,false);
  // O smoke anterior pode estar vencido: serve somente como historico, nunca
  // como prova atual de liberacao. A nova admissao invalida expressamente seu selo.
  return {current,statusHash:sha(v.statusOrigemBytes),registroSha256:hash(t.t1),estadoBytesSha256:sha(v.estadoBytes)};
}
module.exports={validarImplantacaoPosT1,conferirDadosPosT1};
