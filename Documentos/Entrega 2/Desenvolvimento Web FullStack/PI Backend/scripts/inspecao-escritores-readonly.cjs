"use strict";
// Adapter de observacao; importa drivers apenas quando explicitamente chamado.
async function conferirEscritoresBanco(env,ca){
  const out={capturedUtc:new Date().toISOString()};let my,pool,pg;
  try{
    my=await require('mysql2/promise').createConnection({host:env.DB_HOST,port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,connectTimeout:7000});
    const q=(sql,args)=>my.query({sql,timeout:15000},args);await q('SET SESSION TRANSACTION READ ONLY');await q('START TRANSACTION READ ONLY');
    const [clients]=await q("SELECT ID FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND COMMAND<>'Daemon'");const [tx]=await q('SELECT COUNT(*) AS total FROM information_schema.INNODB_TRX WHERE trx_mysql_thread_id<>CONNECTION_ID()');const [jobs]=await q("SELECT COUNT(*) AS total FROM information_schema.EVENTS WHERE STATUS='ENABLED'");const [scheduler]=await q("SHOW VARIABLES LIKE 'event_scheduler'");
    out.mysql={otherClients:clients.length,otherTransactions:Number(tx[0].total),enabledJobs:Number(jobs[0].total),scheduler:scheduler[0].Value};await q('COMMIT');await my.end();my=null;
    pool=require('../db-postgres.js').criarPoolPostgres({...env,PGSSLROOTCERT:ca,PGCONNECT_TIMEOUT_MS:'7000'});pg=await pool.connect();
    await pg.query('BEGIN READ ONLY');await pg.query("SET LOCAL statement_timeout='15s'");
    const sessions=(await pg.query("SELECT usename,state,xact_start IS NOT NULL AS transaction_open FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'")).rows;
    const configured=(await pg.query("SELECT to_regclass('cron.job') IS NOT NULL AS cron,to_regclass('net.http_request_queue') IS NOT NULL AS net")).rows[0];
    const activeCron=configured.cron?Number((await pg.query('SELECT count(*) AS total FROM cron.job WHERE active')).rows[0].total):0;
    const httpQueue=configured.net?Number((await pg.query('SELECT count(*) AS total FROM net.http_request_queue')).rows[0].total):0;
    out.supabase={sessions,activeCron,httpQueue,tlsVerified:!!(pg.connection.stream.encrypted&&pg.connection.stream.authorized)};await pg.query('COMMIT');return out;
  }finally{if(my)await my.end();if(pg)pg.release();if(pool)await pool.end();}
}
module.exports={conferirEscritoresBanco};
