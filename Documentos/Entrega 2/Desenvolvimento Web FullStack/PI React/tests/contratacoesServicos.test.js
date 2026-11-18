import test from 'node:test'
import assert from 'node:assert/strict'
import './helpers/routerDom.js'
const { formalizarContratacao, capacidadesContratacoes } = await import('../src/services/contratacoes.js')

function sessao(t) {
  const anterior=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage')
  let token='sintetico-a'
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=>token}})
  t.after(()=>{if(anterior)Object.defineProperty(globalThis,'sessionStorage',anterior);else delete globalThis.sessionStorage})
  return valor=>{token=valor}
}
for(const escrita of [false,true]) test(`timeout inclui leitura do corpo (${escrita?'escrita incerta':'consulta'})`,async t=>{
  sessao(t);t.mock.timers.enable({apis:['setTimeout']})
  let pronto
  const corpo=new Promise(resolve=>{pronto=resolve})
  t.mock.method(globalThis,'fetch',async(_url,{signal})=>({ok:true,status:200,json:()=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(Error('abortado')),{once:true});pronto()
  })}))
  const pendente=escrita?formalizarContratacao(9):capacidadesContratacoes()
  await corpo;t.mock.timers.tick(15000)
  await assert.rejects(pendente,e=>e.resultadoIncerto===escrita&&/Resposta incompleta/.test(e.message))
})
test('troca de sessão durante escrita não confirma resultado nem permite repetição cega',async t=>{
  const trocar=sessao(t)
  let liberar,pronto
  const resposta=new Promise(resolve=>{liberar=resolve}),corpo=new Promise(resolve=>{pronto=resolve})
  t.mock.method(globalThis,'fetch',async()=>({ok:true,status:201,json:()=>{pronto();return resposta}}))
  const pendente=formalizarContratacao(9)
  await corpo;trocar('sintetico-b');liberar({id:1})
  await assert.rejects(pendente,e=>e.resultadoIncerto===true&&/sessão mudou/.test(e.message))
})
test('401, 403 e 409 preservam status; indisponibilidade explicitamente recusada é distinguível',async t=>{
  sessao(t)
  for(const status of [401,403,409,503]){
    const mock=t.mock.method(globalThis,'fetch',async()=>({ok:false,status,json:async()=>({erro:'Recusado',resultado_incerto:false})}))
    await assert.rejects(formalizarContratacao(9),e=>e.status===status&&e.resultadoIncerto===false)
    mock.mock.restore()
  }
})
