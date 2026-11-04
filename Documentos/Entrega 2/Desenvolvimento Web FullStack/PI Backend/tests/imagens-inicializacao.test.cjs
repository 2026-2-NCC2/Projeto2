'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(aprovado, limpar, eventos=null){
  let tick;
  const chamadas=[],pool={async end(){chamadas.push('pool-fechado');}},clienteStorage={},contasTeste={},integracao={limpar:async op=>{chamadas.push(op||'dry-run');return limpar ? limpar(op) : {executado:false};}};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../imagens/inicializacao.cjs'),'utf8'),{module,console,
    setInterval(fn,ms){assert.equal(ms,60000);chamadas.push('agendamento');tick=fn;return{unref(){}}},clearInterval(){},
    require(nome){
      if(nome==='../eventos-imagens-inicializacao.cjs')return{prepararImagensEvento:async()=>eventos};
      if(nome==='../scripts/preflight-imagens-producao.cjs')return{
        executar:async(_env,op)=>{assert.equal(op.validarContasTeste,true);assert.equal(op.exigirDiarioVazio,false);return{aprovado,bloqueio:'PERMISSOES'};},
        configurar:()=>({c:{url:'https://sintetico.supabase.co'},pg:{}}),
      };
      if(nome==='../db-postgres.js')return{criarPoolPostgres:()=>{chamadas.push('pool');return pool;}};
      if(nome==='./cliente-storage.cjs')return{criarClienteStorage:()=>clienteStorage};
      if(nome==='./contas-teste.cjs')return{criarCicloContasTeste:op=>{assert.equal(op.pool,pool);assert.equal(op.clienteStorage,clienteStorage);return contasTeste;}};
      if(nome==='./integracao.cjs')return{prepararIntegracaoImagens:op=>{assert.equal(op.contasTeste,contasTeste);assert.equal(op.pool,pool);assert.equal(op.clienteStorage,clienteStorage);return integracao;}};
      throw Error('Importação inesperada');
    },
  });
  return{preparar:module.exports.prepararImagens,chamadas,tick:()=>tick()};
}
test('preflight recusado não constrói integração nem agenda limpeza',async()=>{
  const f=fixture(false);await assert.rejects(f.preparar({env:{}}),{code:'IMAGENS_PREFLIGHT'});assert.equal(f.chamadas.length,0);
});
test('parada aguarda limpeza iniciada e impede novos ciclos antes de fechar o pool',async()=>{
  let terminar;
  const pendente=new Promise(r=>{terminar=r;});
  const f=fixture(true,op=>op?.executar ? pendente : {executado:false});
  const runtime=await f.preparar({env:{}});await runtime.iniciarLimpeza();
  const limpeza=f.tick();let fechou=false;
  const fechar=runtime.fechar().then(()=>{fechou=true;});
  await f.tick();assert.equal(f.chamadas.length,4);assert.equal(fechou,false);
  terminar({executado:true});await limpeza;await fechar;
  assert.equal(fechou,true);assert.equal(f.chamadas.at(-1),'pool-fechado');
  await assert.rejects(runtime.iniciarLimpeza(),/já agendada/);
});
test('inicialização compartilha pool e Storage com as guardas; limpeza exige dry-run',async()=>{
  const f=fixture(true),r=await f.preparar({env:{}});assert.deepEqual(f.chamadas,['pool']);
  await r.iniciarLimpeza();assert.deepEqual(f.chamadas,['pool','dry-run','agendamento']);
  await assert.rejects(r.iniciarLimpeza(),/já agendada/);
});
test('perfil e eventos compartilham timer e drenagem, aguardando ambos antes de fechar pool',async()=>{
  let liberar;const pendente=new Promise(r=>{liberar=r;});const calls=[];
  const f=fixture(true,undefined,{async limpar(op){calls.push(op?.executar?'real':'dry-run');if(op?.executar)await pendente;}});
  const r=await f.preparar({env:{}});await r.iniciarLimpeza();assert.deepEqual(calls,['dry-run']);
  assert.equal(f.chamadas.filter(c=>c==='agendamento').length,1);
  const ciclo=f.tick();let fechado=false;const fechar=r.fechar().then(()=>{fechado=true;});
  await Promise.resolve();assert.equal(fechado,false);assert.deepEqual(calls,['dry-run','real']);
  liberar();await ciclo;await fechar;assert.equal(fechado,true);
});
