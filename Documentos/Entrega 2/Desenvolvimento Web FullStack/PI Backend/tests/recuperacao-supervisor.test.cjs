"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {criarRecuperacao}=require('../scripts/recuperacao-supervisor.cjs'),startup=require('../config/startup-controlado.cjs'),{criarSupervisor}=require('../config/supervisor-cutover.cjs');
function fixture(){
  const env={DB_PROVIDER:'supabase',SUPABASE_URL:'https://gnwybroqfvwosiqzsfla.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_ficticia_recuperacao',JWT_SECRET:'jwt-ficticio-recuperacao-'+ 'a'.repeat(40),HOMOLOG_JWT_SECRET:'homolog-ficticio-'+ 'b'.repeat(40)};
  let data={versao:1,congelado:true,selado:true,instancias:['boot-anterior'],transicao:{id:'janela-ficticia',fase:'INCERTA',destino:'boot-anterior',pidDestino:101,ticket:null,checkpointId:'checkpoint-ficticio',configuracaoHash:startup.fingerprint(env)}};
  const estado={ler:()=>structuredClone(data),gravar:e=>{data=structuredClone(e);}};
  const r={run:'run-ficticio',status:'INTERROMPIDA',failure:{stage:'smoke_leitura_jwt_permissoes',code:'ERR_ASSERTION'},jwtRotated:true,startupPatchApplied:true,configurationProvider:'supabase',supabaseBackendPid:101,checkpointId:'checkpoint-ficticio',t1Attempted:false,rollbackExecuted:false,createdIds:{eventos:[],custos_evento:[]},checks:['backups T0 completos e delta final aprovados'],http:[{method:'GET',route:'/perfil',status:200,write:false}]};
  const v={relatorio:r,diario:structuredClone(r),causaConfirmada:'SMOKE_PERFIL_CAMPO_INEXISTENTE',checkpointId:r.checkpointId,checkpointSha256:'c'.repeat(64),escritoresControlados:true,controleMantidoDesdeFalha:true,httpManutencao:503,processo:{pid:101,parentPid:100,criadoEm:'2026-10-31T00:00:00Z',entradaConhecida:true,portaExclusivaLocal:true}};
  let target,stop=0,launch=0,locked=false;const hooks={
    adquirirExclusivo(){assert.equal(locked,false,'TRAVA_OCUPADA');locked=true;return ()=>{locked=false;};},
    estado,ambiente:env,inspecionar:async()=>structuredClone(v),
    encerrarConhecido:async proof=>{assert.deepEqual(proof,v.processo);stop++;return {pid:101,encerrado:true,portaLivre:true};},
    lancarSelado:async proof=>{
      launch++;const e=estado.ler();assert.equal(e.transicao.id,proof.janela);assert.equal(e.transicao.configuracaoHash,proof.configuracaoHash);
      estado.gravar({...e,transicao:{...e.transicao,fase:'PREPARADA',pidDestino:202,destino:'boot-novo',ticket:'ticket-ficticio-uso-unico'}});
      startup.consumirEntrada({estado,env,instancia:'boot-novo',ticket:'ticket-ficticio-uso-unico',pid:202});target=criarSupervisor({estado,instancia:'boot-novo',pid:202});return {pid:202,instancia:'boot-novo'};
    },consultar:async()=>target.status(),abrirLeitura:async janela=>target.abrirLeitura(janela)
  };
  const api=()=>criarRecuperacao(hooks);
  return {env,estado,v,hooks,api,target:()=>target,counts:()=>({stop,launch})};
}
function request(supervisor,method,path){const res=new EventEmitter();res.statusCode=200;res.setHeader=()=>{};res.status=n=>{res.statusCode=n;return res;};res.json=()=>res;let admitted=false;supervisor.middleware({method,path},res,()=>{admitted=true;});res.emit('finish');return {status:res.statusCode,admitted};}
test('planejamento inerte e autorizacao obrigatoria antes de qualquer alteracao',async()=>{
  const f=fixture(),a=f.api(),before=f.estado.ler(),p=await a.planejar();assert.equal(p.pidAnterior,101);assert.deepEqual(f.estado.ler(),before);
  await assert.rejects(a.recuperar(p),/NAO_AUTORIZADA/);assert.deepEqual(f.counts(),{stop:0,launch:0});assert.deepEqual(f.estado.ler(),before);
});
test('recuperacao selada preserva JWT checkpoint e janela e repeticao e idempotente',async()=>{
  const f=fixture(),a=f.api(),env=structuredClone(f.env),p=await a.planejar();assert.equal((await a.recuperar(p,{autorizar:true})).status,'PRONTA_SMOKE');
  assert.equal(request(f.target(),'GET','/perfil').status,503);assert.equal(request(f.target(),'POST','/login').status,503);assert.equal(request(f.target(),'POST','/eventos').status,503);
  assert.deepEqual(f.env,env);assert.equal(f.estado.ler().transicao.checkpointId,p.checkpointId);assert.equal(f.estado.ler().transicao.id,'janela-ficticia');
  assert.equal((await a.recuperar(p,{autorizar:true})).reutilizada,true);assert.deepEqual(f.counts(),{stop:1,launch:1});
});
test('retomada autorizada do smoke admite leituras e login e conserva bloqueio de escritas',async()=>{
  const f=fixture(),a=f.api(),p=await a.planejar();await a.recuperar(p,{autorizar:true});await assert.rejects(a.abrirSmoke(p),/NAO_AUTORIZADO/);
  assert.deepEqual(await a.abrirSmoke(p,{autorizar:true}),{status:'SOMENTE_LEITURA',escritasLiberadas:false});
  assert.equal(request(f.target(),'GET','/perfil').admitted,true);assert.equal(request(f.target(),'POST','/login').admitted,true);assert.equal(request(f.target(),'POST','/eventos').status,503);
  await assert.rejects(f.target().executarPersistencia(async()=>assert.fail('escrita executada')),{code:'FREEZE_NOVA_ESCRITA_BLOQUEADA'});
});
test('T1 incerteza HTTP e identidades divergentes sao recusados sem encerrar processos',async()=>{
  const mutations=[f=>{f.v.relatorio.t1Attempted=true;},f=>{f.v.diario.http[0].status='ENVIANDO';},f=>{f.v.processo.pid=999;},f=>{f.v.escritoresControlados=false;},f=>{f.v.checkpointId='outro';},f=>{f.env.JWT_SECRET+='alterado';},f=>{f.v.causaConfirmada='DESCONHECIDA';}];
  for(const mutate of mutations){const f=fixture();mutate(f);await assert.rejects(f.api().planejar());assert.deepEqual(f.counts(),{stop:0,launch:0});assert.equal(f.estado.ler().transicao.fase,'INCERTA');}
});
test('plano obsoleto e recusado antes de modificar o estado',async()=>{
  const f=fixture(),a=f.api(),p=await a.planejar();f.v.processo.criadoEm='outro-processo';const before=f.estado.ler();await assert.rejects(a.recuperar(p,{autorizar:true}),/PLANO_OBSOLETO/);assert.deepEqual(f.counts(),{stop:0,launch:0});assert.deepEqual(f.estado.ler(),before);
});
test('falha durante admissao conserva INCERTA e nao repete encerramento nem boot',async()=>{
  const f=fixture();f.hooks.lancarSelado=async()=>{throw Error('TIMEOUT_FICTICIO');};const a=f.api(),p=await a.planejar();await assert.rejects(a.recuperar(p,{autorizar:true}),/TIMEOUT_FICTICIO/);
  assert.equal(f.estado.ler().transicao.fase,'INCERTA');assert.equal(f.estado.ler().selado,true);await assert.rejects(a.recuperar(p,{autorizar:true}),/SEM_RETRY/);assert.equal(f.counts().stop,1);
});
test('incerteza de persistencia no novo boot impede reabertura',async()=>{
  const f=fixture();f.hooks.consultar=async()=>({...f.target().status(),resultadosIncertos:1});const a=f.api(),p=await a.planejar();await assert.rejects(a.recuperar(p,{autorizar:true}),/DRENAGEM_PENDENTE/);assert.equal(f.estado.ler().transicao.fase,'INCERTA');assert.equal(f.estado.ler().selado,true);assert.equal(request(f.target(),'GET','/perfil').status,503);
});
test('adapters locais permanecem inertes e exigem confirmacao de controle e continuidade',async()=>{
  const {criarAdaptersLocais}=require('../scripts/adapters-recuperacao-local.cjs');
  const estado={ler(){assert.fail('estado real lido');},gravar(){assert.fail('estado real alterado');}};
  const op={estado,ambiente:{},relatorioFile:'NAO_EXISTE'};
  const a=criarAdaptersLocais(op);assert.equal(a.obterControlador(),undefined);await assert.rejects(a.inspecionar(),/JANELA_NAO_CONFIRMADA/);
  const b=criarAdaptersLocais({...op,confirmarJanelaExclusiva:true});await assert.rejects(b.inspecionar(),/CONTINUIDADE_NAO_CONFIRMADA/);
});
test('falha ao abrir leitura devolve INCERTA e selagem persistente sem liberar escrita',async()=>{
  const f=fixture();f.hooks.abrirLeitura=async()=>{throw Error('IPC_FICTICIO_FALHOU');};const a=f.api(),p=await a.planejar();await a.recuperar(p,{autorizar:true});await assert.rejects(a.abrirSmoke(p,{autorizar:true}),/IPC_FICTICIO_FALHOU/);assert.equal(f.estado.ler().selado,true);assert.equal(f.estado.ler().transicao.fase,'INCERTA');assert.equal(request(f.target(),'GET','/perfil').status,503);
});
test('dois controladores concorrentes nao repetem o encerramento ou boot',async()=>{
  const f=fixture(),a=f.api(),b=f.api(),p=await a.planejar(),pausar=f.hooks.encerrarConhecido;let release,entered;
  const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
  f.hooks.encerrarConhecido=async proof=>{entered();await gate;return pausar(proof);};
  // Criar depois do hook para capturar o adapter lento.
  const c=f.api(),running=c.recuperar(p,{autorizar:true});await started;
  await assert.rejects(b.recuperar(p,{autorizar:true}),/TRAVA_OCUPADA/);release();await running;
  assert.deepEqual(f.counts(),{stop:1,launch:1});
});
