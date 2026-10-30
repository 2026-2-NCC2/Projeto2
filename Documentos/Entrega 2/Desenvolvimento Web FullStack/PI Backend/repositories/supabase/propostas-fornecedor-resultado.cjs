"use strict";
// Resposta da futura RPC; nao implementa agregacao, collation ou transporte.
const { erroResposta, decimalTexto, instante } = require('./suporte-leitura.cjs');
const code='SUPABASE_PROPOSTA_FORNECEDOR_RESPONSE';
function converterPropostasFornecedor(data) {
  if(!Array.isArray(data)) throw erroResposta(code);
  const ids=new Set();let anterior;
  return Array.from(data,row=>{
    const fields=['id','cotacao_id','valor','condicoes_pagamento','detalhes_tecnicos','status','criada_em','evento_nome','categoria'];
    if(!row||typeof row!=='object'||Array.isArray(row)||fields.some(k=>!Object.hasOwn(row,k))||
      !Number.isSafeInteger(row.id)||row.id<=0||ids.has(row.id)||!Number.isSafeInteger(row.cotacao_id)||row.cotacao_id<=0||
      ['condicoes_pagamento','detalhes_tecnicos','status','evento_nome'].some(k=>typeof row[k]!=='string')||
      (row.categoria!==null&&typeof row.categoria!=='string'))throw erroResposta(code);
    const valor=decimalTexto(row.valor,code),criada_em=instante(row.criada_em,code);
    if(valor!==valor.trim()||(anterior&&(criada_em>anterior.criada_em||(+criada_em===+anterior.criada_em&&row.id>=anterior.id))))throw erroResposta(code);
    ids.add(row.id);anterior={id:row.id,criada_em};
    return {id:row.id,cotacao_id:row.cotacao_id,valor,condicoes_pagamento:row.condicoes_pagamento,detalhes_tecnicos:row.detalhes_tecnicos,status:row.status,criada_em,evento_nome:row.evento_nome,categoria:row.categoria};
  });
}
module.exports={converterPropostasFornecedor};
