'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {criarPainelEventoAdmin,totalEstimado}=require('../services/painel-evento-admin.cjs');
const admin={id:10,perfil:'admin'};
function fixture(){
 const calls=[];
 const data={evento:{id:13,status:'Ativo',capacidade_maxima:null,inscritos_confirmados:5,vagas_restantes:null,lotado:false},custos:[{id:1,evento_id:13,valor_estimado:'10.10'},{id:2,evento_id:13,valor_estimado:'0.20'}],cotacoes:[{id:21,evento_id:13},{id:22,evento_id:14}],propostas:[{id:31,evento_id:13,cotacao_id:21,valor:'100.00'},{id:32,evento_id:13,cotacao_id:21,valor:'200.00'},{id:33,evento_id:14,cotacao_id:22,valor:'999.00'}]};
 const r={eventos:{async buscarAdministrativo(id){calls.push(['evento',id]);return id===13?data.evento:undefined}},custos:{async listarPorEvento(id){calls.push(['custos',id]);return data.custos}},cotacoes:{async listarAdministrativo(id){calls.push(['cotacoes',id]);return data.cotacoes},async listarItens(id){calls.push(['itens',id]);return [{id:41,valor_estimado:'10.10'}]}},propostas:{async listarAdministrativo(id){calls.push(['propostas',id]);return data.propostas}}};
 return {data,r,calls,service:criarPainelEventoAdmin(r)};
}
test('autorização precede qualquer consulta; ID estrito e inexistente',async()=>{
 const x=fixture();for(const ator of [null,{id:7,perfil:'organizador'},{id:9,perfil:'participante'}])await assert.rejects(x.service.consultar(ator,'13'),e=>[401,403].includes(e.respostaStatus));assert.equal(x.calls.length,0);
 for(const id of ['0','-1','1.2','13x','01','2147483648'])await assert.rejects(x.service.consultar(admin,id),{respostaStatus:400});
 await assert.rejects(x.service.consultar(admin,'999'),{respostaStatus:404});assert.deepEqual(x.calls,[['evento',999]]);
});
test('relações filtradas por evento sem multiplicar custos/cotações por propostas',async()=>{
 const x=fixture(),p=await x.service.consultar(admin,'13');
 assert.equal(p.cotacoes.length,1);assert.equal(p.cotacoes[0].itens.length,1);assert.equal(p.propostas.length,2);
 assert.deepEqual(p.resumo,{custos:2,cotacoes:1,itens:1,propostas:2,total_custos_estimados:'10.30'});
 assert.equal(p.evento.capacidade_maxima,null);assert.ok(x.calls.every(c=>c[0]==='itens'?c[1]===21:c[1]===13));
 assert.match(p.aviso,/não representam pagamentos/);
});
test('quatro estados e campos de capacidade preservados sem recalcular ocupação',async()=>{
 for(const status of ['Ativo','Em planejamento','Cancelado','Encerrado']){const x=fixture();Object.assign(x.data.evento,{status,capacidade_maxima:5,vagas_restantes:0,lotado:true});const p=await x.service.consultar(admin,13);assert.deepEqual(p.evento,x.data.evento);}
});
test('ausência de relações tem contagens e total zero',async()=>{
 const x=fixture();x.data.custos=[];x.data.cotacoes=[];x.data.propostas=[];const p=await x.service.consultar(admin,13);assert.equal(p.resumo.total_custos_estimados,'0.00');assert.equal(p.resumo.itens,0);
});
test('duplicidades, relações inconsistentes e erro de origem não geram painel parcial',async()=>{
 let x=fixture();x.data.custos.push(x.data.custos[0]);await assert.rejects(x.service.consultar(admin,13),{respostaStatus:503});
 x=fixture();x.data.propostas[0].cotacao_id=99;await assert.rejects(x.service.consultar(admin,13),{respostaStatus:503});
 x=fixture();x.r.cotacoes.listarItens=async()=>{throw Error('origem indisponível')};await assert.rejects(x.service.consultar(admin,13));
});
test('centavos exatos, valores grandes, histórico negativo e entrada inválida',()=>{
 assert.equal(totalEstimado([{v:'9999999999.99'},{v:'0.01'}],'v'),'10000000000.00');assert.equal(totalEstimado([{v:'-10.10'},{v:'0.20'}],'v'),'-9.90');assert.throws(()=>totalEstimado([{v:'1.234'}],'v'));
});
test('Supabase: consultas novas filtram evento no servidor, sem comandos de escrita',async()=>{
 const calls=[];const cliente={schema(){return this},from(tabela){calls.push(['from',tabela]);return this},select(){return this},eq(k,v){calls.push(['eq',k,v]);return this},order(){return this},range:async()=>({data:[],count:0})};
 const eventos=require('../repositories/supabase/eventos.cjs').criarRepositorioEventos(cliente);
 assert.equal(await eventos.buscarAdministrativo(13),undefined);assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='id'&&c[2]===13));
 calls.length=0;await require('../repositories/supabase/cotacoes.cjs').criarRepositorioCotacoes(cliente).listarAdministrativo(13);assert.ok(calls.some(c=>c[1]==='evento_id'&&c[2]===13));
 calls.length=0;await require('../repositories/supabase/propostas.cjs').criarRepositorioPropostas(cliente).listarAdministrativo(13);assert.ok(calls.some(c=>c[1]==='cotacao.evento.id'&&c[2]===13));
});
test('Express real: rota protegida, cache privado e nenhuma operação de escrita',async t=>{
 const express=require('express'),app=express(),x=fixture();
 require('../painel-evento-admin-http.cjs').instalarPainelEventoAdmin(app,{repositorios:x.r,
 autenticar(req,res,next){if(!req.headers.authorization)return res.status(401).json({erro:'Sessão necessária'});req.usuario=req.headers.authorization==='admin'?admin:{id:9,perfil:'participante'};next();},
 permitirPerfis:()=> (req,res,next)=>req.usuario.perfil==='admin'?next():res.status(403).json({erro:'Recusado'}),
 responderErroServico:(res,e)=>res.status(e.respostaStatus||500).json({erro:e.respostaStatus?e.message:'Erro de consulta'})});
 const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));const url=`http://127.0.0.1:${s.address().port}/admin/eventos/13/painel`;
 for(const [authorization,status] of [[null,401],['participante',403],['admin',200]]){const r=await fetch(url,{headers:authorization?{authorization}:{}});assert.equal(r.status,status);if(status===200){assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).resumo.total_custos_estimados,'10.30');}}
});
test('server completo mantém autenticação real e perfis exclusivos na nova rota',async t=>{
 const a=await require('./helpers/http-autenticacao.cjs').iniciar(t,'supabase');
 assert.equal((await a.request('GET','/admin/eventos/13/painel')).status,401);
 for(const id of [7,8,9])assert.equal((await a.request('GET','/admin/eventos/13/painel',undefined,a.token(id))).status,403);
 assert.equal((await a.request('GET','/admin/eventos/0/painel',undefined,a.token(10))).status,400);
 assert.ok(a.calls.every(c=>c.method==='GET'));
});
