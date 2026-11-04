'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(ativo,evidencia,pronto=true){
  const calls=[],config={versao:1,projeto:'gnwybroqfvwosiqzsfla',ativo,evidencia:evidencia?'evidencias/eventos-imagens-descartaveis-00000000-0000-4000-8000-000000000001.json':null},module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../eventos-imagens-inicializacao.cjs'),'utf8'),{module,require(nome){
    calls.push(nome);
    if(nome==='./config/ativacao-eventos-imagens.json')return config;
    if(nome.startsWith('./evidencias/'))return evidencia;
    if(nome==='./scripts/preflight-eventos-imagens.cjs')return{executar:async()=>({pronto})};
    if(nome==='./eventos-imagens.cjs')return{prepararIntegracaoImagensEvento:()=>({servico:{}})};
    throw Error('Importação inesperada');
  }});
  return{calls,preparar:module.exports.prepararImagensEvento};
}
test('ativação desligada não abre PG nem Storage de eventos',async()=>{const f=fixture(false);assert.equal(await f.preparar({}),null);assert.equal(f.calls.length,1);});
test('flag sozinha, evidência divergente ou infraestrutura incompleta nunca liberam eventos',async()=>{
  await assert.rejects(fixture(true).preparar({}),/HOMOLOGACAO/);
  await assert.rejects(fixture(true,{aprovado:true,projeto:'outro'}).preparar({}),/HOMOLOGACAO/);
  await assert.rejects(fixture(true,{aprovado:true,projeto:'gnwybroqfvwosiqzsfla'},false).preparar({}),/INFRA/);
});
test('integração só é construída depois da evidência aprovada e do preflight de leitura',async()=>{
  const f=fixture(true,{aprovado:true,projeto:'gnwybroqfvwosiqzsfla'});assert.ok((await f.preparar({})).servico);
  assert.ok(f.calls.indexOf('./scripts/preflight-eventos-imagens.cjs')<f.calls.indexOf('./eventos-imagens.cjs'));
});
