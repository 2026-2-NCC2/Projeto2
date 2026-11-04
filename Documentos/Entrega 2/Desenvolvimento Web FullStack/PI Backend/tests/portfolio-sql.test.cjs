'use strict';
// Opt-in, PostgreSQL descartável sem rede, portas ou leitura de .env.
const test=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {readFileSync}=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const ddl=readFileSync(path.join(__dirname,'../../Banco de dados/portfolio_fornecedor.preparacao.sql'),'utf8');
const preflight=readFileSync(path.join(__dirname,'../../Banco de dados/portfolio_fornecedor.preflight.sql'),'utf8');
test('portfólio SQL em PostgreSQL 17 isolado',{skip:process.env.TROCATICKET_SQL_ISOLADO!=='1',timeout:60000},async t=>{
  const nome='trocaticket-portfolio-'+randomUUID();
  execFileSync('docker',['run','--detach','--rm','--pull=never','--network','none','--name',nome,
    '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=fixture_admin','postgres:17'],{stdio:'pipe'});
  t.after(()=>execFileSync('docker',['stop','--time','1',nome],{stdio:'pipe'}));
  for(let i=0;;i++){
    try{execFileSync('docker',['exec',nome,'pg_isready','-h','127.0.0.1','-U','fixture_admin'],{stdio:'pipe'});break;}
    catch(e){if(i>60)throw e;await new Promise(r=>setTimeout(r,200));}
  }
  const sql=(s,db='postgres')=>execFileSync('docker',['exec','-i',nome,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','fixture_admin','-d',db],{input:s,encoding:'utf8',stdio:'pipe'}).trim();
  sql('CREATE ROLE postgres LOGIN CREATEROLE; CREATE ROLE supabase_admin SUPERUSER; CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE terceiro;');
  let seq=0;
  function base(tipo='integer'){
    const db='cenario'+(++seq);sql('CREATE DATABASE '+db);
    sql(`GRANT CREATE ON SCHEMA public TO postgres; SET ROLE postgres;
      CREATE TABLE public.usuarios(id ${tipo} PRIMARY KEY,perfil text);
      INSERT INTO usuarios VALUES(7,'fornecedor');
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role,supabase_admin;`,db);
    return db;
  }
  function rejeita(db,conteudo,padrao){
    assert.throws(()=>sql('SET ROLE postgres;'+conteudo,db),e=>padrao.test(String(e.stderr)));
    assert.equal(sql("SELECT to_regclass('public.portfolio_itens') IS NULL",db),'t');
    assert.equal(sql('SELECT count(*) FROM usuarios WHERE id=7',db),'1');
  }
  await t.test('defaults amplos, executor postgres, preflight e CRUD mínimo',()=>{
    const db=base();sql('SET ROLE postgres;'+preflight,db);sql('SET ROLE postgres;'+ddl,db);
    assert.equal(sql("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='portfolio_itens'::regclass",db),'t');
    for(const r of ['anon','authenticated'])assert.equal(sql(`SELECT has_table_privilege('${r}','portfolio_itens','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`,db),'f');
    for(const p of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal(sql(`SELECT has_table_privilege('service_role','portfolio_itens','${p}')`,db),'t');
    assert.equal(sql("SELECT has_table_privilege('service_role','portfolio_itens','TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')",db),'f');
    assert.equal(sql('SELECT count(*) FROM usuarios',db),'1');
    assert.equal(sql('SELECT count(*) FROM portfolio_itens',db),'0');
  });
  await t.test('tipo bigint é recusado antes de criar tabela',()=>rejeita(base('bigint'),ddl,/integer NOT NULL/));
  await t.test('UNIQUE simples válida permite FK sem exigir PRIMARY KEY',()=>{
    const db=base();sql('SET ROLE postgres; ALTER TABLE usuarios DROP CONSTRAINT usuarios_pkey; ALTER TABLE usuarios ADD UNIQUE(id);',db);
    sql('SET ROLE postgres;'+ddl,db);
    assert.equal(sql("SELECT count(*) FROM pg_constraint WHERE conrelid='portfolio_itens'::regclass AND contype='f'",db),'1');
  });
  await t.test('ausência de chave, chave composta e UNIQUE diferível são recusadas',()=>{
    for(const definicao of ['', 'ALTER TABLE usuarios ADD UNIQUE(id,perfil);', 'ALTER TABLE usuarios ADD UNIQUE(id) DEFERRABLE;']){
      const db=base();sql('SET ROLE postgres; ALTER TABLE usuarios DROP CONSTRAINT usuarios_pkey;'+definicao,db);
      rejeita(db,ddl,/PRIMARY KEY ou UNIQUE/);
    }
  });
  await t.test('BYPASSRLS em anon ou authenticated provoca rollback',()=>{
    for(const papel of ['anon','authenticated']){
      const db=base();sql(`ALTER ROLE ${papel} BYPASSRLS;`);
      try{rejeita(db,ddl,/não podem possuir BYPASSRLS/);}finally{sql(`ALTER ROLE ${papel} NOBYPASSRLS;`);}
    }
  });
  await t.test('cada privilégio CRUD ausente provoca rollback',()=>{
    for(const privilegio of ['SELECT','INSERT','UPDATE','DELETE']){
      const db=base();
      const alterado=ddl.replace(/DO \$\$\r?\nDECLARE alvo/,()=>`REVOKE ${privilegio} ON portfolio_itens FROM service_role;\nDO $$\nDECLARE alvo`);
      assert.notEqual(alterado,ddl);rejeita(db,alterado,/sem CRUD efetivo completo/);
    }
  });
  await t.test('grant padrão para terceiro provoca rollback completo',()=>{
    const db=base();sql('SET ROLE postgres; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO terceiro;',db);
    rejeita(db,ddl,/Privilégios inesperados/);
  });
  await t.test('privilégio herdado por anon é recusado',()=>{
    const db=base();sql('GRANT terceiro TO anon; SET ROLE postgres; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO terceiro;',db);
    rejeita(db,ddl,/Privilégios inesperados/);sql('REVOKE terceiro FROM anon;');
  });
  await t.test('MAINTAIN herdado pelo service_role provoca rollback completo',()=>{
    const db=base();sql('GRANT terceiro TO service_role; SET ROLE postgres; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT MAINTAIN ON TABLES TO terceiro;',db);
    rejeita(db,ddl,/Privilégios inesperados/);sql('REVOKE terceiro FROM service_role;');
  });
  await t.test('grant option indevida provoca rollback completo',()=>{
    const db=base();
    const adulterado=ddl.replace(/DO \$\$\r?\nDECLARE alvo/, ()=>'GRANT SELECT ON portfolio_itens TO service_role WITH GRANT OPTION;\nDO $$\nDECLARE alvo');
    assert.notEqual(adulterado,ddl);rejeita(db,adulterado,/Privilégios inesperados/);
  });
  await t.test('tabela preexistente não é substituída',()=>{
    const db=base();sql('SET ROLE postgres; CREATE TABLE portfolio_itens(id integer); INSERT INTO portfolio_itens VALUES(42);',db);
    assert.throws(()=>sql('SET ROLE postgres;'+ddl,db),e=>/já existe/.test(String(e.stderr)));
    assert.equal(sql('SELECT id FROM portfolio_itens',db),'42');
  });
});
