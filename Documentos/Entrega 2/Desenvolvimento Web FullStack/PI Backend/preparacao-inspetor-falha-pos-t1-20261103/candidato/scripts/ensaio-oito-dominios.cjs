"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path");
const {TABLES,validar,fingerprint,planejar,sqlMysql}=require("./delta-cutover.cjs");
const {executar}=require("./backup-mysql-isolado.cjs");
async function ensaiarOito(dir,pgSql){
  const report={scope:"oito dominios, apenas clones network=none",mainConnections:0,mainDataWrites:0,checks:[],fixtureIds:{},status:"EM_EXECUCAO"};
  const save=()=>fs.writeFileSync(path.join(dir,"rollback-oito-dominios.json"),JSON.stringify(report,null,2)+"\n");save();
  await executar(dir,true,async({ids,sql,snapshot,parsed})=>{
    const mysql=ids[0],columns=parsed.columns;
    const snapPg=async()=>{const out={};for(const t of TABLES){const fields=columns[t].map(k=>"'"+k+"',\""+k+"\"::text").join(",");out[t]=JSON.parse(await pgSql("SELECT COALESCE(jsonb_agg(jsonb_build_object("+fields+")), '[]'::jsonb) FROM public.\""+t+"\";"));}return validar(out,columns);};
    const snapMy=async()=>validar(await snapshot(mysql),columns);
    const pgBase=await snapPg(),myBase=await snapMy();
    const align=planejar(myBase,pgBase,columns);assert.equal(TABLES.reduce((n,t)=>n+align.ops[t].insert.length,0),10);assert.ok(TABLES.every(t=>!align.ops[t].update.length&&!align.ops[t].delete.length));
    await sql(mysql,sqlMysql(align));assert.equal(fingerprint(await snapMy()),fingerprint(pgBase));report.checks.push("dez adicionais preservados integralmente no retorno");
    const mark="tt-oito-"+crypto.randomBytes(6).toString("hex"),hash=require("bcryptjs").hashSync(crypto.randomBytes(32).toString("hex"),4);
    function group(g){const id=1900000000+g*100,ts="2026-12-01 13:14:15",o={};
      o.usuarios=[['organizador',id],['fornecedor',id+1],['participante',id+2]].map(([perfil,n])=>({id:String(n),nome:mark+'-'+perfil,email:mark+'-'+n+'@example.invalid',senha:hash,perfil}));
      o.eventos=[{id:String(id),nome:mark,data:'2026-12-20',horario:'14:00:00',local:'Isolado',categoria:'Corporativo',publico:'10',descricao:null,status:'Em planejamento',usuario_id:String(id)}];
      o.custos_evento=[{id:String(id),evento_id:String(id),categoria:'Teste',descricao:mark,valor_estimado:'10.25'}];
      o.cotacoes=[{id:String(id),evento_id:String(id),prazo:'2026-12-15',modalidade:'Fechada',observacoes:null,status:'Aberta',criada_em:ts}];
      o.itens_cotacao=[{id:String(id),cotacao_id:String(id),categoria:'Teste',descricao:mark,valor_estimado:'10.25'}];
      o.propostas=[{id:String(id),cotacao_id:String(id),fornecedor_id:String(id+1),valor:'9.50',condicoes_pagamento:'Ficticio',detalhes_tecnicos:mark,status:'Em avaliação',criada_em:ts}];
      o.inscricoes=[{id:String(id),usuario_id:String(id+2),evento_id:String(id),data_inscricao:ts,status:'Confirmada'}];
      o.solicitacoes_acesso=[{id:String(id),usuario_id:String(id+2),perfil_solicitado:'organizador',justificativa:mark,status:'pendente',criada_em:ts}];
      for(const t of TABLES){report.fixtureIds[t]??=[];report.fixtureIds[t].push(...o[t].map(r=>r.id));}return o;}
    const a=group(0),b=group(1),c=group(2);save();
    for(const t of TABLES)assert.ok(pgBase[t].every(r=>Number(r.id)<1900000000));
    const seed=Object.fromEntries(TABLES.map(t=>[t,[...pgBase[t],...a[t],...b[t]]]));
    // Valores tipados pelo contexto INSERT; literais SQL standard escapados.
    const lit=v=>v===null?'NULL':"'"+String(v).replace(/'/g,"''")+"'";
    let psql="BEGIN; SET LOCAL standard_conforming_strings=on;";
    for(const t of TABLES)for(const r of [...a[t],...b[t]])psql+='INSERT INTO public."'+t+'"('+columns[t].map(k=>'"'+k+'"').join(',')+') VALUES('+columns[t].map(k=>lit(r[k])).join(',')+');';
    await pgSql(psql+'COMMIT;');await sql(mysql,sqlMysql(planejar(pgBase,seed,columns)));
    const updated=structuredClone(a),fancy="Fictício ç '\\ \n fim";
    for(const r of updated.usuarios)r.nome=fancy;
    updated.eventos[0].nome=mark+'-novo';updated.eventos[0].descricao=fancy;
    updated.custos_evento[0].valor_estimado='1234.56';updated.cotacoes[0].observacoes=fancy;
    updated.itens_cotacao[0].descricao=fancy;updated.propostas[0].valor='1200.01';
    updated.inscricoes[0].status='Cancelada';updated.solicitacoes_acesso[0].status='aprovado';
    psql='BEGIN; SET LOCAL standard_conforming_strings=on;';
    for(const t of [...TABLES].reverse())for(const r of b[t])psql+='DELETE FROM public."'+t+'" WHERE id='+r.id+';';
    for(const t of TABLES){for(const r of updated[t])psql+='UPDATE public."'+t+'" SET '+columns[t].filter(k=>k!=='id').map(k=>'"'+k+'"='+lit(r[k])).join(',')+' WHERE id='+r.id+';';for(const r of c[t])psql+='INSERT INTO public."'+t+'"('+columns[t].map(k=>'"'+k+'"').join(',')+') VALUES('+columns[t].map(k=>lit(r[k])).join(',')+');';}
    await pgSql(psql+'COMMIT;');const finalPg=await snapPg(),initialMy=await snapMy(),delta=planejar(initialMy,finalPg,columns);
    report.operations=Object.fromEntries(TABLES.map(t=>[t,Object.fromEntries(['insert','update','delete'].map(k=>[k,delta.ops[t][k].length]))]));
    assert.ok(TABLES.every(t=>['insert','update','delete'].every(k=>delta.ops[t][k].length>0)));
    await assert.rejects(sql(mysql,sqlMysql(delta,{falharAntesCommit:true})));assert.equal(fingerprint(await snapMy()),fingerprint(initialMy));report.checks.push('falha antes COMMIT desfaz operacoes nos oito dominios');
    // Alteracao concorrente no destinatario depois do planejamento: guard detecta e aborta tudo.
    await sql(mysql,"UPDATE eventos SET nome='CONFLITO_FICTICIO' WHERE id=1900000000;");
    const conflict=await snapMy();await assert.rejects(sql(mysql,sqlMysql(delta)));assert.equal(fingerprint(await snapMy()),fingerprint(conflict));
    await sql(mysql,"UPDATE eventos SET nome="+"CONVERT(0x"+Buffer.from(a.eventos[0].nome).toString('hex')+" USING utf8mb4) WHERE id=1900000000;");report.checks.push('conflito concorrente impede commit parcial');
    await sql(mysql,sqlMysql(delta));assert.equal(fingerprint(await snapMy()),fingerprint(finalPg));report.checks.push('INSERT UPDATE DELETE preservados nos oito dominios');
    await assert.rejects(sql(mysql,sqlMysql(delta)));assert.equal(fingerprint(await snapMy()),fingerprint(finalPg));report.checks.push('reaplicacao bloqueada sem repeticao automatica');
    // AUTO_INCREMENT avanca alem dos IDs explicitos; testar uma identidade nova sem colisao.
    const auto=await sql(mysql,"INSERT INTO usuarios(nome,email,senha,perfil) VALUES('Auto ficticio','"+mark+"-auto@example.invalid','"+hash+"','participante'); SELECT LAST_INSERT_ID();");assert.ok(Number(auto)>1900000202);report.checks.push('AUTO_INCREMENT sem colisoes apos retorno');
    report.autoIncrementUserId=String(auto);report.fixtureIds.usuarios.push(String(auto));
    await sql(mysql,'DELETE FROM usuarios WHERE id='+Number(auto)+';');
    const finalMy=await snapMy();for(const t of TABLES){assert.equal(fingerprint(finalMy[t].filter(r=>Number(r.id)<1900000000)),fingerprint(pgBase[t]));assert.equal(fingerprint(finalPg[t].filter(r=>Number(r.id)<1900000000)),fingerprint(pgBase[t]));}
    report.checks.push('52 registros anteriores intactos, inclusive os dez extras');report.status='APROVADO';save();
  },true);
  assert.equal(report.status,'APROVADO');assert.ok(!process.exitCode);return report;
}
module.exports={ensaiarOito};
