"use strict";
// Canal IPC herdado exclusivamente do pai Node. Nao cria socket HTTP/TCP.
function anexarIPC(supervisor,canal=process){
  if(!canal.connected||typeof canal.send!=='function')throw Error('SUPERVISOR_IPC_AUSENTE');
  const comandos={status:()=>supervisor.status(),congelar:()=>supervisor.congelar(),selar:()=>supervisor.selar(),drenar:ms=>supervisor.aguardarDrenagem(ms),'abrir-leitura':(_,m)=>supervisor.abrirLeitura(m.janela),'liberar-escritas':(_,m)=>supervisor.liberarEscritas(m.janela)};
  const receber=async m=>{if(m?.tipo!=='cutover-supervisor'||typeof m.id!=='string'||!Object.hasOwn(comandos,m.acao))return;
    try{canal.send({tipo:'cutover-resposta',id:m.id,ok:true,status:await comandos[m.acao](m.prazo,m)});}catch(e){canal.send({tipo:'cutover-resposta',id:m.id,ok:false,code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'SUPERVISOR_RECUSADO'});}};
  canal.on('message',receber);return ()=>canal.removeListener('message',receber);
}
module.exports={anexarIPC};
