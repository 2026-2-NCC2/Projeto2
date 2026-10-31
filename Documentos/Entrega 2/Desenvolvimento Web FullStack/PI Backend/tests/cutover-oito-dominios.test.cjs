"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {TABLES,FKS,normal,planejar,sqlMysql}=require('../scripts/delta-cutover.cjs');
const {avaliarCongelamentoGlobal}=require('../config/preparacao-global-cutover.cjs');
const {verificarDeltaFinal,EXTRAS}=require('../scripts/verificar-delta-final.cjs');
function fixture(){const rows=Object.fromEntries(TABLES.map(t=>[t,[]])),columns=Object.fromEntries(TABLES.map(t=>[t,['id']]));columns.usuarios=['id','email','nome'];rows.usuarios=[{id:'1',email:'ficticio@example.invalid',nome:'Ficticio'}];return {rows,columns};}
test('delta recusa colisao de identidade e preserva literais vazios/null',()=>{
  const {rows,columns}=fixture(),after=structuredClone(rows);after.usuarios[0].nome='';const p=planejar(rows,after,columns);
  assert.match(sqlMysql(p),/CONVERT\(X'' USING utf8mb4\)/);assert.match(sqlMysql(p),/ROW_COUNT\(\)=1/);assert.match(sqlMysql(p),/START TRANSACTION/);
  after.usuarios[0].id='2';assert.throws(()=>planejar(rows,after,columns),/DELTA_COLISAO_IDENTIDADE/);
});
test('delta recusa perda de precisao/fuso e relacao orfa',()=>{
  assert.equal(normal('criada_em','2026-12-01 10:00:00+00'),'2026-12-01 10:00:00');
  for(const s of ['2026-12-01 10:00:00.123+00','2026-12-01 10:00:00-03'])assert.throws(()=>normal('criada_em',s));
  const {rows,columns}=fixture();columns.eventos=['id','usuario_id'];rows.eventos=[{id:'1',usuario_id:'2'}];assert.throws(()=>planejar(rows,rows,columns),/DELTA_VINCULO_INVALIDO/);
});
function global(){const now=100000;return {now,inventory:{completoConfirmado:true,responsavel:'operador-ficticio',processos:[{id:'replica-1',instancia:'boot-1'}],escritoresExternos:[{id:'job-1'}],persistenciaConferida:{escritoresAtivos:0,incerto:false,coletadoEm:now}},evidence:[{id:'replica-1',instancia:'boot-1',coletadoEm:now,congelado:true,escritasPendentes:0,resultadosIncertos:0,operacoesPersistenciaPendentes:0},{id:'job-1',coletadoEm:now,suspenso:true,transacoesPendentes:0,reinicioAutomaticoBloqueado:true}]};}
test('gate nao prolonga validade de evidencia envelhecida',()=>{
  const {now,inventory,evidence}=global();evidence[0].coletadoEm=now-29000;const gate=avaliarCongelamentoGlobal(inventory,evidence,now);assert.equal(gate.validadeAte,now+1000);
  assert.equal(avaliarCongelamentoGlobal(inventory,evidence,now+1001).status,'BLOQUEADO');
});
test('centavos negativos preservam sinal sem float',()=>{
  assert.equal(normal('valor','-0.50'),'-0.50');assert.equal(normal('valor','-0.00'),'0.00');assert.equal(normal('valor','001.2'),'1.20');
});
test('gate global exige todas as replicas, escritores e persistencia; nao aciona freeze',()=>{
  const {now,inventory,evidence}=global();const good=avaliarCongelamentoGlobal(inventory,evidence,now);assert.equal(good.status,'APTO_PARA_COLETA');assert.equal(good.congelamentoAcionado,false);
  for(const key of ['congelado','instancia','operacoesPersistenciaPendentes','resultadosIncertos']){const bad=structuredClone(evidence);bad[0][key]=key==='instancia'?'reiniciada':key==='congelado'?false:1;assert.equal(avaliarCongelamentoGlobal(inventory,bad,now).status,'BLOQUEADO');}
  assert.equal(avaliarCongelamentoGlobal(inventory,evidence.slice(0,1),now).status,'BLOQUEADO');assert.equal(avaliarCongelamentoGlobal(inventory,evidence,now+30001).status,'BLOQUEADO');
  const unknown=[...evidence,{id:'desconhecido'}];assert.throws(()=>avaliarCongelamentoGlobal(inventory,unknown,now));
});
test('delta final exige freeze e coletas recentes; preserva exatamente os dez adicionais',()=>{
  const {rows,columns}=fixture(),pg=structuredClone(rows);
  for(const t of TABLES){if(t!=='usuarios')columns[t]=['id',...Object.keys(FKS[t]||{})];for(const id of EXTRAS[t])pg[t].push(t==='usuarios'?{id,email:'extra@example.invalid',nome:'Extra'}:{id,...Object.fromEntries(Object.entries(FKS[t]||{}).map(([k,p])=>[k,EXTRAS[p][0]]))});}
  const {now,inventory,evidence}=global(),gate=avaliarCongelamentoGlobal(inventory,evidence,now);
  const input={mysql:rows,supabase:pg,checkpointMysql:rows,checkpointSupabase:pg,columns,gate,capturas:{mysql:{inicio:now,fim:now},supabase:{inicio:now,fim:now}}};
  assert.equal(verificarDeltaFinal(input,now).status,'DELTA_APROVADO_SEM_EXECUTAR_CUTOVER');
  assert.throws(()=>verificarDeltaFinal({...input,gate:{status:'BLOQUEADO'}},now));assert.throws(()=>verificarDeltaFinal(input,now+30001));
  const changed=structuredClone(pg);changed.usuarios[1].nome='Alteracao extra';assert.equal(verificarDeltaFinal({...input,supabase:changed},now).status,'BLOQUEADO');
  const extra=structuredClone(pg);extra.eventos.push({id:'999',usuario_id:'10'});assert.equal(verificarDeltaFinal({...input,supabase:extra},now).status,'BLOQUEADO');
});
