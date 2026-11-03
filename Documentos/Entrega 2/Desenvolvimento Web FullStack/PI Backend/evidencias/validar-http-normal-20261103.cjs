'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),env=require('dotenv').parse(fs.readFileSync(path.join(root,'.env'))),jwt=require('jsonwebtoken');
const cp=JSON.parse(fs.readFileSync('C:/Users/Lucas/BackupsTrocaTicket/t0-b89cb0d48a4e99b43ce50a26238621aa/checkpoint-t0.privado.json'));
const selectors=[['admin',env.HOMOLOG_ADMIN_EMAIL,env.HOMOLOG_ADMIN_PASSWORD],['participante',env.HOMOLOG_PARTICIPANTE_EMAIL,env.HOMOLOG_PARTICIPANTE_PASSWORD],['organizador',null,env.HOMOLOG_PARTICIPANTE_PASSWORD,4],['fornecedor',null,env.HOMOLOG_PARTICIPANTE_PASSWORD,3]];
const http=[];
async function request(method,route,status,body,token){
 const response=await fetch('http://127.0.0.1:3001'+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 http.push({method,route,status:response.status});assert.equal(response.status,status,'NORMAL_HTTP_CONTRATO');return response.json();
}
(async()=>{
 assert.equal(env.DB_PROVIDER,'supabase');
 await request('GET','/perfil',401);
 const tokens={};
 for(const [perfil,email,password,id] of selectors){
  const u=cp.checkpoint.supabase.usuarios.find(x=>email?x.email.trim().toLowerCase()===email.trim().toLowerCase():Number(x.id)===id&&/teste/i.test(x.email));
  assert.ok(u&&u.perfil===perfil&&password);
  const login=await request('POST','/login',200,{email:u.email,senha:password});
  const claims=jwt.verify(login.token,env.JWT_SECRET,{algorithms:['HS256']});assert.equal(claims.id,Number(u.id));assert.equal(claims.perfil,perfil);tokens[perfil]=login.token;
  require('../scripts/smoke-perfil.cjs').validarRespostaPerfil(await request('GET','/perfil',200,null,login.token),{id:Number(u.id),email:u.email});
  const route={admin:'/admin/eventos',participante:'/participante/eventos',organizador:'/cotacoes',fornecedor:'/fornecedor/cotacoes'}[perfil];
  assert.ok(Array.isArray(await request('GET',route,200,null,login.token)));
  const users=await request('GET','/usuarios',perfil==='admin'?200:403,null,login.token);if(perfil==='admin')assert.ok(Array.isArray(users));
 }
 await request('GET','/fornecedor/cotacoes',403,null,tokens.admin);
 const result={status:'SMOKE_HTTP_NORMAL_APROVADO',finishedUtc:new Date().toISOString(),profiles:4,requests:http.length,http,dataWrites:false};
 fs.writeFileSync(path.join(__dirname,'smoke-http-normal-20261103.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 process.stdout.write(JSON.stringify({status:result.status,profiles:4,requests:http.length,dataWrites:false})+'\n');
})().catch(()=>{process.stderr.write('SMOKE_HTTP_NORMAL_RECUSADO\n');process.exitCode=1;});
