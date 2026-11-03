'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),hash=o=>sha(JSON.stringify(o));
function conferirEstadoFalha(e,env){
 const r=e.controleSelado,t=e.transicao;assert.ok(e.congelado&&e.selado&&t?.fase==='INICIADA'&&t.ticket===null&&r?.etapa==='FALHA'&&r.modo==='IMPLANTACAO_POS_T1'&&r.motivoOperacao==='RESTABELECIMENTO_POS_T1'&&!r.recuperacaoFalhaPosT1,'RECUPERACAO_FALHA_ORIGEM_RECUSADA');
 assert.equal(r.ticketControlador,null);assert.equal(r.ticketSupervisor,null);assert.equal(new Set(r.consumidos).size,r.consumidos.length);assert.ok(r.consumidos.every(h=>/^[a-f0-9]{64}$/.test(h)));
 require('../config/procedencia-t1-selada.cjs').conferirProcedenciaT1(e,{destino:true});assert.equal(require('../config/startup-controlado.cjs').fingerprint(env),t.configuracaoHash);assert.deepEqual(e.instancias,[t.destino]);assert.equal(Number(env.PORT||3001),3001);
 assert.equal(r.consumidos.length,r.procedenciaT1.consumidosAnteriores.length+2);
 const p=r.protecaoAposFalha;assert.ok(p?.known503===true&&p.pid===r.respondedor?.pid&&r.respondedor.backendSupervisor===false&&r.respondedor.role==='MANUTENCAO_SEM_BACKEND');
 return r;
}
function pids(e){const r=e.controleSelado;return [...new Set([r.controlador.pid,r.supervisor.pid,r.procedenciaT1.controladorOriginal.pid,r.procedenciaT1.supervisorOriginal.pid])];}
function conferirAusencia(e,proof,agora){assert.equal(proof?.todosAusentes,true,'RECUPERACAO_FALHA_PROCESSO_PRESENTE');assert.deepEqual(proof.presentes,[]);assert.deepEqual(proof.pidsConsultados,pids(e));const at=Date.parse(proof.capturedUtc);assert.ok(Number.isFinite(at)&&at<=agora&&agora-at<30000,'RECUPERACAO_FALHA_PROVA_EXPIRADA');}
function validar(e,env,v,agora){
 const r=conferirEstadoFalha(e,env);assert.ok(v.autorizacao?.recuperarFalhaPosT1===true&&v.autorizacao.riscoResidualAceito===true&&v.autorizacao.historicoNaoComprovado===true&&v.autorizacao.referencia?.trim().length>=8,'RECUPERACAO_FALHA_NAO_AUTORIZADA');
 assert.ok(Buffer.isBuffer(v.estadoBytes));assert.deepEqual(JSON.parse(v.estadoBytes),e);assert.equal(v.estadoSha256,hash(e));conferirAusencia(e,v.provaAusencia,agora);
 const c=v.candidato,b=v.respondedor;assert.ok(c?.entradaConhecida&&c.canalRetomavelInstalado&&Number.isSafeInteger(c.pid)&&c.pid>0&&Number.isSafeInteger(c.parentPid)&&c.parentPid>0&&c.boot&&Date.parse(c.criadoEm)<=agora&&!pids(e).includes(c.pid));
 for(const k of ['pid','parentPid','criadoEm','boot'])assert.equal(b[k],r.respondedor[k]);assert.ok(b.entradaConhecida&&b.portaExclusivaLocal&&b.backendSupervisor===false&&b.role==='MANUTENCAO_SEM_BACKEND'&&b.pid!==c.pid);
 assert.equal(v.pacote.schemaVersion,1);assert.equal(v.pacote.manifestBefore,r.controlador.codigoSha256);assert.equal(v.pacote.manifestAfter,c.codigoSha256);assert.notEqual(v.pacote.manifestBefore,v.pacote.manifestAfter);assert.equal(v.pacote.appliedFilesVerified,true);
 assert.ok(Buffer.isBuffer(v.relatorioBytes));assert.equal(sha(v.relatorioBytes),v.relatorioSha256);
 // O estado original autentico serve apenas para validar o registro T1/dados.
 // Nao altera FALHA, nao fabrica ATIVO e nao confere autoridade historica.
 const historical=JSON.parse(Buffer.from(r.estadoAnteriorPosT1Base64,'base64'));assert.deepEqual(historical.transicao.t1,e.transicao.t1);
 const current=require('./preflight-implantacao-pos-t1.cjs').conferirDadosPosT1(historical,v,agora,{maintenance:true});
 return {current,registroSha256:hash(e.transicao.t1),estadoBytesSha256:sha(v.estadoBytes),provaReinicioSha256:hash(v.provaAusencia)};
}
function conferirDadosFalha(e,v,agora){return require('./preflight-implantacao-pos-t1.cjs').conferirDadosPosT1(JSON.parse(Buffer.from(e.controleSelado.estadoAnteriorPosT1Base64,'base64')),v,agora,{maintenance:true});}
module.exports={conferirEstadoFalha,pids,conferirAusencia,validar,conferirDadosFalha};
