'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validarEvento,erroRpc}=require('../services/eventos.cjs');
const dados={nome:'Sintético',data:'2030-12-10',horario:'10:00',local:'Local',categoria:'Social',publico:900,descricao:''};
function cliente(versao=3,respostas={}){
  const calls=[];
  return {calls,schema(){return this},rpc(nome,args){calls.push({nome,args});return{
    retry(v){assert.equal(v,false);return this},abortSignal:async()=>respostas[nome]??{data:versao},
  }},from(){throw Error('Escrita/leitura legada inesperada')}};
}
test('capacidade independente do público: limites, null e omissão',()=>{
  for(const capacidade_maxima of [0,-1,1.5,2147483648,'5',true,{},NaN,Infinity])
    assert.throws(()=>validarEvento({...dados,capacidade_maxima}),{respostaStatus:400});
  for(const capacidade_maxima of [null,1,2147483647]){
    const v=validarEvento({...dados,capacidade_maxima});
    assert.equal(v.capacidade_maxima,capacidade_maxima);assert.equal(v.publico,900);
  }
  assert.equal(Object.hasOwn(validarEvento(dados),'capacidade_maxima'),false);
});
test('erros específicos não expõem mensagem bruta de banco',()=>{
  for(const [code,padrao] of [['LT409',/lotado/],['DU409',/já está inscrito/],['IN409',/indisponível/],['CP409',/abaixo/]]){
    assert.throws(()=>erroRpc({code,message:'segredo'}),e=>e.respostaStatus===409&&padrao.test(e.message)&&!e.message.includes('segredo'));
  }
});
test('configuração exige migração e versão desconhecida falha fechada',async()=>{
  const {criarRepositorioEventos}=require('../repositories/supabase/eventos.cjs');
  for(const versao of [1,99]){
    const c=cliente(versao),r=criarRepositorioEventos(c,{gestaoSegura:true});
    await assert.rejects(r.criar({...dados,capacidade_maxima:10,usuarioId:7}),{respostaStatus:503});
    assert.ok(c.calls.every(c=>c.nome==='eventos_capacidades_v1'));
  }
});
test('criação/edição encaminham capacidade, proprietário, chave e versão para a RPC da Etapa 1',async()=>{
  const c=cliente(3,{gerir_evento_v1:{data:{id:1,usuario_id:7,versao:2}}});
  const r=require('../repositories/supabase/eventos.cjs').criarRepositorioEventos(c,{gestaoSegura:true});
  assert.equal((await r.capacidades()).controleCapacidade,true);
  await r.criar({...dados,capacidade_maxima:3,usuarioId:7,chaveIdempotencia:'chave'});
  await r.atualizar(1,7,{...dados,capacidade_maxima:4},2);
  const calls=c.calls.filter(c=>c.nome==='gerir_evento_v1').map(c=>c.args);
  assert.equal(calls[0].p_dados.publico,900);assert.equal(calls[0].p_dados.capacidade_maxima,3);
  assert.equal(calls[0].p_usuario,7);assert.equal(calls[0].p_chave,'chave');
  assert.equal(calls[1].p_versao,2);assert.equal(calls[1].p_dados.capacidade_maxima,4);
});
test('inscrição lotada/duplicada/indisponível usa somente RPC e não faz retry',async()=>{
  for(const code of ['LT409','DU409','IN409','23505']){
    const c=cliente(3,{inscrever_evento_v1:{error:{code}}});
    const r=require('../repositories/supabase/inscricoes.cjs').criarRepositorioInscricoes(c,{gestaoSegura:true});
    await assert.rejects(r.criar(9,1),{respostaStatus:409});
    assert.deepEqual(c.calls,[{nome:'inscrever_evento_v1',args:{p_usuario:9,p_evento:1}}]);
  }
});
test('leitura anexa saldo consistente e rejeita resposta incompleta sem inventar vagas',async()=>{
  const evento={id:1,...dados,horario:'10:00:00',usuario_id:7,status:'Ativo',versao:1};
  const vagas={id:1,capacidade_maxima:3,inscritos_confirmados:3,vagas_restantes:0,lotado:true};
  const c=cliente(3,{eventos_vagas_v3:{data:[vagas]}});
  c.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:evento})});
  const r=require('../repositories/supabase/eventos.cjs').criarRepositorioEventos(c,{gestaoSegura:true});
  assert.equal((await r.buscarPorIdDoUsuario(1,7)).lotado,true);
  for(const v of [{...vagas,vagas_restantes:1},{...vagas,lotado:false},{...vagas,capacidade_maxima:undefined}]){
    c.rpc=(nome,args)=>({retry(){return this},abortSignal:async()=>nome==='eventos_capacidades_v1'?{data:3}:{data:[v]}});
    await assert.rejects(r.buscarPorIdDoUsuario(1,7),{code:'SUPABASE_EVENTO_RESPONSE'});
  }
});
test('HTTP recusa capacidade inválida antes de qualquer escrita',async t=>{
  const a=await require('./helpers/http-autenticacao.cjs').iniciar(t,'supabase');
  for(const capacidade_maxima of [0,-1,2.5,'10']){
    assert.equal((await a.request('POST','/eventos',{...dados,capacidade_maxima},a.token(7))).status,400);
    assert.equal((await a.request('PUT','/eventos/13',{...dados,capacidade_maxima,versao:1},a.token(7))).status,400);
  }
  assert.ok(!a.calls.some(c=>c.path==='/rest/v1/eventos'&&['POST','PATCH'].includes(c.method)));
});
