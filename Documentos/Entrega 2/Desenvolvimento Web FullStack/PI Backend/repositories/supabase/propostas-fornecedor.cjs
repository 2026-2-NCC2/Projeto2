"use strict";
const { converterPropostasFornecedor } = require('./propostas-fornecedor-resultado.cjs');
const { erroResposta } = require('./suporte-leitura.cjs');
// Nao agrega no Node. Uma RPC de leitura entrega o snapshot completo.
function criarLeituraPropostasFornecedor(cliente, {timeoutMs=15000}={}) {
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw erroResposta('SUPABASE_PROPOSTA_FORNECEDOR_CONFIG');
  let banco=cliente;
  return {async listarPorFornecedor(fornecedorId) {
    if(!Number.isSafeInteger(fornecedorId)||fornecedorId<=0)throw erroResposta('SUPABASE_PROPOSTA_FORNECEDOR_ID');
    const controle=new AbortController();let timer;
    try {
      if(banco===undefined)banco=require('../../db-supabase.cjs').criarClienteSupabase();
      const consulta=banco.schema('public').rpc('listar_propostas_por_fornecedor',{p_fornecedor_id:fornecedorId},{get:false,head:false}).retry(false).abortSignal(controle.signal);
      const limite=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(erroResposta('SUPABASE_PROPOSTA_FORNECEDOR_TIMEOUT'));controle.abort();},timeoutMs);});
      const resposta=await Promise.race([consulta,limite]);
      if(resposta?.error)throw resposta.error;
      return converterPropostasFornecedor(resposta?.data);
    } finally {clearTimeout(timer);controle.abort();}
  }};
}
module.exports={criarLeituraPropostasFornecedor};
