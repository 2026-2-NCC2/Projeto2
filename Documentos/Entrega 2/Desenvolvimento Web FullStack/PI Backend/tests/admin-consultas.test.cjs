'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {criarConsultaCotacaoAdmin,instalarConsultasAdmin}=require('../admin-consultas-http.cjs');
const admin={id:10,perfil:'admin'};
function fixture(){
 const calls=[];const consulta=criarConsultaCotacaoAdmin({async buscarAdministrativo(id){calls.push(['cotacao',id]);return id===21?{id,evento_id:13,evento_nome:'Sintético',status:'Aberta'}:undefined;},async listarItens(id){calls.push(['itens',id]);return [{id:41,descricao:'Som',valor_estimado:'10.10'}];}});
 return {consulta,calls};
}
test('autorização e ID precedem leitura; ausência não busca itens',async()=>{
 const x=fixture();for(const ator of [null,{id:7,perfil:'organizador'},{id:9,perfil:'participante'}])await assert.rejects(x.consulta(ator,21),e=>[401,403].includes(e.respostaStatus));
 for(const id of [0,'-1','21x','01',2147483648])await assert.rejects(x.consulta(admin,id),{respostaStatus:400});assert.equal(x.calls.length,0);
 await assert.rejects(x.consulta(admin,99),{respostaStatus:404});assert.deepEqual(x.calls,[['cotacao',99]]);
});
test('detalhe reutiliza itens somente da cotação e não altera origem',async()=>{
 const x=fixture(),q=await x.consulta(admin,'21');assert.equal(q.id,21);assert.equal(q.itens[0].id,41);assert.deepEqual(x.calls,[['cotacao',21],['itens',21]]);
});
test('repositório aplica filtro por ID sem alterar contrato de lista',async()=>{
 const calls=[],c={schema(){return this},from(){return this},select(){return this},eq(k,v){calls.push([k,v]);return this},order(){return this},range:async()=>({data:[],count:0})};
 const repo=require('../repositories/supabase/cotacoes.cjs').criarRepositorioCotacoes(c);assert.equal(await repo.buscarAdministrativo(21),undefined);assert.deepEqual(calls,[['id',21]]);calls.length=0;await repo.listarAdministrativo();assert.equal(calls.length,0);
});
test('rota real exige autenticação e perfil admin; erro técnico não vaza dados',async t=>{
 const app=require('express')();let falhar=false;
 instalarConsultasAdmin(app,{repositorios:{cotacoes:{async buscarAdministrativo(id){if(falhar)throw Error('SEGREDO');return {id};},async listarItens(){return [];}}},autenticar(req,res,next){if(!req.headers.authorization)return res.status(401).json({erro:'Sessão'});req.usuario=req.headers.authorization==='admin'?admin:{id:9,perfil:'participante'};next();},permitirPerfis:()=> (req,res,next)=>req.usuario.perfil==='admin'?next():res.status(403).json({erro:'Recusado'}),responderErroServico:(res,e,m)=>res.status(e.respostaStatus||500).json({erro:e.respostaStatus?e.message:m})});
 const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));const url=`http://127.0.0.1:${s.address().port}/admin/cotacoes/21`;
 for(const [authorization,status] of [[null,401],['participante',403],['admin',200]]){const r=await fetch(url,{headers:authorization?{authorization}:{}});assert.equal(r.status,status);if(status===200){assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual((await r.json()).itens,[]);}}
 falhar=true;const r=await fetch(url,{headers:{authorization:'admin'}});assert.equal(r.status,500);assert.doesNotMatch(await r.text(),/SEGREDO/);
});
test('server integrado usa autenticação real e não aceita perfis do JWT como autoridade',async t=>{
 const a=await require('./helpers/http-autenticacao.cjs').iniciar(t,'supabase');assert.equal((await a.request('GET','/admin/cotacoes/21')).status,401);
 for(const id of [7,8,9])assert.equal((await a.request('GET','/admin/cotacoes/21',undefined,a.token(id))).status,403);
 assert.equal((await a.request('GET','/admin/cotacoes/0',undefined,a.token(10))).status,400);assert.ok(a.calls.every(c=>c.method==='GET'));
});
