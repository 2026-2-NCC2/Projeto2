"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {criarServicoImagensEvento,criarRepositorioImagensEvento,criarStorageEvento,validarPosicao,conferirObjeto}=require('../eventos-imagens.cjs');
const u={id:7,perfil:'organizador'},op='00000000-0000-4000-8000-000000000001';
const ref={operacao:op,evento_origem:13,posicao:0,bucket:'eventos-imagens',caminho:`13/${op}.webp`};
function fixture(modo='ok') {
  const calls=[],imagens=[];
  const repo={listar:async(usuario,id)=>{calls.push('autorizar');if(usuario.id!==7||id!==13)throw Object.assign(Error('Evento não encontrado'),{status:404});return imagens;},
    reservar:async()=>calls.push('reservar'),confirmar:async()=>{calls.push('confirmar');if(modo==='commit-incerto')throw Error();},remover:async()=>calls.push('remover')};
  const storage={enviar:async()=>{calls.push('enviar');if(modo==='upload-incerto')throw Error();},assinar:async()=>({url:'https://sintetico.invalid',expira_em_segundos:120})};
  const processar=async(usuario,tipo)=>{calls.push('processar');assert.equal(tipo,'capa');return{dados:Buffer.alloc(20),mime:'image/webp',tamanho:20,largura:32,altura:24};};
  return{calls,imagens,servico:criarServicoImagensEvento({repositorio:repo,storage,processar})};
}
test('somente organizador dono pode enviar; recusa acontece antes do codec/Storage',async()=>{
  const f=fixture();for(const perfil of ['admin','participante','fornecedor'])await assert.rejects(f.servico.substituir({...u,perfil},13,0,Buffer.alloc(1)),{status:403});
  assert.equal(f.calls.length,0);await assert.rejects(f.servico.substituir({...u,id:8},13,0,Buffer.alloc(1)),{status:404});
  assert.deepEqual(f.calls,['autorizar']);
});
test('capa e galeria usam posições limitadas e protocolo reserva/upload/confirmação',async()=>{
  for(const posicao of [0,1,8]) {const f=fixture();const r=await f.servico.substituir(u,13,posicao,Buffer.alloc(1));assert.match(r.operacao,/^[a-f0-9-]{36}$/);assert.deepEqual(f.calls,['autorizar','processar','reservar','enviar','confirmar']);}
  for(const posicao of [-1,9,1.5,'0'])assert.throws(()=>validarPosicao(posicao),{status:400});
});
for(const modo of ['upload-incerto','commit-incerto'])test(modo+' não repete escrita ou remove arquivo por compensação',async()=>{
  const f=fixture(modo);await assert.rejects(f.servico.substituir(u,13,0,Buffer.alloc(1)),{status:503});assert.equal(f.calls.filter(c=>c==='enviar').length,1);assert.ok(!f.calls.includes('remover'));
});
test('referência não pode cruzar evento, bucket ou caminho',()=>{
  assert.doesNotThrow(()=>conferirObjeto(13,ref));for(const r of [{...ref,evento_origem:14},{...ref,bucket:'perfil-capas'},{...ref,caminho:`14/${op}.webp`}])assert.throws(()=>conferirObjeto(13,r),{status:403});
});
test('Storage é privado, sem upsert, origem/caminho de assinatura conferidos',async()=>{
  const calls=[],origem='https://sintetico.supabase.co';
  const storage=criarStorageEvento({storage:{from:bucket=>{assert.equal(bucket,'eventos-imagens');return{
    upload:async(...args)=>{calls.push(args);return{data:{path:ref.caminho}};},
    createSignedUrl:async()=>({data:{signedUrl:`${origem}/storage/v1/object/sign/eventos-imagens/${ref.caminho}?token=sintetico`}}),
  };}}},origem);
  await storage.enviar(13,ref,Buffer.alloc(1));assert.equal(calls[0][2].upsert,false);assert.equal((await storage.assinar(13,ref)).expira_em_segundos,120);
  await assert.rejects(storage.enviar(14,ref,Buffer.alloc(1)),{status:403});
});
function repoFixture({perfil='organizador',dono=true,permitido=true}={}) {
  const calls=[];const pool={connect:async()=>({release(){},query:async(sql,params)=>{
    calls.push({sql,params});if(sql.startsWith('SELECT perfil'))return{rows:[{perfil}]};
    if(sql.startsWith('SELECT id FROM public.eventos'))return{rows:dono?[{id:13}]:[]};
    if(sql.startsWith('SELECT e.id'))return{rows:permitido?[{id:13}]:[]};
    if(sql.startsWith('SELECT * FROM public.eventos_imagens'))return{rows:[]};
    return{rows:[]};}})};
  return{repo:criarRepositorioImagensEvento(pool),calls};
}
test('repositório revalida propriedade em transação para reserva e remoção',async()=>{
  for(const acao of ['reservar','remover']) {
    const f=repoFixture({dono:false});await assert.rejects(acao==='reservar'?f.repo.reservar(u,13,0,{...ref,mime:'image/webp',tamanho:20,largura:32,altura:24}):f.repo.remover(u,13,0),{status:404});
    assert.ok(f.calls.some(c=>c.sql==='SELECT id FROM public.eventos WHERE id=$1 AND usuario_id=$2 FOR UPDATE'&&c.params[1]===7));
    assert.ok(!f.calls.some(c=>/^(UPDATE|INSERT)/.test(c.sql)));assert.equal(f.calls.at(-1).sql,'ROLLBACK');
  }
});
test('consulta mantém regras por perfil; nenhuma assinatura sem autorização',async()=>{
  for(const perfil of ['organizador','participante','fornecedor','admin']) {
    const f=repoFixture({perfil,permitido:false});await assert.rejects(f.repo.listar({...u,perfil},13),{status:404});
    const filtro=f.calls.find(c=>c.sql.startsWith('SELECT e.id'));assert.ok(filtro.sql.includes("e.status='Ativo'"));assert.ok(filtro.sql.includes("q.status='Aberta'"));assert.equal(filtro.params[2],perfil);
    assert.ok(!f.calls.some(c=>c.sql.startsWith('SELECT * FROM public.eventos_imagens')));
  }
});
test('importar o candidato não cria clientes, rotas ou pools',()=>{
  const fs=require('node:fs'),path=require('node:path');const servidor=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert.ok(!servidor.includes("require(\"./eventos-imagens"));assert.ok(!servidor.includes("require('./eventos-imagens"));
});

