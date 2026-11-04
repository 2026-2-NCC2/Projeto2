'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {instalarImagensEvento}=require('../eventos-imagens-http.cjs');
async function appTeste(t,{ativo=false}={}) {
  const app=require('express')(),calls=[];
  const autenticar=(req,res,next)=>{if(!req.headers.authorization)return res.status(401).json({erro:'Sem token'});req.usuario={id:7,perfil:req.headers.authorization};next();};
  instalarImagensEvento(app,{autenticar,receber:require('../imagens/http-binario.cjs').criarRecebedorImagens(),obterIntegracao:()=>ativo?{servico:{
    async listar(){calls.push('listar');return[];},async substituir(u,id,p,b){calls.push({id,p,bytes:b.length,perfil:u.perfil});return{operacao:'fixture'};},async remover(){calls.push('remover');},
  }}:null});
  const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  t.after(()=>new Promise(r=>server.close(r)));
  return{calls,get:async(route,method='GET',body,headers={})=>{
    const r=await fetch('http://127.0.0.1:'+server.address().port+route,{method,headers:{Connection:'close',Authorization:'organizador',...headers},body});
    return{status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};
  }};
}
test('infra bloqueada nunca chama serviço, codec ou Storage; capacidades recusam ativação',async t=>{
  const a=await appTeste(t);
  const caps=await a.get('/eventos/imagens/capacidades');assert.deepEqual(caps.body,{consultar:false,alterar:false,limiteGaleria:8});
  for(const method of ['GET','PUT','DELETE'])assert.equal((await a.get('/eventos/13/imagens'+(method==='GET'?'':'/0'),method)).status,503);
  assert.equal(a.calls.length,0);
});
test('router exige sessão/perfil, limita posição, query e corpo; usa bytes sem aceitar caminhos',async t=>{
  const a=await appTeste(t,{ativo:true});
  assert.equal((await a.get('/eventos/13/imagens','GET',undefined,{Authorization:''})).status,401);
  assert.equal((await a.get('/eventos/13/imagens/0','PUT',undefined,{Authorization:'admin'})).status,403);
  assert.equal((await a.get('/eventos/13/imagens/9','PUT')).status,400);
  assert.equal((await a.get('/eventos/13/imagens?bucket=outro')).status,400);
  assert.equal((await a.get('/eventos/13/imagens/0','PUT','{}',{'Content-Type':'application/json'})).status,415);
  assert.equal((await a.get('/eventos/13/imagens/0','DELETE','{}',{'Content-Type':'application/json'})).status,400);
  const ok=await a.get('/eventos/13/imagens/8','PUT',Buffer.from('binario'),{'Content-Type':'application/octet-stream'});
  assert.equal(ok.status,200);assert.equal(ok.cache,'no-store');assert.deepEqual(a.calls,[{id:13,p:8,bytes:7,perfil:'organizador'}]);
  assert.equal((await a.get('/eventos/13/imagens/0','DELETE')).status,200);
});
