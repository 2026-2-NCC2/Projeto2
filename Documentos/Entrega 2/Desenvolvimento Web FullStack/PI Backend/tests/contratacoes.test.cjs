'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { instalarContratacoes } = require('../contratacoes-http.cjs');
const { criarRepositorioContratacoes } = require('../repositories/supabase/contratacoes.cjs');
const { falha } = require('../services/suporte-transacoes.cjs');

function ambiente({ ativo = true, perfil = 'organizador', repo = {} } = {}) {
  const rotas = new Map(), chamadas = [];
  const app = Object.fromEntries(['get','post','patch'].map(m => [m, (p,...h) => rotas.set(m+' '+p,h)]));
  const repositorio = Object.fromEntries(['capacidades','listar','formalizar','alterar'].map(m => [m, async (...args) => {
    chamadas.push([m,...args]); return repo[m] ? repo[m](...args) : m === 'capacidades' ? { disponivel: true } : [];
  }]));
  instalarContratacoes(app, { ativo, repositorios: { contratacoes: repositorio }, autenticar(req,res,next) {
    if (!req.usuario) return res.status(401).json({ erro: 'Sessão expirada.' }); next();
  } });
  return { chamadas, async pedir(rota, body, query = {}, usuario = { id: 7, perfil }) {
    const req = { usuario, body, query, params: { id: '12' } };
    const res = { codigo:200, setHeader() {}, status(c) { this.codigo=c; return this; }, json(b) { this.body=b; return this; } };
    for (const h of rotas.get(rota)) { let seguir=false; await h(req,res,()=>{seguir=true;}); if (!seguir) break; }
    return res;
  } };
}
test('capacidade fechada por padrão e sessão obrigatória em todas as rotas', async () => {
  const a=ambiente({ ativo:false });
  assert.deepEqual((await a.pedir('get /contratacoes/capacidades')).body,{disponivel:false});
  assert.equal((await a.pedir('get /contratacoes')).codigo,503);
  for (const r of ['get /contratacoes/capacidades','get /contratacoes','post /contratacoes','patch /contratacoes/:id'])
    assert.equal((await a.pedir(r,{}, {},null)).codigo,401);
  assert.deepEqual(a.chamadas,[]);
});
test('participante recusado; fornecedor e admin somente consultam, ator vem da sessão', async () => {
  for (const perfil of ['participante','fornecedor','admin']) {
    const a=ambiente({perfil});
    assert.equal((await a.pedir('post /contratacoes',{proposta_id:9})).codigo,403);
    assert.equal((await a.pedir('patch /contratacoes/:id',{estado:'concluido',motivo:'Entregue',versao:1})).codigo,403);
    assert.equal((await a.pedir('get /contratacoes')).codigo,perfil==='participante'?403:200);
    assert.deepEqual(a.chamadas,perfil==='participante'?[]:[['listar',{id:7,perfil},null]]);
  }
});
test('formalização não aceita proprietário, valor ou estado adulterados', async () => {
  const a=ambiente({repo:{formalizar:async()=>({id:12})}});
  for (const b of [{},{proposta_id:0},{proposta_id:9,organizador_id:8},{proposta_id:9,valor:0},{proposta_id:9,estado:'ativo'}])
    assert.equal((await a.pedir('post /contratacoes',b)).codigo,400);
  assert.equal((await a.pedir('post /contratacoes',{proposta_id:9})).codigo,201);
  assert.deepEqual(a.chamadas,[['formalizar',{id:7,perfil:'organizador'},9]]);
});
test('transições exigem versão, estado terminal e justificativa; filtros estritos', async () => {
  const a=ambiente();
  for (const b of [{estado:'ativo',motivo:'teste',versao:1},{estado:'concluido',motivo:' ',versao:1},{estado:'cancelado',motivo:'teste',versao:0}])
    assert.equal((await a.pedir('patch /contratacoes/:id',b)).codigo,400);
  assert.equal((await a.pedir('get /contratacoes',null,{fornecedor:8})).codigo,400);
  assert.equal((await a.pedir('get /contratacoes',null,{evento:'0'})).codigo,400);
  assert.equal((await a.pedir('patch /contratacoes/:id',{estado:'cancelado',motivo:'  Evento cancelado  ',versao:2})).codigo,200);
  assert.deepEqual(a.chamadas,[['alterar',{id:7,perfil:'organizador'},12,{estado:'cancelado',motivo:'Evento cancelado',versao:2}]]);
});
test('falhas de regra preservadas; falha inesperada de escrita nunca simula confirmação', async () => {
  for (const status of [403,404,409]) {
    const a=ambiente({repo:{formalizar:()=>{throw falha(status,'Recusado');}}});
    const r=await a.pedir('post /contratacoes',{proposta_id:9});
    assert.equal(r.codigo,status); assert.equal(r.body.resultado_incerto,false);
  }
  const a=ambiente({repo:{formalizar:()=>{throw Error('segredo não publicável');}}});
  const r=await a.pedir('post /contratacoes',{proposta_id:9});
  assert.equal(r.codigo,503); assert.equal(r.body.resultado_incerto,true); assert.doesNotMatch(r.body.erro,/segredo/);
});
function cliente(resposta) {
  const calls=[];
  return { calls, schema(s) { assert.equal(s,'public'); return { rpc(n,args) {
    calls.push([n,args]); return { retry(v) { assert.equal(v,false); return { abortSignal(signal) { assert.ok(signal); return Promise.resolve(resposta); } }; } };
  } }; } };
}
test('adaptador deriva propriedade do ator e recusa vazamento de outra conta', async () => {
  for (const perfil of ['organizador','fornecedor']) {
    const c=cliente({data:[{id:1,organizador_id:8,fornecedor_id:8,evento_id:3}]});
    await assert.rejects(criarRepositorioContratacoes(c).listar({id:7,perfil},3),e=>e.respostaStatus===503);
    assert.deepEqual(c.calls,[['listar_contratacoes_v1',{p_ator:7,p_perfil:perfil,p_evento:3}]]);
  }
});
test('adaptador mapeia conflitos, indisponibilidade e confirmação incompleta', async () => {
  for (const [code,status] of [['CT400',400],['CT403',403],['CT404',404],['CT409',409],['57014',503]]) {
    const r=criarRepositorioContratacoes(cliente({error:{code}}));
    await assert.rejects(r.formalizar({id:7},9),e=>e.respostaStatus===status && e.resultadoIncerto===(status===503));
  }
  await assert.rejects(criarRepositorioContratacoes(cliente({data:{id:1,organizador_id:8,proposta_id:9}})).formalizar({id:7},9),e=>e.resultadoIncerto===true);
  for (const data of [null,0,2,'1']) await assert.rejects(criarRepositorioContratacoes(cliente({data})).capacidades());
  assert.deepEqual(await criarRepositorioContratacoes(cliente({data:1})).capacidades(),{disponivel:true});
});
test('adaptador preserva lista integral e envia versão/autoria sem campos do cliente',async()=>{
  const dados=Array.from({length:1001},(_,i)=>({id:i+1,organizador_id:7,evento_organizador_id:7,fornecedor_id:8,evento_id:3}));
  assert.equal((await criarRepositorioContratacoes(cliente({data:dados})).listar({id:7,perfil:'organizador'},3)).length,1001);
  const c=cliente({data:{id:12,organizador_id:7,estado:'cancelado'}});
  await criarRepositorioContratacoes(c).alterar({id:7},12,{estado:'cancelado',motivo:'Evento cancelado',versao:4,organizador_id:99});
  assert.deepEqual(c.calls,[['alterar_contratacao_v1',{p_ator:7,p_contrato:12,p_estado:'cancelado',p_motivo:'Evento cancelado',p_versao:4}]]);
});
test('adaptador recusa contratos do autor anterior depois de transferir o evento',async()=>{
  for(const id of [7,8]) {
    const c=cliente({data:[{id:12,organizador_id:7,evento_organizador_id:8,fornecedor_id:9,evento_id:3}]});
    await assert.rejects(criarRepositorioContratacoes(c).listar({id,perfil:'organizador'},3),e=>e.respostaStatus===503);
  }
});
