'use strict';
// Sem acesso direto a banco, criacao de fixtures, retry ou liberacao HTTP.
const assert=require('node:assert/strict'),jwt=require('jsonwebtoken');
async function executarSmokeFinalIsolado({canal,contas,jwtSecret,tokensAntigos}){
  assert.equal(contas.length,4);assert.deepEqual([...new Set(contas.map(x=>x.perfil))].sort(),['admin','fornecedor','organizador','participante']);assert.ok(Array.isArray(tokensAntigos)&&tokensAntigos.length===2);
  const http=[];
  async function req(method,route,expected,op={}){const r=await canal.requisitar({method,route,body:op.body,token:op.token});http.push({method,route,status:r.status,...(op.perfil?{perfil:op.perfil}:{})});assert.equal(r.status,expected,'SMOKE_HTTP_CONTRATO');return r.body;}
  await req('GET','/perfil',401);
  for(const token of tokensAntigos)await req('GET','/perfil',401,{token});
  const tokens=new Map();
  for(const a of contas){
    const login=await req('POST','/login',200,{body:{email:a.email,senha:a.password},perfil:a.perfil});
    const claims=jwt.verify(login.token,jwtSecret,{algorithms:['HS256']});assert.equal(claims.id,a.id);assert.equal(claims.perfil,a.perfil);assert.equal(claims.exp-claims.iat,3600);tokens.set(a.perfil,login.token);
    const perfil=await req('GET','/perfil',200,{token:login.token,perfil:a.perfil});require('./smoke-perfil.cjs').validarRespostaPerfil(perfil,a);
    const route={admin:'/admin/eventos',organizador:'/cotacoes',fornecedor:'/fornecedor/cotacoes',participante:'/participante/eventos'}[a.perfil];assert.ok(Array.isArray(await req('GET',route,200,{token:login.token,perfil:a.perfil})));
    assert.ok(a.perfil==='admin'?Array.isArray(await req('GET','/usuarios',200,{token:login.token,perfil:a.perfil})):(await req('GET','/usuarios',403,{token:login.token,perfil:a.perfil}))!==undefined);
  }
  await req('GET','/fornecedor/cotacoes',403,{token:tokens.get('admin'),perfil:'admin'});
  for(const [method,route] of [['POST','/eventos'],['PUT','/eventos/1/custos'],['POST','/fornecedor/propostas'],['POST','/participante/inscricoes'],['PATCH','/eventos/1'],['DELETE','/eventos/1']])await req(method,route,503,{body:{},token:tokens.get('organizador')});
  return {status:'SMOKE_ISOLADO_LEITURA_APROVADO',http,perfisAprovados:4,jwtAntigosRecusados:true,contratoPerfilValidado:true,permissoesAprovadas:true,escritasBloqueadas:true,dataWrites:false,maintenanceReleased:false};
}
module.exports={executarSmokeFinalIsolado};
