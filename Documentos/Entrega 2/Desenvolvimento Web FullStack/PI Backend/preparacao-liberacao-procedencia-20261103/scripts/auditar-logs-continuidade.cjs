"use strict";
// Complemento de logs somente leitura; nao recoleta tabelas nem executa delta.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(root,'evidencias/auditoria-continuidade-leitura-20261031.json');
function csv(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}assert.ok(!quoted,'CSV_INCOMPLETO');if(row.length||field){row.push(field);rows.push(row);}return rows;}
async function main(){
  assert.equal(process.argv[2],'--somente-leitura');const report=JSON.parse(fs.readFileSync(file)),env=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));assert.equal(env.PGUSER,'postgres.gnwybroqfvwosiqzsfla');
  const ca=path.join(os.homedir(),'BackupsTrocaTicket/backup-20261031-e51f28697254468aa205e99c9a1fbe15/supabase-ca-2021.crt');
  const pool=require('../db-postgres.js').criarPoolPostgres({...env,PGSSLROOTCERT:ca,PGCONNECT_TIMEOUT_MS:'7000'});let c;
  const result={rawContentPersisted:false,logs:[],coverageComplete:false};
  try{
    c=await pool.connect();assert.ok(c.connection.stream.authorized);await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='15s'");
    const dir=(await c.query("SELECT current_setting('log_directory') AS directory")).rows[0].directory;
    for(const f of report.supabase.fileLogs.files||[]){if(!f.name.endsWith('.csv'))continue;assert.match(f.name,/^[a-z0-9._-]+$/i);if(Number(f.size)>5*1024*1024){result.logs.push({name:f.name,read:false,reason:'SIZE_LIMIT'});continue;}
      await c.query('SAVEPOINT read_log');try{
        const data=(await c.query('SELECT pg_read_file($1,0,$2,true) AS content',[dir.replace(/\/$/,'')+'/'+f.name,Number(f.size)])).rows[0].content;
        if(data===null){result.logs.push({name:f.name,read:false,reason:'UNAVAILABLE'});}else{
          const rows=csv(data),dated=rows.map(r=>({time:Date.parse(r[0]),r})).filter(x=>Number.isFinite(x.time)),after=dated.filter(x=>x.time>=Date.parse(report.auditConservativeStartUtc));
          const writes=after.filter(x=>x.r.some(v=>/(?:statement:|execute\b[^:]*:)\s*(?:insert|update|delete|merge|replace|truncate|copy|call)\b/i.test(v))).length;
          const ddl=after.filter(x=>x.r.some(v=>/(?:statement:|execute\b[^:]*:)\s*(?:alter|create|drop|grant|revoke)\b/i.test(v))).length;
          result.logs.push({name:f.name,read:true,bytes:Buffer.byteLength(data),parsedRecords:rows.length,datedRecords:dated.length,recordsSinceConservativeStart:after.length,dmlStatementRecordsSinceStart:writes,ddlStatementRecordsSinceStart:ddl,firstUtc:dated.length?new Date(Math.min(...dated.map(x=>x.time))).toISOString():null,lastUtc:dated.length?new Date(Math.max(...dated.map(x=>x.time))).toISOString():null,limitation:'Configuracao atual log_statement=ddl e pgaudit.log=none nao garante captura de DML; nao comprova historico da configuracao.'});
        }
        await c.query('RELEASE SAVEPOINT read_log');
      }catch(e){await c.query('ROLLBACK TO SAVEPOINT read_log');await c.query('RELEASE SAVEPOINT read_log');result.logs.push({name:f.name,read:false,errorCode:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'LOG_READ_FAILED'});}
    }
    await c.query('COMMIT');
  }finally{if(c)c.release();await pool.end();}
  const proof=JSON.parse((await require('./helper-powershell.cjs').executarHelper('processo-recuperacao.ps1',['-PidAlvo','25552'])).toString());
  report.local.knownParentPid=proof.parentPid;report.local.unattributedProcesses=report.local.unattributedProcesses.filter(x=>x.pid!==proof.parentPid);
  report.supabase.logContentAudit=result;report.logsAuditedUtc=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'LOG_AUDIT_COMPLETED',logs:result.logs,unattributedProcessCount:report.local.unattributedProcesses.length}));
}
main().catch(e=>{console.log(JSON.stringify({status:'LOG_AUDIT_FAILED',code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'READ_FAILED'}));process.exitCode=1;});
