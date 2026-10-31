"use strict";
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {lerConfiguracaoBanco,validarInicializacaoBanco}=require('./banco.cjs');
const {criarEstadoPrivado}=require('./estado-supervisor.cjs');
const REF='https://gnwybroqfvwosiqzsfla.supabase.co',contextos=new WeakSet();let instalado;
function fingerprint(env){const c=lerConfiguracaoBanco(env,'principal');assert.equal(c.provider,'supabase');assert.equal(c.url,REF);assert.equal(env.TROCATICKET_HOMOLOGACAO,undefined);assert.ok(typeof env.JWT_SECRET==='string'&&env.JWT_SECRET.length>=32);assert.notEqual(env.JWT_SECRET,env.HOMOLOG_JWT_SECRET);return crypto.createHash('sha256').update(JSON.stringify([c.provider,c.url,c.secretKey,env.JWT_SECRET])).digest('hex');}
function consumirEntrada({estado,env,instancia,ticket,pid=process.pid,instalar=false}){
  const e=estado.ler(),t=e.transicao;assert.ok(e.congelado&&e.selado&&t?.fase==='PREPARADA','STARTUP_SEM_PERMISSAO');
  assert.equal(t.destino,instancia);assert.equal(t.pidDestino,pid);assert.equal(t.ticket,ticket);assert.equal(t.configuracaoHash,fingerprint(env));
  estado.gravar({...e,instancias:[instancia],transicao:{...t,fase:'INICIADA',ticket:null}});
  const ctx={estado,instancia,pid,janela:t.id};contextos.add(ctx);if(instalar){assert.equal(pid,process.pid);instalado=ctx;}return ctx;
}
function obterInstanciaPlanejada(){return instalado?.pid===process.pid?instalado.instancia:null;}
function consumirRestabelecimento({estado,env,instancia,ticket,pid=process.pid,instalar=false}){
  const e=estado.ler(),t=e.transicao,r=t?.restabelecimento;
  assert.ok(e.congelado&&e.selado&&t?.fase==='INCERTA'&&t.ticket===null&&!t.recuperacao&&r?.etapa==='PREPARADA','RESTABELECIMENTO_SEM_PERMISSAO');
  assert.ok(Number.isSafeInteger(pid)&&pid>0&&typeof instancia==='string'&&instancia.length>0&&typeof r.id==='string'&&r.id.length>0);assert.match(ticket,/^[a-f0-9]{64}$/);assert.equal(r.ticket,ticket);assert.equal(r.pidDestino,pid);assert.equal(r.destino,instancia);assert.notEqual(instancia,t.destino);
  assert.equal(r.janelaId,t.id);assert.equal(r.checkpointId,t.checkpointId);assert.equal(r.configuracaoHash,t.configuracaoHash);assert.equal(r.configuracaoHash,fingerprint(env));
  if(instalar)assert.equal(pid,process.pid);
  estado.gravar({...e,instancias:[instancia],transicao:{...t,restabelecimento:{...r,etapa:'CONSUMIDA',ticket:null}}});
  const ctx={estado,instancia,pid,janela:t.id,tipo:'RESTABELECIMENTO_SELADO',admissaoId:r.id};contextos.add(ctx);if(instalar)instalado=ctx;return ctx;
}
function validarEntrada(env,modo='principal',{contexto=instalado,estado=contexto?.estado||criarEstadoPrivado()}={}){
  const c=lerConfiguracaoBanco(env,modo);if(modo==='isolado')return validarInicializacaoBanco(env,modo);const e=estado.ler(),t=e.transicao;
  if(c.provider==='mysql'){assert.ok(t?.fase!=='CONCLUIDA','STARTUP_MYSQL_APOS_ATIVACAO_RECUSADO');return validarInicializacaoBanco(env,modo);}
  if(!t)return validarInicializacaoBanco(env,modo); // Trava historica mantida.
  assert.equal(modo,'principal');assert.equal(c.url,REF);assert.equal(t.configuracaoHash,fingerprint(env));
  if(t.fase==='CONCLUIDA'){assert.ok(!e.congelado&&!e.selado);return c;}
  if(t.fase==='INCERTA'){
    const r=t.restabelecimento;assert.ok(contextos.has(contexto)&&contexto.tipo==='RESTABELECIMENTO_SELADO'&&contexto.estado===estado&&contexto.janela===t.id,'RESTABELECIMENTO_CONTEXTO_RECUSADO');
    assert.ok(e.congelado&&e.selado&&['CONSUMIDA','ADMITIDA_SELADA'].includes(r?.etapa)&&r.ticket===null);assert.equal(r.id,contexto.admissaoId);assert.equal(r.destino,contexto.instancia);assert.equal(r.pidDestino,contexto.pid);assert.equal(r.checkpointId,t.checkpointId);assert.equal(r.janelaId,t.id);assert.equal(r.configuracaoHash,fingerprint(env));assert.deepEqual(e.instancias,[r.destino]);return c;
  }
  assert.ok(contextos.has(contexto)&&contexto.estado===estado&&contexto.janela===t.id,'STARTUP_CONTEXTO_RECUSADO');
  assert.ok(['INICIADA','LEITURA','LIBERAR'].includes(t.fase)&&e.congelado);assert.equal(contexto.instancia,t.destino);assert.equal(contexto.pid,t.pidDestino);return c;
}
module.exports={fingerprint,consumirEntrada,consumirRestabelecimento,obterInstanciaPlanejada,validarEntrada};
