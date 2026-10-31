"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const TABLES = ["usuarios", "eventos", "custos_evento", "cotacoes", "itens_cotacao", "propostas", "inscricoes", "solicitacoes_acesso"];
const FKS = { eventos: { usuario_id: "usuarios" }, custos_evento: { evento_id: "eventos" }, cotacoes: { evento_id: "eventos" }, itens_cotacao: { cotacao_id: "cotacoes" }, propostas: { cotacao_id: "cotacoes", fornecedor_id: "usuarios" }, inscricoes: { usuario_id: "usuarios", evento_id: "eventos" }, solicitacoes_acesso: { usuario_id: "usuarios" } };
function normal(k, v) {
  if (v === null) return null;
  assert.ok(v !== undefined); let s = String(v);
  if (["criada_em", "data_inscricao"].includes(k)) {
    s = s.replace("T", " ").replace(/(?:Z|\+00(?::00)?)$/, "").replace(/\.0+$/, "");
    assert.match(s, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/); // Recusa perda de microssegundos ou fuso desconhecido.
  }
  if (["valor", "valor_estimado"].includes(k)) {
    assert.match(s, /^-?\d+(?:\.\d{1,2})?$/); const negative=s.startsWith('-'),[a,b=""] = s.replace(/^-/,'').split("."),integer=BigInt(a).toString(),fraction=b.padEnd(2,'0'); s = (negative&&(integer!=='0'||fraction!=='00')?'-':'')+integer+'.'+fraction;
  }
  return s;
}
function validar(rows, columns) {
  assert.deepEqual(Object.keys(rows).sort(), [...TABLES].sort());
  const out = {};
  for (const t of TABLES) {
    assert.ok(columns[t]?.includes("id") && columns[t].every(k => /^[a-z_]+$/.test(k)));
    out[t] = rows[t].map(r => { assert.deepEqual(Object.keys(r).sort(), [...columns[t]].sort()); return Object.fromEntries(columns[t].map(k => [k, normal(k, r[k])])); }).sort((a,b) => Number(a.id)-Number(b.id));
    assert.ok(out[t].every(r => /^[1-9]\d*$/.test(r.id) && Number.isSafeInteger(Number(r.id)) && Number(r.id)<=2147483647));
    assert.equal(new Set(out[t].map(r => r.id)).size, out[t].length);
  }
  for (const [t, fields] of Object.entries(FKS)) for (const [k,p] of Object.entries(fields)) {
    const ids = new Set(out[p].map(r=>r.id)); assert.ok(out[t].every(r=>ids.has(r[k])), "DELTA_VINCULO_INVALIDO");
  }
  const emails=out.usuarios.map(r=>r.email.trim().toLowerCase()); assert.equal(new Set(emails).size,emails.length,"DELTA_EMAIL_DUPLICADO");
  return out;
}
const fingerprint = rows => crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
function planejar(before, after, columns) {
  before=validar(before,columns);after=validar(after,columns);
  const emails=new Map(before.usuarios.map(r=>[r.email.trim().toLowerCase(),r.id]));
  for(const r of after.usuarios) assert.ok(!emails.has(r.email.trim().toLowerCase()) || emails.get(r.email.trim().toLowerCase())===r.id,"DELTA_COLISAO_IDENTIDADE");
  const ops={};
  for(const t of TABLES){const old=new Map(before[t].map(r=>[r.id,r])),next=new Map(after[t].map(r=>[r.id,r]));
    ops[t]={insert:after[t].filter(r=>!old.has(r.id)),update:after[t].filter(r=>old.has(r.id)&&JSON.stringify(old.get(r.id))!==JSON.stringify(r)).map(row=>({before:old.get(row.id),after:row})),delete:before[t].filter(r=>!next.has(r.id))};}
  return {before,after,columns,ops,beforeHash:fingerprint(before),afterHash:fingerprint(after)};
}
const myLiteral=v=>v===null?"NULL":"CONVERT(X'"+Buffer.from(String(v),"utf8").toString("hex")+"' USING utf8mb4)";
function sqlMysql(plan,{falharAntesCommit=false}={}) {
  const q=k=>"`"+k+"`", guard="INSERT INTO tt_delta_guard VALUES(IF(ROW_COUNT()=1,1,0)); DELETE FROM tt_delta_guard;";
  const where=(t,r)=>plan.columns[t].map(k=>"CAST("+q(k)+" AS BINARY) <=> CAST("+myLiteral(r[k])+" AS BINARY)").join(" AND ");
  let sql="SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'; CREATE TEMPORARY TABLE tt_delta_guard(ok INT CHECK(ok=1)); START TRANSACTION;";
  for(const t of TABLES) for(const r of plan.ops[t].insert) sql+="INSERT INTO "+q(t)+"("+plan.columns[t].map(q).join(",")+") VALUES("+plan.columns[t].map(k=>myLiteral(r[k])).join(",")+");"+guard;
  for(const t of TABLES) for(const {before,after} of plan.ops[t].update) sql+="UPDATE "+q(t)+" SET "+plan.columns[t].filter(k=>k!=="id").map(k=>q(k)+"="+myLiteral(after[k])).join(",")+" WHERE "+where(t,before)+";"+guard;
  for(const t of [...TABLES].reverse()) for(const r of plan.ops[t].delete) sql+="DELETE FROM "+q(t)+" WHERE "+where(t,r)+";"+guard;
  if(falharAntesCommit)sql+="INSERT INTO tt_delta_guard VALUES(0);";
  return sql+"COMMIT;";
}
module.exports={TABLES,FKS,normal,validar,fingerprint,planejar,sqlMysql};
