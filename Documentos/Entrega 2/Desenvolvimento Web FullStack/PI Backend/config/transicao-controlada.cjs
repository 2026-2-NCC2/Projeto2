"use strict";
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fingerprint}=require('./startup-controlado.cjs');
function conferirDrenagem(s){assert.ok(s?.congelado&&s.selado&&s.escritasPendentes===0&&s.requisicoesPendentes===0&&s.operacoesPersistenciaPendentes===0&&s.resultadosIncertos===0,'TRANSICAO_DRENAGEM_PENDENTE');}
function validarGate(g){assert.equal(g?.status,'DELTA_APROVADO_SEM_EXECUTAR_CUTOVER');assert.ok(typeof g.checkpointId==='string'&&g.checkpointId.length>0);assert.equal(g.backupsT0Verificados,true);}
function esperarSaida(child,prazo){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>done(Error('TRANSICAO_SAIDA_TIMEOUT')),prazo);function done(e){clearTimeout(timer);child.removeListener('exit',saiu);e?reject(e):resolve();}function saiu(){done();}child.once('exit',saiu);try{if(child.kill()===false)done(Error('TRANSICAO_ENCERRAMENTO_RECUSADO'));}catch{done(Error('TRANSICAO_ENCERRAMENTO_RECUSADO'));}});}
function esperarInicio(child,janela,instancia,prazo){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>fim(Error('TRANSICAO_STARTUP_TIMEOUT')),prazo);function fim(e){clearTimeout(timer);child.removeListener('message',mensagem);child.removeListener('exit',saiu);e?reject(e):resolve();}function saiu(){fim(Error('TRANSICAO_STARTUP_FALHOU'));}function mensagem(m){if(m?.tipo==='cutover-pronta'&&m.janela===janela&&m.instancia===instancia)fim();else if(m?.tipo==='cutover-falha')fim(Error('TRANSICAO_STARTUP_FALHOU'));}child.on('message',mensagem);child.once('exit',saiu);});}
function criarTransicao({estado,pedir,obterFilho,registrar,agora=Date.now}){
  let ocupado=false;
  async function exclusivo(acao){assert.ok(!ocupado,'TRANSICAO_EM_ANDAMENTO');ocupado=true;try{return await acao();}catch(x){try{const e=estado.ler();if(e.transicao)estado.gravar({...e,congelado:true,selado:true,transicao:{...e.transicao,fase:'INCERTA'}});}catch{}throw x;}finally{ocupado=false;}}
  return {
    substituir:op=>exclusivo(async()=>{
      const {id,lancar,validarT0,ambienteOrigem,ambienteNovo,prazo=30000}=op;assert.equal(typeof lancar,'function');assert.equal(typeof validarT0,'function');assert.ok(Number.isSafeInteger(prazo)&&prazo>0&&prazo<=60000);
      const original=await pedir(id,'status');conferirDrenagem(original);const e=estado.ler();assert.ok(e.congelado&&e.selado&&!e.transicao,'TRANSICAO_ESTADO_RECUSADO');assert.ok(e.instancias.includes(original.instancia));
      const configuracaoHash=fingerprint(ambienteNovo);assert.notEqual(ambienteNovo.JWT_SECRET,ambienteOrigem.JWT_SECRET,'TRANSICAO_JWT_ANTIGO');assert.notEqual(ambienteNovo.JWT_SECRET,ambienteOrigem.HOMOLOG_JWT_SECRET);
      const gate=await validarT0();validarGate(gate);conferirDrenagem(await pedir(id,'status'));
      const anterior=obterFilho(id);assert.ok(anterior?.connected&&Number.isSafeInteger(anterior.pid));
      const t={id:crypto.randomUUID(),origem:original.instancia,destino:crypto.randomUUID(),pidOrigem:anterior.pid,pidDestino:null,ticket:crypto.randomBytes(32).toString('hex'),fase:'AGUARDANDO_SAIDA',configuracaoHash,checkpointId:gate.checkpointId,preparadaEm:agora()};
      estado.gravar({...e,transicao:t});await esperarSaida(anterior,prazo); // Somente processo filho conhecido, ja drenado.
      const novo=await lancar({instancia:t.destino,ticket:t.ticket,janela:t.id});assert.ok(novo?.connected&&Number.isSafeInteger(novo.pid)&&novo.pid!==anterior.pid);
      estado.gravar({...estado.ler(),transicao:{...t,pidDestino:novo.pid,fase:'PREPARADA'}});registrar(id,novo);
      const pronto=esperarInicio(novo,t.id,t.destino,prazo);try{novo.send({tipo:'cutover-iniciar',janela:t.id,instancia:t.destino,ticket:t.ticket});}catch{novo.emit('message',{tipo:'cutover-falha'});}await pronto;
      const s=await pedir(id,'status');conferirDrenagem(s);assert.equal(s.instancia,t.destino);assert.equal(s.pid,novo.pid);assert.equal(estado.ler().transicao.fase,'INICIADA');
      estado.gravar({...estado.ler(),selado:false,transicao:{...estado.ler().transicao,fase:'LEITURA'}});
      return pedir(id,'abrir-leitura',prazo,{janela:t.id});
    }),
    liberar:op=>exclusivo(async()=>{
      const {id,autorizarEscritas,validarSmoke,validarDelta,prazo=30000}=op;assert.equal(autorizarEscritas,true);assert.equal(typeof validarSmoke,'function');assert.equal(typeof validarDelta,'function');
      const e=estado.ler(),t=e.transicao;assert.ok(e.congelado&&t?.fase==='LEITURA');const s=await pedir(id,'status');assert.equal(s.instancia,t.destino);assert.equal(s.pid,t.pidDestino);
      const smoke=await validarSmoke();assert.ok(smoke?.jwtAntigosRecusados===true&&smoke.perfisGetAprovados===true&&smoke.mysqlIsolado===true,'TRANSICAO_SMOKE_RECUSADO');
      await pedir(id,'selar');conferirDrenagem(await pedir(id,'drenar',prazo));
      const gate=await validarDelta();validarGate(gate);assert.equal(gate.checkpointId,t.checkpointId);conferirDrenagem(await pedir(id,'status'));
      assert.equal(estado.ler().transicao.id,t.id);estado.gravar({...estado.ler(),transicao:{...estado.ler().transicao,fase:'LIBERAR'}});
      return pedir(id,'liberar-escritas',prazo,{janela:t.id});
    })
  };
}
module.exports={criarTransicao,conferirDrenagem};
