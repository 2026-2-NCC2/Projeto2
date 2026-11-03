"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {criarLeituraPropostasFornecedor:criar}=require('../repositories/supabase/propostas-fornecedor.cjs');
const {criarRepositorioPropostas}=require('../repositories/supabase/propostas.cjs');
const {base}=require('./fixtures/propostas-fornecedor-rpc.cjs');
function mock(response){const calls=[];let signal;return {calls,get signal(){return signal;},client:{schema(s){calls.push(['schema',s]);return {rpc(n,p,o){calls.push(['rpc',n,p,o]);return {retry(v){calls.push(['retry',v]);return this;},abortSignal(s){signal=s;return typeof response==='function'?response():Promise.resolve(response);}};}};}}};}
test('repositorio delega uma RPC com filtro confiavel e converte os nove campos',async()=>{
  const row={...base,categoria:'Áudio, Som ',extra:'nao retornar'};const m=mock({data:[row],error:null});
  const result=await criarRepositorioPropostas(m.client).listarPorFornecedor(17);
  assert.deepEqual(m.calls,[['schema','public'],['rpc','listar_propostas_por_fornecedor',{p_fornecedor_id:17},{get:false,head:false}],['retry',false]]);
  assert.equal(result[0].categoria,row.categoria);assert.equal(result[0].valor,base.valor);assert.ok(result[0].criada_em instanceof Date);assert.equal(Object.keys(result[0]).length,9);assert.ok(m.signal.aborted);
});
test('vazio preservado e erros SQL/rede propagados sem retry ou fallback',async()=>{
  assert.deepEqual(await criar(mock({data:[],error:null}).client).listarPorFornecedor(17),[]);
  for(const code of ['PF403','PF400','42501','57014']){const error={code,message:'mock'};const m=mock({error});await assert.rejects(criar(m.client).listarPorFornecedor(17),e=>e===error);assert.equal(m.calls.filter(c=>c[0]==='rpc').length,1);}
  const error=new Error('network');await assert.rejects(criar(mock(()=>Promise.reject(error)).client).listarPorFornecedor(17),e=>e===error);
});
test('IDs invalidos e configuracao falham antes de inicializar transporte',async()=>{
  for(const id of [null,undefined,0,-1,'17',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])await assert.rejects(criar().listarPorFornecedor(id),{code:'SUPABASE_PROPOSTA_FORNECEDOR_ID'});
  for(const timeoutMs of [0,-1,Infinity,60001])assert.throws(()=>criar(undefined,{timeoutMs}));
});
test('respostas malformadas recusadas integralmente',async()=>{
  for(const data of [undefined,null,{},Array(1),[{...base,categoria:null},{...base,id:1,categoria:[]}]] )await assert.rejects(criar(mock({data}).client).listarPorFornecedor(17),{code:'SUPABASE_PROPOSTA_FORNECEDOR_RESPONSE'});
});
test('timeout aborta leitura unica e ignora sucesso atrasado',async()=>{
  let finish;const m=mock(()=>new Promise(resolve=>{finish=resolve;}));
  await assert.rejects(criar(m.client,{timeoutMs:10}).listarPorFornecedor(17),{code:'SUPABASE_PROPOSTA_FORNECEDOR_TIMEOUT'});assert.ok(m.signal.aborted);finish({data:[]});assert.equal(m.calls.filter(c=>c[0]==='rpc').length,1);
});
test('limite da resposta e medido em bytes e SDK real usa POST unico sem retry',async()=>{
  await assert.rejects(criar(mock({data:[{...base,categoria:'á'.repeat(524289)}]}).client).listarPorFornecedor(17),{code:'SUPABASE_PROPOSTA_FORNECEDOR_RESPONSE'});
  const {createClient}=require('@supabase/supabase-js');let count=0;
  const client=createClient('https://diagnostico.invalid','synthetic-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{count++;assert.ok(String(url).endsWith('/rest/v1/rpc/listar_propostas_por_fornecedor'));assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{p_fornecedor_id:17});return new Response(JSON.stringify({code:'503',message:'simulado'}),{status:503,headers:{'content-type':'application/json'}});}}});
  await assert.rejects(criar(client).listarPorFornecedor(17),e=>e.code==='503');assert.equal(count,1);
});
