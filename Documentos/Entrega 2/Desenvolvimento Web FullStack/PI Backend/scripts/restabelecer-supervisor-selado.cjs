"use strict";
// Preparacao inerte. Executar exige autorizacao explicita e adapters privados.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fingerprint}=require('../config/startup-controlado.cjs'),{conferirSeladoRestabelecido}=require('../config/identidade-supervisor.cjs'),{resumo}=require('./gate-reconciliacao-recuperacao.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function validarPreAdmissao(e,env,v,agora){
  const t=e.transicao;assert.ok(e.congelado&&e.selado&&t?.fase==='INCERTA'&&t.ticket===null&&!t.recuperacao&&!t.restabelecimento,'RESTABELECIMENTO_ESTADO_RECUSADO');
  assert.deepEqual(e.instancias,[t.destino]);assert.ok(typeof t.id==='string'&&t.id.length>0&&typeof t.checkpointId==='string'&&t.checkpointId.length>0);
  assert.equal(Number(env.PORT||3001),3001,'RESTABELECIMENTO_PORTA_CONFIG_DIVERGENTE');assert.equal(t.configuracaoHash,fingerprint(env));assert.equal(v.origemOriginalAusente,true);assert.equal(v.janelaExclusivaConfirmada,true);assert.equal(v.historicoComprovado,false);assert.equal(v.riscoResidualAceito,true);
  assert.ok(typeof v.referenciaAutorizacao==='string'&&v.referenciaAutorizacao.trim().length>=8);
  assert.ok(Buffer.isBuffer(v.checkpointBytes));const saved=JSON.parse(v.checkpointBytes.toString('utf8'));assert.equal(saved.checkpointId,t.checkpointId);
  assert.ok(Buffer.isBuffer(v.evidenciaBytes));assert.equal(sha(v.evidenciaBytes),v.evidenciaSha256);const r=JSON.parse(v.evidenciaBytes.toString('utf8'));
  assert.equal(r.schemaVersion,2);assert.equal(r.scopeType,'PRE_RECUPERACAO_SEM_SUPERVISOR');assert.equal(r.recoveryGateApproved,false);assert.equal(r.reconciliationApproved,true);assert.equal(r.historicalAbsenceOfWritesProven,false);assert.equal(r.historicalGapExplicitlyAcknowledged,true);
  assert.equal(r.checkpointId,t.checkpointId);assert.equal(r.checkpointSha256,sha(v.checkpointBytes));assert.equal(r.estadoSha256,sha(JSON.stringify(e)));assert.equal(r.configuracaoHash,t.configuracaoHash);assert.equal(r.janelaId,t.id);
  const end=Date.parse(r.finishedUtc),start=Date.parse(r.startedUtc);assert.ok(Number.isFinite(end)&&Number.isFinite(start)&&start<=end&&end<=agora&&agora-start<=15*60000,'RESTABELECIMENTO_EVIDENCIA_EXPIRADA');
  for(const key of ['recoveryExecuted','maintenanceReleased','dataWrites','jwtRotated','checkpointCreated','backupsGenerated'])assert.equal(r[key],false);
  const expected=v.respondedor;assert.ok(expected?.pid>0&&expected.role==='MANUTENCAO_SEM_BACKEND'&&expected.backendSupervisor===false&&expected.entradaConhecida&&expected.portaExclusivaLocal);
  assert.ok(typeof expected.criadoEm==='string'&&expected.parentPid>0);assert.notEqual(expected.pid,t.pidDestino);
  for(const w of [v.writersBefore,v.writersAfter]){
    assert.deepEqual(w.local.knownMaintenanceResponder,expected);assert.equal(w.local.knownBackend,null);assert.equal(w.local.backendSupervisorPresent,false);assert.equal(w.local.unknownProcessCount,0);assert.equal(w.local.tasks,0);assert.deepEqual(w.local.mysqlClientPids,[]);assert.equal(w.local.httpStatus,503);
    for(const time of [w.local.capturedUtc,w.database.capturedUtc]){const n=Date.parse(time);assert.ok(Number.isSafeInteger(n)&&n<=agora&&agora-n<=30000,'RESTABELECIMENTO_INVENTARIO_EXPIRADO');}
    const m=w.database.mysql,p=w.database.supabase;assert.equal(m.otherClients,0);assert.equal(m.otherTransactions,0);assert.equal(m.enabledJobs,0);assert.equal(m.scheduler,'OFF');assert.equal(p.activeCron,0);assert.equal(p.httpQueue,0);assert.equal(p.tlsVerified,true);const roles=new Set(['supabase_admin','pgbouncer','authenticator','supabase_auth_admin','supabase_storage_admin','supabase_realtime_admin']);assert.ok(p.sessions.every(x=>roles.has(x.usename)&&x.state==='idle'&&!x.transaction_open));
  }
  const snap=v.snapshot;assert.equal(snap.projeto,'gnwybroqfvwosiqzsfla');assert.ok(snap.mysqlReadOnly&&snap.supabaseReadOnly&&snap.tlsVerificado&&snap.catalogoConferido);
  for(const key of ['mysql','supabase']){const c=snap.capturas?.[key];assert.ok(c&&Number.isSafeInteger(c.inicio)&&Number.isSafeInteger(c.fim)&&c.inicio<=c.fim&&c.fim<=agora&&agora-c.inicio<=30000);assert.ok(Math.max(Date.parse(v.writersBefore.local.capturedUtc),Date.parse(v.writersBefore.database.capturedUtc))<=c.inicio&&Math.min(Date.parse(v.writersAfter.local.capturedUtc),Date.parse(v.writersAfter.database.capturedUtc))>=c.fim);}
  const data=resumo(saved.checkpoint,snap,v.columns);assert.deepEqual(data.hashes,r.dataHashes);
  return {id:sha(JSON.stringify([t.id,sha(v.evidenciaBytes),sha(JSON.stringify(e)),expected])),estadoHash:sha(JSON.stringify(e)),checkpointId:t.checkpointId,checkpointSha256:sha(v.checkpointBytes),configuracaoHash:t.configuracaoHash,respondedor:structuredClone(expected),evidenciaSha256:sha(v.evidenciaBytes),referenciaAutorizacao:v.referenciaAutorizacao,historicoComprovado:false,riscoResidualAceito:true};
}
function criarRestabelecimento({estado,ambiente,inspecionar,adquirirExclusivo,lancarPausado,admitirSemEscutar,consultar,encerrarRespondedor,portaLivre,ouvir,gerarEvidenciaV2,manter503EmFalha,agora=Date.now}){
  let ocupado=false;
  return {
    async planejar(){return validarPreAdmissao(estado.ler(),ambiente,await inspecionar(),agora());},
    async executar(plano,{autorizarAdmissao=false}={}){
      assert.equal(autorizarAdmissao,true,'RESTABELECIMENTO_NAO_AUTORIZADO');assert.ok(!ocupado,'RESTABELECIMENTO_EM_ANDAMENTO');ocupado=true;let release,iniciou=false;
      try{
        release=adquirirExclusivo();const e=estado.ler(),done=e.transicao?.restabelecimento;
        if(done){assert.equal(done.planoHash,sha(JSON.stringify(plano)));assert.equal(done.etapa,'ADMITIDA_SELADA','RESTABELECIMENTO_SEM_RETRY_AUTOMATICO');assert.equal(e.transicao.fase,'INCERTA');assert.equal(e.transicao.checkpointId,plano.checkpointId);assert.equal(e.transicao.configuracaoHash,fingerprint(ambiente));const s=await consultar();conferirSeladoRestabelecido(s);assert.equal(s.pid,done.pidDestino);assert.equal(s.instancia,done.destino);return {status:'ADMITIDA_SELADA',reutilizada:true,fase:e.transicao.fase};}
        assert.deepEqual(validarPreAdmissao(e,ambiente,await inspecionar(),agora()),plano);assert.equal(sha(JSON.stringify(estado.ler())),plano.estadoHash);
        const r={id:crypto.randomUUID(),etapa:'AGUARDANDO_CANDIDATO',planoHash:sha(JSON.stringify(plano)),janelaId:e.transicao.id,checkpointId:plano.checkpointId,checkpointSha256:plano.checkpointSha256,configuracaoHash:plano.configuracaoHash,estadoOrigemSha256:plano.estadoHash,respondedor:plano.respondedor,historicoComprovado:false,riscoResidualAceito:true,referenciaAutorizacao:plano.referenciaAutorizacao};
        estado.gravar({...e,transicao:{...e.transicao,restabelecimento:r}});iniciou=true;
        const candidate=await lancarPausado();assert.ok(candidate.connected&&Number.isSafeInteger(candidate.pid)&&candidate.pid>0);assert.notEqual(candidate.pid,plano.respondedor.pid);assert.notEqual(candidate.pid,e.transicao.pidDestino);
        const prepared={...r,etapa:'PREPARADA',pidDestino:candidate.pid,destino:crypto.randomUUID(),ticket:crypto.randomBytes(32).toString('hex')};
        estado.gravar({...estado.ler(),transicao:{...estado.ler().transicao,restabelecimento:prepared}});
        await admitirSemEscutar({id:prepared.id,janela:prepared.janelaId,instancia:prepared.destino,ticket:prepared.ticket});
        const admitted=estado.ler();assert.equal(admitted.transicao.fase,'INCERTA');assert.equal(admitted.transicao.restabelecimento.etapa,'CONSUMIDA');assert.equal(admitted.transicao.restabelecimento.ticket,null);let status=await consultar();conferirSeladoRestabelecido(status);assert.equal(status.pid,candidate.pid);assert.equal(status.instancia,prepared.destino);
        estado.gravar({...admitted,transicao:{...admitted.transicao,restabelecimento:{...admitted.transicao.restabelecimento,etapa:'AGUARDANDO_PORTA'}}});
        const closed=await encerrarRespondedor(plano.respondedor);assert.equal(closed.pid,plano.respondedor.pid);assert.equal(closed.encerrado,true);assert.equal(await portaLivre(),true,'RESTABELECIMENTO_PORTA_OCUPADA');
        await ouvir(prepared.id);status=await consultar();conferirSeladoRestabelecido(status);assert.equal(status.pid,candidate.pid);assert.equal(status.instancia,prepared.destino);
        const bound=estado.ler();assert.equal(bound.transicao.fase,'INCERTA');assert.equal(bound.transicao.checkpointId,plano.checkpointId);assert.equal(bound.transicao.configuracaoHash,plano.configuracaoHash);
        estado.gravar({...bound,transicao:{...bound.transicao,restabelecimento:{...bound.transicao.restabelecimento,etapa:'ADMITIDA_SELADA'}}});
        // Somente coleta READ ONLY. Nunca abre login/GET nem libera escritas.
        const evidence=await gerarEvidenciaV2();assert.equal(evidence.schemaVersion,2);assert.equal(evidence.supervisorAdmitido,true);assert.equal(evidence.pid,candidate.pid);assert.equal(evidence.httpStatus,503);assert.equal(evidence.checkpointId,plano.checkpointId);assert.equal(evidence.semDivergencias,true);
        return {status:'ADMITIDA_SELADA',reutilizada:false,fase:'INCERTA',evidencia:evidence};
      }catch(err){if(iniciou){const e=estado.ler();estado.gravar({...e,congelado:true,selado:true,transicao:{...e.transicao,fase:'INCERTA',restabelecimento:{...e.transicao.restabelecimento,etapa:'FALHA',ticket:null}}});if(typeof manter503EmFalha==='function')await manter503EmFalha();}throw err;}
      finally{try{release?.();}finally{ocupado=false;}}
    }
  };
}
module.exports={criarRestabelecimento,validarPreAdmissao};
