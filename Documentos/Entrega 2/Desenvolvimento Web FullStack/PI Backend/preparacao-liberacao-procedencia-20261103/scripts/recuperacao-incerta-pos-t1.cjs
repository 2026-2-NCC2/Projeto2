'use strict';
// Sem CLI, drivers, processos, abertura HTTP ou fallback de estado.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x));
function projetar(e){return {...e,transicao:{...e.transicao,fase:'INICIADA'}};}
function validarOrigem(e,ambiente,v,agora){
 const t=e.transicao,r=e.controleSelado,g=t?.gateSelado;
 assert.ok(e.congelado&&e.selado&&t?.fase==='INCERTA'&&t.ticket===null&&r?.etapa==='ATIVO'&&r.modo==='IMPLANTACAO_POS_T1','INCERTA_POS_T1_ESTADO');
 assert.equal(r.ticketControlador,null);assert.equal(r.ticketSupervisor,null);assert.equal(new Set(r.consumidos).size,r.consumidos.length);
 const base=projetar(e);require('../config/procedencia-t1-selada.cjs').conferirProcedenciaT1(base,{destino:true,agora});
 assert.equal(require('../config/startup-controlado.cjs').fingerprint(ambiente),t.configuracaoHash);
 assert.deepEqual(e.instancias,[t.destino]);
 // O selo legado e historico. Nunca autoriza a recuperacao por si so.
 assert.ok(g&&/^[a-f0-9]{64}$/.test(g.smokeSha256)&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(g.controleNonce)&&Number.isSafeInteger(g.verificadoEm)&&g.verificadoEm<=agora,'INCERTA_POS_T1_SELO');
 assert.ok(Buffer.isBuffer(v.smokeBytes)&&sha(v.smokeBytes)===g.smokeSha256,'INCERTA_POS_T1_SMOKE_HISTORICO');
 const smoke=JSON.parse(v.smokeBytes);assert.equal(smoke.controllerPid,r.controlador.pid);assert.equal(smoke.supervisorPid,r.supervisor.pid);assert.equal(smoke.maintenanceReleased,false);assert.equal(smoke.dataWrites,false);
 // Snapshot independente, selado ANTES da tentativa; nao pode ser reconstruido e aceito como historico.
 assert.ok(Buffer.isBuffer(v.estadoAnteriorBytes),'INCERTA_POS_T1_SNAPSHOT_ANTERIOR_AUSENTE');
 const h=v.historico;
 assert.ok(h?.causa==='POS_T1_PROCEDENCIA_AUSENTE'&&h.falhaAntesDoEnvio===true&&h.acao==='liberar-escritas'&&h.envios===0&&h.tentativas===1,'INCERTA_POS_T1_HISTORICO');
 assert.equal(sha(v.estadoAnteriorBytes),h.estadoAnteriorSha256);assert.ok(Number.isSafeInteger(h.seladoAntesEm)&&h.seladoAntesEm<=g.verificadoEm,'INCERTA_POS_T1_SNAPSHOT_TARDIO');
 const before=JSON.parse(v.estadoAnteriorBytes);assert.equal(before.transicao.fase,'INICIADA');
 const expected={...before,transicao:{...before.transicao,fase:'INCERTA',gateSelado:g}};assert.deepEqual(e,expected,'INCERTA_POS_T1_ESTADO_DIVERGENTE');
 assert.equal(h.smokeSha256,g.smokeSha256);assert.equal(h.gateVerificadoEm,g.verificadoEm);assert.equal(h.checkpointId,t.checkpointId);assert.equal(h.run,t.t1.run);
 assert.ok(Buffer.isBuffer(v.checkpointBytes)&&Buffer.isBuffer(v.t1JournalBytes));
 assert.equal(sha(v.checkpointBytes),t.recuperacao.decisaoSeguranca.checkpointSha256);assert.equal(sha(v.t1JournalBytes),t.t1.journalSha256);
 assert.equal(v.estadoAtualSha256,hash(e));
 for(const id of ['controlador','supervisor'])assert.deepEqual(v.identidades[id],r[id]);
 const q=v.diagnostico;
 assert.ok(q?.httpStatus===503&&q.ipcExclusivo===true&&q.autoridadeExclusiva===true&&q.requisicoesPendentes===0&&q.escritasPendentes===0&&q.operacoesPersistenciaPendentes===0&&q.incertezasOperacionais===0,'INCERTA_POS_T1_DIAGNOSTICO');
 assert.equal(q.controllerPid,r.controlador.pid);assert.equal(q.supervisorPid,r.supervisor.pid);assert.equal(q.estadoSha256,hash(e));
 assert.ok(Number.isSafeInteger(q.verificadoEm)&&q.verificadoEm<=agora&&agora-q.verificadoEm<30000,'INCERTA_POS_T1_EVIDENCIA_EXPIRADA');
 const dados=require('./preflight-implantacao-pos-t1.cjs').conferirDadosPosT1(base,v,agora);
 return {estadoSha256:hash(e),journalSha256:t.t1.journalSha256,checkpointSha256:sha(v.checkpointBytes),historicoSha256:hash(h),hashes:dados.hashes};
}
function criarRecuperacao({estado,ambiente,inspecionar,conferirAutoridade,conferirHistorico,conferirIpc,adquirirExclusivo,arquivar,agora=Date.now}){
 const planos=new WeakMap();let ocupado=false,concluida;
 async function conferir(){const e=estado.ler(),v=await inspecionar();const proof=validarOrigem(e,ambiente,v,agora());
  // Obrigatorios: adapters retidos pelo dono legitimo. Booleans/JSON nao criam autoridade.
  assert.equal(typeof conferirAutoridade,'function');assert.equal(typeof conferirHistorico,'function');assert.equal(typeof conferirIpc,'function');
  await conferirAutoridade(e);await conferirHistorico(v.historico,v.estadoAnteriorBytes);await conferirIpc(e,v.diagnostico);
  assert.equal(hash(estado.ler()),proof.estadoSha256,'INCERTA_POS_T1_ESTADO_MUDOU');return {e,proof};}
 return {async planejar(){assert.ok(!ocupado&&!concluida,'INCERTA_POS_T1_OCUPADA');const {proof}=await conferir();const p=Object.freeze({id:crypto.randomUUID(),...proof,emitidoEm:agora(),expiraEm:agora()+30000});planos.set(p,{usado:false});return p;},
 async executar(p,auth){assert.ok(!ocupado,'INCERTA_POS_T1_OCUPADA');const record=planos.get(p);assert.ok(record,'INCERTA_POS_T1_PLANO_NAO_AUTENTICO');
  if(concluida===p){assert.equal(hash(estado.ler()),record.resultadoHash);return {status:'RECUPERACAO_INCERTA_POS_T1_CONCLUIDA',reutilizada:true,httpStatus:503};}
  assert.ok(auth?.autorizarRecuperacao===true&&auth.referencia?.trim().length>=8,'INCERTA_POS_T1_NAO_AUTORIZADA');assert.ok(!record.usado,'INCERTA_POS_T1_SEM_RETRY');record.usado=true;ocupado=true;let soltar;
  try{assert.ok(agora()>=p.emitidoEm&&agora()<p.expiraEm,'INCERTA_POS_T1_PLANO_EXPIRADO');soltar=await adquirirExclusivo();assert.equal(typeof soltar,'function');const {e,proof}=await conferir();assert.deepEqual(proof,{estadoSha256:p.estadoSha256,journalSha256:p.journalSha256,checkpointSha256:p.checkpointSha256,historicoSha256:p.historicoSha256,hashes:p.hashes});
   const archived=await arquivar(Buffer.from(JSON.stringify(e)));assert.equal(archived.sha256,hash(e),'INCERTA_POS_T1_ARQUIVO_INVALIDO');
   assert.equal(hash(estado.ler()),p.estadoSha256);assert.ok(agora()<p.expiraEm,'INCERTA_POS_T1_PLANO_EXPIRADO');
   const n=projetar(e);n.transicao.recuperacao={...n.transicao.recuperacao,smokeIsolado:{aprovado:false},recuperacaoIncertaPosT1:{versao:1,id:p.id,estadoRecusadoSha256:archived.sha256,historicoSha256:p.historicoSha256,referencia:auth.referencia,recuperadoEm:agora(),novaLiberacaoExigeNovoGate:true}};
   // Guarda o selo antigo como historico no arquivo; nunca o reativa.
   delete n.transicao.gateSelado;estado.gravar(n);assert.deepEqual(estado.ler(),n,'INCERTA_POS_T1_PUBLICACAO_DIVERGENTE');
   await conferirAutoridade(n);await conferirIpc(n,{httpStatus:503,exigirDrenagem:true});assert.equal(hash(estado.ler()),hash(n));record.resultadoHash=hash(n);concluida=p;
   return {status:'RECUPERACAO_INCERTA_POS_T1_CONCLUIDA',reutilizada:false,httpStatus:503,novaLiberacaoExigeNovoGate:true};
  }catch(error){const e=estado.ler();if(e.transicao?.fase==='INICIADA'&&e.transicao.recuperacao?.recuperacaoIncertaPosT1?.id===p.id)estado.gravar({...e,congelado:true,selado:true,transicao:{...e.transicao,fase:'INCERTA'}});throw error;}
  finally{try{soltar?.();}finally{ocupado=false;}}
 }};
}
module.exports={validarOrigem,criarRecuperacao};
