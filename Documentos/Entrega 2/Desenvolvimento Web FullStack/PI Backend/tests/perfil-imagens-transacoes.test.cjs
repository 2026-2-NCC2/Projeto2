"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { criarRepositorioImagens } = require('../imagens/repositorio.cjs');
const { criarServicoImagens, limparUmaImagem } = require('../imagens/servico.cjs');
const { novoArquivo } = require('../imagens/politica.cjs');

test('repositório real PostgreSQL: imagens, concorrência e limpeza', { skip: process.env.TROCATICKET_SQL_ISOLADO !== '1', timeout:60000 }, async t => {
  const nome='trocaticket-imagens-repo-'+randomUUID(), senha=randomUUID();
  let pool;
  execFileSync('docker',['run','--detach','--rm','--pull=never','--name',nome,
    '-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+senha,'postgres:17'],{stdio:'pipe'});
  t.after(async()=>{try {await pool?.end();} finally {execFileSync('docker',['stop','--time','1',nome],{stdio:'pipe'});}});
  for(let i=0;;i++) { try {execFileSync('docker',['exec',nome,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'pipe'});break;}
    catch(erro){if(i>60)throw erro;await new Promise(r=>setTimeout(r,200));} }
  const porta=execFileSync('docker',['port',nome,'5432/tcp'],{encoding:'utf8'}).trim().split(':').at(-1);
  pool=new Pool({host:'127.0.0.1',port:Number(porta),user:'postgres',password:senha,database:'postgres',max:6,connectionTimeoutMillis:3000,query_timeout:10000});
  await pool.query(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.usuarios(id integer PRIMARY KEY,perfil text NOT NULL);
    INSERT INTO usuarios VALUES(7,'participante'),(8,'organizador'),(9,'fornecedor'),(10,'admin');
    GRANT SELECT,UPDATE ON usuarios TO service_role;`);
  await pool.query(readFileSync(path.join(__dirname,'../../Banco de dados/perfil_imagens.incremental.sql'),'utf8'));
  const repo=criarRepositorioImagens(pool);
  const ref=(id=7,tipo='foto')=>({usuario_id:id,tipo,...novoArquivo({id,perfil:'participante'},tipo),mime:'image/webp',tamanho:20,largura:32,altura:24});
  const expirar=op=>pool.query("UPDATE perfil_imagens_objetos SET reserva_ate=now()-interval '1 minute' WHERE operacao=$1",[op]);
  const vencerLimpeza=()=>pool.query("UPDATE perfil_imagens_objetos SET limpeza_apos=now()-interval '1 minute' WHERE estado IN ('limpeza','removido')");
  await t.test('uma reserva por slot, inclusive requisições concorrentes',async()=>{
    const resultados=await Promise.allSettled([repo.reservar(ref()),repo.reservar(ref())]);
    assert.equal(resultados.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(resultados.find(x=>x.status==='rejected').reason.status,409);
    await repo.desvincular(7,'foto');
  });
  await t.test('confirmar é idempotente, substitui atomicamente e separa donos/tipos',async()=>{
    for(const id of [7,8,9,10]) {
      const a=ref(id);await repo.reservar(a);await Promise.all([repo.confirmar(id,'foto',a.operacao),repo.confirmar(id,'foto',a.operacao)]);
      assert.equal((await repo.buscar(id,'foto')).operacao,a.operacao);
      assert.equal(await repo.buscar(id,'capa'),null);
    }
    const nova=ref();await repo.reservar(nova);await repo.confirmar(7,'foto',nova.operacao);
    assert.equal((await repo.buscar(7,'foto')).operacao,nova.operacao);
    await assert.rejects(repo.confirmar(8,'foto',nova.operacao),{status:409});
    const atual=(await pool.query("SELECT count(*)::integer AS n FROM perfil_imagens_objetos WHERE usuario_id=7 AND estado='atual'")).rows[0];assert.equal(atual.n,1);
  });
  await t.test('PUT/DELETE cancela reserva e impede confirmação tardia',async()=>{
    const a=ref();await repo.reservar(a);await repo.desvincular(7,'foto');
    await assert.rejects(repo.confirmar(7,'foto',a.operacao),{status:409});
    assert.equal(await repo.buscar(7,'foto'),null);
    await repo.desvincular(7,'foto');
  });
  await t.test('DELETE durante upload em trânsito impede ressuscitar imagem',async()=>{
    let liberar, entrou;
    const iniciou=new Promise(resolve=>{entrou=resolve});
    const emVoo=new Promise(resolve=>{liberar=resolve});
    let envios=0;
    const servico=criarServicoImagens({repositorio:repo,storage:{enviar:async()=>{envios++;entrou();await emVoo;}},
      processar:async()=>({dados:Buffer.alloc(20),mime:'image/webp',tamanho:20,largura:32,altura:24})});
    const resultado=servico.substituir({id:7,perfil:'participante'},'foto',Buffer.alloc(1));
    const recusado=assert.rejects(resultado,{status:503});
    await iniciou;await repo.desvincular(7,'foto');liberar();await recusado;
    assert.equal(await repo.buscar(7,'foto'),null);assert.equal(envios,1);
  });
  await t.test('DELETE/PUT permite somente reserva nova; reserva expirada não revive',async()=>{
    const antiga=ref();await repo.reservar(antiga);await expirar(antiga.operacao);
    const nova=ref();await repo.reservar(nova);
    await assert.rejects(repo.confirmar(7,'foto',antiga.operacao),{status:409});
    await repo.confirmar(7,'foto',nova.operacao);
    assert.equal((await repo.buscar(7,'foto')).operacao,nova.operacao);
  });
  await t.test('upload/commit incerto preserva diário, sem retry ou compensação',async()=>{
    await repo.desvincular(7,'foto');
    let envios=0,remocoes=0;
    const storage={enviar:async()=>{envios++;throw Error('timeout sintético');},remover:async()=>remocoes++};
    const servico=criarServicoImagens({repositorio:repo,storage,processar:async()=>({dados:Buffer.alloc(20),mime:'image/webp',tamanho:20,largura:32,altura:24})});
    await assert.rejects(servico.substituir({id:7,perfil:'participante'},'foto',Buffer.alloc(1)),{status:503});
    assert.equal(envios,1);assert.equal(remocoes,0);
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM perfil_imagens_objetos WHERE usuario_id=7 AND estado='reservado'")).rows[0].n,1);
    await repo.desvincular(7,'foto');
    const incerto=criarServicoImagens({repositorio:{...repo,confirmar:async(...args)=>{await repo.confirmar(...args);throw Error('resposta perdida');}},storage:{enviar:async()=>{envios++;}},processar:async()=>({dados:Buffer.alloc(20),mime:'image/webp',tamanho:20,largura:32,altura:24})});
    await assert.rejects(incerto.substituir({id:7,perfil:'participante'},'foto',Buffer.alloc(1)),{status:503});
    assert.ok(await repo.buscar(7,'foto'));assert.equal(envios,2);
  });
  await t.test('limpeza não toca atuais, respeita quarentena e usa lease exclusivo',async()=>{
    assert.equal(await repo.reivindicarLimpeza(),null);
    await vencerLimpeza();
    const [a,b]=await Promise.all([repo.reivindicarLimpeza(),repo.reivindicarLimpeza()]);
    assert.ok(a||b); if(a&&b)assert.notEqual(a.operacao,b.operacao);
    const tarefa=a||b;
    assert.equal(tarefa.estado,'limpando');
    await assert.rejects(repo.concluirLimpeza(tarefa.operacao,new Date(0).toISOString()),{status:409});
    await repo.adiarLimpeza(tarefa.operacao,tarefa.lease);
    if(a&&b)await repo.adiarLimpeza(b.operacao,b.lease);
    assert.ok(await repo.buscar(7,'foto'));
  });
  await t.test('worker remove só tarefa reivindicada e mantém tombstone; lease perdido é recuperável',async()=>{
    await vencerLimpeza();let removida;
    assert.equal(await limparUmaImagem({repositorio:repo,storage:{remover:async(u,t,r)=>{removida=r;assert.equal(r.usuario_id,u.id);}}}),true);
    assert.equal((await pool.query('SELECT estado FROM perfil_imagens_objetos WHERE operacao=$1',[removida.operacao])).rows[0].estado,'removido');
    // Recupera somente leases vencidos, sem reativar a imagem.
    await pool.query("UPDATE perfil_imagens_objetos SET lease_ate=now()-interval '1 minute' WHERE estado='limpando'");
    const tarefa=await repo.reivindicarLimpeza(); if(tarefa)await repo.concluirLimpeza(tarefa.operacao,tarefa.lease);
    assert.ok(await repo.buscar(7,'foto'));
  });
  await t.test('worker antigo não conclui lease retomado; tombstone jamais é confirmado',async()=>{
    const anterior=await repo.buscar(8,'foto');await repo.desvincular(8,'foto');
    await pool.query("UPDATE perfil_imagens_objetos SET limpeza_apos=now()+interval '24 hours' WHERE estado IN ('limpeza','removido')");
    await pool.query("UPDATE perfil_imagens_objetos SET limpeza_apos=now()-interval '1 minute' WHERE operacao=$1",[anterior.operacao]);
    const a=await repo.reivindicarLimpeza();assert.equal(a.operacao,anterior.operacao);
    await pool.query("UPDATE perfil_imagens_objetos SET lease_ate=now()-interval '1 minute' WHERE operacao=$1",[a.operacao]);
    const b=await repo.reivindicarLimpeza();assert.equal(a.operacao,b.operacao);assert.notEqual(a.lease,b.lease);
    await assert.rejects(repo.concluirLimpeza(a.operacao,a.lease),{status:409});
    await repo.concluirLimpeza(b.operacao,b.lease);
    await assert.rejects(repo.confirmar(8,'foto',b.operacao),{status:409});
  });
  await t.test('rollback preserva slot se falhar a promoção; pool não vaza SET ROLE',async()=>{
    const antes=await repo.buscar(7,'foto');const nova=ref();await repo.reservar(nova);
    // Erro SQL após demover antigo, antes de concluir a transação real.
    const poolFalha={connect:async()=>{const c=await pool.connect();return {release:x=>c.release(x),query:(q,p)=>q.includes("SET estado='atual'")?Promise.reject(Error('falha sintética')):c.query(q,p)};}};
    await assert.rejects(criarRepositorioImagens(poolFalha).confirmar(7,'foto',nova.operacao),{status:503});
    assert.equal((await repo.buscar(7,'foto')).operacao,antes.operacao);
    assert.equal((await pool.query('SELECT current_user AS papel')).rows[0].papel,'postgres');
  });
});
