"use strict";
// Bootstrap privado: consome capacidade especifica, importa selado, ouve so apos handoff.
const assert=require('node:assert/strict'),startup=require('../config/startup-controlado.cjs'),{criarEstadoPrivado}=require('../config/estado-supervisor.cjs'),{conferirSeladoRestabelecido}=require('../config/identidade-supervisor.cjs');
assert.ok(process.connected&&process.env.TROCATICKET_SUPERVISOR_IPC==='1','RESTABELECIMENTO_IPC_OBRIGATORIO');
assert.equal(Number(process.env.PORT||3001),3001,'RESTABELECIMENTO_PORTA_CONFIG_DIVERGENTE');
let stage='PAUSADO',id,app;
const fail=()=>{stage='FALHA';process.send?.({tipo:'restabelecimento-falhou'});};
process.on('message',m=>{
  try{
    if(m?.tipo==='restabelecimento-admitir'){
      assert.equal(stage,'PAUSADO');const e=criarEstadoPrivado();assert.equal(e.ler().transicao.restabelecimento.id,m.id);assert.equal(e.ler().transicao.id,m.janela);
      startup.consumirRestabelecimento({estado:e,env:process.env,instancia:m.instancia,ticket:m.ticket,instalar:true});id=m.id;app=require('../server.js');conferirSeladoRestabelecido(app.locals.supervisorCutover.status());stage='SELADO_SEM_PORTA';process.send({tipo:'restabelecimento-selado',id,pid:process.pid,instancia:m.instancia});
    }else if(m?.tipo==='restabelecimento-ouvir'){
      assert.equal(stage,'SELADO_SEM_PORTA');assert.equal(m.id,id);const e=criarEstadoPrivado().ler();assert.ok(e.congelado&&e.selado&&e.transicao.fase==='INCERTA'&&e.transicao.restabelecimento.etapa==='AGUARDANDO_PORTA');conferirSeladoRestabelecido(app.locals.supervisorCutover.status());stage='VINCULANDO';
      const server=app.listen(3001,'127.0.0.1',()=>{stage='OUVINDO_SELADO';process.send({tipo:'restabelecimento-pronto',id,pid:process.pid});});server.once('error',fail);
    }
  }catch{fail();}
});
process.send({tipo:'restabelecimento-aguardando'});
