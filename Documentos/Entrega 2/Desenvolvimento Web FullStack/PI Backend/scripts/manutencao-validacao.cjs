"use strict";
// Respondedor dedicado de manutencao. Nao carrega .env, Express ou bancos.
function responder(_req,res){
  res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Retry-After':'60','Cache-Control':'no-store','Connection':'close'});
  res.end(JSON.stringify({erro:'Escritas temporariamente suspensas para manutencao.'}));
}
if(require.main===module){
  const assert=require('node:assert/strict');assert.equal(process.argv[2],'--somente-manutencao');
  const estado=require('../config/estado-supervisor.cjs').criarEstadoPrivado().ler();assert.ok(estado.congelado&&estado.selado&&estado.transicao?.fase==='INCERTA');
  const server=require('node:http').createServer(responder);server.requestTimeout=5000;server.headersTimeout=5000;
  server.once('error',()=>{process.send?.({tipo:'manutencao-validacao-falhou'});process.exitCode=1;process.disconnect?.();});
  server.listen(3001,'127.0.0.1',()=>{const ready={tipo:'manutencao-validacao-pronta',pid:process.pid,role:'MANUTENCAO_SEM_BACKEND',boot:require('node:crypto').randomUUID(),port:3001};if(process.send)process.send(ready);else console.log(JSON.stringify(ready));});
}
module.exports={responder};
