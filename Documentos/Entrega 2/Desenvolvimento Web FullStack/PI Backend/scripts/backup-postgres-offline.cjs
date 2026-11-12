'use strict';
// V2 opt-in. Importar este módulo não lê .env, cria arquivos ou abre conexões.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { inventarioSql, catalogoOfflineSql } = require('./catalogo-backup.cjs');
const qi = s => '"' + s.replaceAll('"', '""') + '"';
const fail = code => Object.assign(Error('Operação de backup offline recusada.'), { code });
const canonical = x => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
async function hashFile(file) {
  const h = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
function validarDiretorio(dir) {
  assert.ok(dir && !fs.lstatSync(dir).isSymbolicLink());
  const solicitado = path.resolve(dir);
  dir = fs.realpathSync(dir);
  assert.equal(solicitado.toLowerCase(), dir.toLowerCase(), 'CAMINHO_REDIRECIONADO');
  let root = path.resolve(__dirname);
  while (!fs.existsSync(path.join(root, '.git')) && path.dirname(root) !== root) root = path.dirname(root);
  const rel = path.relative(root, dir);
  assert.ok(rel.startsWith('..' + path.sep) || path.isAbsolute(rel), 'BACKUP_FORA_GIT');
  assert.ok(!/[\r\n,]/.test(dir), 'CAMINHO_INVALIDO');
  if (process.platform === 'win32') {
    // Não interpolar o caminho em código PowerShell. Somente ACL de leitura/escrita privada.
    const check = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference="Stop"; $me=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $ok=@($me,"S-1-5-18","S-1-5-32-544"); $a=Get-Acl -LiteralPath $env:TT_BACKUP_DIR; if(!$a.AreAccessRulesProtected){exit 2}; foreach($r in $a.Access){if($r.AccessControlType -eq "Allow" -and $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin $ok){exit 3}}'],
    { windowsHide: true, stdio: 'pipe', timeout: 10000, env: { ...process.env, TT_BACKUP_DIR: dir } });
    assert.equal(check.status, 0, 'ACL_PRIVADA_NECESSARIA');
  } else assert.equal(fs.statSync(dir).mode & 0o077, 0, 'MODO_PRIVADO_NECESSARIO');
  return dir;
}
function arquivo(dir, name) {
  assert.equal(path.basename(name), name); assert.ok(!/[\\/\r\n]/.test(name));
  const f = path.join(dir, name);
  if (fs.existsSync(f)) { assert.ok(!fs.lstatSync(f).isSymbolicLink()); assert.equal(fs.realpathSync(f), f); }
  return f;
}
async function cmd(args, { input, output, timeout = 300000, onLine } = {}) {
  const p = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let expired = false, bytes = 0, pending = '', lineError; const chunks = [];
  const timer = setTimeout(() => { expired = true; p.kill(); }, timeout);
  p.stderr.resume(); // Não gravar stderr: pg_restore pode incluir valores de dados.
  p.stdin.on('error', () => {});
  const stream = output ? pipeline(p.stdout, fs.createWriteStream(output, { flags: 'wx', mode: 0o600 })) : null;
  if (!output) p.stdout.on('data', b => {
    if (onLine) {
      pending += b.toString('utf8');
      try { let i; while ((i = pending.indexOf('\n')) >= 0) { onLine(pending.slice(0, i).replace(/\r$/, '')); pending = pending.slice(i + 1); }
        if (pending.length > 1024) throw fail('LINHA_EXCESSIVA');
      } catch (e) { lineError = e; p.kill(); }
    } else { bytes += b.length; if (bytes > 64 * 1024 * 1024) p.kill(); else chunks.push(b); }
  });
  const done = new Promise((resolve, reject) => { p.once('error', () => reject(fail('SUBPROCESSO'))); p.once('close', resolve); });
  const sending = input === undefined ? (p.stdin.end(), Promise.resolve()) : pipeline(input, p.stdin);
  // Anexar handlers imediatamente, inclusive se o processo falhar antes do await.
  const results = Promise.allSettled([done, sending, ...(stream ? [stream] : [])]);
  try {
    const r = await results;
    if (lineError || expired || bytes > 64 * 1024 * 1024 || r.some(x => x.status === 'rejected') || r[0].value !== 0) throw fail('SUBPROCESSO');
    if (onLine && pending) onLine(pending);
    return Buffer.concat(chunks).toString('utf8');
  } finally { clearTimeout(timer); }
}
async function dockerLocal(run = cmd) {
  const contexto = (await run(['context', 'show'])).trim();
  const endpoint = process.env.DOCKER_HOST || (await run(['context', 'inspect', contexto, '--format', '{{.Endpoints.docker.Host}}'])).trim();
  assert.ok(endpoint.startsWith('npipe:////./pipe/') || /^unix:\/\/\/[^\r\n]+$/.test(endpoint), 'DOCKER_REMOTO_RECUSADO');
  const docker = (args, opts) => run(['--host', endpoint, ...args], opts);
  docker.endpoint = endpoint;
  return docker;
}
function poolPsqlLocal(endpoint, name) {
  assert.ok(endpoint?.startsWith('npipe:////./pipe/') || /^unix:\/\/\//.test(endpoint || ''));
  const p = spawn('docker', ['--host', endpoint, 'exec', '-i', name, 'psql', '-X', '-qAt', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let pending, buffer = '', ended = false;
  p.stderr.resume(); p.stdin.on('error', () => {});
  const done = new Promise(resolve => p.once('close', () => { ended = true; if (pending) { clearTimeout(pending.timer); pending.reject(fail('PSQL_LOCAL')); pending = null; } resolve(); }));
  p.on('error', () => { if (pending) { clearTimeout(pending.timer); pending.reject(fail('PSQL_LOCAL')); pending = null; } });
  p.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    if (buffer.length > 64 * 1024 * 1024) { p.kill(); return; }
    if (!pending) return;
    const marker = pending.marker + '\n', pos = buffer.indexOf(marker);
    if (pos < 0) return;
    const result = buffer.slice(0, pos).trim(); buffer = buffer.slice(pos + marker.length);
    const q = pending; pending = null; clearTimeout(q.timer);
    try {
      const rows = q.mode === 'json' ? JSON.parse(result) : q.mode === 'fetch'
        ? (result ? result.split(/\r?\n/).map(h => ({ h })) : [])
        : q.mode === 'version' ? [{ server_version_num: result }] : [];
      q.resolve({ rows });
    } catch { q.reject(fail('PSQL_LOCAL_RESULTADO')); }
  });
  const client = { localDocker: true, release() {}, query(sql) {
    assert.ok(!pending && !ended);
    let text = sql.trim().replace(/;$/, ''), mode = 'none';
    if (/^(SELECT|WITH)\b/i.test(text)) { mode = 'json'; text = `SELECT COALESCE(json_agg(q),'[]'::json) FROM (${text}) q`; }
    else if (/^FETCH\b/i.test(text)) mode = 'fetch';
    else if (/^SHOW server_version_num$/i.test(text)) mode = 'version';
    return new Promise((resolve, reject) => {
      const marker = 'TT_BACKUP_' + crypto.randomUUID();
      const timer = setTimeout(() => { p.kill(); reject(fail('PSQL_LOCAL_TIMEOUT')); }, 30000);
      pending = { marker, mode, resolve, reject, timer };
      p.stdin.write(text + ';\n\\echo ' + marker + '\n');
    });
  } };
  return { connect: async () => client, end: async () => { if (!ended) p.stdin.end('\\q\n'); await done; } };
}
async function clienteDescartavel(docker, args, opts) {
  assert.equal(args[0], 'run');
  const name = 'tt-backup-client-' + crypto.randomUUID();
  const esperado = args[args.indexOf('--network') + 1];
  try { return await docker(['run', '--name', name, '--label', 'tt.backup.client=' + name, ...args.slice(1)], opts); }
  finally {
    // --rm não basta quando só o cliente Docker é encerrado por timeout.
    const listed = (await docker(['ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}'])).trim();
    if (listed) {
      assert.equal(listed, name);
      const [c] = JSON.parse(await docker(['inspect', name]));
      assert.equal(c.Name, '/' + name); assert.equal(c.Config.Labels['tt.backup.client'], name);
      assert.equal(c.HostConfig.NetworkMode, esperado); assert.equal(c.HostConfig.ReadonlyRootfs, true);
      await docker(['stop', '--time', '5', name]); await docker(['rm', name]);
    }
  }
}
function validarInventario(tables) {
  assert.ok(Array.isArray(tables) && tables.length && tables.some(t => t.schema === 'public' && t.name === 'usuarios'));
  const keys = new Set();
  for (const t of tables) {
    assert.ok(typeof t.schema === 'string' && typeof t.name === 'string' && !/[\x00-\x1f]/.test(t.schema + t.name));
    assert.ok(['r', 'p', 'm'].includes(t.kind), 'FOREIGN_TABLE_SEM_COBERTURA');
    assert.ok(!keys.has(t.schema + '\0' + t.name)); keys.add(t.schema + '\0' + t.name);
  }
}
async function integridade(query, t) {
  // Somente hashes ASCII saem do servidor; sem conversão JS de numeric/bigint.
  const relation = (t.kind === 'r' ? 'ONLY ' : '') + qi(t.schema) + '.' + qi(t.name);
  await query(`DECLARE tt_integridade NO SCROLL CURSOR FOR SELECT h FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM ${relation} t) hashes ORDER BY h COLLATE "C"`);
  let count = 0n; const hash = crypto.createHash('sha256');
  try {
    for (;;) {
      const rows = (await query('FETCH FORWARD 1000 FROM tt_integridade')).rows;
      if (!rows.length) break;
      assert.ok(rows.length <= 1000);
      for (const r of rows) { assert.match(r.h, /^[a-f0-9]{64}$/); hash.update(r.h + '\n'); count++; }
    }
    return { count: count.toString(), hash: hash.digest('hex') };
  } finally { await query('CLOSE tt_integridade'); }
}
async function capturar(query) {
  const tables = (await query(inventarioSql)).rows; validarInventario(tables);
  const catalogo = (await query(catalogoOfflineSql)).rows[0].catalogo;
  for (const t of tables) if (t.kind !== 'p') Object.assign(t, await integridade(query, t));
  return { tables, catalogo };
}
function comparar(expected, actual) {
  // Somente o par exato de casts já validado para este CHECK no ensaio histórico.
  const normalizar = reference => {
    if (!reference.catalogo?.constraints) return reference;
    const { normalizarConstraint } = require('./backup-etapa3-validado.cjs');
    return { ...reference, catalogo: { ...reference.catalogo, constraints: reference.catalogo.constraints.map(c =>
      c.schema === 'public' ? { ...c, def: normalizarConstraint({ table: c.table, name: c.name, definition: c.def }).definition } : c) } };
  };
  // Não incluir valores/definições no AssertionError/logs.
  if (canonical(normalizar(expected)) !== canonical(normalizar(actual))) {
    const e = fail('MANIFESTO_DIVERGENTE');
    e.campos = Object.keys(expected.catalogo || {}).filter(k => canonical(normalizar(expected).catalogo[k]) !== canonical(normalizar(actual).catalogo[k]));
    if (canonical(expected.tables) !== canonical(actual.tables)) e.campos.push('tables');
    throw e;
  }
}
async function validarArtefatos(dir, m) {
  assert.equal(m.version, 2); assert.equal(m.status, 'BACKUP_COMPLETO_GERADO');
  assert.equal(m.algorithm, 'sha256-sorted-row-hashes-v1');
  assert.ok(Array.isArray(m.artifacts) && m.artifacts.length === 2);
  assert.deepEqual(m.artifacts.map(a => a.name).sort(), ['database.dump', 'roles.sql']);
  for (const a of m.artifacts) {
    const f = arquivo(dir, a.name); assert.ok(fs.statSync(f).isFile());
    assert.equal(fs.statSync(f).size, a.bytes);
    if (await hashFile(f) !== a.sha256) throw fail('ARTEFATO_ADULTERADO');
  }
  validarInventario(m.reference.tables); assert.ok(m.reference.catalogo);
}
async function backup(dir, { autorizado = false, escritasPausadas = false, origemLocal } = {}, deps = {}) {
  assert.ok(autorizado && escritasPausadas, 'EXIGE_AUTORIZACAO_E_JANELA_SEM_ESCRITAS');
  dir = (deps.validarDiretorio || validarDiretorio)(dir);
  const manifestFile = arquivo(dir, 'manifest-v2.json'); assert.ok(!fs.existsSync(manifestFile));
  const dump = arquivo(dir, 'database.dump'), roles = arquivo(dir, 'roles.sql'), pass = arquivo(dir, 'pgpass-temporario');
  for (const f of [dump, roles, pass]) assert.ok(!fs.existsSync(f));
  const docker = deps.docker || await dockerLocal();
  let env, ca, pool;
  const image = (await docker(['image', 'inspect', 'postgres:17', '--format', '{{.Id}}'])).trim(); assert.match(image, /^sha256:[a-f0-9]{64}$/);
  if (origemLocal) {
    // Origem sintética sem rede: sessão persistente por socket Unix/Docker local.
    // Este ramo nunca lê .env nem recebe configurações do Supabase.
    assert.match(origemLocal, /^tt-backup-source-[a-f0-9-]{36}$/);
    const [source] = JSON.parse(await docker(['inspect', origemLocal]));
    assert.equal(source.Name, '/' + origemLocal);
    assert.equal(source.Config.Labels['tt.backup.source'], origemLocal);
    assert.equal(source.Image, image); assert.equal(source.HostConfig.ReadonlyRootfs, true);
    assert.equal(source.HostConfig.NetworkMode, 'none');
    assert.ok(!source.HostConfig.PortBindings || !Object.keys(source.HostConfig.PortBindings).length);
    pool = poolPsqlLocal(docker.endpoint, origemLocal);
  } else {
    env = deps.env || require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
    const ref = require('../imagens/homologacao-config.cjs').PRODUCAO;
    assert.equal(env.SUPABASE_URL, `https://${ref}.supabase.co`);
    assert.equal(env.PGUSER, 'postgres.' + ref); assert.equal(env.PGPORT, '5432'); assert.equal(env.PGDATABASE, 'postgres');
    assert.match(env.PGHOST, /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/);
    assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
    ca = arquivo(dir, 'root-ca.crt'); assert.ok(fs.existsSync(ca));
    pool = (deps.criarPool || require('../db-postgres.js').criarPoolPostgres)({ ...env, PGSSLROOTCERT: ca }, { queryTimeoutMs: 30000 });
  }
  let c, ownPass = false;
  const m = { version: 2, algorithm: 'sha256-sorted-row-hashes-v1', status: 'PREPARACAO',
    exclusions: ['Storage: bytes dos arquivos', 'configuração/segredos da plataforma', 'senhas de roles'],
    consistency: 'Janela sem escritores/DDL exigida; sequences e roles não são snapshot MVCC.', artifacts: [] };
  try {
    c = await pool.connect();
    if (!origemLocal) assert.ok(c.connection.stream.authorized);
    else assert.equal(c.localDocker, true);
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await c.query("SET LOCAL search_path=pg_catalog; SET LOCAL timezone='UTC'; SET LOCAL extra_float_digits=3");
    m.serverVersion = Number((await c.query('SHOW server_version_num')).rows[0].server_version_num);
    assert.ok(m.serverVersion >= 170000 && m.serverVersion < 180000);
    const snapshot = (await c.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    assert.match(snapshot, /^[0-9A-F-]+$/);
    m.reference = await capturar(q => c.query(q));
    if (origemLocal) {
      await docker(['exec', origemLocal, 'pg_dump', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'postgres', '--format=custom', '--snapshot=' + snapshot], { output: dump });
      await docker(['exec', origemLocal, 'pg_dumpall', '-h', '/tmp', '-U', 'supabase_admin', '--roles-only', '--no-role-passwords'], { output: roles });
    } else {
    const esc = x => { assert.ok(typeof x === 'string' && !/[\r\n\0]/.test(x)); return x.replaceAll('\\', '\\\\').replaceAll(':', '\\:'); };
    fs.writeFileSync(pass, [env.PGHOST, env.PGPORT, env.PGDATABASE, env.PGUSER, env.PGPASSWORD].map(esc).join(':') + '\n', { flag: 'wx', mode: 0o600 }); ownPass = true;
    const args = ['run', '--rm', '--pull=never', '--read-only', '--network', 'bridge', '--tmpfs', '/tmp:rw,size=64m',
      '--mount', `type=bind,source=${dir},target=/backup,readonly`, '--env', 'PGHOST=' + env.PGHOST,
      '--env', 'PGPORT=5432', '--env', 'PGDATABASE=postgres', '--env', 'PGUSER=' + env.PGUSER,
      '--env', 'PGSSLMODE=verify-full', '--env', 'PGSSLROOTCERT=/backup/root-ca.crt', '--env', 'PGCONNECT_TIMEOUT=15',
      '--env', 'PGOPTIONS=-c default_transaction_read_only=on -c timezone=UTC -c search_path=pg_catalog',
      '--entrypoint', '/bin/sh', image, '-c', 'cp /backup/pgpass-temporario /tmp/pass && chmod 600 /tmp/pass && export PGPASSFILE=/tmp/pass && exec "$@"', 'backup-client'];
    await clienteDescartavel(docker, [...args, 'pg_dump', '--format=custom', '--snapshot=' + snapshot], { output: dump });
    await clienteDescartavel(docker, [...args, 'pg_dumpall', '--roles-only', '--no-role-passwords'], { output: roles });
    }
    const toc = await clienteDescartavel(docker, ['run', '--rm', '--pull=never', '--network', 'none', '--read-only', '--mount', `type=bind,source=${dump},target=/dump,readonly`, '--entrypoint', 'pg_restore', image, '--list', '/dump']);
    for (const t of m.reference.tables.filter(t => t.kind === 'r')) {
      // Falhar se pg_dump omitiu dados de tabela gerenciada/extensão. Não alegar cobertura.
      assert.ok(toc.split('\n').some(l => l.includes(` TABLE DATA ${t.schema} ${t.name} `)), 'TABELA_SEM_DADOS_NO_TOC');
    }
    for (const [name, file] of [['database.dump', dump], ['roles.sql', roles]]) m.artifacts.push({ name, bytes: fs.statSync(file).size, sha256: await hashFile(file) });
    await c.query('ROLLBACK'); c.release(); c = null;
    m.status = 'BACKUP_COMPLETO_GERADO';
    fs.writeFileSync(manifestFile, JSON.stringify(m, null, 2), { flag: 'wx', mode: 0o600 });
    return { status: m.status, tables: m.reference.tables.length };
  } finally { try { if (c) { try { await c.query('ROLLBACK'); } finally { c.release(); } } } finally { await pool.end(); if (ownPass) fs.unlinkSync(pass); } }
}
async function executarRestore({ docker, dir, m, pausar = ms => new Promise(r => setTimeout(r, ms)) }) {
  const name = 'tt-offline-' + crypto.randomUUID();
  const image = (await docker(['image', 'inspect', 'supabase/postgres:17.11.0.016', '--format', '{{.Id}}'])).trim(); assert.match(image, /^sha256:[a-f0-9]{64}$/);
  async function validar() {
    const [c] = JSON.parse(await docker(['inspect', name]));
    assert.equal(c.Name, '/' + name); assert.equal(c.Config.Labels['tt.offline'], name);
    assert.equal(c.HostConfig.NetworkMode, 'none'); assert.ok(!c.HostConfig.PortBindings || !Object.keys(c.HostConfig.PortBindings).length);
    assert.equal(c.HostConfig.ReadonlyRootfs, true); assert.equal(c.Config.User, 'postgres');
    assert.ok(c.Mounts.every(x => x.Type === 'tmpfs' || (x.Type === 'bind' && !x.RW && ['/dump', '/roles'].includes(x.Destination))));
    assert.ok(!(c.Config.Env || []).some(x => /^(PGHOST|PGPASSWORD|DATABASE_URL|SUPABASE_|JWT_)/.test(x)));
  }
  async function sql(q) {
    await validar();
    const text = await docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-h', '/tmp', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      { input: require('node:stream').Readable.from(["SET search_path=pg_catalog; SET timezone='UTC'; SET extra_float_digits=3; " + q]), timeout: 300000 });
    return text.trim();
  }
  try {
    // Nome/label conhecidos antes do run: limpeza também cobre criação parcial.
    await docker(['run', '--detach', '--pull=never', '--name', name, '--label', 'tt.offline=' + name,
      '--network', 'none', '--read-only', '--memory', '1536m', '--cpus', '2', '--pids-limit', '256', '--user', 'postgres',
      '--tmpfs', '/tmp:rw,size=128m,mode=1777', '--tmpfs', '/isolated:rw,size=1g,uid=100,gid=101,mode=0700',
      '--mount', `type=bind,source=${arquivo(dir, 'database.dump')},target=/dump,readonly`,
      '--mount', `type=bind,source=${arquivo(dir, 'roles.sql')},target=/roles,readonly`, '--entrypoint', '/bin/sh', image, '-c',
      'initdb -D /isolated/data -U supabase_admin --auth-local=trust --auth-host=reject --no-locale --encoding=UTF8 >/tmp/init.log 2>&1 && exec postgres -D /isolated/data -k /tmp -c listen_addresses= -c unix_socket_permissions=0700 -c shared_preload_libraries=pg_stat_statements']);
    const deadline = Date.now() + 30000; let ready = false;
    while (Date.now() < deadline) { try { ready = await sql('SELECT 1;') === '1'; if (ready) break; } catch (e) { if (e.code !== 'SUBPROCESSO') throw e; } await pausar(100); }
    assert.ok(ready, 'PRONTIDAO_OFFLINE');
    // Única adaptação explícita: bootstrap role já existe no cluster descartável.
    assert.ok(fs.statSync(arquivo(dir, 'roles.sql')).size < 8 * 1024 * 1024);
    const roles = fs.readFileSync(arquivo(dir, 'roles.sql'), 'utf8');
    await sql(roles.replace(/^CREATE ROLE supabase_admin;\r?\n/gm, ''));
    await validar();
    await docker(['exec', name, 'pg_restore', '--exit-on-error', '--single-transaction', '--dbname=postgres', '--host=/tmp', '--username=supabase_admin', '/dump']);
    // O destino transmite somente hashes, sem devolver linhas pessoais ao Node.
    const actual = { tables: JSON.parse('[' + (await sql(`SELECT row_to_json(z) FROM (${inventarioSql}) z;`)).split('\n').filter(Boolean).join(',') + ']'), catalogo: null };
    validarInventario(actual.tables);
    actual.catalogo = JSON.parse(await sql(catalogoOfflineSql));
    for (const t of actual.tables.filter(t => t.kind !== 'p')) {
      const relation = (t.kind === 'r' ? 'ONLY ' : '') + qi(t.schema) + '.' + qi(t.name);
      const q = `SET timezone='UTC'; SET extra_float_digits=3; SET search_path=pg_catalog; SELECT h FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM ${relation} t) hashes ORDER BY h COLLATE "C";`;
      let count = 0n; const h = crypto.createHash('sha256');
      await validar();
      await docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-h', '/tmp', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
        input: require('node:stream').Readable.from([q]),
        onLine: line => { assert.match(line, /^[a-f0-9]{64}$/); h.update(line + '\n'); count++; },
      });
      Object.assign(t, { count: count.toString(), hash: h.digest('hex') });
    }
    comparar(m.reference, actual);
    return { status: 'RESTAURACAO_OFFLINE_APROVADA', tables: actual.tables.length };
  } finally {
    // inspect falhando não autoriza remover outro recurso; sinalizar falha de limpeza.
    const listado = (await docker(['ps', '-a', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}'])).trim();
    if (listado) { assert.equal(listado, name); await validar(); await docker(['stop', '--time', '5', name]); await docker(['rm', name]); }
  }
}
async function restaurar(dir, { autorizado = false, docker } = {}) {
  assert.ok(autorizado, 'EXIGE_AUTORIZACAO_OFFLINE'); dir = validarDiretorio(dir);
  assert.ok(fs.statSync(arquivo(dir, 'manifest-v2.json')).size < 128 * 1024 * 1024, 'MANIFESTO_EXCESSIVO');
  const m = JSON.parse(fs.readFileSync(arquivo(dir, 'manifest-v2.json'), 'utf8'));
  await validarArtefatos(dir, m);
  const resultado = await executarRestore({ docker: docker || await dockerLocal(), dir, m });
  await validarArtefatos(dir, m); return resultado;
}
module.exports = { backup, restaurar, validarDiretorio, arquivo, hashFile, validarArtefatos,
  validarInventario, capturar, integridade, comparar, executarRestore, dockerLocal, clienteDescartavel };
