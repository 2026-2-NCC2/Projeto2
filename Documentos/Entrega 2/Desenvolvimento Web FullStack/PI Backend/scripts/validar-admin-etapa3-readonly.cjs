'use strict';
// Execução explícita: Express em porta efêmera, somente GET e PostgreSQL READ ONLY.
// Importar server.js não inicia o supervisor de limpeza (require.main !== module).
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function executar(){
 const raiz=path.join(__dirname,'..'),env=require('dotenv').parse(fs.readFileSync(path.join(raiz,'.env')));
 const {pg}=require('./preflight-imagens-producao.cjs').configurar(env);
 const pool=require('../db-postgres.js').criarPoolPostgres(pg,{queryTimeoutMs:15000});let db,server;
 const out={coletadoEm:new Date().toISOString(),somenteLeitura:true,supervisorIniciado:false,rotas:[],cotacoesVerificadas:0,itens:0};
 try{
  db=await pool.connect();assert.equal(db.connection.stream.authorized,true);
  const sql=fs.readFileSync(path.join(raiz,'../Banco de dados/eventos_capacidade.verificacao.sql'),'utf8');
  async function verificar(){await db.query('BEGIN READ ONLY');try{await db.query("SET LOCAL timezone='UTC'");return (await db.query(sql)).rows[0].verificacao;}finally{await db.query('ROLLBACK');}}
  const antes=await verificar();await db.query('BEGIN READ ONLY');
  const users=(await db.query("SELECT DISTINCT ON(u.perfil) u.id,u.perfil FROM public.usuarios u WHERE u.perfil IN ('admin','participante') AND NOT EXISTS(SELECT 1 FROM public.contas_teste_imagens c WHERE c.usuario_id=u.id) ORDER BY u.perfil,u.id")).rows;
  await db.query('ROLLBACK');
  const admin=users.find(x=>x.perfil==='admin'),participante=users.find(x=>x.perfil==='participante');assert.ok(admin&&participante);
  const app=require('../server.js');server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  const port=server.address().port;assert.ok(![3001,5173].includes(port));
  const jwt=require('jsonwebtoken');
  async function get(rota,ator,status=200){
   const token=ator?jwt.sign({id:ator.id,perfil:ator.perfil},env.JWT_SECRET,{algorithm:'HS256',expiresIn:180}):null;
   const r=await fetch(`http://127.0.0.1:${port}${rota}`,{method:'GET',headers:{Origin:'http://localhost:5173',...(token?{Authorization:'Bearer '+token}:{})},signal:AbortSignal.timeout(20000)});
   assert.equal(r.status,status);const data=await r.json();return data;
  }
  const listes={};
  for(const rota of ['/admin/eventos','/usuarios','/admin/cotacoes','/admin/propostas','/solicitacoes-acesso']){
   listes[rota]=await get(rota,admin);assert.ok(Array.isArray(listes[rota]));
   await get(rota,participante,403);await get(rota,null,401);
   out.rotas.push({rota,statusAdmin:200,statusParticipante:403,statusSemToken:401,registros:listes[rota].length});
  }
  for(const q of listes['/admin/cotacoes']){
   const d=await get(`/admin/cotacoes/${q.id}`,admin);assert.equal(d.id,q.id);assert.equal(d.evento_id,q.evento_id);assert.ok(Array.isArray(d.itens));
   assert.equal(new Set(d.itens.map(i=>i.id)).size,d.itens.length);out.cotacoesVerificadas++;out.itens+=d.itens.length;
  }
  const cotacao=listes['/admin/cotacoes'][0];assert.ok(cotacao);
  await get(`/admin/cotacoes/${cotacao.id}`,participante,403);await get(`/admin/cotacoes/${cotacao.id}`,null,401);await get('/admin/cotacoes/0',admin,400);await get('/admin/cotacoes/2147483647',admin,404);
  const evento=listes['/admin/eventos'][0];const painel=await get(`/admin/eventos/${evento.id}/painel`,admin);assert.equal(painel.evento.id,evento.id);
  const caps=await get('/eventos/capacidades',admin);assert.equal(caps.controleCapacidade,true);
  out.uploadsDesativados=(await get('/eventos/imagens/capacidades',admin)).alterar===false;assert.ok(out.uploadsDesativados);
  const depois=await verificar();assert.equal(require('./backup-postgres-isolado.cjs').canonical(antes),require('./backup-postgres-isolado.cjs').canonical(depois));
  out.dadosPreservados=true;out.marcador=depois.etapa3.versao_instalada;out.aprovado=true;
  fs.writeFileSync(path.join(raiz,'evidencias/admin-etapa3-leitura.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));if(db){await db.query('ROLLBACK').catch(()=>{});db.release();}await pool.end();
 }
}
if(require.main===module)executar().catch(e=>{console.error(JSON.stringify({aprovado:false,codigo:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'VALIDACAO_RECUSADA'}));process.exitCode=1;});
