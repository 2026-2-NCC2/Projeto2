"use strict";
const assert=require('node:assert/strict');
// Somente a RPC STABLE cujo SQL o usuario confirmou instalar. Nenhuma escrita.
module.exports=async function({client,report,check,pending,exact}){
  const repo=require('../repositories/supabase/propostas.cjs').criarRepositorioPropostas(client);
  const get=async query=>{const {data,error}=await query;if(error)throw error;assert.ok(Array.isArray(data));return data;};
  const fixture=await check('fornecedor: fixture minima de identificadores',async()=>{
    const {data,error,count}=await client.schema('public').from('propostas').select('fornecedor_id',{count:'exact'}).range(0,999).retry(false);if(error)throw error;assert.ok(Array.isArray(data));assert.equal(data.length,count);return data;
  });
  if(!fixture?.length){pending('fornecedor: execucao com propostas existentes','No supplier fixture observed');return;}
  const supplier=fixture[0].fornecedor_id,absent=Math.max(...fixture.map(r=>r.fornecedor_id))+1;assert.ok(absent<=2147483647);
  const rows=await check('RPC instalada: POST real pelo adaptador e guard service_role',async()=>{
    const result=await repo.listarPorFornecedor(supplier);assert.ok(result.length>0);result.forEach((r,i)=>{exact(r,['id','cotacao_id','valor','condicoes_pagamento','detalhes_tecnicos','status','criada_em','evento_nome','categoria']);assert.ok(r.criada_em instanceof Date&&Number.isFinite(+r.criada_em));assert.match(r.valor,/^-?(?:0|[1-9]\d{0,9})\.\d{2}$/);assert.ok(r.categoria===null||typeof r.categoria==='string');if(i)assert.ok(+result[i-1].criada_em>+r.criada_em||(+result[i-1].criada_em===+r.criada_em&&result[i-1].id>r.id));});
    report.rpcAvailable=true;report.serviceRoleGuardSucceeded=true;report.supplierRowsValidated=result.length;return result;
  });
  if(!rows){pending('fornecedor: verificacoes dependentes da RPC','Read RPC execution failed; no installation or permission change attempted');return;}
  await check('fornecedor: filtro relacionamentos campos datas e valores iguais ao SELECT base',async()=>{
    const source=await get(client.schema('public').from('propostas').select('id,cotacao_id,fornecedor_id,valor::text,condicoes_pagamento,detalhes_tecnicos,status,criada_em,cotacao:cotacoes!inner(evento:eventos!inner(nome))').eq('fornecedor_id',supplier).order('criada_em',{ascending:false}).order('id',{ascending:false}).retry(false));
    assert.deepEqual(rows.map(r=>r.id),source.map(r=>r.id));rows.forEach((r,i)=>{const s=source[i];assert.equal(s.fornecedor_id,supplier);assert.equal(r.cotacao_id,s.cotacao_id);assert.equal(r.valor,s.valor);assert.equal(+r.criada_em,Date.parse(s.criada_em));assert.equal(r.evento_nome,s.cotacao.evento.nome);assert.equal(r.status,s.status);assert.equal(r.condicoes_pagamento,s.condicoes_pagamento);assert.equal(r.detalhes_tecnicos,s.detalhes_tecnicos);});
  });
  await check('fornecedor: agrupamento ICU menor ID grafia original e ordem',async()=>{
    let nulls=0,empty=0,multi=0;
    for(const p of rows){
      const items=await get(client.schema('public').from('itens_cotacao').select('id,categoria').eq('cotacao_id',p.cotacao_id).order('id',{ascending:true}).retry(false));
      const seen=new Set(),representatives=[];
      for(const item of items){if(item.categoria===null||seen.has(item.id))continue;
        const members=await get(client.schema('public').from('itens_cotacao').select('id').eq('cotacao_id',p.cotacao_id).eq('categoria',item.categoria).order('id',{ascending:true}).retry(false));
        assert.ok(members.length>0);assert.equal(members[0].id,item.id);members.forEach(m=>seen.add(m.id));representatives.push(item.categoria);
      }
      let expected=representatives.length?representatives.join(', '):null;
      if(expected!==null){const b=Buffer.from(expected);if(b.length>1048576){let prefix;for(let cut=0;cut<4;cut++){try{prefix=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(0,1048576-cut));break;}catch{}}assert.equal(typeof prefix,'string');expected=prefix;}}
      assert.equal(p.categoria,expected);if(expected===null)nulls++;if(expected==='')empty++;if(representatives.length>1)multi++;
    }
    report.nullCategoriesValidated=nulls;report.emptyCategoriesValidated=empty;report.multiCategoryRowsValidated=multi;
    if(!nulls)pending('fornecedor: categoria NULL em dados reais','No such fixture; remains validated in disposable PostgreSQL and mocks only');
    if(!empty)pending('fornecedor: categoria vazia em dados reais','No such fixture; remains validated in disposable PostgreSQL and mocks only');
  });
  await check('fornecedor: resposta vazia pelo mesmo adaptador POST',async()=>assert.deepEqual(await repo.listarPorFornecedor(absent),[]));
  report.previous404Resolved=true;
};
