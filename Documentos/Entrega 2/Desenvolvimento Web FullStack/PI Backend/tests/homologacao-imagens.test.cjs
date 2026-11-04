"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {writeFileSync,unlinkSync}=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {validarConfiguracao,PRODUCAO}=require('../imagens/homologacao-config.cjs');
const {criarLeitorRemoto,verificarVinculo}=require('../imagens/homologacao-verificacao.cjs');
const {executar}=require('../scripts/homologar-imagens.cjs');
const ref='abcdefghijklmnopqrst';
const contas=['participante','organizador','fornecedor','admin'].map((perfil,i)=>({id:7+i,email:`teste${i}@example.invalid`,perfil}));
function valores(){return{IMAGENS_HOMOLOG_PROJECT_REF:ref,IMAGENS_HOMOLOG_SUPABASE_URL:`https://${ref}.supabase.co`,
  IMAGENS_HOMOLOG_SUPABASE_SECRET_KEY:'sb_secret_chave_sintetica_homologacao',IMAGENS_HOMOLOG_JWT_SECRET:'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'.repeat(2),
  IMAGENS_HOMOLOG_PGHOST:`db.${ref}.supabase.co`,IMAGENS_HOMOLOG_PGPORT:'5432',IMAGENS_HOMOLOG_PGDATABASE:'postgres',
  IMAGENS_HOMOLOG_PGUSER:'postgres',IMAGENS_HOMOLOG_PGPASSWORD:'senha-ficticia-exclusiva-testes',IMAGENS_HOMOLOG_CONTAS:JSON.stringify(contas)};}
