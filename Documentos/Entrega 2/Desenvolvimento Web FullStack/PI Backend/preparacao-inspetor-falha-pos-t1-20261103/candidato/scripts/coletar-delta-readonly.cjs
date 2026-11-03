"use strict";
const assert=require('node:assert/strict');
const {TABLES}=require('./delta-cutover.cjs');
const {catalogoSql}=require('./catalogo-backup.cjs');
const {canonical}=require('./backup-postgres-isolado.cjs');
function criarColetorReadOnly(env,columns,catalogosEsperados,ca){
  assert.ok(['localhost','127.0.0.1','::1'].includes(env.DB_HOST));assert.ok(/^[A-Za-z0-9_]+$/.test(env.DB_NAME));assert.match(env.PGHOST,/^[a-z0-9.-]+\.pooler\.supabase\.com$/);assert.equal(env.PGUSER,'postgres.gnwybroqfvwosiqzsfla');assert.equal(env.PGPORT,'5432');assert.equal(env.PGDATABASE,'postgres');assert.ok(ca&&catalogosEsperados?.mysql&&catalogosEsperados?.supabase);
  for(const t of TABLES)assert.ok(Array.isArray(columns[t])&&columns[t].includes('id')&&columns[t].every(k=>/^[a-z_]+$/.test(k)));
  // O construtor e inerte. Somente a chamada posterior ao gate abre conexoes.
  return async({projeto,somenteLeitura})=>{
    assert.equal(projeto,'gnwybroqfvwosiqzsfla');assert.equal(somenteLeitura,true);
    const out={projeto,mysql:{},supabase:{},capturas:{}};let my,pool,pg;
    try{
      out.capturas.mysql={inicio:Date.now()};
      my=await require('mysql2/promise').createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,charset:'utf8mb4',connectTimeout:10000});
      const queryMy=my.query.bind(my);my.query=(sql,params)=>queryMy({sql,timeout:15000},params);
      await my.query("SET SESSION time_zone='+00:00'");await my.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await my.query('START TRANSACTION READ ONLY');
      const [engines]=await my.execute({sql:'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=?',timeout:15000},[env.DB_NAME,'BASE TABLE']);assert.equal(engines.length,8);assert.ok(engines.every(x=>x.ENGINE==='InnoDB'));
      const cat={};for(const t of TABLES){const [ddl]=await my.query('SHOW CREATE TABLE `'+t+'`');cat[t]=ddl[0]['Create Table'];const [rows]=await my.query('SELECT '+columns[t].map(k=>'CAST(`'+k+'` AS CHAR) AS `'+k+'`').join(',')+' FROM `'+t+'` ORDER BY id');out.mysql[t]=rows;}
      assert.equal(canonical(cat),canonical(catalogosEsperados.mysql));out.catalogos={mysql:cat};out.mysqlReadOnly=true;out.capturas.mysql.fim=Date.now();await my.rollback();await my.end();my=null;
      out.capturas.supabase={inicio:Date.now()};pool=require('../db-postgres.js').criarPoolPostgres({...env,PGSSLROOTCERT:ca});pg=await pool.connect();assert.ok(pg.connection.stream.encrypted&&pg.connection.stream.authorized);
      const queryPg=pg.query.bind(pg);pg.query=text=>queryPg({text,query_timeout:15000});
      await pg.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await pg.query("SET LOCAL timezone='UTC'");await pg.query("SET LOCAL statement_timeout='15s'");
      out.catalogos.supabase=(await pg.query(catalogoSql)).rows[0].catalogo;assert.equal(canonical(out.catalogos.supabase),canonical(catalogosEsperados.supabase));
      for(const t of TABLES){const fields=columns[t].map(k=>"'"+k+"',\""+k+"\"::text").join(',');out.supabase[t]=(await pg.query('SELECT jsonb_build_object('+fields+') AS row FROM public."'+t+'" ORDER BY id')).rows.map(x=>x.row);}
      out.supabaseReadOnly=true;out.tlsVerificado=true;out.catalogoConferido=true;out.capturas.supabase.fim=Date.now();await pg.query('ROLLBACK');return out;
    }finally{if(my){await my.rollback().catch(()=>{});await my.end();}if(pg){await pg.query('ROLLBACK').catch(()=>{});pg.release();}if(pool)await pool.end();}
  };
}
module.exports={criarColetorReadOnly};
