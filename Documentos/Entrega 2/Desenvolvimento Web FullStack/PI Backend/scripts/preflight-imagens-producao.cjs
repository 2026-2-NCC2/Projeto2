'use strict';
// Somente leitura, execução explícita. Não importa server.js nem habilita rotas.
const REF='gnwybroqfvwosiqzsfla';
function configurar(env){
  const c=require('../config/banco.cjs').lerConfiguracaoBanco(env);
  if(c.provider!=='supabase'||c.url!==`https://${REF}.supabase.co`)throw Error('PROJETO_RECUSADO');
  const direto=env.PGHOST===`db.${REF}.supabase.co`&&env.PGUSER==='postgres';
  const pooler=/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(env.PGHOST||'')&&env.PGUSER===`postgres.${REF}`;
  if(!(direto||pooler)||env.PGDATABASE!=='postgres'||String(env.PGPORT)!=='5432'||!env.PGPASSWORD||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('PG_CONFIG_RECUSADA');
  return {c,pg:{PGHOST:env.PGHOST,PGUSER:env.PGUSER,PGPASSWORD:env.PGPASSWORD,PGDATABASE:env.PGDATABASE,PGPORT:'5432',
    PGPOOL_MAX:'2',PGCONNECT_TIMEOUT_MS:'5000',PGIDLE_TIMEOUT_MS:'10000',...(env.PGSSLROOTCERT?{PGSSLROOTCERT:env.PGSSLROOTCERT}:{})}};
}
async function executar(env,{somentePostgres=false,exigirDiarioVazio=true,validarContasTeste=false}={}){
  const resultado={aprovado:false,somenteLeitura:true,uploadsHabilitados:false};
  if(somentePostgres)resultado.escopo='postgresql';
  let etapa='CONFIG',pool,conexao;
  const exigir=(ok)=>{if(!ok)throw Error('VERIFICACAO_RECUSADA');};
  try{
    const {c,pg}=configurar(env);resultado.destinosCompativeis=true;
    const get=async caminho=>{
      const r=await fetch(c.url+caminho,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),
        headers:{apikey:c.secretKey,Authorization:`Bearer ${c.secretKey}`}});
      exigir(r.ok&&r.headers.get('sb-project-ref')===REF);
      const partes=[];let tamanho=0;
      for await(const parte of r.body){tamanho+=parte.length;exigir(tamanho<=1024*1024);partes.push(parte);}
      return JSON.parse(Buffer.concat(partes).toString('utf8'));
    };
    if(!somentePostgres){
    etapa='REST';
    for(const [tabela,campos] of [['perfil_imagens','usuario_id,tipo,objeto_id,estado_objeto,atualizado_em'],
      ['perfil_imagens_objetos','operacao,usuario_id,tipo,estado,bucket,caminho,reserva_ate,lease_ate']]){
      exigir(Array.isArray(await get(`/rest/v1/${tabela}?select=${campos}&limit=0`)));
    }
    resultado.restProjetoETabelas=true;
    etapa='STORAGE';
    for(const [id,limite] of [['perfil-fotos',5242880],['perfil-capas',10485760]]){
      const b=await get('/storage/v1/bucket/'+id);
      exigir(b.id===id&&b.public===false&&Number(b.file_size_limit)===limite&&Array.isArray(b.allowed_mime_types)&&b.allowed_mime_types.length===1&&b.allowed_mime_types[0]==='image/webp');
    }
    resultado.bucketsPrivadosELimites=true;
    }
    etapa='PG_CONEXAO';pool=require('../db-postgres.js').criarPoolPostgres(pg,{queryTimeoutMs:10000});
    conexao=await pool.connect();await conexao.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    exigir(conexao.connection?.stream?.authorized===true);
    resultado.tlsVerificado=true;
    await conexao.query("SET LOCAL statement_timeout='5s'");await conexao.query("SET LOCAL lock_timeout='2s'");
    etapa='PG_PERMISSOES';await conexao.query('SET LOCAL ROLE service_role');
    const role=(await conexao.query(`SELECT current_user='service_role' AND rolbypassrls AS ok,
      has_schema_privilege(current_user,'public','USAGE') AS esquema,
      has_table_privilege(current_user,'public.usuarios','SELECT') AND has_table_privilege(current_user,'public.usuarios','UPDATE') AS usuarios
      FROM pg_roles WHERE rolname=current_user`)).rows[0];
    exigir(role?.ok&&role.esquema&&role.usuarios);
    const publico=(await conexao.query("SELECT count(*)::integer AS total FROM pg_roles WHERE rolname IN ('anon','authenticated') AND NOT rolbypassrls AND NOT rolsuper")).rows[0];exigir(publico.total===2);
    const v=Number((await conexao.query('SHOW server_version_num')).rows[0].server_version_num);exigir(v>=150000&&v<190000);
    const extras='TRUNCATE,REFERENCES,TRIGGER'+(v>=170000?',MAINTAIN':'');
    for(const tabela of ['perfil_imagens','perfil_imagens_objetos']){
      const t=(await conexao.query(`SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS forcado,
        has_table_privilege('service_role',c.oid,'SELECT') AND has_table_privilege('service_role',c.oid,'INSERT') AND
        has_table_privilege('service_role',c.oid,'UPDATE') AND has_table_privilege('service_role',c.oid,'DELETE') AS crud,
        has_table_privilege('anon',c.oid,$2) OR has_table_privilege('authenticated',c.oid,$2) AS publico,
        has_table_privilege('service_role',c.oid,$3) OR has_table_privilege('service_role',c.oid,
          'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION') AS extras
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1`,[tabela,'SELECT,INSERT,UPDATE,DELETE,'+extras,extras])).rows[0];
      exigir(t?.rls&&t.forcado&&t.crud&&!t.publico&&!t.extras);
    }
    resultado.rlsEPermissoes=true;
    if(validarContasTeste){
      etapa='PG_CONTAS_TESTE';
      const t=(await conexao.query(`SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS forcado,
        has_table_privilege('service_role',c.oid,'SELECT') AND has_table_privilege('service_role',c.oid,'INSERT') AND
        has_table_privilege('service_role',c.oid,'UPDATE') AS permitido,
        has_table_privilege('service_role',c.oid,$1) AS proibido,
        has_table_privilege('anon',c.oid,$2) OR has_table_privilege('authenticated',c.oid,$2) AS publico,
        (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid)=0 AS sem_politicas
        FROM pg_class c WHERE c.oid='public.contas_teste_imagens'::regclass`,[
          'DELETE,'+extras+',SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION',
          'SELECT,INSERT,UPDATE,DELETE,'+extras])).rows[0];
      exigir(t?.rls&&t.forcado&&t.permitido&&!t.proibido&&!t.publico&&t.sem_politicas);
      exigir((await conexao.query("SELECT has_schema_privilege(current_user,'storage','USAGE') AND has_table_privilege(current_user,'storage.objects','SELECT') AS ok")).rows[0]?.ok);
      resultado.contasTesteProtegidas=true;
    }
    etapa='PG_STORAGE_POLITICAS';
    exigir((await conexao.query("SELECT count(*)::integer AS total FROM pg_policies WHERE schemaname='storage' AND tablename IN ('objects','buckets')")).rows[0].total===0);
    resultado.semPoliticasStorage=true;
    etapa='PG_INTEGRIDADE';
    exigir((await conexao.query("SELECT convalidated AND condeferrable AND condeferred AS ok FROM pg_constraint WHERE conrelid='public.perfil_imagens'::regclass AND conname='perfil_imagens_objeto_atual_fk'")).rows[0]?.ok);
    exigir((await conexao.query("SELECT count(*)::integer AS total FROM pg_index WHERE indrelid='public.perfil_imagens_objetos'::regclass AND indisvalid AND indisready AND indexrelid::regclass::text IN ('perfil_imagens_reserva_unica','perfil_imagens_atual_unica','perfil_imagens_fila_limpeza')")).rows[0].total===3);
    exigir(!(await conexao.query(`SELECT EXISTS(SELECT 1 FROM public.perfil_imagens p LEFT JOIN public.perfil_imagens_objetos o
      ON o.operacao=p.objeto_id AND o.usuario_id=p.usuario_id AND o.tipo=p.tipo WHERE o.operacao IS NULL OR o.estado<>'atual') AS inconsistente`)).rows[0].inconsistente);
    resultado.integridadeReferencias=true;
    resultado.diarioVazio=(await conexao.query('SELECT count(*)::integer AS total FROM public.perfil_imagens_objetos')).rows[0].total===0;
    if(exigirDiarioVazio)exigir(resultado.diarioVazio);
    resultado.aprovado=true;
  }catch(e){resultado.bloqueio=etapa;resultado.codigo=/^[A-Z][A-Z0-9_]{1,63}$/.test(e.code||'')?e.code:'VERIFICACAO_RECUSADA';}
  finally{
    if(conexao){try{await conexao.query('ROLLBACK');}catch{resultado.aprovado=false;resultado.bloqueio='PG_ENCERRAMENTO';}conexao.release();}
    if(pool)await pool.end();
  }
  return resultado;
}
if(require.main===module){
  if(process.argv.length!==3||!['--somente-leitura','--somente-postgres'].includes(process.argv[2])){console.error('Exige --somente-leitura ou --somente-postgres');process.exitCode=1;}
  else executar(require('dotenv').parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../.env'))),{somentePostgres:process.argv[2]==='--somente-postgres'})
    .then(r=>{console.log(JSON.stringify(r));if(!r.aprovado)process.exitCode=1;}).catch(()=>{console.error('PREFLIGHT_RECUSADO');process.exitCode=1;});
}
module.exports={configurar,executar};
