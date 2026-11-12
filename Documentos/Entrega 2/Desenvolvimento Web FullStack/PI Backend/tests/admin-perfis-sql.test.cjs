'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const sql = fs.readFileSync(path.join(__dirname, '../../Banco de dados/admin_perfis.incremental.sql'), 'utf8');
test('SQL de perfis preserva modelo único e históricos; não adiciona privilégios nas tabelas existentes', () => {
  assert.match(sql, /SET perfil=p_novo::public\.usuarios_perfil_enum/);
  assert.match(sql, /SHARE ROW EXCLUSIVE/); assert.match(sql, /AP412/); assert.match(sql, /AP413/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /DELETE FROM|UPDATE public\.(eventos|inscricoes|propostas)|ALTER TABLE public\.usuarios/);
});
test('PostgreSQL descartável: concessão, remoção, concorrência e auditoria de perfis', {
  skip: process.env.TROCATICKET_ADMIN_PERFIS_SQL_LOCAL !== '1', timeout: 180000,
}, async t => {
  const { spawnSync } = require('node:child_process'), { Pool, Client } = require('pg');
  const run = args => { const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 10000 }); if (r.status !== 0) throw Error('Docker local indisponível.'); return r.stdout.trim(); };
  const ctx = run(['context', 'show']); const endpoint = process.env.DOCKER_HOST || run(['context', 'inspect', ctx, '--format', '{{.Endpoints.docker.Host}}']);
  assert.ok(endpoint.startsWith('npipe:////./pipe/') || /^unix:\/\/\//.test(endpoint));
  const docker = args => run(['--host', endpoint, ...args]), nome = 'tt-admin-perfis-' + randomUUID(), senha = randomUUID();
  let pool;
  t.after(async () => { try { await pool?.end(); } finally { const list = docker(['ps', '-a', '--filter', 'name=^/' + nome + '$', '--format', '{{.Names}}']); if (list) { assert.equal(list, nome); docker(['stop', '--time', '1', nome]); } } });
  docker(['run', '--detach', '--rm', '--pull=never', '--name', nome, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=' + senha, 'postgres:17']);
  const binding = docker(['port', nome, '5432/tcp']); assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const config = { host: '127.0.0.1', port: Number(binding.split(':')[1]), user: 'postgres', password: senha, database: 'postgres', ssl: false, connectionTimeoutMillis: 1000 };
  const end = Date.now() + 30000; let ready = false;
  while (Date.now() < end) { const c = new Client(config); c.on('error', () => {}); try { await c.connect(); await c.query('SELECT 1'); ready = true; break; } catch {} finally { await c.end(); } await new Promise(r => setTimeout(r, 100)); }
  assert.ok(ready); pool = new Pool({ ...config, max: 5, query_timeout: 10000 });
  await pool.query(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated;
   CREATE TYPE public.usuarios_perfil_enum AS ENUM('participante','organizador','fornecedor','admin');
   CREATE TABLE usuarios(id integer PRIMARY KEY,perfil usuarios_perfil_enum NOT NULL,nome text NOT NULL DEFAULT 'sintético');
   INSERT INTO usuarios(id,perfil) VALUES(1,'participante'),(2,'organizador'),(3,'fornecedor'),(10,'admin'),(11,'admin');
   CREATE TABLE contas_teste_imagens(usuario_id integer PRIMARY KEY,estado text NOT NULL);
   CREATE TABLE eventos(id integer PRIMARY KEY,usuario_id integer REFERENCES usuarios(id)); INSERT INTO eventos VALUES(13,2);
   CREATE TABLE inscricoes(id integer PRIMARY KEY,usuario_id integer REFERENCES usuarios(id)); INSERT INTO inscricoes VALUES(1,1);
   CREATE TABLE propostas(id integer PRIMARY KEY,fornecedor_id integer REFERENCES usuarios(id)); INSERT INTO propostas VALUES(1,3);
   GRANT USAGE ON SCHEMA public TO service_role;
   GRANT SELECT,UPDATE ON usuarios,contas_teste_imagens TO service_role;`);
  await pool.query(sql);
  const motivo = 'Ajuste exclusivamente sintético';
  async function alterar(admin, id, anterior, novo, chave = randomUUID(), reason = motivo, role = 'service_role') {
    assert.ok(['service_role', 'anon', 'authenticated'].includes(role)); const c = await pool.connect();
    try { await c.query('BEGIN ISOLATION LEVEL READ COMMITTED'); await c.query('SET LOCAL ROLE ' + role);
      const r = await c.query('SELECT public.alterar_perfil_admin_v1($1,$2,$3,$4,$5,$6) AS usuario', [admin, id, anterior, novo, reason, chave]);
      await c.query('COMMIT'); return r.rows[0].usuario;
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  const count = async () => Number((await pool.query('SELECT count(*) FROM admin_perfis_auditoria')).rows[0].count);
  await t.test('quatro perfis, histórico intacto, auditoria completa e replay', async () => {
    let old = 'participante';
    for (const novo of ['organizador', 'fornecedor', 'admin', 'participante']) {
      const key = randomUUID(), before = await count();
      const r = await alterar(10, 1, old, novo, key); assert.equal(r.perfil, novo);
      assert.deepEqual(await alterar(10, 1, old, novo, key), r); assert.equal(await count(), before + 1);
      await assert.rejects(alterar(10, 1, old, novo, key, 'Outro motivo completamente válido'), { code: 'AP409' }); old = novo;
    }
    const a = (await pool.query('SELECT * FROM admin_perfis_auditoria LIMIT 1')).rows[0];
    assert.equal(a.admin_id, 10); assert.equal(a.usuario_id, 1); assert.equal(a.motivo, motivo); assert.ok(a.criado_em);
    for (const tabela of ['eventos', 'inscricoes', 'propostas']) assert.equal(Number((await pool.query('SELECT count(*) FROM ' + tabela)).rows[0].count), 1);
  });
  await t.test('perfis comuns, argumentos inválidos e conta em encerramento', async () => {
    for (const id of [1, 2, 3, 999]) await assert.rejects(alterar(id, 1, 'participante', 'admin'), { code: 'AP403' });
    await assert.rejects(alterar(10, 1, 'participante', 'root'), { code: 'AP400' });
    await assert.rejects(alterar(10, 1, 'participante', 'admin', randomUUID(), 'curto'), { code: 'AP400' });
    await pool.query("INSERT INTO contas_teste_imagens VALUES(1,'encerrando')");
    await assert.rejects(alterar(10, 1, 'participante', 'admin'), { code: 'AP409' }); await pool.query('DELETE FROM contas_teste_imagens');
  });
  await t.test('próprio acesso e último administrador autorizado são protegidos', async () => {
    await assert.rejects(alterar(10, 10, 'admin', 'participante'), { code: 'AP413' });
    await pool.query("INSERT INTO contas_teste_imagens VALUES(11,'encerrando')");
    await assert.rejects(alterar(10, 10, 'admin', 'participante'), { code: 'AP412' });
    await pool.query('DELETE FROM contas_teste_imagens');
  });
  await t.test('demissões cruzadas: somente uma confirma; ator revogado é recusado', async () => {
    const r = await Promise.allSettled([alterar(10, 11, 'admin', 'participante'), alterar(11, 10, 'admin', 'participante')]);
    assert.equal(r.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal(r.find(x => x.status === 'rejected').reason.code, 'AP403');
    assert.equal(Number((await pool.query("SELECT count(*) FROM usuarios WHERE perfil='admin'")).rows[0].count), 1);
    await pool.query("UPDATE usuarios SET perfil='admin' WHERE id IN (10,11)");
  });
  await t.test('mesma chave concorrente grava uma auditoria; perfil desatualizado conflita', async () => {
    const key = randomUUID(), before = await count();
    const r = await Promise.all([alterar(10, 1, 'participante', 'organizador', key), alterar(10, 1, 'participante', 'organizador', key)]);
    assert.deepEqual(r[0], r[1]); assert.equal(await count(), before + 1);
    await assert.rejects(alterar(10, 1, 'participante', 'fornecedor'), { code: 'AP409' });
  });
  await t.test('falha na auditoria reverte perfil; nenhum sucesso fictício', async () => {
    await pool.query(`CREATE FUNCTION falhar_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='TA001',MESSAGE='falha sintética'; END $$;
     CREATE TRIGGER falha BEFORE INSERT ON admin_perfis_auditoria FOR EACH ROW EXECUTE FUNCTION falhar_auditoria();`);
    const before = await count(); await assert.rejects(alterar(10, 1, 'organizador', 'fornecedor'), { code: 'TA001' });
    assert.equal((await pool.query('SELECT perfil FROM usuarios WHERE id=1')).rows[0].perfil, 'organizador'); assert.equal(await count(), before);
    await pool.query('DROP TRIGGER falha ON admin_perfis_auditoria');
  });
  await t.test('RLS e privilégios mínimos; RPC inacessível a anon/authenticated', async () => {
    for (const role of ['anon', 'authenticated']) await assert.rejects(alterar(10, 1, 'organizador', 'fornecedor', randomUUID(), motivo, role), { code: '42501' });
    const r = (await pool.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.admin_perfis_auditoria'::regclass")).rows[0];
    assert.ok(r.relrowsecurity && r.relforcerowsecurity);
    for (const p of ['UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN']) assert.equal((await pool.query("SELECT has_table_privilege('service_role','admin_perfis_auditoria',$1) AS sim", [p])).rows[0].sim, false);
  });
});
