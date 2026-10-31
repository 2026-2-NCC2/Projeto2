"use strict";
// Procedimento inerte ate autorizacao explicita; adapters operacionais sao privados.
// Nao importa drivers, gera JWT, coleta delta ou libera escritas.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fingerprint}=require('../config/startup-controlado.cjs');
const {conferirDrenagem}=require('../config/transicao-controlada.cjs');
const {validarReconciliacao}=require('./gate-reconciliacao-recuperacao.cjs');
const {identidadeSupervisor}=require('../config/identidade-supervisor.cjs');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function conferirEvidencias(e,env,v,agora=Date.now()){
  const t=e.transicao,r=v.relatorio,j=v.diario;
  assert.ok(e.congelado&&e.selado&&t?.fase==='INCERTA'&&t.ticket===null,'RECUPERACAO_ESTADO_RECUSADO');
  const ativo=identidadeSupervisor(e);assert.deepEqual(e.instancias,[ativo.instancia]);
  assert.equal(t.configuracaoHash,fingerprint(env),'RECUPERACAO_CONFIG_DIVERGENTE');
  assert.equal(v.causaConfirmada,'SMOKE_PERFIL_CAMPO_INEXISTENTE');
  assert.ok(r&&j&&r.run===j.run&&r.checkpointId===j.checkpointId&&r.supabaseBackendPid===j.supabaseBackendPid);
  assert.equal(r.checkpointId,t.checkpointId);assert.equal(v.checkpointId,t.checkpointId);
  assert.match(v.checkpointSha256,/^[a-f0-9]{64}$/);
  for(const x of [r,j]){
    assert.equal(x.status,'INTERROMPIDA');assert.equal(x.failure?.stage,'smoke_leitura_jwt_permissoes');assert.equal(x.failure?.code,'ERR_ASSERTION');
    assert.equal(x.jwtRotated,true);assert.equal(x.startupPatchApplied,true);
    assert.equal(x.configurationProvider,'supabase');assert.equal(x.supabaseBackendPid,t.pidDestino);
    assert.equal(x.t1Attempted,false,'RECUPERACAO_T1_RECUSADA');assert.equal(x.rollbackExecuted,false);
    assert.ok(Object.values(x.createdIds).every(ids=>Array.isArray(ids)&&ids.length===0));
    assert.ok(x.checks.some(c=>c==='backups T0 completos e delta final aprovados'));
    assert.ok(x.http.length>0&&x.http.every(q=>q.write===false&&(q.method==='GET'||(q.method==='POST'&&q.route==='/login'))&&Number.isInteger(q.status)),'RECUPERACAO_HTTP_INCERTO');
    assert.equal(x.http.at(-1).route,'/perfil');assert.equal(x.http.at(-1).status,200);
  }
  assert.deepEqual(r.http,j.http);
  assert.equal(v.escritoresControlados,true);
  let decisaoSeguranca;
  if(v.reconciliacao){decisaoSeguranca=validarReconciliacao({estado:e,env,v,agora});}
  else{assert.equal(v.controleMantidoDesdeFalha,true);decisaoSeguranca={criterio:'CONTINUIDADE_DECLARADA',continuidadeHistoricaComprovada:false,continuidadeDeclaradaPeloOperador:true};}
  assert.ok(v.processo&&v.processo.pid===ativo.pid&&v.processo.parentPid>0&&typeof v.processo.criadoEm==='string');
  assert.equal(v.processo.entradaConhecida,true);assert.equal(v.processo.portaExclusivaLocal,true);
  assert.equal(v.httpManutencao,503);
  return {id:hash([r.run,t.id,ativo.instancia,t.configuracaoHash,t.checkpointId,v.checkpointSha256,decisaoSeguranca]),estadoHash:hash(e),evidenciasHash:hash({...v,verificacaoAtual:undefined}),checkpointId:t.checkpointId,pidAnterior:ativo.pid,instanciaAnterior:ativo.instancia,processo:structuredClone(v.processo),run:r.run,decisaoSeguranca};
}
function criarRecuperacao({estado,ambiente,inspecionar,encerrarConhecido,lancarSelado,consultar,abrirLeitura,adquirirExclusivo,agora=Date.now}){
  let ocupado=false;
  async function conferirVigencia(plano){
    const e=estado.ler(),rec=e.transicao.recuperacao;assert.equal(rec.planoHash,hash(plano),'RECUPERACAO_PLANO_ALTERADO');assert.deepEqual(rec.decisaoSeguranca,plano.decisaoSeguranca);
    if(plano.decisaoSeguranca.criterio==='RECONCILIACAO_ATUAL'){
      const v=await inspecionar();assert.equal(v.processo.pid,e.transicao.pidDestino);assert.equal(v.processo.entradaConhecida,true);assert.equal(v.processo.portaExclusivaLocal,true);assert.equal(v.httpManutencao,503);assert.equal(v.checkpointSha256,plano.decisaoSeguranca.checkpointSha256);
      const decisao=validarReconciliacao({estado:e,env:ambiente,v,agora:agora(),estadoBaseHash:plano.estadoHash,processoBase:plano.processo});assert.deepEqual(decisao,plano.decisaoSeguranca);
    }
  }
  return {
    async planejar(){const e=estado.ler();assert.ok(!e.transicao?.recuperacao,'RECUPERACAO_JA_REGISTRADA');return conferirEvidencias(e,ambiente,await inspecionar(),agora());},
    async recuperar(plano,{autorizar=false}={}){
      assert.equal(autorizar,true,'RECUPERACAO_NAO_AUTORIZADA');assert.ok(!ocupado,'RECUPERACAO_EM_ANDAMENTO');ocupado=true;let iniciou=false,soltar;
      try{
        assert.equal(typeof adquirirExclusivo,'function','RECUPERACAO_TRAVA_OBRIGATORIA');soltar=adquirirExclusivo();
        const e=estado.ler(),rec=e.transicao?.recuperacao;
        if(rec){
          assert.equal(rec.id,plano.id);assert.equal(rec.etapa,'PRONTA_SMOKE','RECUPERACAO_INTERROMPIDA_SEM_RETRY');
          assert.equal(e.transicao.configuracaoHash,fingerprint(ambiente));assert.ok(e.congelado&&e.selado&&e.transicao.fase==='INICIADA');
          await conferirVigencia(plano);
          const s=await consultar();conferirDrenagem(s);assert.equal(s.pid,e.transicao.pidDestino);assert.equal(s.instancia,e.transicao.destino);
          return {status:'PRONTA_SMOKE',reutilizada:true};
        }
        const atual=conferirEvidencias(e,ambiente,await inspecionar(),agora());assert.deepEqual(atual,plano,'RECUPERACAO_PLANO_OBSOLETO');assert.equal(hash(estado.ler()),plano.estadoHash,'RECUPERACAO_ESTADO_ALTERADO');
        estado.gravar({...e,transicao:{...e.transicao,...(e.transicao.restabelecimento?{restabelecimento:{...e.transicao.restabelecimento,etapa:'RECUPERACAO_SUBSEQUENTE'}}:{}),recuperacao:{id:plano.id,etapa:'ENCERRANDO',pidAnterior:plano.pidAnterior,instanciaAnterior:plano.instanciaAnterior,preparadaEm:agora(),planoHash:hash(plano),decisaoSeguranca:structuredClone(plano.decisaoSeguranca)}}});iniciou=true;
        // Adapter deve reconferir PID + criacao + pai + entrada imediatamente antes.
        const saida=await encerrarConhecido(plano.processo);assert.equal(saida.pid,plano.pidAnterior);assert.equal(saida.encerrado,true);assert.equal(saida.portaLivre,true);
        // Adapter apenas inicia a MESMA configuracao Supabase, selada, por ticket
        // de uso unico. Usa consumirEntrada; mantem janela/checkpoint/JWT originais.
        const novo=await lancarSelado({janela:e.transicao.id,checkpointId:e.transicao.checkpointId,configuracaoHash:e.transicao.configuracaoHash});
        const n=estado.ler(),t=n.transicao,s=await consultar();
        assert.ok(n.congelado&&n.selado&&t.fase==='INICIADA'&&t.ticket===null);assert.equal(t.id,e.transicao.id);assert.equal(t.checkpointId,plano.checkpointId);assert.equal(t.configuracaoHash,e.transicao.configuracaoHash);
        assert.equal(t.recuperacao.id,plano.id);assert.equal(t.pidDestino,novo.pid);assert.notEqual(t.pidDestino,plano.pidAnterior);assert.equal(t.destino,novo.instancia);assert.notEqual(t.destino,plano.instanciaAnterior);
        assert.deepEqual(n.instancias,[t.destino]);conferirDrenagem(s);assert.equal(s.pid,t.pidDestino);assert.equal(s.instancia,t.destino);
        estado.gravar({...n,transicao:{...t,recuperacao:{...t.recuperacao,etapa:'PRONTA_SMOKE'}}});
        return {status:'PRONTA_SMOKE',reutilizada:false};
      }catch(err){if(iniciou){const e=estado.ler();estado.gravar({...e,congelado:true,selado:true,transicao:{...e.transicao,fase:'INCERTA',recuperacao:{...e.transicao.recuperacao,etapa:'INTERROMPIDA'}}});}throw err;}
      finally{try{soltar?.();}finally{ocupado=false;}}
    },
    async abrirSmoke(plano,{autorizar=false}={}){
      assert.equal(autorizar,true,'SMOKE_NAO_AUTORIZADO');assert.ok(!ocupado,'RECUPERACAO_EM_ANDAMENTO');ocupado=true;let iniciou=false,soltar;
      try{
        assert.equal(typeof adquirirExclusivo,'function','RECUPERACAO_TRAVA_OBRIGATORIA');soltar=adquirirExclusivo();
        const e=estado.ler(),t=e.transicao;assert.equal(t?.recuperacao?.id,plano.id);assert.equal(t.recuperacao.etapa,'PRONTA_SMOKE');
        assert.equal(t.configuracaoHash,fingerprint(ambiente));assert.ok(e.congelado&&e.selado&&t.fase==='INICIADA');
        await conferirVigencia(plano);
        const s=await consultar();conferirDrenagem(s);assert.equal(s.pid,t.pidDestino);assert.equal(s.instancia,t.destino);
        estado.gravar({...e,selado:false,transicao:{...t,fase:'LEITURA',recuperacao:{...t.recuperacao,etapa:'SMOKE'}}});iniciou=true;
        const aberto=await abrirLeitura(t.id);assert.ok(aberto.congelado&&!aberto.selado&&aberto.resultadosIncertos===0);assert.equal(aberto.pid,t.pidDestino);assert.equal(aberto.instancia,t.destino);
        return {status:'SOMENTE_LEITURA',escritasLiberadas:false};
      }catch(err){if(iniciou){const e=estado.ler();estado.gravar({...e,congelado:true,selado:true,transicao:{...e.transicao,fase:'INCERTA',recuperacao:{...e.transicao.recuperacao,etapa:'INTERROMPIDA'}}});}throw err;}
      finally{try{soltar?.();}finally{ocupado=false;}}
    }
  };
}
module.exports={criarRecuperacao,conferirEvidencias};
