'use strict';
// Inerte ate autorizarT1. Sem driver, retry, rollback ou liberacao HTTP.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {conferirPlanoFinalSelado}=require('../config/gate-final-selado.cjs');
const {resumo,TTL_ATUAL}=require('./gate-reconciliacao-recuperacao.cjs'),{validar}=require('./delta-cutover.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const {performance}=require('node:perf_hooks');
const preparados=new WeakMap(),ativos=new Map(),gatesEmitidos=new WeakSet(),noncesEmitidos=new Set(),runsEmitidos=new Set(),digest=p=>sha(JSON.stringify([p.run,p.marker,p.body,p.checkpointBytes.toString('hex'),p.columns,p.gate,p.emitidoEm,p.expiraEm]));
const erro=code=>Object.assign(Error(code),{code});
function revogarPlanoT1(p){if(!p)return;const m=preparados.get(p);if(!m)throw erro('T1_PLANO_NAO_AUTENTICO');if(m.executando)throw erro('T1_EM_EXECUCAO');if(m.estado==='EMITIDO')m.estado='REVOGADO';if(ativos.get(m.chave)===p)ativos.delete(m.chave);}
function conferirPlanoT1(p,estado,agora=Date.now()){
  const m=preparados.get(p);if(!m)throw erro('T1_PLANO_NAO_AUTENTICO');if(m.estado!=='EMITIDO')throw erro('T1_PLANO_'+m.estado);
  try{
    if(m.digest!==digest(p)||ativos.get(m.chave)!==p)throw erro('T1_PLANO_ALTERADO');
    const mono=m.relogio();if(agora<p.emitidoEm||agora>=p.expiraEm||mono<m.inicioMono||mono>=m.expiraMono){m.estado='EXPIRADO';throw erro('T1_PLANO_EXPIRADO');}
    if(estado.transicao.t1)throw erro('T1_JA_REGISTRADA');conferirPlanoFinalSelado(p.gate,estado,agora);return p;
  }catch(error){if(m.estado==='EMITIDO')m.estado='REVOGADO';throw error;}
}
function prepararT1({gate,estado,checkpointBytes,columns,run=crypto.randomUUID(),agora=Date.now(),relogioMonotono=()=>performance.now()}){
  conferirPlanoFinalSelado(gate,estado,agora);assert.equal(gate.finalidade,'T1');assert.match(run,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.equal(sha(checkpointBytes),gate.checkpointSha256);const cp=JSON.parse(checkpointBytes);assert.equal(cp.checkpointId,gate.checkpointId);
  if(estado.transicao.t1)throw erro('T1_JA_REGISTRADA');assert.ok(Number.isSafeInteger(gate.expiraEm)&&gate.expiraEm>agora&&gate.expiraEm-agora<=TTL_ATUAL);
  if(gatesEmitidos.has(gate)||noncesEmitidos.has(gate.controleNonce)||runsEmitidos.has(run))throw erro('T1_EMISSAO_REUTILIZADA');
  const chave=JSON.stringify([gate.controllerPid,gate.pid,gate.instancia]),previous=ativos.get(chave);if(previous)revogarPlanoT1(previous);
  const marker='TT-T1-'+run,body={nome:marker,data:'2026-12-20',horario:'14:00',local:'Fixture descartavel T1',categoria:'Corporativo',publico:10,descricao:marker};
  const p=Object.freeze({gate,run,marker,body,checkpointBytes:Buffer.from(checkpointBytes),columns:structuredClone(columns),emitidoEm:agora,expiraEm:gate.expiraEm}),inicioMono=relogioMonotono();assert.ok(Number.isFinite(inicioMono));preparados.set(p,{digest:digest(p),estado:'EMITIDO',chave,executando:false,relogio:relogioMonotono,inicioMono,expiraMono:inicioMono+p.expiraEm-agora});ativos.set(chave,p);gatesEmitidos.add(gate);noncesEmitidos.add(gate.controleNonce);runsEmitidos.add(run);return p;
}
function criarExecucaoT1({estado,jornal,revalidarGate,conferirControleAtual,requisitarPrivado,limparPorIdsTransacional,snapshot,adquirirExclusivo,agora=Date.now}){
  let ocupado=false;
  return {async executar(p,{autorizarT1=false,referenciaAutorizacao,organizadorId}={}){
    assert.equal(autorizarT1,true,'T1_NAO_AUTORIZADA');assert.ok(!ocupado);assert.ok(typeof referenciaAutorizacao==='string'&&referenciaAutorizacao.length>=8);assert.ok(Number.isSafeInteger(organizadorId)&&organizadorId>0);conferirPlanoT1(p,estado.ler(),agora());const consumo=preparados.get(p);consumo.estado='CONSUMIDO';consumo.executando=true;ocupado=true;let soltar,registro;
    const cp=JSON.parse(p.checkpointBytes).checkpoint,baseIds=t=>new Set(cp.supabase[t].map(r=>Number(r.id)));
    async function salvar(){await jornal.gravar(structuredClone(registro));}
    async function request(method,route,body){
      await conferirControleAtual();const e=estado.ler();assert.ok(e.congelado&&e.selado&&e.transicao.fase==='INICIADA');assert.equal(e.transicao.pidDestino,p.gate.pid);assert.equal(e.transicao.destino,p.gate.instancia);assert.equal(e.transicao.configuracaoHash,p.gate.configuracaoHash);
      const op={id:crypto.randomUUID(),method,route,status:'ENVIANDO',iniciadoEm:agora()};registro.operacoes.push(op);await salvar();
      const r=await requisitarPrivado({method,route,body,run:p.run,marker:p.marker,organizadorId});op.status=r.status;await salvar();assert.equal(r.status,method==='POST'?201:200,'T1_HTTP_CONTRATO');return r.body;
    }
    async function verificar(s,{eventoPresente,custoPresente}){
      const rows=validar(s.supabase,p.columns),events=rows.eventos.filter(r=>!baseIds('eventos').has(Number(r.id))),costs=rows.custos_evento.filter(r=>!baseIds('custos_evento').has(Number(r.id)));
      assert.equal(events.length,eventoPresente?1:0);assert.equal(costs.length,custoPresente?1:0);
      if(eventoPresente){const ev=events[0];assert.equal(Number(ev.id),registro.createdEventIds[0]);assert.equal(ev.nome,p.marker);assert.equal(ev.descricao,p.marker);assert.equal(Number(ev.usuario_id),organizadorId);}
      if(custoPresente){const c=costs[0];assert.equal(Number(c.evento_id),registro.createdEventIds[0]);assert.equal(c.descricao,p.marker);assert.equal(Number(c.valor_estimado),0.1);const id=Number(c.id);assert.ok(!baseIds('custos_evento').has(id));if(!registro.createdCostIds.length){registro.createdCostIds.push(id);await salvar();}assert.deepEqual(costs.map(x=>Number(x.id)),registro.createdCostIds);}
      const filtered={...s,catalogos:{...s.catalogos,supabase:require('./catalogo-t1.cjs').catalogoT1(cp.catalogos.supabase,s.catalogos.supabase,registro)},supabase:{...s.supabase,eventos:s.supabase.eventos.filter(r=>baseIds('eventos').has(Number(r.id))),custos_evento:s.supabase.custos_evento.filter(r=>baseIds('custos_evento').has(Number(r.id)))}};
      const proof=resumo(cp,filtered,p.columns);assert.equal(proof.hashes.supabase,p.gate.dataHashes.supabase);registro.verificacoes.push({baseHash:proof.hashes.supabase,mysqlHash:proof.hashes.mysql,eventosNovos:events.map(x=>({id:Number(x.id),usuario_id:Number(x.usuario_id),nome:x.nome,descricao:x.descricao})),custosNovos:costs.map(x=>({id:Number(x.id),evento_id:Number(x.evento_id),descricao:x.descricao,valor_estimado:x.valor_estimado}))});await salvar();return proof;
    }
    try{
      // A capacidade foi consumida dentro da janela, antes de qualquer await.
      // Consumo nao renova prazo nem permite replay; a execucao exige gate novo.
      soltar=adquirirExclusivo();assert.equal(await jornal.existe(p.run),false,'T1_SEM_RETRY');
      const fresh=await revalidarGate();conferirPlanoFinalSelado(fresh,estado.ler(),agora());assert.notEqual(fresh,p.gate);assert.notEqual(fresh.controleNonce,p.gate.controleNonce);for(const k of ['janelaId','checkpointId','checkpointSha256','configuracaoHash','pid','instancia','controllerPid','smokeSha256'])assert.equal(fresh[k],p.gate[k]);assert.deepEqual(fresh.dataHashes,p.gate.dataHashes);
      assert.ok(cp.supabase.usuarios.some(u=>Number(u.id)===organizadorId&&u.perfil==='organizador'&&/teste/i.test(u.email)),'T1_ORGANIZADOR_NAO_DESCARTAVEL');
      const pre=await snapshot();resumo(cp,pre,p.columns);conferirPlanoFinalSelado(fresh,estado.ler(),agora());
      registro={run:p.run,marker:p.marker,organizadorId,gateSha256:sha(JSON.stringify(fresh)),checkpointId:p.gate.checkpointId,configuracaoHash:p.gate.configuracaoHash,pid:p.gate.pid,instancia:p.gate.instancia,etapa:'EM_EXECUCAO',autorizacao:referenciaAutorizacao,createdEventIds:[],createdCostIds:[],beforeHash:p.gate.dataHashes.supabase,unknownResult:false,retryCount:0,operacoes:[],verificacoes:[]};await jornal.criar(structuredClone(registro));
      const created=await request('POST','/eventos',p.body),id=created.evento?.id;assert.ok(Number.isSafeInteger(id)&&id>0&&!baseIds('eventos').has(id));registro.createdEventIds.push(id);await salvar();await verificar(await snapshot(),{eventoPresente:true,custoPresente:false});
      await request('PUT','/eventos/'+id+'/custos',{custos:[{categoria:'Som',descricao:p.marker,valor_estimado:'0.10'}]});await verificar(await snapshot(),{eventoPresente:true,custoPresente:true});
      // Limpeza atomica por IDs, com parent row lock, manifesto e baseline conferidos.
      await conferirControleAtual();const cleanup={id:crypto.randomUUID(),method:'SQL',route:'LIMPEZA_IDS',status:'ENVIANDO',iniciadoEm:agora()};registro.operacoes.push(cleanup);await salvar();
      const cleaned=await limparPorIdsTransacional({autorizarLimpeza:true,run:p.run,marker:p.marker,organizadorId,createdEventIds:[...registro.createdEventIds],createdCostIds:[...registro.createdCostIds],checkpointBytes:p.checkpointBytes,columns:p.columns});assert.ok(cleaned.cleanupVerified&&cleaned.parentLocked&&cleaned.serializable);assert.deepEqual(cleaned.createdEventIds,registro.createdEventIds);assert.deepEqual(cleaned.createdCostIds,registro.createdCostIds);cleanup.status=200;await salvar();const after=await verificar(await snapshot(),{eventoPresente:false,custoPresente:false});
      registro.etapa='CONCLUIDA';registro.afterHash=after.hashes.supabase;registro.cleanupVerified=true;registro.additional10RowsPreserved=true;registro.terminadoEm=agora();await conferirControleAtual();await salvar();return structuredClone(registro);
    }catch(err){if(registro){registro.etapa='INTERROMPIDA';registro.unknownResult=true;registro.cleanupVerified=false;await salvar();}throw err;}
    finally{try{soltar?.();}finally{consumo.executando=false;if(ativos.get(consumo.chave)===p)ativos.delete(consumo.chave);ocupado=false;}}
  }};
}
module.exports={prepararT1,conferirPlanoT1,revogarPlanoT1,criarExecucaoT1};