test('configuração completa é imutável e ignora campos principais',()=>{
  const v={...valores(),SUPABASE_URL:`https://${PRODUCAO}.supabase.co`,PGHOST:'producao.invalid',JWT_SECRET:'principal-ficticio'};
  const c=validarConfiguracao(v,v);assert.equal(c.url,`https://${ref}.supabase.co`);assert.equal(c.pg.PGPOOL_MAX,'2');assert.ok(Object.isFrozen(c.pg));
});
for(const campo of Object.keys(valores()))test('ausência de '+campo+' não usa fallback',()=>{
  const v=valores();delete v[campo];v[campo.replace('IMAGENS_HOMOLOG_','')]='valor-principal-ficticio';assert.throws(()=>validarConfiguracao(v));
});
for(const [campo,valor]of [
  ['PROJECT_REF',PRODUCAO],['SUPABASE_URL',`https://${PRODUCAO}.supabase.co`],['PGHOST',`db.${PRODUCAO}.supabase.co`],['PGUSER',`postgres.${PRODUCAO}`],
  ['PGHOST','127.0.0.1'],['PGHOST','db.outroprojetoficticioxx.supabase.co'],['PGUSER','postgres.outroprojetoficticioxx'],['PGPORT','6543'],['PGDATABASE','outra'],
])test('destino recusado: '+campo+'/'+valor,()=>assert.throws(()=>validarConfiguracao({...valores(),['IMAGENS_HOMOLOG_'+campo]:valor})));
test('Session pooler exige sufixo exato e segredos distintos',()=>{
  const v={...valores(),IMAGENS_HOMOLOG_PGHOST:'aws-0-sa-east-1.pooler.supabase.com',IMAGENS_HOMOLOG_PGUSER:`postgres.${ref}`};
  assert.equal(validarConfiguracao(v).pg.PGUSER,`postgres.${ref}`);
  assert.throws(()=>validarConfiguracao({...v,IMAGENS_HOMOLOG_PGUSER:'postgres'}));
  assert.throws(()=>validarConfiguracao(v,{JWT_SECRET:v.IMAGENS_HOMOLOG_JWT_SECRET}),{code:'IH_SECRET'});
  assert.throws(()=>validarConfiguracao(v,{SUPABASE_SECRET_KEY:v.IMAGENS_HOMOLOG_SUPABASE_SECRET_KEY}),{code:'IH_SECRET'});
  assert.throws(()=>validarConfiguracao(v,{PGPASSWORD:v.IMAGENS_HOMOLOG_PGPASSWORD}),{code:'IH_SECRET'});
  assert.throws(()=>validarConfiguracao(v,{NODE_TLS_REJECT_UNAUTHORIZED:'0'}),{code:'IH_TLS'});
});
test('pool candidato tem limites explícitos e sua construção não abre conexões',async()=>{
  const c=validarConfiguracao(valores());
  const pool=require('../db-postgres.js').criarPoolPostgres(c.pg,{queryTimeoutMs:10000});
  assert.equal(pool.totalCount,0);assert.equal(pool.options.host,c.pg.PGHOST);assert.equal(pool.options.max,2);
  assert.equal(pool.options.query_timeout,10000);assert.equal(pool.options.connectionTimeoutMillis,5000);
  assert.equal(pool.options.idleTimeoutMillis,10000);assert.equal(pool.options.ssl.rejectUnauthorized,true);
  await pool.end();
});
test('allowlist não aceita conta inválida ou papéis repetidos',()=>{
  for(const lista of [null,[],[null,null,null,null],contas.map(c=>({...c,id:7})),contas.map(c=>({...c,perfil:'admin'}))])
    assert.throws(()=>validarConfiguracao({...valores(),IMAGENS_HOMOLOG_CONTAS:JSON.stringify(lista)}));
});
test('CLI --validar é offline e não escreve process.env',async t=>{
  const arquivo=path.join(os.tmpdir(),'imagens-ficticias-'+randomUUID()+'.env');
  writeFileSync(arquivo,Object.entries(valores()).map(([k,v])=>`${k}=${v}`).join('\n'));t.after(()=>unlinkSync(arquivo));
  const antes=process.env.IMAGENS_HOMOLOG_PROJECT_REF;
  const r=await executar(['--validar','--config',arquivo]);assert.equal(r.redeUtilizada,false);assert.equal(process.env.IMAGENS_HOMOLOG_PROJECT_REF,antes);
  await assert.rejects(executar(['--iniciar']),/IH_USO/);
});
test('leitor recusa produção, redirects, POST e projeto de resposta diferente',async()=>{
  const config=validarConfiguracao(valores());let calls=0;
  const ler=criarLeitorRemoto(config,async(_,opcoes)=>{calls++;assert.equal(opcoes.redirect,'error');return new Response('[]',{headers:{'sb-project-ref':'outro'}});});
  await assert.rejects(ler(`https://${PRODUCAO}.supabase.co/rest/v1/usuarios`),{code:'IH_HTTP_DESTINO'});
  await assert.rejects(ler(config.url+'/rest/v1/usuarios',{method:'POST'}),{code:'IH_HTTP_DESTINO'});assert.equal(calls,0);
  await assert.rejects(ler(config.url+'/rest/v1/usuarios'),{code:'IH_HTTP_PROJECT'});
  assert.throws(()=>criarLeitorRemoto({...config,url:`https://${PRODUCAO}.supabase.co`}),{code:'IH_CONFIG_NAO_VALIDADA'});
});
function fixture({mudarPool=false,mudarPG=false,privilegios=false,diario=0,politicas=0,bucketPublico=false,refResposta=ref}={}){
  const config=validarConfiguracao(valores()),consultas=[];let conexoes=0;
  const pool={options:{host:config.pg.PGHOST,user:config.pg.PGUSER,database:'postgres',port:5432,ssl:{rejectUnauthorized:true},query_timeout:10000,max:2},
    connect:async()=>{conexoes++;return{query:async(sql)=>{
      consultas.push(sql);
      if(sql.startsWith('SELECT current_user'))return{rows:[{papel:'service_role',rolbypassrls:true,esquema:true,usuarios:true}]};
      if(sql.startsWith('SHOW'))return{rows:[{server_version_num:'170000'}]};
      if(sql.startsWith('SELECT c.relrowsecurity'))return{rows:[{rls:true,forcado:true,crud:true,publico:privilegios,extras:false}]};
      if(sql.startsWith('SELECT id,email'))return{rows:mudarPG?contas.map(c=>({...c,email:'outra@example.invalid'})):contas};
      if(sql.includes('FROM public.perfil_imagens_objetos'))return{rows:[{total:diario}]};
      if(sql.includes('FROM pg_policies'))return{rows:[{total:politicas}]};
      return{rows:[]};},release(){}};}};
  if(mudarPool)pool.options.host=`db.${PRODUCAO}.supabase.co`;
  const ler=criarLeitorRemoto(config,async(url)=>{
    const id=url.split('/').at(-1);const data=url.includes('/rest/')?contas:{id,public:bucketPublico,file_size_limit:id==='perfil-fotos'?5242880:10485760,allowed_mime_types:['image/webp']};
    return new Response(JSON.stringify(data),{headers:{'sb-project-ref':refResposta}});
  });
  return{config,pool,ler,consultas,conexoes:()=>conexoes};
}
test('preflight vincula REST/PG/Storage usando somente leitura e rollback',async()=>{
  const f=fixture();const r=await verificarVinculo(f.config,f);assert.equal(r.aprovado,true);assert.equal(r.escritasHabilitadas,false);
  assert.equal(f.consultas[0],'BEGIN READ ONLY');assert.equal(f.consultas.at(-1),'ROLLBACK');
  assert.ok(f.consultas.every(q=>!/^(INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT|REVOKE)/.test(q)));
});
for(const [opcoes,codigo]of [
  [{mudarPool:true},'IH_POOL_DESTINO'],[{mudarPG:true},'IH_PG_PROJECT'],[{privilegios:true},'IH_PG_PERMISSOES'],
  [{diario:1},'IH_DIARIO_NAO_VAZIO'],[{politicas:1},'IH_STORAGE_POLITICAS'],[{bucketPublico:true},'IH_STORAGE'],[{refResposta:'outro'},'IH_HTTP_PROJECT'],
])test('preflight falha fechado: '+codigo,async()=>{
  const f=fixture(opcoes);await assert.rejects(verificarVinculo(f.config,f),{code:codigo});
  if(opcoes.mudarPool)assert.equal(f.conexoes(),0);
  if(f.conexoes())assert.equal(f.consultas.at(-1),'ROLLBACK');
});
test('app candidato mantém imagens 503 e JWT principal não autentica',async t=>{
  const config=validarConfiguracao(valores());const bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
  const hash=await bcrypt.hash('senha-ficticia',4);
  const usuarios={buscarParaLogin:async email=>{const c=contas.find(c=>c.email===email);return c?{...c,nome:'Conta teste',senha:hash}:undefined;}};
  const app=require('../imagens/homologacao-app.cjs').criarAppHomologacao(config,usuarios,{aprovado:true,ref,escritasHabilitadas:false});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const c of contas){
    const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:c.email,senha:'senha-ficticia'})});assert.equal(login.status,200);
    const {token}=await login.json();for(const method of ['GET','PUT','DELETE'])assert.equal((await fetch(base+'/perfil/imagens/foto',{method,headers:{Authorization:'Bearer '+token}})).status,503);
  }
  const token=jwt.sign({id:7},'segredo-principal-ficticio');assert.equal((await fetch(base+'/perfil',{headers:{Authorization:'Bearer '+token}})).status,401);
});
