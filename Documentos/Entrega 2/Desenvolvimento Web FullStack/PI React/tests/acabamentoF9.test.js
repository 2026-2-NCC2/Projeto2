import test from 'node:test'
import assert from 'node:assert/strict'
import { act, createElement, useState } from 'react'
import { montarRouter, apiSintetica } from './helpers/routerDom.js'
const { Cotacao } = await import('../src/pages/organizador/Cotacao.jsx')
const botao=(a,texto)=>[...a.document.querySelectorAll('button')].find(b=>b.textContent.trim()===texto)
const ok=data=>({ok:true,status:200,json:async()=>data})
const cotacao={id:1,evento_id:7,evento_nome:'Evento sintético',evento_local:'Local sintético',prazo:'2030-12-10',status:'Aberta',itens:[{categoria:'Áudio'}]}
test('Fornecedor recupera consulta de oportunidades sem perder busca ou recarregar propostas',async()=>{
  const base=apiSintetica('fornecedor'),calls=[];let consultas=0
  const a=await montarRouter({url:'/#/fornecedor-mural',dados:{token:'sintetico',perfil:'fornecedor'},fetch:async(url,op)=>{
    const path=new URL(url).pathname;calls.push([path,op])
    if(path==='/fornecedor/cotacoes')return ++consultas===1?{ok:false,status:503,json:async()=>({erro:'Consulta temporariamente indisponível'})}:ok([cotacao,{...cotacao,id:2}])
    return base(url,op)
  }});try{
    assert.ok(botao(a,'Tentar consultar cotações novamente'))
    const input=a.document.querySelector('#fornecedor-busca')
    const propostasAntes=calls.filter(([p])=>p==='/fornecedor/propostas').length
    await act(async()=>{Object.getOwnPropertyDescriptor(a.window.HTMLInputElement.prototype,'value').set.call(input,'sintético');input.dispatchEvent(new a.window.Event('input',{bubbles:true}))})
    await a.clicar(botao(a,'Tentar consultar cotações novamente'))
    assert.equal(a.document.querySelector('#fornecedor-busca').value,'sintético');assert.equal(a.window.location.hash,'#/fornecedor-mural')
    assert.equal(a.document.querySelectorAll('.fornLista article').length,2)
    assert.match(a.document.querySelector('.fornHero').textContent,/2 COTAÇÕES DISPONÍVEIS/)
    assert.doesNotMatch(a.document.body.textContent,/COMPATÍVEIS|EVENTOS AGUARDANDO|Organizador do evento|Não informado participantes/)
    assert.match(a.document.body.textContent,/Organizador e público não informados/)
    assert.equal(calls.filter(([p])=>p==='/fornecedor/cotacoes').length,2)
    assert.equal(calls.filter(([p])=>p==='/fornecedor/propostas').length,propostasAntes)
    assert.ok(calls.filter(([p])=>p==='/fornecedor/cotacoes').every(([,op])=>op.signal&&op.headers.Authorization==='Bearer sintetico'&&!op.method))
  }finally{await a.close()}
})
test('Fornecedor não apresenta resposta incompleta como lista vazia bem-sucedida',async()=>{
  const base=apiSintetica('fornecedor')
  const a=await montarRouter({url:'/#/fornecedor-mural',dados:{token:'sintetico',perfil:'fornecedor'},fetch:(url,op)=>new URL(url).pathname==='/fornecedor/cotacoes'?Promise.resolve(ok({})):base(url,op)});try{
    assert.match(a.document.body.textContent,/Resposta de cotações incompleta/);assert.doesNotMatch(a.document.body.textContent,/Nenhuma cotação disponível no momento/)
    assert.equal(a.document.querySelectorAll('.fornLista article').length,0)
  }finally{await a.close()}
})
async function montarCotacao(fetch,elemento){return montarRouter({dados:{token:'sintetico'},routes:[{path:'*',element:elemento||createElement(Cotacao,{evento:{id:7,nome:'Evento sintético'},custos:[],setPagina(){},publicacao:{}})}],fetch})}
test('Organizador oferece recuperação de GET e de avaliação incerta sem repetir PATCH',async()=>{
  const proposta={id:2,evento_id:7,fornecedor_nome:'Fornecedor sintético',evento_nome:'Evento sintético',status:'Em avaliação',valor:'100.00'}
  const calls=[];let consultas=0
  const a=await montarCotacao(async(url,op)=>{
    const p=new URL(url).pathname;calls.push([p,op])
    if(p==='/contratacoes/capacidades')return ok({disponivel:false})
    if(p.endsWith('/status'))throw Error('Conexão encerrada')
    assert.equal(p,'/organizador/propostas')
    return ++consultas===1?{ok:false,status:503,json:async()=>({erro:'Falha temporária de consulta'})}:ok([proposta])
  });try{
    assert.ok(botao(a,'Tentar consultar propostas novamente'));await a.clicar(botao(a,'Tentar consultar propostas novamente'))
    assert.match(a.document.body.textContent,/Fornecedor sintético/)
    await a.clicar([...a.document.querySelectorAll('button')].find(b=>b.textContent.includes('Aprovar proposta')))
    assert.match(a.document.body.textContent,/Consulte as propostas antes de repetir/)
    await a.clicar(botao(a,'Consultar propostas novamente'))
    assert.equal(calls.filter(([,op])=>op.method==='PATCH').length,1)
    assert.equal(calls.filter(([p])=>p==='/organizador/propostas').length,3)
    assert.ok(calls.filter(([p])=>p==='/organizador/propostas').every(([,op])=>op.signal&&op.headers.Authorization==='Bearer sintetico'))
    assert.equal(a.document.querySelectorAll('h1').length,1)
  }finally{await a.close()}
})
test('resposta antiga de outro evento não substitui a consulta atual do Organizador',async()=>{
  let liberar
  const calls=[]
  function Contexto(){
    const [id,selecionar]=useState(7)
    return createElement('div',null,createElement('button',{onClick:()=>selecionar(8)},'Selecionar outro evento'),
      createElement(Cotacao,{evento:{id,nome:'Evento atual'},custos:[],setPagina(){},publicacao:{}}))
  }
  const a=await montarCotacao(async(url,op)=>{
    const p=new URL(url).pathname;calls.push([p,op])
    if(p==='/contratacoes/capacidades')return ok({disponivel:false})
    if(calls.filter(([p])=>p==='/organizador/propostas').length===1)return new Promise(r=>{liberar=r})
    return ok([{id:3,evento_id:8,fornecedor_nome:'Fornecedor atual',status:'Aprovada',valor:'20.00'}])
  },createElement(Contexto));try{
    await a.clicar(botao(a,'Selecionar outro evento'))
    assert.match(a.document.body.textContent,/Fornecedor atual/)
    await act(async()=>liberar(ok([{id:2,evento_id:7,fornecedor_nome:'Fornecedor antigo',status:'Aprovada',valor:'10.00'}])))
    await a.settle();assert.doesNotMatch(a.document.body.textContent,/Fornecedor antigo/)
    assert.equal(calls.find(([p])=>p==='/organizador/propostas')[1].signal.aborted,true)
  }finally{await a.close()}
})
