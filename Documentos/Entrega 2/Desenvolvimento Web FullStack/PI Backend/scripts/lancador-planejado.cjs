"use strict";
const {fork}=require('node:child_process'),path=require('node:path');
// Apenas construir este adapter nao inicia nada. Nunca imprime ambiente/segredos.
function criarLancadorPlanejado(ambienteNovo){return ()=>new Promise((resolve,reject)=>{
  const child=fork(path.join(__dirname,'iniciar-instancia-planejada.cjs'),[],{cwd:path.join(__dirname,'..'),windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{...ambienteNovo,TROCATICKET_SUPERVISOR_IPC:'1'}});
  const timer=setTimeout(()=>fim(Error('STARTUP_PRONTIDAO_TIMEOUT')),15000);
  function fim(e){clearTimeout(timer);child.removeListener('message',receber);child.removeListener('exit',saiu);e?reject(e):resolve(child);}
  function receber(m){if(m?.tipo==='cutover-aguardando')fim();}function saiu(){fim(Error('STARTUP_PREPARACAO_FALHOU'));}child.on('message',receber);child.once('exit',saiu);
});}
module.exports={criarLancadorPlanejado};
// Lane distinta: nao reutiliza ticket ou identidade da migracao interrompida.
function criarLancadorRestabelecimento(env){return ()=>new Promise((resolve,reject)=>{
  const child=fork(path.join(__dirname,'iniciar-supervisor-restabelecido.cjs'),[],{cwd:path.join(__dirname,'..'),windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{...env,TROCATICKET_SUPERVISOR_IPC:'1'}});
  const timer=setTimeout(()=>fim(Error('RESTABELECIMENTO_PAUSA_TIMEOUT')),15000);
  function fim(e){clearTimeout(timer);child.removeListener('message',receber);child.removeListener('exit',saiu);e?reject(e):resolve(child);}
  function receber(m){if(m?.tipo==='restabelecimento-aguardando')fim();}function saiu(){fim(Error('RESTABELECIMENTO_PAUSA_ENCERROU'));}child.on('message',receber);child.once('exit',saiu);
});}
module.exports.criarLancadorRestabelecimento=criarLancadorRestabelecimento;
