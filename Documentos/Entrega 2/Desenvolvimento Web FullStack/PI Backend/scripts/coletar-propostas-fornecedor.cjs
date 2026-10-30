"use strict";
// Sem CLI, .env ou credenciais embutidas. Chamar com pool explicitamente autorizado.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {comparacoesPendentes}=require('../tests/fixtures/propostas-fornecedor-rpc.cjs');
async function coletar(pool) {
  const evidence={timestamp:new Date().toISOString(),initialization:'mysql2/promise createPool: backend options/defaults, credentials supplied explicitly; separate process, not live backend session',realRowsRead:false,sessionChanges:[],cases:[]};
  const file=path.resolve('evidencias','propostas-origem-'+crypto.randomUUID()+'.json');
  let conn; const started=Date.now();
  const save=()=>fs.writeFileSync(file,JSON.stringify(evidence,null,2));
  try {
    conn=await pool.getConnection();
    const q=async(sql,values=[])=>{assert.ok(Date.now()-started<120000,'Collection deadline');assert.match(sql.trim(),/^(SELECT|WITH|SHOW WARNINGS)/);return (await conn.query({sql,values,timeout:10000}))[0];};
    const [identity]=await q("SELECT CONNECTION_ID() AS connection_id, @@port AS port, DATABASE() AS database_name, @@datadir AS datadir, @@pid_file AS pid_file, VERSION() AS version");
    evidence.identity=identity; assert.equal(identity.port,3306);assert.equal(identity.database_name,'trocaticket');assert.equal(identity.datadir.replaceAll('\\','/').replace(/\/$/, '').toLowerCase(),'c:/xampp/mysql/data');
    const pidPath=path.isAbsolute(identity.pid_file)?identity.pid_file:path.join(identity.datadir,identity.pid_file);
    assert.equal(fs.readFileSync(pidPath,'utf8').trim(),'30896');
    const [meta]=await q("SELECT @@session.group_concat_max_len AS limit_bytes, @@session.character_set_client AS charset_client, @@session.character_set_connection AS charset_connection, @@session.character_set_results AS charset_results, @@session.collation_connection AS collation_connection, CHARACTER_SET_NAME AS column_charset, COLLATION_NAME AS column_collation, COLUMN_TYPE AS column_type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='itens_cotacao' AND COLUMN_NAME='categoria'");
    evidence.metadata=meta;assert.equal(meta.column_charset,'utf8mb4');assert.equal(meta.column_collation,'utf8mb4_general_ci');
    async function capture(name,sql,values=[],input) {
      const result=await q(sql,values);const warnings=await q('SHOW WARNINGS');
      const [id]=await q('SELECT CONNECTION_ID() AS connection_id');assert.equal(id.connection_id,identity.connection_id);
      evidence.cases.push({name,input,result,warnings});save();
    }
    const wrap=relation=>`SELECT categoria,HEX(categoria) AS hex,OCTET_LENGTH(categoria) AS bytes FROM (SELECT GROUP_CONCAT(DISTINCT categoria SEPARATOR ', ') AS categoria FROM (${relation}) AS sinteticos) AS agregado`;
    for(const fixture of comparacoesPendentes.filter(f=>!f.limiteFixtureBytes&&!f.propostas)) {
      for(const reverse of [false,true]) {const values=reverse?[...fixture.itens].reverse():fixture.itens;await capture(fixture.nome+(reverse?' reversed':' forward'),wrap(values.map(()=>"SELECT CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci AS categoria").join(' UNION ALL ')),values,values);}
      if(fixture.semItens)await capture('sem itens',wrap("SELECT CONVERT(NULL USING utf8mb4) COLLATE utf8mb4_general_ci AS categoria WHERE 1=0"));
    }
    for(const [left,right] of [['Áudio','audio'],['Áudio','A\u0301udio'],['Som','Som '],['😀','😁'],['ß','ss']]) {
      await capture('igualdade sintetica',"SELECT CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci AS iguais",[left,right],[left,right]);
    }
    // Consulta original, mas cada fonte substituida por relacao derivada sintetica.
    let original;
    const repo=require('../repositories/mysql/propostas.cjs').criarRepositorioPropostas({async query(sql){original=sql;return [[]];}});await repo.listarPorFornecedor(11);
    const proposals="SELECT 1 id,1 cotacao_id,CAST('0.10' AS DECIMAL(12,2)) valor,'Pix' condicoes_pagamento,'Sintetico' detalhes_tecnicos,'Recusada' status,CAST('2030-01-01 10:00:00' AS DATETIME) criada_em,11 fornecedor_id UNION ALL SELECT 2,1,0.20,'Pix','Sintetico','Em avaliacao',CAST('2030-01-01 10:00:00' AS DATETIME),11 UNION ALL SELECT 3,1,1.00,'Pix','Sintetico','Recusada',CAST('2030-01-01 10:00:00' AS DATETIME),999";
    const categories="SELECT 1 cotacao_id,CONVERT('Som' USING utf8mb4) COLLATE utf8mb4_general_ci categoria UNION ALL SELECT 1,'Som' UNION ALL SELECT 1,'Luz'";
    const joined=original.replace('FROM propostas p',`FROM (${proposals}) p`).replace('INNER JOIN cotacoes c',"INNER JOIN (SELECT 1 id,1 evento_id) c").replace('INNER JOIN eventos e',"INNER JOIN (SELECT 1 id,CONVERT('Evento sintetico' USING utf8mb4) COLLATE utf8mb4_general_ci nome) e").replace('LEFT JOIN itens_cotacao i',`LEFT JOIN (${categories}) i`);
    assert.ok(!/\b(?:FROM|JOIN)\s+(?:propostas|cotacoes|eventos|itens_cotacao)\b/i.test(joined));
    await capture('joins filtro ordem e duas propostas mesma cotacao',joined,[11]);
    assert.deepEqual(evidence.cases.at(-1).result.map(x=>x.id),[2,1]);
    const limit=Number(meta.limit_bytes);assert.ok(Number.isSafeInteger(limit)&&limit>=32&&limit<=1048576,'Boundary budget: limit outside 32..1048576');
    for(const [delta,unicode] of [[-1,false],[0,false],[1,false],[2,true]]) {
      const target=limit+delta,n=Math.ceil((target+2)/102);let last=target-2*(n-1)-100*(n-1),reduce=0;
      if(last<12){reduce=12-last;last=12;}
      const digits='SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9';
      const sequence=`WITH digits AS (${digits}), seq AS (SELECT a.n+10*b.n+100*c.n+1000*d.n+10000*e.n AS n FROM digits a CROSS JOIN digits b CROSS JOIN digits c CROSS JOIN digits d CROSS JOIN digits e)`;
      const length=`CASE WHEN n=${n-1} THEN ${last} WHEN n=0 THEN ${100-reduce} ELSE 100 END`;
      const suffix=unicode?"CASE WHEN n="+(n-1)+" THEN CONVERT(0xF09F9880 USING utf8mb4) ELSE '' END":"''";
      const bytes=unicode?`CASE WHEN n=${n-1} THEN 4 ELSE 0 END`:'0';
      const relation=`SELECT CONCAT('Z',LPAD(n,6,'0'),'_',REPEAT('x',(${length})-8-(${bytes})),${suffix}) COLLATE utf8mb4_general_ci AS categoria FROM seq WHERE n<${n}`;
      await capture('limite real '+delta+(unicode?' corte multibyte':''),sequence+' '+wrap(relation),[],{targetBytes:target,distinctItems:n,categoryMaxBytes:100,generated:true});
    }
    const [final]=await q('SELECT CONNECTION_ID() AS connection_id, @@session.group_concat_max_len AS limit_bytes');assert.equal(final.connection_id,identity.connection_id);assert.equal(final.limit_bytes,meta.limit_bytes);
    evidence.finalSession=final;evidence.status='COMPLETE_SOURCE_OBSERVATIONS';
  } catch(e){evidence.status='FAILED';evidence.error={code:e.code||'DIAGNOSTIC_ASSERTION',message:e.code?'Diagnostic SQL/connection failed; no raw parameters logged':e.message};throw e;}
  finally {if(conn)conn.release();await pool.end();fs.mkdirSync(path.dirname(file),{recursive:true});save();console.log(file);}
  return evidence;
}
module.exports={coletar};
