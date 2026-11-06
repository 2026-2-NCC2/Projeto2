'use strict';
// Somente GET HTTP e transações PostgreSQL READ ONLY. Tokens apenas em memória.
const fs=require('node:fs'),assert=require('node:assert/strict');
let etapa='CONFIG';
async function executar(){
 const env=require('dotenv').parse(fs.readFileSync('.env')),{pg}=require('./preflight-imagens-producao.cjs').configurar(env);
 const pool=require('../db-postgres.js').criarPoolPostgres(pg,{queryTimeoutMs:15000});let db;
 const out={coletadoEm:new Date().toISOString(),somenteLeitura:true,http:[]};
 async function get(rota,usuario,esperado=200){etapa='GET '+rota;const token=usuario?require('jsonwebtoken').sign({id:usuario.id,perfil:usuario.perfil},env.JWT_SECRET,{algorithm:'HS256',expiresIn:120}):null;const r=await fetch('http://localhost:3001'+rota,{method:'GET',headers:{Origin:'http://localhost:5173',...(token?{Authorization:'Bearer '+token}:{})},signal:AbortSignal.timeout(10000)});etapa+=' STATUS '+r.status;assert.equal(r.status,esperado);out.http.push({rota,status:r.status,cors:r.headers.get('access-control-allow-origin')==='http://localhost:5173'});return r.json();}
 try{
 db=await pool.connect();assert.equal(db.connection.stream.authorized,true);await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL timezone='UTC'");
 const users=(await db.query("SELECT DISTINCT ON (u.perfil) u.id,u.perfil FROM public.usuarios u WHERE u.perfil IN ('organizador','participante','admin') AND NOT EXISTS(SELECT 1 FROM public.contas_teste_imagens c WHERE c.usuario_id=u.id) ORDER BY u.perfil,u.id")).rows;
 const org=users.find(u=>u.perfil==='organizador'),part=users.find(u=>u.perfil==='participante'),admin=users.find(u=>u.perfil==='admin');assert.ok(org&&part&&admin);
 const v=(await db.query(fs.readFileSync('../Banco de dados/eventos_capacidade.verificacao.sql','utf8'))).rows[0].verificacao;
 const before=JSON.parse(fs.readFileSync('evidencias/eventos-capacidade-aplicacao-20261106.json')).depois.verificacao;
 const {canonical}=require('./backup-postgres-isolado.cjs');assert.equal(canonical(v),canonical(before));out.dadosGestaoPreservados=true;
 out.fila=(await db.query("SELECT estado,count(*)::integer AS quantidade,count(*) FILTER(WHERE lease_ate>now())::integer AS leases FROM public.perfil_imagens_objetos GROUP BY estado ORDER BY estado")).rows;
 out.storage=(await db.query('SELECT bucket_id,count(*)::integer AS quantidade FROM storage.objects GROUP BY bucket_id ORDER BY bucket_id')).rows;
 out.semReferenciaAtual=Number((await db.query('SELECT count(*) AS total FROM public.perfil_imagens')).rows[0].total)===0;
 await db.query('ROLLBACK');
 await get('/eventos/capacidades',null,401);out.capacidades=await get('/eventos/capacidades',org);assert.equal(out.capacidades.controleCapacidade,true);assert.equal(out.capacidades.excluir,false);
 await get('/eventos/capacidades', {...org,id:2147483647},401);
 await get('/admin/eventos',part,403);
 const todos=await get('/admin/eventos',admin);assert.equal(todos.length,6);assert.ok(todos.every(e=>e.capacidade_maxima===null&&e.vagas_restantes===null&&!e.lotado));out.eventos={quantidade:todos.length,semLimite:todos.filter(e=>e.capacidade_maxima===null).length,inscritos:todos.reduce((n,e)=>n+e.inscritos_confirmados,0),estados:v.estados};assert.equal(out.eventos.inscritos,5);
 const proprios=await get('/eventos',org);assert.ok(proprios.every(e=>e.usuario_id===org.id));out.eventosProprios=proprios.length;
 const disponiveis=await get('/participante/eventos',part);assert.ok(disponiveis.every(e=>e.status==='Ativo'));out.eventosDisponiveis=disponiveis.length;
 out.imagens=await get('/eventos/imagens/capacidades',org);assert.equal(out.imagens.alterar,false);
 out.uploadsDesativados=JSON.parse(fs.readFileSync('config/ativacao-eventos-imagens.json')).ativo===false;assert.ok(out.uploadsDesativados);
 fs.writeFileSync('evidencias/eventos-capacidade-retomada-20261106.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
 }finally{if(db){await db.query('ROLLBACK').catch(()=>{});db.release();}await pool.end();}
}
executar().catch(e=>{console.error(JSON.stringify({aprovado:false,etapa,codigo:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'LEITURA_RECUSADA'}));process.exitCode=1;});
