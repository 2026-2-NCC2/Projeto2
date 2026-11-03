'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{fixture}=require('./helpers/falha-pos-t1.cjs');
test('recupera FALHA em simulacao sem apagar procedencia diario ou tickets consumidos',async()=>{const f=await fixture(),before=f.estado.ler(),api=f.api(),p=await api.planejarRecuperacaoFalhaPosT1();assert.deepEqual(f.estado.ler(),before);await api.executar(p,f.authorization);const e=f.estado.ler(),r=e.controleSelado;assert.equal(r.etapa,'ATIVO');assert.equal(r.epoch,before.controleSelado.epoch+1);assert.notEqual(r.id,before.controleSelado.id);assert.deepEqual(e.transicao.t1,before.transicao.t1);assert.deepEqual(JSON.parse(Buffer.from(r.recuperacaoFalhaPosT1.estadoFalhaBase64,'base64')),before);assert.equal(r.estadoAnteriorPosT1Base64,before.controleSelado.estadoAnteriorPosT1Base64);assert.ok(before.controleSelado.consumidos.every(h=>r.consumidos.includes(h)));assert.equal(r.consumidos.length,before.controleSelado.consumidos.length+2);assert.equal(r.ticketControlador,null);assert.equal(r.ticketSupervisor,null);assert.equal(f.status().port,504);assert.ok(!f.events.includes('old-owner-exit')&&!f.events.includes('old-child-exit'));require('../config/procedencia-t1-selada.cjs').conferirProcedenciaT1(e,{destino:true});});
for(const [name,change] of [
 ['ainda ATIVO',(f,v)=>{const e=f.estado.ler();e.controleSelado.etapa='ATIVO';f.estado.gravar(e);}],
 ['limpeza invalida',(f,v)=>{const e=f.estado.ler();e.transicao.t1.cleanupVerified=false;f.estado.gravar(e);}],
 ['ticket pendente',(f,v)=>{const e=f.estado.ler();e.controleSelado.ticketControlador={hash:'a'.repeat(64)};f.estado.gravar(e);}],
 ['processo anterior presente',(f,v)=>v.provaAusencia.todosAusentes=false],
 ['prova expirada',(f,v)=>v.provaAusencia.capturedUtc=new Date(f.now()-31000).toISOString()],
 ['PID consultado incompleto',(f,v)=>v.provaAusencia.pidsConsultados.pop()],
 ['respondedor diferente',(f,v)=>v.respondedor.pid=999],
 ['entrada desconhecida',(f,v)=>v.respondedor.entradaConhecida=false],
 ['sem autorizacao',(f,v)=>v.autorizacao.recuperarFalhaPosT1=false],
 ['sem aceite residual',(f,v)=>v.autorizacao.riscoResidualAceito=false],
 ['diario alterado',(f,v)=>v.t1JournalBytes=Buffer.from('{}')],
 ['checkpoint alterado',(f,v)=>v.checkpointBytes=Buffer.from('{}')],
 ['escritor concorrente',(f,v)=>v.writersAfter.local.unknownProcessCount=1],
 ['dados divergentes',(f,v)=>v.snapshot.supabase.eventos[0].nome='Alterado'],
 ['adicional divergente',(f,v)=>v.snapshot.supabase.eventos[1].descricao='Alterado'],
 ['codigo nao aprovado',(f,v)=>v.pacote.manifestAfter='d'.repeat(64)]
])test('recuperacao rejeita '+name+' sem efeitos',async()=>{const f=await fixture(),read=f.a.inspecionar;f.a.inspecionar=async op=>{const v=await read(op);change(f,v);return v;};await assert.rejects(f.api().planejarRecuperacaoFalhaPosT1());assert.equal(f.events.length,0);assert.equal(f.status().controllerActive,false);});
test('exige autorizacao especifica e plano genuino nao expirado',async()=>{const f=await fixture(),a=f.api(),p=await a.planejarRecuperacaoFalhaPosT1();await assert.rejects(a.executar(p,{autorizar:true,autorizarRestabelecimentoPosT1:true}));await assert.rejects(a.executar(JSON.parse(JSON.stringify(p)),f.authorization));f.advance(31000);await assert.rejects(a.executar(p,f.authorization));assert.equal(f.events.length,0);});
test('duas recuperacoes nao admitem dois controladores',async()=>{const f=await fixture(),a=f.api(),b=f.api(),p=await a.planejarRecuperacaoFalhaPosT1(),q=await b.planejarRecuperacaoFalhaPosT1();let release,entered;const wait=new Promise(r=>release=r),start=new Promise(r=>entered=r),read=f.a.inspecionar;f.a.inspecionar=async op=>{entered();await wait;return read(op);};const running=a.executar(p,f.authorization);await start;await assert.rejects(b.executar(q,f.authorization));release();await running;assert.equal(f.events.filter(e=>e==='new-owner-authority').length,1);});
for(const method of ['inspecionarAposParada','admitirControlador','lancarSupervisorPausado','admitirSupervisor','ouvirSupervisor','conferirContinuidade'])test('falha em '+method+' nao repete nem altera T1',async()=>{const f=await fixture(),before=f.estado.ler().transicao.t1,a=f.api(),p=await a.planejarRecuperacaoFalhaPosT1();f.a[method]=async()=>{throw Error('FALHA_FICTICIA');};await assert.rejects(a.executar(p,f.authorization));assert.equal(f.estado.ler().controleSelado.etapa,'FALHA');assert.deepEqual(f.estado.ler().transicao.t1,before);assert.equal(f.estado.ler().controleSelado.ticketControlador,null);await assert.rejects(a.executar(p,f.authorization));});
