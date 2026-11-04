'use strict';
const fs=require('node:fs'),path=require('node:path');
async function executar(env){
  const {c,pg}=require('./preflight-imagens-producao.cjs').configurar(env);
  const pool=require('../db-postgres.js').criarPoolPostgres(pg,{queryTimeoutMs:10000});let db;
  try{
    const rest=await fetch(c.url+'/rest/v1/eventos?select=id&limit=0',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:c.secretKey,Authorization:'Bearer '+c.secretKey}});
    if(!rest.ok||rest.headers.get('sb-project-ref')!=='gnwybroqfvwosiqzsfla')throw Error('PROJETO_RECUSADO');
    db=await pool.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if(db.connection.stream.authorized!==true)throw Error('TLS_RECUSADO');
    await db.query("SET LOCAL statement_timeout='5s'");
    const colunas=(await db.query(`SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_default,is_identity,identity_generation
      FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('eventos','inscricoes') ORDER BY table_name,ordinal_position`)).rows;
    const restricoes=(await db.query(`SELECT conrelid::regclass::text AS tabela,conname,contype,convalidated,pg_get_constraintdef(oid) AS definicao
      FROM pg_constraint WHERE conrelid IN ('public.eventos'::regclass,'public.inscricoes'::regclass)
      OR confrelid='public.eventos'::regclass ORDER BY tabela,conname`)).rows;
    const indices=(await db.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('eventos','inscricoes') ORDER BY tablename,indexname")).rows;
    const estados=(await db.query('SELECT status,count(*)::integer AS quantidade FROM public.eventos GROUP BY status ORDER BY status')).rows;
    const seguranca=(await db.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
      has_table_privilege('service_role',c.oid,'SELECT') AS leitura,
      has_table_privilege('service_role',c.oid,'INSERT') AS inserir,
      has_table_privilege('service_role',c.oid,'UPDATE') AS atualizar,
      (SELECT count(*)::integer FROM pg_policy WHERE polrelid=c.oid) AS politicas
      FROM pg_class c WHERE c.oid IN ('public.eventos'::regclass,'public.inscricoes'::regclass)`)).rows;
    const triggers=(await db.query(`SELECT tgrelid::regclass::text AS tabela,tgname,pg_get_triggerdef(oid) AS definicao
      FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.eventos'::regclass,'public.inscricoes'::regclass)`)).rows;
    const funcoes=(await db.query("SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('eventos_capacidades_v1','gerir_evento_v1','inscrever_evento_v1')")).rows;
    const esperadas=['id','nome','data','horario','local','categoria','publico','descricao','status','usuario_id'];
    const camposEvento=colunas.filter(x=>x.table_name==='eventos');
    return {projeto:'gnwybroqfvwosiqzsfla',somenteLeitura:true,coletadoEm:new Date().toISOString(),tlsVerificado:true,
      comparacao:{camposBasePresentes:esperadas.every(c=>camposEvento.some(x=>x.column_name===c)),
        colunasAdicionais:camposEvento.filter(x=>!esperadas.includes(x.column_name)).map(x=>x.column_name),
        estadosCompativeis:estados.every(x=>['Em planejamento','Ativo','Cancelado','Encerrado'].includes(x.status))},
      colunas,restricoes,indices,estados,seguranca,triggers,funcoes};
  }finally{if(db){try{await db.query('ROLLBACK');}finally{db.release();}}await pool.end();}
}
if(require.main===module){
  if(process.argv[2]!=='--somente-leitura')throw Error('Exige --somente-leitura');
  executar(require('dotenv').parse(fs.readFileSync(path.join(__dirname,'../.env')))).then(r=>{
    fs.writeFileSync(path.join(__dirname,'../evidencias/eventos-preflight-20261104.json'),JSON.stringify(r,null,2)+'\n');
    console.log(JSON.stringify(r));
  }).catch(()=>{console.error('PREFLIGHT_EVENTOS_RECUSADO');process.exitCode=1;});
}
module.exports={executar};
