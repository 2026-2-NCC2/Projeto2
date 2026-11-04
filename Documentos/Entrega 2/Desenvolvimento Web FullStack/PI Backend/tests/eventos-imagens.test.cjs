"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {criarServicoImagensEvento,criarRepositorioImagensEvento,criarStorageEvento,validarPosicao,conferirObjeto}=require('../eventos-imagens.cjs');
const u={id:7,perfil:'organizador'},op='00000000-0000-4000-8000-000000000001';
const ref={operacao:op,evento_origem:13,posicao:0,bucket:'eventos-imagens',caminho:`13/${op}.webp`};
function fixture(modo='ok') {
  const calls=[],imagens=[];
  const repo={listar:async(usuario,id)=>{calls.push('autorizar');if(usuario.id!==7||id!==13)throw Object.assign(Error('Evento não encontrado'),{status:404});return imagens;},
    autorizarEdicao:async(usuario,id)=>{calls.push('autorizar');if(usuario.id!==7||id!==13)throw Object.assign(Error('Evento não encontrado'),{status:404});},
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
    if(sql.startsWith('SELECT id,status FROM public.eventos'))return{rows:dono?[{id:13,status:'Ativo'}]:[]};
    if(sql.startsWith('SELECT e.id'))return{rows:permitido?[{id:13}]:[]};
    if(sql.startsWith('SELECT * FROM public.eventos_imagens'))return{rows:[]};
    return{rows:[]};}})};
  return{repo:criarRepositorioImagensEvento(pool),calls};
}
test('repositório revalida propriedade em transação para reserva e remoção',async()=>{
  for(const acao of ['reservar','remover']) {
    const f=repoFixture({dono:false});await assert.rejects(acao==='reservar'?f.repo.reservar(u,13,0,{...ref,mime:'image/webp',tamanho:20,largura:32,altura:24}):f.repo.remover(u,13,0),{status:404});
    assert.ok(f.calls.some(c=>c.sql==='SELECT id,status FROM public.eventos WHERE id=$1 AND usuario_id=$2 FOR UPDATE'&&c.params[1]===7));
    assert.ok(!f.calls.some(c=>/^(UPDATE|INSERT)/.test(c.sql)));assert.equal(f.calls.at(-1).sql,'ROLLBACK');
  }
});
test('consulta mantém regras por perfil; nenhuma assinatura sem autorização',async()=>{
  for(const perfil of ['organizador','participante','fornecedor','admin']) {
    const f=repoFixture({perfil,permitido:false});await assert.rejects(f.repo.listar({...u,perfil},13),{status:404});
    const filtro=f.calls.find(c=>c.sql.startsWith('SELECT e.id'));assert.ok(filtro.sql.includes('e.status COLLATE "C"'));assert.ok(filtro.sql.includes('clock_timestamp()'));assert.ok(filtro.sql.includes('public.inscricoes'));assert.ok(filtro.sql.includes('public.propostas'));assert.equal(filtro.params[2],perfil);
    assert.ok(!f.calls.some(c=>c.sql.startsWith('SELECT * FROM public.eventos_imagens')));
  }
});
test('servidor monta router bloqueado antes do parser; ativação permanece desligada',()=>{
  const fs=require('node:fs'),path=require('node:path');const servidor=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert.ok(servidor.indexOf("require('./eventos-imagens-http.cjs')")<servidor.indexOf('app.use(express.json())'));
  assert.equal(require('../config/ativacao-eventos-imagens.json').ativo,false);
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
    CREATE TABLE contas_teste_imagens(usuario_id integer,estado text);
    CREATE TABLE eventos(id integer PRIMARY KEY,usuario_id integer NOT NULL REFERENCES usuarios(id),status text,data date DEFAULT '2030-01-01',horario time DEFAULT '10:00');
    INSERT INTO eventos(id,usuario_id,status) VALUES(13,7,'Ativo'),(14,8,'Em planejamento');
    CREATE TABLE cotacoes(id integer PRIMARY KEY,evento_id integer REFERENCES eventos(id) ON DELETE CASCADE,status text,prazo date);
    INSERT INTO cotacoes VALUES(21,13,'Aberta',CURRENT_DATE+1);
    CREATE TABLE propostas(id integer PRIMARY KEY,cotacao_id integer REFERENCES cotacoes(id),fornecedor_id integer REFERENCES usuarios(id));
    CREATE TABLE inscricoes(usuario_id integer REFERENCES usuarios(id),evento_id integer REFERENCES eventos(id) ON DELETE CASCADE);
    GRANT SELECT,UPDATE ON usuarios,eventos,contas_teste_imagens TO service_role;GRANT SELECT ON cotacoes,propostas,inscricoes TO service_role;`);
  // Exclusivamente fixture local. O arquivo não é executado contra Supabase.
  await pool.query(fs.readFileSync(path.join(__dirname,'../../Banco de dados/eventos_imagens.preparacao.sql'),'utf8'));
  await t.test('preflight de leitura reconhece o schema candidato e recusa bucket público',async()=>{
    await pool.query(`CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      INSERT INTO storage.buckets VALUES('eventos-imagens',false,10485760,ARRAY['image/webp']);
      CREATE FUNCTION eventos_capacidades_v1() RETURNS integer LANGUAGE sql STABLE AS 'SELECT 1';`);
    const module={exports:{}},ref='gnwybroqfvwosiqzsfla';
    require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/preflight-eventos-imagens.cjs'),'utf8'),{module,AbortSignal,
      fetch:async()=>({ok:true,headers:{get:()=>ref},arrayBuffer:async()=>new ArrayBuffer(0)}),
      require(nome){
        if(nome==='./preflight-imagens-producao.cjs')return{configurar:()=>({c:{url:'https://'+ref+'.supabase.co',secretKey:'sintetica'},pg:{}})};
        if(nome==='../db-postgres.js')return{criarPoolPostgres:()=>({async connect(){const c=await pool.connect();return{connection:{stream:{authorized:true}},query:(...a)=>c.query(...a),release:()=>c.release()}},async end(){}})};
        if(nome==='../eventos-imagens.cjs')return require('../eventos-imagens.cjs');
        throw Error('Dependência inesperada');
      }});
    let resultado=await module.exports.executar({});assert.equal(resultado.pronto,true,JSON.stringify(resultado.checks));
    await pool.query('UPDATE storage.buckets SET public=true');
    resultado=await module.exports.executar({});assert.equal(resultado.pronto,false);assert.equal(resultado.checks.bucket,false);
    await pool.query('UPDATE storage.buckets SET public=false');
  });
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
  await t.test('limite é uma capa e oito imagens atuais, imposto também pelo banco',async()=>{
    for(let posicao=0;posicao<=8;posicao++)await repo.remover(u,13,posicao);
    const processar=async()=>({dados:Buffer.alloc(20),mime:'image/webp',tamanho:20,largura:32,altura:24});
    const servico=criarServicoImagensEvento({repositorio:repo,storage:{enviar:async()=>{}},processar});
    for(let posicao=0;posicao<=8;posicao++)await servico.substituir(u,13,posicao,Buffer.alloc(1));
    assert.equal((await repo.listar(u,13)).length,9);
    await assert.rejects(pool.query("UPDATE eventos_imagens SET posicao=9 WHERE estado='atual' AND posicao=8"),{code:'23514'});
    await assert.rejects(servico.substituir(u,13,9,Buffer.alloc(1)),{status:400});
  });
  await t.test('terminais bloqueiam mutações; inscritos e proponentes mantêm leitura histórica',async()=>{
    await pool.query("UPDATE eventos SET status='Cancelado' WHERE id=13");
    await assert.rejects(repo.autorizarEdicao(u,13),{status:409});
    await assert.rejects(repo.reservar(u,13,5,nova()),{status:409});
    await assert.rejects(repo.remover(u,13,0),{status:409});
    await assert.rejects(repo.listar({id:9,perfil:'participante'},13),{status:404});
    await pool.query('INSERT INTO inscricoes VALUES(9,13);INSERT INTO propostas VALUES(1,21,10)');
    assert.ok((await repo.listar({id:9,perfil:'participante'},13)).length);
    assert.ok((await repo.listar({id:10,perfil:'fornecedor'},13)).length);
    await pool.query("UPDATE eventos SET status='Encerrado' WHERE id=13");
    await assert.rejects(repo.confirmar(u,13,0,op),{status:409});
    await pool.query("UPDATE eventos SET status='Ativo' WHERE id=13");
  });
  await t.test('conta encerrando é recusada na mesma transação; permissões preservam diário',async()=>{
    await pool.query("INSERT INTO contas_teste_imagens VALUES(7,'encerrando')");
    await assert.rejects(repo.reservar(u,13,5,nova()),{status:403});
    await pool.query('DELETE FROM contas_teste_imagens');
    const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE service_role');await assert.rejects(c.query('DELETE FROM eventos_imagens WHERE false'),{code:'42501'});}finally{await c.query('ROLLBACK');c.release();}
    for(const role of ['anon','authenticated']){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);await assert.rejects(c.query('SELECT * FROM eventos_imagens'),{code:'42501'});}finally{await c.query('ROLLBACK');c.release();}}
  });
  await t.test('exclusão do evento preserva diário e caminho para futura limpeza',async()=>{
    await pool.query('DELETE FROM propostas');
    await pool.query('DELETE FROM eventos WHERE id=13');
    const r=await pool.query('SELECT evento_id,evento_origem FROM eventos_imagens');
    assert.ok(r.rows.length>0);assert.ok(r.rows.every(r=>r.evento_id===null&&r.evento_origem===13));
    await assert.rejects(repo.listar({id:11,perfil:'admin'},13),{status:404});
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM usuarios')).rows[0].n,5);
  });
  await t.test('órfãos são agendados sem remoção precoce; lease impede confirmação e worker antigo',async()=>{
    assert.equal(await repo.reivindicarLimpeza(),null);
    const q=await pool.query("SELECT count(*)::integer AS n FROM eventos_imagens WHERE estado='limpeza' AND limpeza_apos>now()+interval '23 hours'");
    assert.ok(q.rows[0].n>0);
    await pool.query("UPDATE eventos_imagens SET limpeza_apos=now()-interval '1 second' WHERE estado='limpeza'");
    const tarefa=await repo.reivindicarLimpeza();assert.equal(tarefa.estado,'limpando');assert.equal(tarefa.evento_id,null);
    assert.ok(tarefa.lease);await assert.rejects(repo.concluirLimpeza(tarefa.operacao,'2000-01-01T00:00:00Z'));
    await repo.concluirLimpeza(tarefa.operacao,tarefa.lease);
    const r=(await pool.query('SELECT * FROM eventos_imagens WHERE operacao=$1',[tarefa.operacao])).rows[0];
    assert.equal(r.estado,'removido');assert.equal(r.lease_ate,null);assert.ok(r.limpeza_apos>new Date(Date.now()+23*3600000));
  });
  await t.test('reaplicação recusa tabela existente e faz rollback sem alterar o diário',async()=>{
    const antes=(await pool.query('SELECT count(*)::integer AS n FROM eventos_imagens')).rows[0].n;
    const c=await pool.connect();try{await assert.rejects(c.query(fs.readFileSync(path.join(__dirname,'../../Banco de dados/eventos_imagens.preparacao.sql'),'utf8')),{code:'42P07'});}finally{await c.query('ROLLBACK');c.release();}
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM eventos_imagens')).rows[0].n,antes);
  });
});
