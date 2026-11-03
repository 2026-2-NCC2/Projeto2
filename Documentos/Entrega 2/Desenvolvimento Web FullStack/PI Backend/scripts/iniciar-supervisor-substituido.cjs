'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{criarEstadoPrivado}=require('../config/estado-supervisor.cjs'),startup=require('../config/startup-controlado.cjs');
assert.ok(process.connected&&process.env.TROCATICKET_SUPERVISOR_IPC==='1','SUBSTITUICAO_IPC_OBRIGATORIO');assert.equal(Number(process.env.PORT||3001),3001);
const estado=criarEstadoPrivado(),boot=crypto.randomUUID();let app,server,stage='PAUSADO';
process.on('message',m=>{try{
  if(m?.tipo==='substituicao-admitir'){
    assert.equal(stage,'PAUSADO');assert.equal(m.instancia,boot);assert.equal(m.substituicaoId,estado.ler().controleSelado.id);
    const current=estado.ler();if(current.transicao.t1)require('./validar-fence-pos-t1.cjs').validarFence({estado:current,ambiente:process.env,estadoBytes:Buffer.from(JSON.stringify(current)),journalBytes:require('node:fs').readFileSync(require('node:path').join(estado.diretorio,'t1-'+current.transicao.t1.run+'.privado.json'))});
    startup.consumirSubstituicao({estado,env:process.env,instancia:boot,ticket:m.ticket,instalar:true});app=require('../server.js');require('../config/transicao-controlada.cjs').conferirDrenagem(app.locals.supervisorCutover.status());
    require('./canal-smoke-isolado.cjs').anexarSmokeIsolado(app);require('./canal-t1-isolado.cjs').anexarT1Isolado(app);stage='SELADO';process.send({tipo:'substituicao-selada',id:m.id,pid:process.pid,instancia:boot});
  }else if(m?.tipo==='substituicao-ouvir'){
    assert.equal(stage,'SELADO');assert.equal(estado.ler().controleSelado.etapa,'VINCULANDO');require('../config/transicao-controlada.cjs').conferirDrenagem(app.locals.supervisorCutover.status());stage='VINCULANDO';
    server=app.listen(3001,'127.0.0.1',()=>{stage='OUVINDO';process.send({tipo:'substituicao-pronta',id:m.id,pid:process.pid,instancia:boot});});server.once('error',()=>process.send?.({tipo:'substituicao-falhou',id:m.id}));
  }
}catch{stage='FALHA';process.send?.({tipo:'substituicao-falhou',id:m?.id});}});
process.once('disconnect',()=>{
  try{const e=estado.ler();require('../config/autoridade-selada.cjs').revogar(estado,'PAI_DESCONECTADO');if(e.transicao.t1){if(e.transicao.t1.etapa==='CONCLUIDA'&&e.transicao.t1.cleanupVerified===true&&e.transicao.t1.unknownResult===false)return;const n=estado.ler();estado.gravar({...n,transicao:{...n.transicao,t1:{...n.transicao.t1,etapa:'INTERROMPIDA',unknownResult:true}}});return;}}catch{}
  server?.close();process.exitCode=1;setTimeout(()=>process.exit(1),100).unref();
});
process.send({tipo:'substituicao-aguardando',pid:process.pid,parentPid:process.ppid,boot});
