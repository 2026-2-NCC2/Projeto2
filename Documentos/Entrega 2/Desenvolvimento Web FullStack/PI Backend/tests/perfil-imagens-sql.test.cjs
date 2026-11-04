"use strict";
// Opt-in: PostgreSQL 17 descartável, sem rede, portas publicadas ou .env.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const migracao = readFileSync(path.join(__dirname, '../../Banco de dados/perfil_imagens.incremental.sql'), 'utf8');
const preflight = readFileSync(path.join(__dirname, '../../Banco de dados/perfil_imagens.preflight.sql'), 'utf8');
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const c = '00000000-0000-4000-8000-000000000003';
const d = '00000000-0000-4000-8000-000000000004';
function objeto(op, estado = 'reservado', usuario = 7, tipo = 'foto', tamanho = 1, largura = 32) {
  return `INSERT INTO public.perfil_imagens_objetos
    (operacao,usuario_id,tipo,bucket,caminho,mime,tamanho,largura,altura,estado,limpeza_apos,lease_ate)
    VALUES ('${op}',${usuario},'${tipo}','perfil-${tipo === 'foto' ? 'fotos' : 'capas'}',
      '${usuario}/${op}.webp','image/webp',${tamanho},${largura},24,'${estado}',
      ${['limpeza', 'limpando'].includes(estado) ? 'now()' : 'NULL'},${estado === 'limpando' ? 'now()' : 'NULL'});`;
}
test('SQL de imagens em PostgreSQL local isolado', { skip: process.env.TROCATICKET_SQL_ISOLADO !== '1', timeout: 60000 }, async t => {
  const nome = 'trocaticket-imagens-sql-' + randomUUID();
  execFileSync('docker', ['run', '--detach', '--rm', '--pull=never', '--network', 'none', '--name', nome,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=fixture_admin', 'postgres:17'], { stdio: 'pipe' });
  t.after(() => execFileSync('docker', ['stop', '--time', '1', nome], { stdio: 'pipe' }));
  for (let i = 0; ; i++) {
    try { execFileSync('docker', ['exec', nome, 'pg_isready', '-h', '127.0.0.1', '-U', 'fixture_admin'], { stdio: 'pipe' }); break; }
    catch (erro) { if (i > 60) throw erro; await new Promise(r => setTimeout(r, 200)); }
  }
  // O usuário de bootstrap não pode perder SUPERUSER. Criar postgres separado
  // permite reproduzir o papel restrito do SQL Editor sem essa limitação.
  execFileSync('docker', ['exec', nome, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'fixture_admin', '-d', 'postgres',
    '-c', 'CREATE ROLE postgres LOGIN SUPERUSER;'], { stdio: 'pipe' });
  const args = db => ['exec', '-i', nome, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db];
  const sql = (s, db = 'postgres', user = 'postgres') => {
    const comando = args(db); comando[comando.indexOf('-U') + 1] = user;
    return execFileSync('docker', comando, { input: s, encoding: 'utf8', stdio: 'pipe' }).trim();
  };
  const rejeita = (s, padrao, db) => assert.throws(() => sql(s, db), e => padrao.test(String(e.stderr)));
  sql('CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE terceiro; CREATE ROLE supabase_admin LOGIN SUPERUSER;');
  const setup = db => {
    sql(`CREATE DATABASE ${db}`);
    sql(`CREATE TABLE public.usuarios(id integer PRIMARY KEY, perfil text NOT NULL);
      INSERT INTO public.usuarios VALUES (7,'organizador'),(8,'fornecedor');
      CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`, db);
  };
  setup('base');
  await t.test('migração, preflight, RLS e dados preexistentes', () => {
    sql(migracao, 'base'); sql(preflight, 'base');
    assert.equal(sql('SELECT count(*) FROM usuarios', 'base'), '2');
    assert.equal(sql("SELECT count(*) FROM pg_class WHERE relname IN ('perfil_imagens','perfil_imagens_objetos') AND relrowsecurity AND relforcerowsecurity", 'base'), '2');
    assert.equal(sql("SELECT has_table_privilege('anon','perfil_imagens','SELECT,TRUNCATE') OR has_table_privilege('authenticated','perfil_imagens_objetos','INSERT,TRIGGER')", 'base'), 'f');
  });
  await t.test('service_role opera sob FORCE RLS; anon/authenticated negados', () => {
    sql(`BEGIN; SET LOCAL ROLE service_role; ${objeto(a, 'atual')}
      INSERT INTO perfil_imagens(usuario_id,tipo,objeto_id) VALUES (7,'foto','${a}'); COMMIT;`, 'base');
    for (const papel of ['anon', 'authenticated']) rejeita(`SET ROLE ${papel}; SELECT * FROM perfil_imagens`, /permission denied/, 'base');
  });
  await t.test('reserva convive com atual; duplicatas de ambos são recusadas', () => {
    sql(objeto(b), 'base');
    rejeita(objeto(c), /duplicate key/, 'base'); rejeita(objeto(c, 'atual'), /duplicate key/, 'base');
  });
  await t.test('FK rejeita slot reservado, estrangeiro e alteração do estado sem troca', () => {
    rejeita(`BEGIN; UPDATE perfil_imagens SET objeto_id='${b}'; COMMIT;`, /foreign key/, 'base');
    rejeita(`BEGIN; INSERT INTO perfil_imagens VALUES (8,'foto','${a}',DEFAULT,DEFAULT); COMMIT;`, /foreign key/, 'base');
    rejeita(`BEGIN; UPDATE perfil_imagens_objetos SET estado='limpeza',limpeza_apos=now() WHERE operacao='${a}'; COMMIT;`, /foreign key/, 'base');
    assert.equal(sql(`SELECT estado FROM perfil_imagens_objetos WHERE operacao='${a}'`, 'base'), 'atual');
  });
  await t.test('substituição demove antigo, promove novo, troca slot e confirma no commit', () => {
    sql(`BEGIN; SELECT id FROM usuarios WHERE id=7 FOR UPDATE;
      UPDATE perfil_imagens_objetos SET estado='limpeza',limpeza_apos=now() WHERE operacao='${a}';
      UPDATE perfil_imagens_objetos SET estado='atual' WHERE operacao='${b}';
      UPDATE perfil_imagens SET objeto_id='${b}' WHERE usuario_id=7 AND tipo='foto'; COMMIT;`, 'base');
    assert.equal(sql('SELECT objeto_id FROM perfil_imagens', 'base'), b);
  });
  await t.test('estados de limpeza/removido não podem ser referenciados', () => {
    for (const estado of ['limpeza', 'limpando', 'removido']) {
      sql(`UPDATE perfil_imagens_objetos SET estado='${estado}',limpeza_apos=now(),lease_ate=now() WHERE operacao='${a}'`, 'base');
      rejeita(`BEGIN; UPDATE perfil_imagens SET objeto_id='${a}'; COMMIT;`, /foreign key/, 'base');
    }
  });
  await t.test('UUID, bytes, dimensões e prazos obrigatórios são validados', () => {
    rejeita(objeto('00000000-0000-1000-8000-000000000003', 'reservado', 8), /check constraint/, 'base');
    rejeita(objeto(c, 'reservado', 8, 'foto', 5242881), /check constraint/, 'base');
    rejeita(objeto(c, 'reservado', 8, 'foto', 1, 513), /check constraint/, 'base');
    rejeita(objeto(c, 'reservado', 8, 'capa', 10485761), /check constraint/, 'base');
    rejeita(objeto(c, 'reservado', 8, 'capa', 1, 1921), /check constraint/, 'base');
    rejeita(objeto(c, 'limpando', 8) + `UPDATE perfil_imagens_objetos SET lease_ate=NULL WHERE operacao='${c}'`, /check constraint/, 'base');
    sql(`DELETE FROM perfil_imagens_objetos WHERE operacao='${c}';`, 'base');
    sql('BEGIN;' + objeto(c, 'reservado', 8, 'foto', 5242880, 512) + 'ROLLBACK;', 'base');
    sql('BEGIN;' + objeto(c, 'reservado', 8, 'capa', 10485760, 1920) + 'ROLLBACK;', 'base');
  });
  await t.test('RESTRICT preserva usuário e diário, mesmo para objetos removidos', () => {
    rejeita('DELETE FROM usuarios WHERE id=7', /foreign key/, 'base');
    sql(objeto(c, 'removido', 8), 'base');
    rejeita('DELETE FROM usuarios WHERE id=8', /foreign key/, 'base');
    assert.equal(sql('SELECT count(*) FROM usuarios', 'base'), '2');
  });
  await t.test('duas reservas concorrentes não são admitidas', async () => {
    sql(`DELETE FROM perfil_imagens_objetos WHERE operacao='${c}'`, 'base');
    const primeira = spawn('docker', args('base'), { stdio: ['pipe', 'pipe', 'pipe'] });
    let saida = '', erros = '';
    primeira.stderr.on('data', b => { erros += b });
    const terminou = new Promise(resolve => primeira.on('close', resolve));
    const reservado = new Promise(resolve => primeira.stdout.on('data', b => { saida += b; if (saida.includes('reservado')) resolve(); }));
    primeira.stdin.write(`BEGIN; ${objeto(c, 'reservado', 8)} SELECT 'reservado';\n`);
    await reservado;
    rejeita(`SET lock_timeout='200ms'; ${objeto(d, 'reservado', 8)}`, /lock timeout/, 'base');
    primeira.stdin.end('COMMIT;\n'); assert.equal(await terminou, 0, erros);
    rejeita(objeto(d, 'reservado', 8), /duplicate key/, 'base');
  });
  await t.test('reaplicação falha sem apagar estruturas/dados', () => {
    rejeita(migracao, /já existem/, 'base');
    assert.equal(sql('SELECT count(*) FROM usuarios', 'base'), '2');
  });
  await t.test('default grant inesperado provoca rollback completo', () => {
    setup('defaults'); sql('ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO terceiro', 'defaults');
    rejeita(migracao, /Grant inesperado/, 'defaults');
    assert.equal(sql("SELECT to_regclass('public.perfil_imagens') IS NULL AND to_regclass('public.perfil_imagens_objetos') IS NULL", 'defaults'), 't');
    assert.equal(sql('SELECT count(*) FROM usuarios', 'defaults'), '2');
  });
  await t.test('grant herdado por anon provoca rollback completo', () => {
    setup('heranca'); sql('GRANT service_role TO anon');
    rejeita(migracao, /Privilégio efetivo inesperado/, 'heranca');
    sql('REVOKE service_role FROM anon');
    assert.equal(sql("SELECT to_regclass('public.perfil_imagens') IS NULL", 'heranca'), 't');
  });
  await t.test('service_role sem BYPASSRLS é recusado sem enfraquecer RLS', () => {
    setup('sem_bypass'); sql('ALTER ROLE service_role NOBYPASSRLS');
    rejeita(migracao, /sem BYPASSRLS/, 'sem_bypass');
    sql('ALTER ROLE service_role BYPASSRLS');
    assert.equal(sql("SELECT to_regclass('public.perfil_imagens') IS NULL", 'sem_bypass'), 't');
  });
  await t.test('defaults amplos de postgres/supabase_admin, grants administrativos e executor postgres sem SUPERUSER', () => {
    setup('supabase_defaults');
    for (const dono of ['postgres', 'supabase_admin']) {
      sql(`ALTER DEFAULT PRIVILEGES FOR ROLE ${dono} GRANT ALL ON TABLES TO anon, authenticated, service_role WITH GRANT OPTION;
        ALTER DEFAULT PRIVILEGES FOR ROLE ${dono} IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role WITH GRANT OPTION;`, 'supabase_defaults');
    }
    sql('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO supabase_admin', 'supabase_defaults');
    const defaults = sql('SELECT defaclrole,defaclnamespace,defaclacl FROM pg_default_acl ORDER BY oid', 'supabase_defaults');
    // Simula o SQL Editor hospedado: postgres é dono, mas não superusuário.
    sql('ALTER ROLE postgres NOSUPERUSER', 'postgres', 'supabase_admin');
    try {
      sql(migracao, 'supabase_defaults');
      assert.equal(sql("SELECT rolsuper FROM pg_roles WHERE rolname=current_user", 'supabase_defaults'), 'f');
      assert.equal(sql('SELECT defaclrole,defaclnamespace,defaclacl FROM pg_default_acl ORDER BY oid', 'supabase_defaults'), defaults);
      for (const tabela of ['perfil_imagens', 'perfil_imagens_objetos']) {
        for (const papel of ['anon', 'authenticated']) assert.equal(sql(`SELECT has_table_privilege('${papel}','${tabela}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')`, 'supabase_defaults'), 'f');
        assert.equal(sql(`SELECT string_agg(a.privilege_type,',' ORDER BY a.privilege_type)
          FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
          WHERE c.oid='${tabela}'::regclass AND a.grantee='service_role'::regrole`, 'supabase_defaults'), 'DELETE,INSERT,SELECT,UPDATE');
        assert.equal(sql(`SELECT has_table_privilege('service_role','${tabela}','TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION')`, 'supabase_defaults'), 'f');
      }
      assert.equal(sql('SELECT count(*) FROM usuarios', 'supabase_defaults'), '2');
    } finally { sql('ALTER ROLE postgres SUPERUSER', 'postgres', 'supabase_admin'); }
  });
  // Injeta uma permissão APÓS o REVOKE/GRANT para exercitar o gate final.
  for (const [i, grant] of [
    'GRANT TRUNCATE ON perfil_imagens TO service_role;',
    'GRANT REFERENCES ON perfil_imagens TO service_role;',
    'GRANT TRIGGER ON perfil_imagens_objetos TO service_role;',
    'GRANT MAINTAIN ON perfil_imagens_objetos TO service_role;',
    'GRANT SELECT ON perfil_imagens TO service_role WITH GRANT OPTION;',
    'GRANT INSERT ON perfil_imagens TO service_role WITH GRANT OPTION;',
    'GRANT UPDATE ON perfil_imagens TO service_role WITH GRANT OPTION;',
    'GRANT DELETE ON perfil_imagens TO service_role WITH GRANT OPTION;',
  ].entries()) await t.test(`service_role extra/grant option ${i + 1} causa rollback`, () => {
    const db = `extra_${i}`; setup(db);
    rejeita(migracao.replace('-- REVOKE direto', grant + '\n-- REVOKE direto'), /service_role com privilégio extra/, db);
    assert.equal(sql("SELECT to_regclass('perfil_imagens') IS NULL AND to_regclass('perfil_imagens_objetos') IS NULL", db), 't');
    assert.equal(sql('SELECT count(*) FROM usuarios', db), '2');
  });
  await t.test('MAINTAIN herdado de pg_maintain por service_role causa rollback', () => {
    setup('maintain_service'); sql('GRANT pg_maintain TO service_role');
    try { rejeita(migracao, /service_role com privilégio extra/, 'maintain_service'); }
    finally { sql('REVOKE pg_maintain FROM service_role'); }
    assert.equal(sql("SELECT to_regclass('perfil_imagens') IS NULL", 'maintain_service'), 't');
  });
  for (const papel of ['anon', 'authenticated']) await t.test(`MAINTAIN herdado por ${papel} causa rollback`, () => {
    const db = `maintain_${papel}`; setup(db); sql(`GRANT pg_maintain TO ${papel}`);
    try { rejeita(migracao, /Privilégio efetivo inesperado/, db); }
    finally { sql(`REVOKE pg_maintain FROM ${papel}`); }
    assert.equal(sql("SELECT to_regclass('perfil_imagens') IS NULL AND to_regclass('perfil_imagens_objetos') IS NULL", db), 't');
    assert.equal(sql('SELECT count(*) FROM usuarios', db), '2');
  });
  await t.test('nome supabase_admin sem SUPERUSER não autoriza grant de terceiro', () => {
    setup('admin_falso');
    sql('ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO supabase_admin', 'admin_falso');
    sql('ALTER ROLE supabase_admin NOSUPERUSER');
    try { rejeita(migracao, /Grant inesperado/, 'admin_falso'); }
    finally { sql('ALTER ROLE supabase_admin SUPERUSER'); }
    assert.equal(sql("SELECT to_regclass('perfil_imagens') IS NULL", 'admin_falso'), 't');
  });
});
