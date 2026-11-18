import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement, act } from 'react'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'

const { Contratacoes } = await import('../src/components/contratacoes/Contratacoes.jsx')
const contrato = { id: 12, proposta_id: 9, cotacao_id: 3, evento_id: 7, organizador_id: 1, fornecedor_id: 2,
  formalizado_por: 1, versao: 1, estado: 'ativo', moeda: 'BRL', valor_acordado: '1234.56', servico: 'Som e iluminação',
  condicoes_pagamento: 'Após o evento', formalizado_em: '2030-01-02T12:00:00Z', evento_nome: 'Congresso sintético', fornecedor_nome: 'Fornecedor sintético' }
const proposta = { id:9, status:'Aprovada', valor:'1234.56', detalhes_tecnicos:'Som e iluminação', condicoes_pagamento:'Após o evento', fornecedor_nome:'Fornecedor sintético',evento_nome:'Congresso sintético' }
async function montar({ disponivel=true, registros=[contrato], falha, organizador=false, propostas=[], enviar, buscarLista }={}) {
  const calls=[]
  const a=await montarRouter({ dados:{token:'token-sintetico'}, routes:[{path:'*',element:createElement(Contratacoes,{organizador,propostas,eventoId:organizador?7:undefined})}], fetch:async (url,op={})=>{
    const p=new URL(url).pathname; calls.push([p,op]);
    if (op.method) return enviar ? enviar(op) : {ok:true,status:200,json:async()=>contrato}
    if(falha) return {ok:false,status:falha,json:async()=>({erro:'Consulta recusada'})}
    if(buscarLista&&!p.endsWith('capacidades')) return buscarLista()
    return {ok:true,status:200,json:async()=>p.endsWith('capacidades')?{disponivel}:registros}
  } })
  return Object.assign(a,{calls,botao(texto){return [...a.document.querySelectorAll('button')].find(b=>b.textContent.includes(texto))}})
}
test('capacidade negativa mantém indisponibilidade e não consulta registros', async()=>{
  const a=await montar({disponivel:false});try {
    assert.match(a.document.body.textContent,/Contratos ativos indisponíveis/)
    assert.equal(a.calls.length,1);assert.equal(a.botao('Formalizar'),undefined)
  }finally{await a.close()}
})
for(const status of [401,403])test(`nova consulta ${status} remove histórico e ações antes autorizadas`,async()=>{
  let autorizado=true
  const a=await montar({organizador:true,buscarLista:async()=>autorizado?{ok:true,status:200,json:async()=>[contrato]}:{ok:false,status,json:async()=>({erro:'Acesso revogado'})}});try{
    assert.match(a.document.body.textContent,/Congresso sintético/);assert.ok(a.botao('Concluir'))
    autorizado=false;await a.clicar(a.botao('Atualizar'))
    assert.doesNotMatch(a.document.body.textContent,/Congresso sintético/);assert.equal(a.botao('Concluir'),undefined)
    assert.ok(a.document.querySelector('[role=alert]'));assert.equal(a.document.querySelector('.ctIndicadores'),null)
  }finally{await a.close()}
})
for(const status of [401,403,503]) test(`falha ${status} não vira lista vazia ou indicadores falsos`,async()=>{
  const a=await montar({falha:status});try{
    assert.ok(a.document.querySelector('[role=alert]'));assert.equal(a.document.querySelector('.ctIndicadores'),null)
    assert.ok(a.botao('Tentar novamente'));if(status===403)assert.match(a.document.body.textContent,/Acesso negado/)
  }finally{await a.close()}
})
test('fornecedor consulta snapshots, detalhes acessíveis e histórico sem ações de escrita',async()=>{
  const a=await montar();try{
    assert.match(a.document.body.textContent,/1\.234,56/)
    assert.match(a.document.body.textContent,/Não representa assinatura digital/)
    assert.equal(a.botao('Concluir'),undefined);assert.equal(a.botao('Formalizar'),undefined)
    await a.clicar(a.botao('Detalhes'));const d=a.document.querySelector('[role=dialog]');assert.ok(d)
    assert.match(d.textContent,/Após o evento/)
    await act(async()=>d.dispatchEvent(new a.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
    await a.settle();assert.equal(a.document.querySelector('[role=dialog]'),null)
    const select=a.document.querySelector('select');await act(async()=>{select.value='cancelado';select.dispatchEvent(new a.window.Event('change',{bubbles:true}))})
    assert.match(a.document.body.textContent,/Nenhuma contratação para estes filtros/)
    await a.clicar(a.botao('Atualizar'));assert.equal(a.document.querySelector('select').value,'cancelado')
    await a.clicar(a.botao('Limpar filtros'));assert.match(a.document.body.textContent,/Congresso sintético/)
  }finally{await a.close()}
})
test('organizador confirma explicitamente proposta aprovada e não envia duplicado',async()=>{
  const a=await montar({organizador:true,registros:[],propostas:[proposta,{...proposta,id:10,status:'Recusada'}]});try{
    assert.equal(a.botao('#10'),undefined)
    await a.clicar(a.botao('Formalizar'));assert.equal(a.calls.filter(([,o])=>o.method).length,0)
    await a.clicar(a.botao('Confirmar'))
    const envios=a.calls.filter(([,o])=>o.method);assert.equal(envios.length,1)
    assert.deepEqual(JSON.parse(envios[0][1].body),{proposta_id:9})
    assert.match(a.document.body.textContent,/Operação confirmada/)
  }finally{await a.close()}
})
test('conclusão exige motivo e mantém foco durante digitação; PATCH leva versão',async()=>{
  const a=await montar({organizador:true});try{
    await a.clicar(a.botao('Concluir'));await a.clicar(a.botao('Confirmar'))
    assert.match(a.document.body.textContent,/Informe justificativa/);assert.equal(a.calls.filter(([,o])=>o.method).length,0)
    const t=a.document.querySelector('textarea');t.focus()
    await act(async()=>{Object.getOwnPropertyDescriptor(a.window.HTMLTextAreaElement.prototype,'value').set.call(t,'Serviço entregue');t.dispatchEvent(new a.window.Event('input',{bubbles:true}))})
    assert.equal(a.document.activeElement,t)
    await a.clicar(a.botao('Confirmar'));const [,o]=a.calls.find(([,o])=>o.method)
    assert.equal(o.method,'PATCH');assert.deepEqual(JSON.parse(o.body),{estado:'concluido',motivo:'Serviço entregue',versao:1})
  }finally{await a.close()}
})
test('resultado incerto bloqueia reenvio, permite fechar e reconciliar pela lista',async()=>{
  const a=await montar({organizador:true,registros:[],propostas:[proposta],enviar:async()=>{throw Error('rede')}});try{
    await a.clicar(a.botao('Formalizar'));await a.clicar(a.botao('Confirmar'))
    assert.match(a.document.body.textContent,/Consulte a lista antes de repetir/);assert.equal(a.botao('Confirmar').disabled,true)
    await a.clicar(a.botao('Fechar e consultar'));assert.equal(a.document.querySelector('[role=dialog]'),null)
    assert.ok(a.calls.filter(([p])=>p.endsWith('capacidades')).length>=2)
  }finally{await a.close()}
})
test('resposta incompleta não é tratada como ausência de contratos',async()=>{
  const a=await montar({registros:[{id:1}]});try{assert.ok(a.document.querySelector('[role=alert]'));assert.equal(a.document.querySelector('table'),null)}finally{await a.close()}
})
test('sidebar fornecedor habilita somente capacidade positiva e preserva URL, histórico e remontagem',async()=>{
  const base=apiSintetica('fornecedor')
  const fetch=async(url,o)=>new URL(url).pathname.startsWith('/contratacoes')?{ok:true,status:200,json:async()=>new URL(url).pathname.endsWith('capacidades')?{disponivel:true}:[contrato]}:base(url,o)
  for(const url of ['/#/fornecedor-mural','/#/fornecedor-contratos']){
    const a=await montarRouter({url,dados:{token:'sintetico',perfil:'fornecedor'},fetch});try{
      const b=[...a.document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Contratos ativos');assert.ok(b);assert.equal(b.disabled,false)
      if(url.endsWith('mural')){await a.clicar(b);assert.equal(a.window.location.hash,'#/fornecedor-contratos');await a.back();assert.equal(a.window.location.hash,'#/fornecedor-mural');await a.forward()}
      assert.equal(a.window.location.hash,'#/fornecedor-contratos');assert.match(a.document.body.textContent,/Congresso sintético/)
      assert.equal(a.document.querySelectorAll('h1').length,1)
    }finally{await a.close()}
  }
})
test('estrutura responsiva mantém tabela interna, cards flexíveis, diálogo limitado e foco visível',()=>{
  const css=postcss.parse(readFileSync(new URL('../src/components/contratacoes/Contratacoes.css',import.meta.url),'utf8'))
  const regra=selector=>css.nodes.find(n=>n.selector===selector)
  assert.ok(regra('.ctTabela').nodes.some(d=>d.prop==='overflow'&&d.value==='auto'))
  assert.ok(regra('.ctDialogo').nodes.some(d=>d.prop==='max-height'&&d.value==='90dvh'))
  assert.ok(regra('.ctFiltros').nodes.some(d=>d.prop==='flex-wrap'&&d.value==='wrap'))
  assert.ok(css.nodes.some(n=>n.type==='atrule'&&n.params==='(max-width: 540px)'))
})
test('dupla confirmação pendente envia uma vez e Escape não fecha durante gravação',async()=>{
  let terminar
  const a=await montar({organizador:true,registros:[],propostas:[proposta],enviar:()=>new Promise(resolve=>{terminar=resolve})});try{
    await a.clicar(a.botao('Formalizar'));const b=a.botao('Confirmar')
    await act(async()=>{b.click();b.click()});assert.equal(a.calls.filter(([,o])=>o.method).length,1)
    await act(async()=>a.document.dispatchEvent(new a.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
    assert.ok(a.document.querySelector('[role=dialog]'))
    await act(async()=>terminar({ok:true,status:201,json:async()=>contrato}));await a.settle()
    assert.equal(a.document.querySelector('[role=dialog]'),null)
  }finally{await a.close()}
})
for (const body of [null, { erro:'Gateway indisponível' }]) test(`falha de escrita 503 com corpo ${JSON.stringify(body)} exige reconciliação`,async()=>{
  const a=await montar({organizador:true,registros:[],propostas:[proposta],enviar:async()=>({ok:false,status:503,json:async()=>body})});try{
    await a.clicar(a.botao('Formalizar'));await a.clicar(a.botao('Confirmar'))
    assert.equal(a.botao('Confirmar').disabled,true)
    assert.ok(a.botao('Fechar e consultar'))
    assert.equal(a.calls.filter(([,o])=>o.method).length,1)
  }finally{await a.close()}
})
