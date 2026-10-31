"use strict";
const assert=require('node:assert/strict');
const {TABLES,validar,fingerprint}=require('./delta-cutover.cjs');
const EXTRAS={usuarios:['10'],eventos:['12'],custos_evento:['7','8'],cotacoes:['6'],itens_cotacao:['22','23'],propostas:['3'],inscricoes:['3'],solicitacoes_acesso:['6']};
// Somente dados em memoria. A coleta real READ ONLY fica reservada a janela autorizada.
function verificarDeltaFinal({mysql,supabase,checkpointMysql,checkpointSupabase,columns,gate,capturas},agora=Date.now()) {
  assert.ok(gate?.status==='APTO_PARA_COLETA'&&agora>=gate.avaliadoEm&&agora<=gate.validadeAte,'DELTA_FREEZE_GLOBAL_PENDENTE');
  for(const p of ['mysql','supabase'])assert.ok(Number.isSafeInteger(capturas?.[p]?.inicio)&&Number.isSafeInteger(capturas?.[p]?.fim)&&capturas[p].inicio>=gate.avaliadoEm && capturas[p].fim>=capturas[p].inicio && capturas[p].fim<=agora,'DELTA_COLETA_FORA_JANELA');
  mysql=validar(mysql,columns);supabase=validar(supabase,columns);checkpointMysql=validar(checkpointMysql,columns);checkpointSupabase=validar(checkpointSupabase,columns);
  const motivos=[],counts={};
  if(fingerprint(mysql)!==fingerprint(checkpointMysql))motivos.push('MYSQL_DIVERGE_DO_CHECKPOINT');
  if(fingerprint(supabase)!==fingerprint(checkpointSupabase))motivos.push('SUPABASE_DIVERGE_DO_CHECKPOINT');
  for(const t of TABLES){const source=new Map(mysql[t].map(r=>[r.id,r])),target=new Map(supabase[t].map(r=>[r.id,r]));
    const missing=mysql[t].filter(r=>!target.has(r.id)).length,changed=mysql[t].filter(r=>target.has(r.id)&&JSON.stringify(r)!==JSON.stringify(target.get(r.id))).length;
    const extras=supabase[t].filter(r=>!source.has(r.id)).map(r=>r.id).sort();
    if(missing||changed)motivos.push('DADOS_RELACIONADOS_DIVERGENTES:'+t);
    if(JSON.stringify(extras)!==JSON.stringify([...EXTRAS[t]].sort()))motivos.push('ADICIONAIS_DIVERGENTES:'+t);
    counts[t]={mysql:mysql[t].length,supabase:supabase[t].length,ausentes:missing,alterados:changed,adicionais:extras.length};
  }
  return {status:motivos.length?'BLOQUEADO':'DELTA_APROVADO_SEM_EXECUTAR_CUTOVER',motivos,counts,adicionaisAutorizados:10,adicionaisPreservados:motivos.length===0,alteracoesExecutadas:0};
}
module.exports={verificarDeltaFinal,EXTRAS};
