"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {converterPropostasFornecedor:convert}=require('../repositories/supabase/propostas-fornecedor-resultado.cjs');
const {base,retornosSimulados,campos}=require('./fixtures/propostas-fornecedor-rpc.cjs');
test('conversor preserva fixtures, NULL, vazio, Unicode, espacos e escala',()=>{
  for(const f of retornosSimulados){const input=Object.freeze({...base,categoria:f.categoria,extra:'ignorar'});const [out]=convert([input]);assert.deepEqual(Object.keys(out),campos);assert.equal(out.categoria,f.categoria);assert.equal(out.valor,base.valor);assert.equal(out.criada_em.toISOString(),'2030-01-01T13:00:00.000Z');assert.equal(out.condicoes_pagamento,' Pix ');}
  assert.deepEqual(convert([]),[]);
});
test('projecao independente preserva negativo historico e string parcial recebida',()=>{
  const input=[{...base,valor:'-0.10',categoria:'Áudio, L'}],out=convert(input);assert.equal(out[0].valor,'-0.10');assert.equal(out[0].categoria,'Áudio, L');out[0].categoria='outro';assert.equal(input[0].categoria,'Áudio, L');
});
test('ordem temporal e empate por ID, incluindo mesmo instante com offsets diferentes',()=>{
  const row={...base,categoria:null};assert.equal(convert([{...row,id:3},{...row,id:2,criada_em:'2030-01-01T13:00:00Z'}]).length,2);
  for(const input of [[{...row,id:2},{...row,id:3}],[row,row],[{...row,criada_em:'2029-01-01T13:00:00Z'},{...row,id:1}]])assert.throws(()=>convert(input),{code:'SUPABASE_PROPOSTA_FORNECEDOR_RESPONSE'});
});
test('dados malformados ou esparsos falham sem resultado parcial nem arredondamento',()=>{
  const row={...base,categoria:''};
  const invalid=[null,{},Array(1),[null],[{...row,id:'2'}],[{...row,cotacao_id:0}],[{...row,valor:0.1}],[{...row,valor:'1.001'}],[{...row,valor:'0.10\n'}],[{...row,categoria:[]}],[{...row,criada_em:'2030-02-30T00:00:00Z'}],[{...row,evento_nome:null}]];
  for(const input of invalid)assert.throws(()=>convert(input),{code:'SUPABASE_PROPOSTA_FORNECEDOR_RESPONSE'});
  const missing={...row};delete missing.status;assert.throws(()=>convert([missing]));assert.throws(()=>convert([row,undefined]));
});
