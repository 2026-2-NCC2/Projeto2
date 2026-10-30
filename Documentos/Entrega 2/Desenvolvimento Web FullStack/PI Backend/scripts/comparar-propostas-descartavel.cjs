"use strict";
// Nao conecta ao MySQL: usa exclusivamente o JSON da coleta ja autorizada.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async function({sql,pass,folder,manifest,hash,save}) {
  const source=path.resolve(__dirname,'../evidencias/propostas-origem-74fe2d17-2347-4621-8425-dda96672edc8.json');
  const original=fs.readFileSync(source);const mysql=JSON.parse(original);
  assert.equal(mysql.status,'COMPLETE_SOURCE_OBSERVATIONS');
  manifest.sourceEvidenceSha256=hash(original);manifest.comparisonControllerSha256=hash(fs.readFileSync(__filename));
  fs.copyFileSync(__filename,path.join(folder,'comparacao.cjs'));save();
  sql("CREATE COLLATION public.trocaticket_general_ci (provider=icu,locale='und-u-ks-level1',deterministic=false);");
  const collation=JSON.parse(sql("SELECT json_build_object('provider',collprovider,'deterministic',collisdeterministic,'locale',COALESCE(to_jsonb(pg_collation)->>'colllocale',to_jsonb(pg_collation)->>'colliculocale'),'registered',collversion,'actual',pg_collation_actual_version(oid)) FROM pg_collation WHERE oid='public.trocaticket_general_ci'::regcollation;"));
  const results={sourceEvidence:source,sourceSha256:hash(original),collation,scope:'Synthetic PostgreSQL observations, not universal equivalence or migration implementation',cases:[]};
  const output=path.join(folder,'comparacao.json');const persist=()=>fs.writeFileSync(output,JSON.stringify(results,null,2));
  const lit=s=>s===null?'NULL::text':"'"+s.replaceAll("'","''")+"'::text";
  for(const sourceCase of mysql.cases.filter(c=>Array.isArray(c.input)&&!c.name.startsWith('igualdade'))) {
    const relation=sourceCase.input.map(s=>`SELECT ${lit(s)} COLLATE public.trocaticket_general_ci AS categoria`).join(' UNION ALL ');
    const pg=JSON.parse(sql(`SELECT json_build_object('categoria',string_agg(DISTINCT categoria,', '),'representatives',array_agg(DISTINCT categoria) FILTER(WHERE categoria IS NOT NULL),'classes',count(DISTINCT categoria)::int) FROM (${relation}) AS sinteticos;`));
    results.cases.push({name:sourceCase.name,input:sourceCase.input,mysql:sourceCase.result[0],postgres:pg,literalEqual:sourceCase.result[0].categoria===pg.categoria,literalDifferenceAloneIsNotFailure:true});persist();
  }
  const empty=JSON.parse(sql("SELECT json_build_object('categoria',string_agg(categoria,', ')) FROM (SELECT NULL::text AS categoria WHERE false) s;"));
  assert.equal(empty.categoria,null);results.cases.push({name:'sem itens',postgres:empty,mysql:null});
  for(const c of mysql.cases.filter(c=>c.name==='igualdade sintetica')) {
    const pg=sql(`SELECT (${lit(c.input[0])} COLLATE public.trocaticket_general_ci = ${lit(c.input[1])} COLLATE public.trocaticket_general_ci)::int;`);
    results.cases.push({name:c.name,input:c.input,mysqlEqual:c.result[0].iguais===1,postgresEqual:pg==='1',equal:c.result[0].iguais===Number(pg)});persist();
  }
  pass('comparacoes reais de igualdade representantes NULL e vazio registradas');
  const limit=Number(mysql.metadata.limit_bytes);
  for(const c of mysql.cases.filter(c=>c.name.startsWith('limite real'))) {
    const {targetBytes:target,distinctItems:n}=c.input;const unicode=c.name.includes('multibyte');
    let last=target-2*(n-1)-100*(n-1),reduce=0;if(last<12){reduce=12-last;last=12;}
    const length=`CASE WHEN n=${n-1} THEN ${last} WHEN n=0 THEN ${100-reduce} ELSE 100 END`;
    const suffix=unicode?`CASE WHEN n=${n-1} THEN chr(128512) ELSE '' END`:"''";
    const extra=unicode?`CASE WHEN n=${n-1} THEN 4 ELSE 0 END`:'0';
    // ORDER BY n only isolates truncation; it is NOT proposed as an implicit MySQL order.
    const pg=JSON.parse(sql(`WITH cats AS (SELECT n,concat('Z',lpad(n::text,6,'0'),'_',repeat('x',(${length})-8-(${extra})),${suffix}) AS categoria FROM generate_series(0,${n-1}) AS g(n)), agg AS (SELECT string_agg(categoria,', ' ORDER BY n) AS value FROM cats) SELECT json_build_object('value',value,'bytes',octet_length(value),'characterLeftBytes',octet_length(left(value,${limit}))) FROM agg;`));
    assert.equal(pg.bytes,target);
    const bytes=Buffer.from(pg.value);let end=Math.min(bytes.length,limit),candidate;
    while(end>=Math.max(0,Math.min(bytes.length,limit)-3)){try{candidate=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,end));break;}catch{end--;}}
    assert.equal(typeof candidate,'string');
    const observed=c.result[0];assert.equal(candidate,observed.categoria);
    const rawFile=c.name.replaceAll(' ','_')+'.json';fs.writeFileSync(path.join(folder,rawFile),JSON.stringify(pg));
    results.cases.push({name:c.name,mysqlBytes:observed.bytes,mysqlWarningCodes:c.warnings.map(w=>w.Code),postgresUnboundedBytes:pg.bytes,postgresCharacterLeftBytes:pg.characterLeftBytes,explicitUtf8BytePrefixBytes:Buffer.byteLength(candidate),prefixEqualObservedMysql:true,warning:'Explicit byte-prefix probe only, not automatic PostgreSQL behavior or an implemented RPC',rawFile});persist();
  }
  pass('truncamento comparado sem assumir limite automatico PostgreSQL');
  const differences=results.cases.filter(c=>c.name==='igualdade sintetica'&&!c.equal);
  assert.ok(differences.length>0,'Expected evidence-based decision, inspect unexpected universal-looking match');
  results.conclusion={equalityDifferences:differences,compatibleImplementation:false,reason:'Existing ICU equality partitions differ from source general_ci; representative-only differences are not treated as failure. No universal mapping or source-order guarantee was established.',contractProposalNotApplied:'Use explicitly approved PostgreSQL ICU category equality, preserve earliest item by id within each class, order classes by that representative id; retain comma-space, NULL/empty and observed 1048576-byte UTF-8 prefix.'};
  persist();pass('divergencias de classes comprovadas; decisao contratual necessaria',differences);
  manifest.comparisonEvidence=output;manifest.comparisonConclusion='INCOMPATIBLE_EQUALITY_NO_MIGRATION';save();
};
