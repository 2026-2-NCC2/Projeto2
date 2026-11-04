'use strict';
// Sempre somente leitura. Nunca cria tabela, bucket, política ou pool no import.
async function executar(env) {
  const {c,pg}=require('./preflight-imagens-producao.cjs').configurar(env);
  const {BUCKET}=require('../eventos-imagens.cjs');
  const ref='gnwybroqfvwosiqzsfla',checks={};
  const r=await fetch(c.url+'/rest/v1/eventos?select=id&limit=0',{redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:c.secretKey,Authorization:'Bearer '+c.secretKey}});
  if(!r.ok||r.headers.get('sb-project-ref')!==ref)throw Error('PROJETO_RECUSADO');await r.arrayBuffer();
  const pool=require('../db-postgres.js').criarPoolPostgres(pg,{queryTimeoutMs:10000});let db,catalogo;
  try {
    db=await pool.connect();if(db.connection.stream.authorized!==true)throw Error('TLS_RECUSADO');
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query("SET LOCAL statement_timeout='5s'");await db.query("SET LOCAL lock_timeout='2s'");
    const tabela=(await db.query(`SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
      (SELECT count(*)::integer FROM pg_policy WHERE polrelid=c.oid) AS politicas,
      has_table_privilege('service_role',c.oid,'SELECT') AND has_table_privilege('service_role',c.oid,'INSERT') AND has_table_privilege('service_role',c.oid,'UPDATE') AS permitido,
      c.oid FROM pg_class c WHERE c.oid=to_regclass('public.eventos_imagens')`)).rows[0];
    const bucket=(await db.query('SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id=$1',[BUCKET])).rows[0];
    const colunas=(await db.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='eventos_imagens' ORDER BY ordinal_position")).rows;
    const indices=(await db.query("SELECT c.relname AS nome,i.indisvalid,i.indisready,i.indisunique,pg_get_indexdef(i.indexrelid) AS definicao FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=to_regclass('public.eventos_imagens') ORDER BY c.relname")).rows;
    const restricoes=(await db.query("SELECT conname,contype,convalidated,confrelid::regclass::text AS destino,confdeltype,pg_get_constraintdef(oid) AS definicao FROM pg_constraint WHERE conrelid=to_regclass('public.eventos_imagens') ORDER BY conname")).rows;
    const roles=(await db.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')")).rows;
    const version=Number((await db.query('SHOW server_version_num')).rows[0].server_version_num);
    checks.versaoRevisada=version>=150000&&version<190000;
    checks.roles=roles.length===3&&roles.every(x=>x.rolname==='service_role'?x.rolbypassrls:!x.rolsuper&&!x.rolbypassrls);
    checks.tabela=Boolean(tabela?.rls&&tabela.force_rls&&tabela.politicas===0&&tabela.permitido);
    const expected={operacao:'uuid',evento_id:'integer',evento_origem:'integer',usuario_id:'integer',posicao:'smallint',bucket:'text',caminho:'text',mime:'text',tamanho:'integer',largura:'integer',altura:'integer',estado:'text',reserva_ate:'timestamp with time zone',limpeza_apos:'timestamp with time zone',lease_ate:'timestamp with time zone',tentativas:'integer',ultimo_erro_codigo:'text',criado_em:'timestamp with time zone',atualizado_em:'timestamp with time zone'};
    checks.colunas=colunas.length===Object.keys(expected).length&&colunas.every(x=>expected[x.column_name]===x.data_type);
    checks.indices=['eventos_imagens_reserva_unica','eventos_imagens_atual_unica','eventos_imagens_limpeza','eventos_imagens_usuario_evento','eventos_imagens_orfaos'].every(nome=>indices.some(x=>x.nome===nome&&x.indisvalid&&x.indisready&&(!nome.endsWith('_unica')||x.indisunique)));
    checks.restricoes=restricoes.length>=14&&restricoes.every(x=>x.convalidated)&&restricoes.some(x=>x.contype==='f'&&x.destino==='eventos'&&x.confdeltype==='n')&&restricoes.some(x=>x.contype==='f'&&x.destino==='usuarios'&&x.confdeltype==='r');
    const possui=(nome,partes)=>restricoes.some(x=>x.conname===nome&&partes.every(p=>x.definicao.includes(p)));
    checks.contrato=possui('eventos_imagens_posicao_check',['posicao >= 0','posicao <= 8'])&&
      possui('eventos_imagens_bucket_check',["'eventos-imagens'"])&&possui('eventos_imagens_mime_check',["'image/webp'"])&&
      possui('eventos_imagens_estado_check',["'reservado'","'atual'","'limpeza'","'limpando'","'removido'"])&&
      possui('eventos_imagens_tamanho_check',['tamanho >= 1','tamanho <= 10485760'])&&
      possui('eventos_imagens_largura_check',['largura >= 1','largura <= 1920'])&&
      possui('eventos_imagens_altura_check',['altura >= 1','altura <= 1920']);
    checks.bucket=Boolean(bucket&&!bucket.public&&Number(bucket.file_size_limit)===10485760&&Array.isArray(bucket.allowed_mime_types)&&bucket.allowed_mime_types.length===1&&bucket.allowed_mime_types[0]==='image/webp');
    checks.permissoes=false;
    if(tabela){
      const extras='TRUNCATE,REFERENCES,TRIGGER'+(version>=170000?',MAINTAIN':'');
      checks.permissoes=!(await db.query(`SELECT has_table_privilege('anon',$1::oid,$2) OR has_table_privilege('authenticated',$1::oid,$2)
        OR has_table_privilege('service_role',$1::oid,$3)
        OR has_table_privilege('service_role',$1::oid,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
        OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=$1::oid
          AND a.grantee NOT IN(c.relowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
          AND NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=a.grantee AND r.rolsuper)) AS indevido`,[tabela.oid,'SELECT,INSERT,UPDATE,DELETE,'+extras,'DELETE,'+extras])).rows[0].indevido;
    }
    await db.query('SET LOCAL ROLE service_role');
    checks.dependencias=(await db.query(`SELECT has_table_privilege(current_user,'public.usuarios','SELECT') AND has_table_privilege(current_user,'public.usuarios','UPDATE')
      AND has_table_privilege(current_user,'public.eventos','SELECT') AND has_table_privilege(current_user,'public.eventos','UPDATE')
      AND has_table_privilege(current_user,'public.cotacoes','SELECT') AND has_table_privilege(current_user,'public.propostas','SELECT')
      AND has_table_privilege(current_user,'public.inscricoes','SELECT') AND has_table_privilege(current_user,'public.contas_teste_imagens','SELECT')
      AND has_table_privilege(current_user,'public.contas_teste_imagens','UPDATE') AS ok`)).rows[0].ok;
    checks.gestaoV1=[1,3].includes((await db.query('SELECT public.eventos_capacidades_v1() AS v')).rows[0].v);
    catalogo={tabelaExiste:Boolean(tabela),bucket:bucket||null,colunas,indices,restricoes};
  }finally{if(db){try{await db.query('ROLLBACK');}finally{db.release();}}await pool.end();}
  return {projeto:ref,somenteLeitura:true,tlsVerificado:true,coletadoEm:new Date().toISOString(),pronto:Object.values(checks).every(Boolean),checks,catalogo};
}
if(require.main===module){
  if(process.argv.length!==3||process.argv[2]!=='--somente-leitura')throw Error('Exige --somente-leitura');
  executar(require('dotenv').parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../.env'))))
    .then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('PREFLIGHT_EVENTOS_IMAGENS_RECUSADO');process.exitCode=1;});
}
module.exports={executar};
