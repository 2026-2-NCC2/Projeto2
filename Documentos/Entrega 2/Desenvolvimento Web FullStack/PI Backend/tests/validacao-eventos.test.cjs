'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {validarEvento,reconciliarCriacaoConfirmada}=require('../services/eventos.cjs');
const {falha}=require('../services/suporte-transacoes.cjs');
const dados=()=>({nome:'Sintético',data:'2030-05-10',horario:'12:01',local:'Local',publico:10});

for(const [data,horario,aceito] of [['2030-05-09','23:59',false],['2030-05-10','11:59',false],['2030-05-10','12:00',false],['2030-05-10','12:01',true]])
test(`criação antecipada no backend: ${data} ${horario}`,()=>{
 const executar=()=>validarEvento({...dados(),data,horario},{criacao:true,agora:new Date('2030-05-10T15:00:00Z')});
 if(aceito)assert.doesNotThrow(executar);else assert.throws(executar,e=>e.respostaStatus===400&&e.inicioPassado===true);
});
test('mesma data civil de Brasília prevalece sobre data UTC e edição histórica não exige futuro',()=>{
 assert.doesNotThrow(()=>validarEvento({...dados(),horario:'00:00'},{criacao:true,agora:new Date('2030-05-10T02:59:30Z')}));
 assert.doesNotThrow(()=>validarEvento({...dados(),data:'2000-01-01'}));
});
test('POST real recusa passado antes de RPC de criação; PUT histórico continua até a capacidade existente',async t=>{
 const a=await require('./helpers/http-autenticacao.cjs').iniciar(t,'supabase');
 const r=await a.request('POST','/eventos',{...dados(),data:'2000-01-01'},a.token(7));
 assert.equal(r.status,400);assert.match(r.body.erro,/futuros.*Brasília/);
 assert.ok(!a.calls.some(c=>c.path==='/rest/v1/rpc/gerir_evento_v1'));
 assert.equal((await a.request('PUT','/eventos/13',{...dados(),data:'2000-01-01',versao:1},a.token(7))).status,503);
});
function clienteReplay(resultado){
 const calls=[];const client={schema(s){calls.push(['schema',s]);return this;},from(t){calls.push(['from',t]);return this;},select(c){calls.push(['select',c]);return this;},eq(k,v){calls.push(['eq',k,v]);return this;},maybeSingle(){return this;},retry(v){assert.equal(v,false);return this;},abortSignal:async()=>resultado};
 return {client,calls};
}
test('reconciliação só confirma após registro existente; chave inválida e ausência não chamam RPC',async()=>{
 for(const [chave,retorno,consultas] of [['invalida',{data:{id:13}},false],[randomUUID(),{data:null},true]]){
  const c=clienteReplay(retorno);let confirmacoes=0;
  assert.equal(await reconciliarCriacaoConfirmada(c.client,{tabela:'eventos',identificador:'id',filtros:{usuario_id:7,criacao_chave:chave},chave},()=>{confirmacoes++;}),null);
  assert.equal(confirmacoes,0);assert.equal(c.calls.length>0,consultas);
 }
});
test('leitura não basta para confirmar replay: RPC revalida conteúdo/autor; falhas não viram sucesso',async()=>{
 const chave=randomUUID(),c=clienteReplay({data:{id:13}}),config={tabela:'eventos',identificador:'id',filtros:{usuario_id:7,criacao_chave:chave},chave};
 await assert.rejects(reconciliarCriacaoConfirmada(c.client,config,()=>{throw falha(409,'Conteúdo divergente.');}),{respostaStatus:409});
 assert.deepEqual(c.calls.filter(x=>x[0]==='eq'),[['eq','usuario_id',7],['eq','criacao_chave',chave]]);
 for(const retorno of [{error:{code:'42501'}},{data:{id:'13'}},{data:undefined}]){
  const c=clienteReplay(retorno);await assert.rejects(reconciliarCriacaoConfirmada(c.client,config,()=>{throw Error('Não deve confirmar');}),e=>e.respostaStatus===503&&e.resultadoIncerto);
 }
});
test('adaptador do organizador usa capacidade, proprietário e chave antes de confirmar replay pela RPC',async()=>{
 const chave=randomUUID(),calls=[];const c=clienteReplay({data:{id:13}});
 c.client.rpc=(nome,args)=>{calls.push([nome,args]);return{retry(v){assert.equal(v,false);return this;},abortSignal:async()=>nome==='eventos_capacidades_v1'?{data:1}:{data:{id:13,usuario_id:7,versao:1}}};};
 const repo=require('../repositories/supabase/eventos.cjs').criarRepositorioEventos(c.client,{gestaoSegura:true});
 const r=await repo.reconciliarCriacao(7,chave,validarEvento(dados()));assert.equal(r.id,13);
 const criar=calls.find(x=>x[0]==='gerir_evento_v1');assert.equal(criar[1].p_chave,chave);assert.equal(criar[1].p_usuario,7);
});
test('replay administrativo exige diário do ator e continua revalidando autoria/proprietário na RPC',async()=>{
 const chave=randomUUID(),c=clienteReplay({data:{evento_id:13}}),calls=[];
 c.client.rpc=(nome,args)=>{calls.push([nome,args]);return{retry(){return this;},abortSignal:async()=>({data:{id:13,usuario_id:7,admin_criador_id:10}})};};
 const repo=require('../repositories/supabase/admin-eventos.cjs').criarRepositorioAdminEventos(c.client);
 assert.deepEqual(await repo.reconciliarCriacao(10,7,validarEvento({...dados(),data:'2000-01-01'}),chave),{id:13,usuario_id:7});
 assert.deepEqual(c.calls.filter(x=>x[0]==='eq'),[['eq','admin_id',10],['eq','chave',chave]]);
 assert.equal(calls[0][0],'criar_evento_admin_v1');assert.equal(calls[0][1].p_admin,10);assert.equal(calls[0][1].p_organizador,7);
});
