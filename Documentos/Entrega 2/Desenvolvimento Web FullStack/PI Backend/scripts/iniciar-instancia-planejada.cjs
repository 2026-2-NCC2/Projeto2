"use strict";
// Entrada futura: so importa servidor apos ticket privado, PID e configuracao conferidos.
const {criarEstadoPrivado}=require('../config/estado-supervisor.cjs');
const startup=require('../config/startup-controlado.cjs');
if(!process.connected||process.env.TROCATICKET_SUPERVISOR_IPC!=='1')throw Error('STARTUP_IPC_OBRIGATORIO');
process.once('message',m=>{
  try{
    if(m?.tipo!=='cutover-iniciar')throw Error('STARTUP_TICKET_OBRIGATORIO');
    startup.consumirEntrada({estado:criarEstadoPrivado(),env:process.env,instancia:m.instancia,ticket:m.ticket,instalar:true});
    const app=require('../server.js');const s=app.locals.supervisorCutover;if(s.status().instancia!==m.instancia||!s.status().selado)throw Error('STARTUP_INSTANCIA_RECUSADA');
    const port=Number(process.env.PORT||3001);if(!Number.isInteger(port)||port<1||port>65535)throw Error('STARTUP_PORTA_INVALIDA');
    const server=app.listen(port,'127.0.0.1',()=>process.send({tipo:'cutover-pronta',janela:m.janela,instancia:m.instancia}));
    server.once('error',()=>{process.send?.({tipo:'cutover-falha'});process.exitCode=1;process.disconnect();});
  }catch{process.send?.({tipo:'cutover-falha'});process.exitCode=1;process.disconnect();}
});
process.send({tipo:'cutover-aguardando'});
