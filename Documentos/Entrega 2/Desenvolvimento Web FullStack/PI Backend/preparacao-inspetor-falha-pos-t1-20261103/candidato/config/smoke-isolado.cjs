'use strict';
// Transporte efemero privado. Nunca abre a manutencao da porta principal.
const http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
async function criarCanalSmokeIsolado({app,supervisor,janela,recuperacaoId,prazoMs=60000}){
  return criarTransportePrivado({app,admissao:supervisor.criarAdmissaoSmoke({janela,recuperacaoId}),prazoMs});
}
async function criarCanalT1Isolado({app,supervisor,janela,run,organizadorId,prazoMs=15000}){
  return criarTransportePrivado({app,admissao:supervisor.criarAdmissaoT1({janela,run,organizadorId}),prazoMs});
}
async function criarTransportePrivado({app,admissao,prazoMs}){
  assert.ok(Number.isSafeInteger(prazoMs)&&prazoMs>=1&&prazoMs<=120000);
  const capacidade=crypto.randomBytes(32).toString('hex'),deadline=Date.now()+prazoMs;
  let encerrado=false,ocupado=false,timer;
  const negar=res=>{res.writeHead(503,{'content-type':'application/json','retry-after':'60'});res.end(JSON.stringify({erro:'Escritas temporariamente suspensas para manutencao.'}));};
  const server=http.createServer((req,res)=>{
    const recebido=req.headers['x-trocaticket-smoke-privado'];delete req.headers['x-trocaticket-smoke-privado'];
    if(encerrado||Date.now()>=deadline||typeof recebido!=='string'||!/^([a-f0-9]{64})$/.test(recebido)||!crypto.timingSafeEqual(Buffer.from(recebido),Buffer.from(capacidade)))return negar(res);
    try{admissao.atender(req,res,app);}catch{if(res.headersSent)res.destroy();else negar(res);}
  });
  async function fechar(){if(encerrado)return;encerrado=true;clearTimeout(timer);admissao.fechar();server.closeAllConnections();await new Promise(resolve=>server.close(()=>resolve()));}
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
  catch(e){admissao.fechar();throw e;}
  timer=setTimeout(()=>{void fechar();},prazoMs);timer.unref();
  return Object.freeze({
    async requisitar({method='GET',route,body,token}){
      assert.ok(!encerrado&&!ocupado&&Date.now()<deadline,'SMOKE_PRIVADO_INDISPONIVEL');
      assert.ok(typeof route==='string'&&/^\/[A-Za-z0-9_\/-]*$/.test(route),'SMOKE_PRIVADO_ROTA_INVALIDA');
      ocupado=true;
      try{
        const response=await fetch('http://127.0.0.1:'+server.address().port+route,{method,headers:{connection:'close','x-trocaticket-smoke-privado':capacidade,...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(Math.min(12000,Math.max(1,deadline-Date.now())))});
        return {status:response.status,body:await response.json()};
      }finally{ocupado=false;}
    },fechar
  });
}
module.exports={criarCanalSmokeIsolado,criarCanalT1Isolado};
