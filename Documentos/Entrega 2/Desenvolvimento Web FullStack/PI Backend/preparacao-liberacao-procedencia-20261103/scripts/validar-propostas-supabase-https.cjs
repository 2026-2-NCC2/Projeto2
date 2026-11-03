"use strict";
const assert=require('node:assert/strict');
module.exports=async function({client,report,check,pending,exact,wire}){
  const repo=require('../repositories/supabase/propostas.cjs').criarRepositorioPropostas(client);
  const fields=['id','cotacao_id','fornecedor_id','valor','condicoes_pagamento','detalhes_tecnicos','status','criada_em','evento_id','evento_nome','fornecedor_nome'];
  const order=rows=>rows.forEach((r,i)=>{assert.ok(r.criada_em instanceof Date&&Number.isFinite(+r.criada_em));if(i)assert.ok(+rows[i-1].criada_em>+r.criada_em||(+rows[i-1].criada_em===+r.criada_em&&rows[i-1].id>r.id));});
  const all=await check('propostas.listarAdministrativo: campos joins ordenacao datas e decimais',async()=>{
    const rows=await repo.listarAdministrativo(),raw=wire();order(rows);assert.equal(rows.length,raw.length);
    rows.forEach((r,i)=>{exact(r,fields);assert.match(r.valor,/^-?(?:0|[1-9]\d{0,9})\.\d{2}$/);assert.equal(r.valor,raw[i].valor);assert.equal(+r.criada_em,Date.parse(raw[i].criada_em));assert.equal(r.evento_id,raw[i].cotacao.evento.id);assert.equal(r.evento_nome,raw[i].cotacao.evento.nome);assert.equal(r.fornecedor_nome,raw[i].fornecedor.nome);assert.equal(r.cotacao_id,raw[i].cotacao_id);});
    report.proposalRowsValidated=rows.length;report.ownerFixture=undefined;
    // Nao persistir registros, nomes, e-mails ou identificadores de atores.
    return {rows,owners:raw.map(r=>r.cotacao.evento.usuario_id)};
  });
  if(!all?.rows.length){pending('propostas: filtros e agrupamento com dados existentes','No nonempty proposal fixture validated');return;}
  const {rows,owners}=all,owner=owners[0],supplier=rows[0].fornecedor_id,quote=rows[0].cotacao_id;
  const absentActor=Math.max(...owners,...rows.map(r=>r.fornecedor_id))+1;
  await check('propostas.listarPorOrganizador: propriedade e lista completa',async()=>{
    const result=await repo.listarPorOrganizador(owner);order(result);assert.deepEqual(result,rows.filter((r,i)=>owners[i]===owner));
  });
  await check('propostas.listarPorOrganizador: outro organizador sem propostas retorna []',async()=>assert.deepEqual(await repo.listarPorOrganizador(absentActor),[]));
  report.byQuoteScope='Repository has no listarPorCotacao; testing read-only filtered SELECT, not introducing a new method or route.';
  await check('propostas por cotacao: SELECT direto respeita filtro e ordenacao',async()=>{
    const {data,error}=await client.schema('public').from('propostas').select('id,cotacao_id,valor::text,criada_em').eq('cotacao_id',quote).order('criada_em',{ascending:false}).order('id',{ascending:false}).retry(false);
    if(error)throw error;assert.ok(Array.isArray(data));assert.deepEqual(data.map(r=>r.id),rows.filter(r=>r.cotacao_id===quote).map(r=>r.id));
    data.forEach(r=>{assert.equal(r.cotacao_id,quote);assert.equal(typeof r.valor,'string');});
  });
  await check('propostas por cotacao: filtro sem resultados retorna []',async()=>{
    const absent=Math.max(...rows.map(r=>r.cotacao_id))+1;
    const {data,error}=await client.schema('public').from('propostas').select('id').eq('cotacao_id',absent).retry(false);if(error)throw error;assert.deepEqual(data,[]);
  });
  // GET implica transacao de leitura no PostgREST. Nunca invocar POST de funcao
  // instalada desconhecida, nem instalar RPC/modificar ACLs para fazer passar.
  report.supplierAdapterTransportNotExercised='Production adapter uses POST. This diagnostic probes the read RPC using GET only; no claim of POST transport validation.';
  const bySupplier=await check('fornecedor: RPC por GET com contrato aprovado e filtro confiavel',async()=>{
    const {data,error}=await client.schema('public').rpc('listar_propostas_por_fornecedor',{p_fornecedor_id:supplier},{get:true,head:false}).retry(false);
    if(error)throw error;
    const result=require('../repositories/supabase/propostas-fornecedor-resultado.cjs').converterPropostasFornecedor(data);order(result);
    const expected=rows.filter(r=>r.fornecedor_id===supplier);
    assert.deepEqual(result.map(r=>r.id),expected.map(r=>r.id));
    result.forEach((r,i)=>{const e=expected[i];assert.equal(r.cotacao_id,e.cotacao_id);assert.equal(r.valor,e.valor);assert.equal(+r.criada_em,+e.criada_em);assert.equal(r.evento_nome,e.evento_nome);assert.equal(r.status,e.status);assert.equal(r.condicoes_pagamento,e.condicoes_pagamento);assert.equal(r.detalhes_tecnicos,e.detalhes_tecnicos);});
    return result;
  });
  if(!bySupplier){pending('fornecedor: agrupamento e NULL/vazio do agregado','RPC read did not succeed. Do not install or change permissions automatically.');return;}
  await check('fornecedor: RPC GET com resultado vazio',async()=>{
    const {data,error}=await client.schema('public').rpc('listar_propostas_por_fornecedor',{p_fornecedor_id:absentActor},{get:true,head:false}).retry(false);if(error)throw error;assert.deepEqual(data,[]);
  });
  await check('fornecedor: categorias pela classe ICU e menor ID de representante',async()=>{
    let nulls=0,empty=0;
    for(const p of bySupplier){
      const {data:items,error}=await client.schema('public').from('itens_cotacao').select('id,categoria').eq('cotacao_id',p.cotacao_id).order('id',{ascending:true}).retry(false);if(error)throw error;assert.ok(Array.isArray(items));
      const seen=new Set(),representatives=[];
      for(const i of items){if(i.categoria===null||seen.has(i.id))continue;
        const {data:members,error:err}=await client.schema('public').from('itens_cotacao').select('id').eq('cotacao_id',p.cotacao_id).eq('categoria',i.categoria).order('id',{ascending:true}).retry(false);if(err)throw err;assert.ok(members.some(m=>m.id===i.id));members.forEach(m=>seen.add(m.id));assert.equal(members[0].id,i.id);representatives.push(i.categoria);
      }
      let expected=representatives.length?representatives.join(', '):null;
      if(expected!==null){const b=Buffer.from(expected);let n=Math.min(b.length,1048576);for(let cut=0;cut<4;cut++){try{expected=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(0,n-cut));break;}catch{}}}
      assert.equal(p.categoria,expected);if(expected===null)nulls++;if(expected==='')empty++;
    }
    report.nullCategoriesValidated=nulls;report.emptyCategoriesValidated=empty;
    if(!nulls)pending('fornecedor: agregado NULL real','No proposal without non-NULL categories in current data');
    if(!empty)pending('fornecedor: agregado vazio real','No proposal with empty-only category class in current data');
  });
};