test('candidato de eventos em PostgreSQL descartável', {skip:process.env.TROCATICKET_SQL_ISOLADO!=='1',timeout:60000}, async t=>{
  const {execFileSync}=require('node:child_process'),{Pool}=require('pg'),{randomUUID}=require('node:crypto');
  const fs=require('node:fs'),path=require('node:path');
  const nome='trocaticket-eventos-imagens-'+randomUUID(),senha=randomUUID();let pool;
  execFileSync('docker',['run','--detach','--rm','--pull=never','--name',nome,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+senha,'postgres:17'],{stdio:'pipe'});
  t.after(async()=>{try{await pool?.end();}finally{execFileSync('docker',['stop','--time','1',nome],{stdio:'pipe'});}});
  for(let i=0;;i++){try{execFileSync('docker',['exec',nome,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'pipe'});break;}catch(e){if(i>60)throw e;await new Promise(r=>setTimeout(r,200));}}
  const porta=Number(execFileSync('docker',['port',nome,'5432/tcp'],{encoding:'utf8'}).trim().split(':').at(-1));
  pool=new Pool({host:'127.0.0.1',port:porta,user:'postgres',password:senha,database:'postgres',max:4,query_timeout:10000});
  await pool.query(`CREATE ROLE service_role BYPASSRLS;CREATE ROLE anon;CREATE ROLE authenticated;
    CREATE TABLE usuarios(id integer PRIMARY KEY,perfil text NOT NULL);
    INSERT INTO usuarios VALUES(7,'organizador'),(8,'organizador'),(9,'participante'),(10,'fornecedor'),(11,'admin');
    CREATE TABLE eventos(id integer PRIMARY KEY,usuario_id integer NOT NULL REFERENCES usuarios(id),status text);
    INSERT INTO eventos VALUES(13,7,'Ativo'),(14,8,'Em planejamento');
    CREATE TABLE cotacoes(id integer PRIMARY KEY,evento_id integer REFERENCES eventos(id) ON DELETE CASCADE,status text,prazo date);
    INSERT INTO cotacoes VALUES(21,13,'Aberta',CURRENT_DATE+1);
    GRANT SELECT,UPDATE ON usuarios,eventos TO service_role;GRANT SELECT ON cotacoes TO service_role;`);
  // Exclusivamente fixture local. O arquivo não é executado contra Supabase.
  await pool.query(fs.readFileSync(path.join(__dirname,'../../Banco de dados/eventos_imagens.preparacao.sql'),'utf8'));
  const repo=criarRepositorioImagensEvento(pool);
  const nova=()=>{const operacao=randomUUID();return{operacao,evento_origem:13,bucket:'eventos-imagens',caminho:`13/${operacao}.webp`,mime:'image/webp',tamanho:20,largura:32,altura:24};};
  await t.test('leitura por perfil usa evento próprio, status e cotação disponíveis',async()=>{
    await assert.rejects(repo.listar(u,14),{status:404});
    for(const usuario of [{id:9,perfil:'participante'},{id:10,perfil:'fornecedor'}]){
      assert.deepEqual(await repo.listar(usuario,13),[]);await assert.rejects(repo.listar(usuario,14),{status:404});
      await assert.rejects(repo.reservar(usuario,13,0,nova()),{status:403});
    }
    assert.deepEqual(await repo.listar({id:11,perfil:'admin'},14),[]);
    await assert.rejects(repo.remover({id:11,perfil:'admin'},13,0),{status:403});
  });
  await t.test('mesma posição concorrente admite somente uma reserva',async()=>{
    const r=await Promise.allSettled([repo.reservar(u,13,2,nova()),repo.reservar(u,13,2,nova())]);
    assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(r.find(x=>x.status==='rejected').reason.status,409);
  });
  await t.test('capa e galeria persistem; substituição agenda antiga e confirmação é idempotente',async()=>{
    const processar=async()=>({dados:Buffer.alloc(20),mime:'image/webp',tamanho:20,largura:32,altura:24});
    const servico=criarServicoImagensEvento({repositorio:repo,storage:{enviar:async()=>{}},processar});
    const antiga=await servico.substituir(u,13,0,Buffer.alloc(1));
    const atual=await servico.substituir(u,13,0,Buffer.alloc(1));
    await repo.confirmar(u,13,0,atual.operacao);
    await servico.substituir(u,13,1,Buffer.alloc(1));await servico.substituir(u,13,8,Buffer.alloc(1));
    assert.equal((await repo.listar(u,13)).length,3);
    assert.equal((await pool.query('SELECT estado FROM eventos_imagens WHERE operacao=$1',[antiga.operacao])).rows[0].estado,'limpeza');
  });
  await t.test('troca de dono impede confirmação pelo anterior ou adoção da sua reserva',async()=>{
    const ref=nova();await repo.reservar(u,13,3,ref);
    await pool.query('UPDATE eventos SET usuario_id=8 WHERE id=13');
    await assert.rejects(repo.confirmar(u,13,3,ref.operacao),{status:404});
    await assert.rejects(repo.confirmar({id:8,perfil:'organizador'},13,3,ref.operacao),{status:409});
    await pool.query('UPDATE eventos SET usuario_id=7 WHERE id=13');
  });
  await t.test('remoção cancela reserva e bloqueia confirmação tardia',async()=>{
    const ref=nova();await repo.reservar(u,13,4,ref);await repo.remover(u,13,4);await repo.remover(u,13,4);
    await assert.rejects(repo.confirmar(u,13,4,ref.operacao),{status:409});
  });
  await t.test('exclusão do evento preserva diário e caminho para futura limpeza',async()=>{
    await pool.query('DELETE FROM eventos WHERE id=13');
    const r=await pool.query('SELECT evento_id,evento_origem FROM eventos_imagens');
    assert.ok(r.rows.length>0);assert.ok(r.rows.every(r=>r.evento_id===null&&r.evento_origem===13));
    await assert.rejects(repo.listar({id:11,perfil:'admin'},13),{status:404});
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM usuarios')).rows[0].n,5);
  });
});
