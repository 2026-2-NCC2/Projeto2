'use strict';
// Lane distinta: reboot comprovado; nunca adota IPC nem promove registro historico.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),hash=o=>sha(JSON.stringify(o));
function conferirOrigem(e,env){
 const t=e.transicao,r=e.controleSelado,x=t?.t1;
 assert.ok(e.congelado&&e.selado&&t?.fase==='INICIADA'&&t.ticket===null&&r?.etapa==='ATIVO'&&!r.procedenciaT1,'REINICIO_POS_T1_ORIGEM_RECUSADA');
 assert.equal(t.recuperacao?.etapa,'PRONTA_SMOKE');assert.deepEqual(e.instancias,[t.destino]);assert.equal(r.fasePreservada,t.fase);assert.ok(Number.isSafeInteger(r.epoch)&&r.epoch>0&&typeof r.id==='string'&&r.id.length>0);
 assert.ok(x?.etapa==='CONCLUIDA'&&x.cleanupVerified===true&&x.unknownResult===false&&x.retryCount===0,'REINICIO_POS_T1_LIMPEZA_RECUSADA');
 assert.equal(r.ticketControlador,null);assert.equal(r.ticketSupervisor,null);
 assert.ok(Array.isArray(r.consumidos)&&r.consumidos.length>=2&&new Set(r.consumidos).size===r.consumidos.length&&r.consumidos.every(x=>/^[a-f0-9]{64}$/.test(x)));
 assert.equal(x.pid,r.supervisor.pid);assert.equal(x.instancia,r.supervisor.boot);assert.equal(t.pidDestino,x.pid);assert.equal(t.destino,x.instancia);assert.equal(r.supervisor.parentPid,r.controlador.pid);
 assert.equal(require('../config/startup-controlado.cjs').fingerprint(env),t.configuracaoHash);assert.equal(Number(env.PORT||3001),3001);
 assert.equal(r.configuracaoHash,t.configuracaoHash);assert.equal(r.checkpointId,t.checkpointId);return r;
}
function validarPreflight(e,env,v,agora){
 const r=conferirOrigem(e,env),x=e.transicao.t1;
 assert.ok(v.autorizacao?.restabelecerPosT1===true&&v.autorizacao.riscoResidualAceito===true&&v.autorizacao.historicoNaoComprovado===true&&v.autorizacao.referencia?.trim().length>=8,'REINICIO_POS_T1_NAO_AUTORIZADO');
 assert.ok(Buffer.isBuffer(v.estadoBytes));assert.deepEqual(JSON.parse(v.estadoBytes),e);assert.equal(v.estadoSha256,hash(e));
 assert.ok(Buffer.isBuffer(v.relatorioBytes));assert.equal(sha(v.relatorioBytes),v.relatorioSha256);const report=JSON.parse(v.relatorioBytes);
 assert.equal(report.status,'RECUPERACAO_E_SMOKE_ISOLADO_APROVADOS');assert.equal(report.controllerPid,r.controlador.pid);assert.equal(report.supervisorPid,r.supervisor.pid);assert.equal(report.maintenanceReleased,false);assert.equal(report.historicalAbsenceOfWritesProven,false);assert.equal(report.startupProvider,'supabase');assert.equal(report.mysqlModulesLoaded,false);
 const proof=v.provaReinicio;assert.equal(proof?.todosAusentes,true,'REINICIO_POS_T1_PROCESSO_PRESENTE');assert.deepEqual(proof.presentes,[]);assert.deepEqual(proof.pidsConsultados,[r.controlador.pid,r.supervisor.pid]);
 const boot=Date.parse(proof.lastBootUtc),captured=Date.parse(proof.capturedUtc);assert.ok(Number.isFinite(boot)&&Number.isFinite(captured)&&boot>Math.max(Date.parse(report.finishedUtc),x.terminadoEm,Date.parse(r.controlador.criadoEm),Date.parse(r.supervisor.criadoEm))&&boot<=captured&&captured<=agora&&agora-captured<30000,'REINICIO_POS_T1_BOOT_RECUSADO');
 const c=v.candidato,b=v.respondedor;assert.ok(c?.entradaConhecida&&c.canalRetomavelInstalado&&Number.isSafeInteger(c.pid)&&c.pid>0&&Number.isSafeInteger(c.parentPid)&&c.parentPid>0&&c.boot&&Date.parse(c.criadoEm)>=boot&&Date.parse(c.criadoEm)<=agora);
 assert.ok(!proof.pidsConsultados.includes(c.pid));assert.ok(b?.entradaConhecida&&b.role==='MANUTENCAO_SEM_BACKEND'&&b.backendSupervisor===false&&b.portaExclusivaLocal&&b.parentPid===c.pid&&Number.isSafeInteger(b.pid)&&b.pid>0&&b.pid!==c.pid&&!proof.pidsConsultados.includes(b.pid));assert.ok(Date.parse(b.criadoEm)>=Date.parse(c.criadoEm)&&Date.parse(b.criadoEm)<=agora);
 assert.equal(v.pacote.schemaVersion,1);assert.equal(v.pacote.manifestBefore,r.controlador.codigoSha256);assert.equal(v.pacote.manifestAfter,c.codigoSha256);assert.notEqual(v.pacote.manifestBefore,v.pacote.manifestAfter);assert.equal(v.pacote.appliedFilesVerified,true);
 for(const w of [v.writersBefore,v.writersAfter]){assert.equal(w.local.knownBackend,null);assert.deepEqual(w.local.knownMaintenanceResponder,b);}
 const current=require('./preflight-implantacao-pos-t1.cjs').conferirDadosPosT1(e,v,agora,{maintenance:true});
 return {current,registroSha256:hash(x),estadoBytesSha256:sha(v.estadoBytes),provaReinicioSha256:hash(proof)};
}
function validarGate(e,env,v,agora=Date.now()){
 const r=e.controleSelado;assert.equal(r.motivoOperacao,'RESTABELECIMENTO_POS_T1');assert.equal(r.etapa,'ATIVO');assert.equal(r.ticketControlador,null);assert.equal(r.ticketSupervisor,null);assert.equal(r.consumidos.length,(r.recuperacaoFalhaPosT1?.consumidosAnteriores||r.procedenciaT1.consumidosAnteriores).length+2);assert.equal(new Set(r.consumidos).size,r.consumidos.length);
 assert.equal(require('../config/startup-controlado.cjs').fingerprint(env),e.transicao.configuracaoHash);
 require('../config/procedencia-t1-selada.cjs').conferirProcedenciaT1(e,{destino:true});
 assert.equal(hash(r.provaReinicioInicial),r.procedenciaT1.provaReinicioSha256);assert.equal(r.provaReinicioInicial.lastBootUtc,r.provaReinicioRevalidada.lastBootUtc);assert.equal(r.provaReinicioRevalidada.todosAusentes,true);
 if(r.recuperacaoFalhaPosT1){const old=JSON.parse(Buffer.from(r.recuperacaoFalhaPosT1.estadoFalhaBase64,'base64'));require('./preflight-falha-pos-t1.cjs').conferirAusencia(old,v.ausenciaAtual,agora);}
 const receipt=require('../config/continuidade-controlador.cjs').validarContinuidadeControlador(v.controle,e,agora);
 for(const key of ['pid','parentPid','criadoEm']){assert.equal(receipt.controller[key],r.controlador[key]);assert.equal(receipt.backend[key],r.supervisor[key]);}
 assert.equal(e.transicao.recuperacao.smokeIsolado.aprovado,false);
 const current=require('./preflight-implantacao-pos-t1.cjs').conferirDadosPosT1(e,{...v,origem:{backend:v.writersBefore.local.knownBackend}},agora);assert.deepEqual(current.hashes,r.preflightDataHashes);
 return {status:'RESTABELECIMENTO_POS_T1_GATE_APROVADO',httpStatus:503,comparison:current,exclusiveAuthorityConfirmed:true,newSmokeRequired:true,finalReleaseGateApproved:false,historicalAbsenceOfWritesProven:false};
}
module.exports={conferirOrigem,validarPreflight,validarGate};
