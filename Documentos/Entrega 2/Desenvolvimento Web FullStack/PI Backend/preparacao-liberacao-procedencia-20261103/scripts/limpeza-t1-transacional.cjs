'use strict';
// Adapter inerte. Somente a futura autorizacao T1 inclui esta limpeza delimitada.
const assert=require('node:assert/strict');
const {validar,fingerprint,TABLES}=require('./delta-cutover.cjs'),{canonical}=require('./backup-postgres-isolado.cjs');
function criarLimpezaT1({conectar,lerSnapshot}){
  return async function limpar(p){
    assert.equal(p.autorizarLimpeza,true);assert.equal(p.createdEventIds.length,1);assert.equal(p.createdCostIds.length,1);assert.equal(p.marker,'TT-T1-'+p.run);const [eventId]=p.createdEventIds,[costId]=p.createdCostIds;
    for(const id of [eventId,costId,p.organizadorId])assert.ok(Number.isSafeInteger(id)&&id>0);
    const cp=JSON.parse(p.checkpointBytes).checkpoint,base=validar(cp.supabase,p.columns);assert.ok(!base.eventos.some(x=>Number(x.id)===eventId)&&!base.custos_evento.some(x=>Number(x.id)===costId),'T1_ID_PREEXISTENTE');
    let c,commitEnviado=false,iniciou=false;
    try{
      c=await conectar();assert.ok(c.connection.stream.encrypted&&c.connection.stream.authorized);await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');iniciou=true;await c.query("SET LOCAL statement_timeout='15s'");
      const event=(await c.query('SELECT id,usuario_id,nome,descricao FROM public.eventos WHERE id=$1 FOR UPDATE',[eventId])).rows;assert.equal(event.length,1);assert.equal(Number(event[0].usuario_id),p.organizadorId);assert.equal(event[0].nome,p.marker);assert.equal(event[0].descricao,p.marker);
      const costs=(await c.query('SELECT id,evento_id,descricao,valor_estimado FROM public.custos_evento WHERE evento_id=$1 FOR UPDATE',[eventId])).rows;assert.equal(costs.length,1,'T1_FILHO_NAO_REGISTRADO');assert.equal(Number(costs[0].id),costId);assert.equal(costs[0].descricao,p.marker);assert.equal(Number(costs[0].valor_estimado),0.1);
      const before=await lerSnapshot(c,p.columns),rows=validar(before.rows,p.columns);assert.equal(canonical(require('./catalogo-t1.cjs').catalogoT1(cp.catalogos.supabase,before.catalogo,p)),canonical(cp.catalogos.supabase));
      const filtered={...rows,eventos:rows.eventos.filter(x=>Number(x.id)!==eventId),custos_evento:rows.custos_evento.filter(x=>Number(x.id)!==costId)};assert.equal(fingerprint(filtered),fingerprint(base),'T1_LIMPEZA_ESTADO_DIVERGENTE');
      assert.equal((await c.query('DELETE FROM public.custos_evento WHERE id=$1 AND evento_id=$2 AND descricao=$3 AND valor_estimado=0.10 RETURNING id',[costId,eventId,p.marker])).rows.length,1);
      assert.equal((await c.query('DELETE FROM public.eventos WHERE id=$1 AND usuario_id=$2 AND nome=$3 AND descricao=$3 RETURNING id',[eventId,p.organizadorId,p.marker])).rows.length,1);
      const after=await lerSnapshot(c,p.columns);assert.equal(canonical(require('./catalogo-t1.cjs').catalogoT1(cp.catalogos.supabase,after.catalogo,p)),canonical(cp.catalogos.supabase));assert.equal(fingerprint(validar(after.rows,p.columns)),fingerprint(base));commitEnviado=true;await c.query('COMMIT');
      return {cleanupVerified:true,parentLocked:true,serializable:true,createdEventIds:[eventId],createdCostIds:[costId]};
    }catch(e){if(c&&iniciou&&!commitEnviado)await c.query('ROLLBACK').catch(()=>{});if(commitEnviado)e.resultadoIncerto=true;throw e;}
    finally{c?.release(commitEnviado?true:undefined);}
  };
}
async function lerSnapshotLimpeza(c,columns){
  const owned=(await c.query("SELECT pg_get_serial_sequence('public.eventos','id') AS eventos, pg_get_serial_sequence('public.custos_evento','id') AS custos_evento")).rows[0];for(const [t,seq] of Object.entries(require('./catalogo-t1.cjs').SEQUENCIAS))assert.equal(owned[t],'public.'+seq);
  const rows={};for(const table of TABLES){assert.ok(columns[table].every(k=>/^[a-z_]+$/.test(k)));const pairs=columns[table].map(k=>"'"+k+"',\""+k+"\"::text").join(',');rows[table]=(await c.query('SELECT jsonb_build_object('+pairs+') AS row FROM public."'+table+'" ORDER BY id')).rows.map(x=>x.row);}
  const catalogo=(await c.query(require('./catalogo-backup.cjs').catalogoSql)).rows[0].catalogo;return {rows,catalogo};
}
function criarLimpezaT1Postgres({ambiente,ca}){
  return async p=>{
    assert.equal(p.autorizarLimpeza,true);assert.equal(ambiente.DB_PROVIDER,'supabase');assert.equal(ambiente.SUPABASE_URL,'https://gnwybroqfvwosiqzsfla.supabase.co');assert.equal(ambiente.PGUSER,'postgres.gnwybroqfvwosiqzsfla');assert.equal(ambiente.PGDATABASE,'postgres');assert.equal(Number(ambiente.PGPORT),5432);assert.match(ambiente.PGHOST,/^[a-z0-9.-]+\.pooler\.supabase\.com$/);assert.ok(typeof ca==='string'&&ca.length>0);
    const pool=require('../db-postgres.js').criarPoolPostgres({...ambiente,PGSSLROOTCERT:ca});try{return await criarLimpezaT1({conectar:()=>pool.connect(),lerSnapshot:lerSnapshotLimpeza})(p);}finally{await pool.end();}
  };
}
module.exports={criarLimpezaT1,lerSnapshotLimpeza,criarLimpezaT1Postgres};
