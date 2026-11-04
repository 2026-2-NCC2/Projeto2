"use strict";
const { falha, exigirConfiguracao } = require('./homologacao-config.cjs');

// Chamadas futuras explicitamente autorizadas. Nenhuma chamada ao importar.
function criarLeitorRemoto(config, executarFetch = fetch) {
  exigirConfiguracao(config);
  return async (entrada, opcoes = {}) => {
    if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw falha('IH_TLS');
    const url = new URL(String(entrada));
    if (url.origin !== config.url || url.username || url.password || url.hash ||
        !['/rest/v1/usuarios','/storage/v1/bucket/perfil-fotos','/storage/v1/bucket/perfil-capas'].includes(url.pathname) ||
        (opcoes.method || 'GET').toUpperCase() !== 'GET') throw falha('IH_HTTP_DESTINO');
    const signal = opcoes.signal ? AbortSignal.any([opcoes.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
    const resposta = await executarFetch(url.href, { ...opcoes, method:'GET', redirect:'error', signal });
    if (resposta.headers.get('sb-project-ref') !== config.ref) throw falha('IH_HTTP_PROJECT');
    // Consumir corpo dentro do timeout. Nenhuma URL/credencial é registrada.
    const partes=[];let bytes=0;
    if (resposta.body) for await(const parte of resposta.body) {
      bytes+=parte.length;if(bytes>1024*1024)throw falha('IH_HTTP_TAMANHO');partes.push(Buffer.from(parte));
    }
    return new Response(Buffer.concat(partes),{status:resposta.status,headers:resposta.headers});
  };
}
async function verificarVinculo(config, { pool, ler }) {
  exigirConfiguracao(config);
  const opcoes=pool.options || {};
  if(opcoes.host!==config.pg.PGHOST || opcoes.user!==config.pg.PGUSER || opcoes.database!==config.pg.PGDATABASE ||
      Number(opcoes.port)!==Number(config.pg.PGPORT) || opcoes.ssl?.rejectUnauthorized!==true ||
      opcoes.query_timeout!==10000 || opcoes.max!==2)throw falha('IH_POOL_DESTINO');
  // Não usa current_database() como identificação. O host direto ou o usuário
  // do Session pooler já deve estar fixado ao ref validado antes de conectar.
  const ids=config.contas.map(c=>c.id);
  const headers={apikey:config.secretKey,Authorization:`Bearer ${config.secretKey}`};
  const resposta=await ler(`${config.url}/rest/v1/usuarios?select=id,email,perfil&id=in.(${ids.join(',')})`,{headers});
  if(!resposta.ok)throw falha('IH_REST');
  const rest=await resposta.json();
  const projetar=lista=>{
    if(!Array.isArray(lista) || lista.length!==4)throw falha('IH_IDENTIDADES');
    return lista.map(c=>({id:c.id,email:c.email,perfil:c.perfil})).sort((a,b)=>a.id-b.id);
  };
  const esperado=JSON.stringify(projetar(config.contas));
  if(JSON.stringify(projetar(rest))!==esperado)throw falha('IH_IDENTIDADES');
  let c;
  try {
    c=await pool.connect();await c.query('BEGIN READ ONLY');await c.query('SET LOCAL ROLE service_role');
    await c.query("SET LOCAL statement_timeout='5s'");await c.query("SET LOCAL lock_timeout='2s'");
    const permissao=await c.query(`SELECT current_user AS papel, r.rolbypassrls,
      has_schema_privilege(current_user,'public','USAGE') AS esquema,
      has_table_privilege(current_user,'public.usuarios','SELECT') AND
      has_table_privilege(current_user,'public.usuarios','UPDATE') AS usuarios
      FROM pg_roles r WHERE r.rolname=current_user`);
    const p=permissao.rows[0];
    if(!p || p.papel!=='service_role' || !p.rolbypassrls || !p.esquema || !p.usuarios)throw falha('IH_PG_PERMISSOES');
    const versao=Number((await c.query("SHOW server_version_num")).rows[0].server_version_num);
    if(versao<150000 || versao>=190000)throw falha('IH_PG_VERSAO');
    const extras='TRUNCATE,REFERENCES,TRIGGER'+(versao>=170000?',MAINTAIN':'');
    for(const tabela of ['perfil_imagens','perfil_imagens_objetos']) {
      const r=await c.query(`SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS forcado,
        has_table_privilege('service_role',c.oid,'SELECT') AND has_table_privilege('service_role',c.oid,'INSERT') AND
        has_table_privilege('service_role',c.oid,'UPDATE') AND has_table_privilege('service_role',c.oid,'DELETE') AS crud,
        has_table_privilege('anon',c.oid,$2) OR has_table_privilege('authenticated',c.oid,$2) AS publico,
        has_table_privilege('service_role',c.oid,$3) OR has_table_privilege('service_role',c.oid,
          'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION') AS extras
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1`,
      [tabela,'SELECT,INSERT,UPDATE,DELETE,'+extras,extras]);
      const t=r.rows[0];if(!t || !t.rls || !t.forcado || !t.crud || t.publico || t.extras)throw falha('IH_PG_PERMISSOES');
    }
    const usuarios=await c.query('SELECT id,email,perfil FROM public.usuarios WHERE id=ANY($1::integer[]) ORDER BY id',[ids]);
    if(JSON.stringify(projetar(usuarios.rows))!==esperado)throw falha('IH_PG_PROJECT');
    // Worker futuro alcança o diário inteiro. Exigir baseline vazio para a
    // primeira admissão desta configuração, sem apagar qualquer registro.
    const diario=await c.query('SELECT count(*)::integer AS total FROM public.perfil_imagens_objetos');
    if(diario.rows[0]?.total!==0)throw falha('IH_DIARIO_NAO_VAZIO');
    const politicas=await c.query("SELECT count(*)::integer AS total FROM pg_policies WHERE schemaname='storage' AND tablename IN ('objects','buckets')");
    if(politicas.rows[0]?.total!==0)throw falha('IH_STORAGE_POLITICAS');
  } finally {
    if(c){let erro;try{await c.query('ROLLBACK');}catch{erro=true;}c.release(erro);if(erro)throw falha('IH_PG_CONEXAO');}
  }
  for(const [id,limite] of [['perfil-fotos',5242880],['perfil-capas',10485760]]) {
    const r=await ler(`${config.url}/storage/v1/bucket/${id}`,{headers});
    if(!r.ok)throw falha('IH_STORAGE');const b=await r.json();
    if(b.id!==id || b.public!==false || Number(b.file_size_limit)!==limite ||
        !Array.isArray(b.allowed_mime_types) || b.allowed_mime_types.length!==1 || b.allowed_mime_types[0]!=='image/webp')throw falha('IH_STORAGE');
  }
  return Object.freeze({aprovado:true,ref:config.ref,escritasHabilitadas:false});
}
module.exports={criarLeitorRemoto,verificarVinculo};
