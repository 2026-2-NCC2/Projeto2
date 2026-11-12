'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const b = require('../scripts/backup-postgres-offline.cjs');
const catalog = require('../scripts/catalogo-backup.cjs');
const digest = lines => crypto.createHash('sha256').update(lines.map(x => x + '\n').join('')).digest('hex');
const line = 'a'.repeat(64);
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-offline-test-'));
  t.after(() => { for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name)); fs.rmdirSync(dir); });
  fs.writeFileSync(path.join(dir, 'roles.sql'), 'CREATE ROLE supabase_admin;\nCREATE ROLE sintetico;\n');
  fs.writeFileSync(path.join(dir, 'database.dump'), 'PGDMP-sintetico');
  const m = { version: 2, algorithm: 'sha256-sorted-row-hashes-v1', status: 'BACKUP_COMPLETO_GERADO', artifacts: [],
    reference: { tables: [{ schema: 'public', name: 'usuarios', kind: 'r', extension_owned: false, count: '2', hash: digest([line, line]) }],
      catalogo: { ownership: 'sintetico', acl: ['SELECT'], rls: true, sequences: [{ last_value: 2 }], triggers: ['validar'] } } };
  return { dir, m };
}
async function preencher(dir, m) {
  for (const name of ['database.dump', 'roles.sql']) m.artifacts.push({ name, bytes: fs.statSync(path.join(dir, name)).size, sha256: await b.hashFile(path.join(dir, name)) });
}
function dockerMock(m, { falharRestore = false, adulterarInspecao, adulterarCatalogo, runParcial = false } = {}) {
  let name, exists = false; const calls = [];
  async function docker(args, opts = {}) {
    calls.push(args);
    if (args[0] === 'image') return 'sha256:' + 'b'.repeat(64);
    if (args[0] === 'run') {
      name = args[args.indexOf('--name') + 1]; exists = true;
      if (runParcial) throw Object.assign(Error('Falha sintética'), { code: 'SUBPROCESSO' });
      return 'c'.repeat(64);
    }
    if (args[0] === 'inspect') {
      const c = { Name: '/' + name, Config: { Labels: { 'tt.offline': name }, User: 'postgres', Env: [] },
        HostConfig: { NetworkMode: 'none', PortBindings: {}, ReadonlyRootfs: true },
        Mounts: ['/dump', '/roles'].map(Destination => ({ Type: 'bind', RW: false, Destination })) };
      if (adulterarInspecao) adulterarInspecao(c);
      return JSON.stringify([c]);
    }
    if (args[0] === 'ps') return exists ? name : '';
    if (args[0] === 'stop') return name;
    if (args[0] === 'rm') { exists = false; return name; }
    if (args[0] === 'exec' && args.includes('pg_restore')) {
      if (falharRestore) throw Object.assign(Error('Falha sintética'), { code: 'SUBPROCESSO' });
      return '';
    }
    if (args[0] === 'exec' && args.includes('psql')) {
      let q = ''; for await (const x of opts.input) q += x;
      if (q.endsWith('SELECT 1;')) return '1';
      if (q.includes('row_to_json(z)')) return m.reference.tables.map(({ count, hash, ...t }) => JSON.stringify(t)).join('\n');
      if (q.includes('WITH rels AS')) return JSON.stringify(adulterarCatalogo ? adulterarCatalogo(m.reference.catalogo) : m.reference.catalogo);
      if (opts.onLine) { opts.onLine(line); opts.onLine(line); }
      return '';
    }
    throw Error('Comando inesperado no mock');
  }
  return { docker, calls, existe: () => exists };
}
test('inventário dinâmico aceita uma ou várias tabelas, vazias e particionadas', async () => {
  for (const n of [1, 3, 14]) {
    const tables = Array.from({ length: n }, (_, i) => ({ schema: 'public', name: i ? 't' + i : 'usuarios', kind: i === 2 ? 'p' : 'r' }));
    const query = async q => q === catalog.inventarioSql ? { rows: tables } : q === catalog.catalogoOfflineSql
      ? { rows: [{ catalogo: { rls: true } }] } : { rows: [] };
    const m = await b.capturar(query);
    assert.equal(m.tables.length, n);
    for (const t of tables) assert.equal(t.count, t.kind === 'p' ? undefined : '0');
  }
});
test('integridade usa lotes limitados, hashes e preserva duplicatas sem materializar linhas', async () => {
  let fetch = 0; const queries = [];
  const r = await b.integridade(async q => { queries.push(q); return { rows: q.startsWith('FETCH') && fetch++ < 2 ? Array.from({ length: 1000 }, () => ({ h: line })) : [] }; }, { schema: 'public', name: 'usuarios', kind: 'r' });
  assert.equal(r.count, '2000'); assert.equal(r.hash, digest(Array(2000).fill(line)));
  assert.match(queries[0], /ONLY "public"\."usuarios"/); assert.match(queries[0], /sha256/);
  assert.equal(queries.at(-1), 'CLOSE tt_integridade');
});
test('inventário recusa ausência, duplicatas, foreign tables e identificadores com controle', () => {
  const t = { schema: 'public', name: 'usuarios', kind: 'r' };
  for (const x of [[], [t, t], [{ ...t, kind: 'f' }], [{ ...t, name: 'x\n' }]]) assert.throws(() => b.validarInventario(x));
});
test('checksums exigem todos os artefatos, nomes confinados e formato conhecido', async t => {
  const { dir, m } = fixture(t); await preencher(dir, m); await b.validarArtefatos(dir, m);
  await assert.rejects(b.validarArtefatos(dir, { ...m, version: 1 }));
  await assert.rejects(b.validarArtefatos(dir, { ...m, artifacts: m.artifacts.slice(1) }));
  assert.throws(() => b.arquivo(dir, '../segredo'));
  fs.unlinkSync(path.join(dir, 'database.dump')); await assert.rejects(b.validarArtefatos(dir, m));
});
test('adulteração de mesmo tamanho é detectada', async t => {
  const { dir, m } = fixture(t); await preencher(dir, m);
  const adulterado = fs.readFileSync(path.join(dir, 'database.dump')); adulterado[adulterado.length - 1] ^= 1;
  fs.writeFileSync(path.join(dir, 'database.dump'), adulterado);
  await assert.rejects(b.validarArtefatos(dir, m));
});
for (const campo of ['ownership', 'acl', 'rls', 'sequences', 'triggers']) test('comparação offline reprova divergência de ' + campo + ' sem expor conteúdo', () => {
  const original = { [campo]: 'original-sintetico' };
  assert.throws(() => b.comparar(original, { [campo]: 'alterado-sintetico' }), e => e.code === 'MANIFESTO_DIVERGENTE' && !e.message.includes('sintetico'));
});
test('restore offline compara manifesto e remove container; nenhuma rede ou env de origem', async t => {
  const { dir, m } = fixture(t); const mock = dockerMock(m);
  const r = await b.executarRestore({ ...mock, dir, m });
  assert.equal(r.status, 'RESTAURACAO_OFFLINE_APROVADA'); assert.equal(mock.existe(), false);
  const run = mock.calls.find(x => x[0] === 'run');
  assert.equal(run[run.indexOf('--network') + 1], 'none'); assert.ok(!run.includes('-p') && !run.includes('--env') && !run.includes('--env-file'));
  assert.ok(run.filter(x => x.startsWith('type=bind')).every(x => x.endsWith('readonly')));
  assert.ok(mock.calls.filter(x => x[0] === 'exec' && x.includes('pg_restore')).every(x => x.includes('--exit-on-error') && x.includes('--single-transaction')));
});
test('falha de restore interrompe antes da comparação e limpa container', async t => {
  const { dir, m } = fixture(t); const mock = dockerMock(m, { falharRestore: true });
  await assert.rejects(b.executarRestore({ ...mock, dir, m }), { code: 'SUBPROCESSO' }); assert.equal(mock.existe(), false);
  assert.equal(mock.calls.at(-1)[0], 'rm');
});
test('run parcialmente criado também tem limpeza restrita', async t => {
  const { dir, m } = fixture(t); const mock = dockerMock(m, { runParcial: true });
  await assert.rejects(b.executarRestore({ ...mock, dir, m })); assert.equal(mock.existe(), false);
});
test('estrutura restaurada adulterada reprova e limpa', async t => {
  const { dir, m } = fixture(t); const mock = dockerMock(m, { adulterarCatalogo: c => ({ ...c, rls: false }) });
  await assert.rejects(b.executarRestore({ ...mock, dir, m }), { code: 'MANIFESTO_DIVERGENTE' }); assert.equal(mock.existe(), false);
});
test('inspeção recusa rede, porta, mount gravável e credencial; não remove recurso inseguro', async t => {
  const { dir, m } = fixture(t);
  for (const adulterarInspecao of [c => { c.HostConfig.NetworkMode = 'bridge'; }, c => { c.HostConfig.PortBindings = { 5432: [{}] }; },
    c => { c.Mounts[0].RW = true; }, c => { c.Config.Env = ['PGPASSWORD=segredo-sintetico']; }]) {
    const mock = dockerMock(m, { adulterarInspecao }); await assert.rejects(b.executarRestore({ ...mock, dir, m }));
    assert.ok(!mock.calls.some(x => x[0] === 'rm')); assert.ok(!mock.calls.some(x => x.includes('pg_restore')));
  }
});
test('opt-in ausente bloqueia backup e restore antes de arquivos e rede', async () => {
  await assert.rejects(b.backup('nao-existe')); await assert.rejects(b.restaurar('nao-existe'));
});
test('destino dentro do Git e caminhos com travessia são recusados', () => {
  assert.throws(() => b.validarDiretorio(path.resolve(__dirname, '..')));
  assert.throws(() => b.arquivo(os.tmpdir(), '..\\segredo'));
});
test('Docker remoto é recusado antes de qualquer run', async () => {
  const anterior = process.env.DOCKER_HOST;
  try { process.env.DOCKER_HOST = 'tcp://remoto.invalid:2376'; await assert.rejects(b.dockerLocal(async () => 'contexto')); }
  finally { if (anterior === undefined) delete process.env.DOCKER_HOST; else process.env.DOCKER_HOST = anterior; }
});
test('catálogo histórico permanece estável e V2 inclui metadados fora de public', () => {
  assert.match(catalog.catalogoSql, /n\.nspname='public'/);
  for (const campo of ['owner', 'acl', 'rls', 'sequences', 'triggers', 'defaults', 'memberships', 'event_triggers', 'extensions']) assert.ok(catalog.catalogoOfflineSql.includes(campo));
  assert.doesNotMatch(catalog.catalogoOfflineSql, /rolpassword|pg_authid/);
});
test('comparação V2 aceita somente o par de casts histórico no CHECK correto', () => {
  const { CHECK_ORIGEM, CHECK_RESTAURADO } = require('../scripts/backup-etapa3-validado.cjs');
  const ref = def => ({ catalogo: { constraints: [{ schema: 'public', table: 'eventos', name: 'eventos_ciclo_v1', def }] } });
  b.comparar(ref(CHECK_ORIGEM), ref(CHECK_RESTAURADO));
  assert.throws(() => b.comparar(ref(CHECK_ORIGEM), ref(CHECK_RESTAURADO.replace('Encerrado', 'Outro'))), { code: 'MANIFESTO_DIVERGENTE' });
});
for (const falhar of [false, true]) test('backup dinâmico com mocks: snapshot, TOC, credenciais e limpeza; falha=' + falhar, async t => {
  const { dir } = fixture(t);
  for (const f of ['database.dump', 'roles.sql']) fs.unlinkSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'root-ca.crt'), 'CA-sintetica');
  const ref = require('../imagens/homologacao-config.cjs').PRODUCAO;
  const env = { SUPABASE_URL: `https://${ref}.supabase.co`, PGUSER: 'postgres.' + ref,
    PGHOST: 'aws-0-teste.pooler.supabase.com', PGPORT: '5432', PGDATABASE: 'postgres', PGPASSWORD: 'senha-exclusivamente-sintetica' };
  let rollback = 0, encerrado = false; const calls = [];
  const client = { connection: { stream: { authorized: true } }, release() {}, async query(q) {
    calls.push(q);
    if (q === 'SHOW server_version_num') return { rows: [{ server_version_num: '170011' }] };
    if (q.includes('pg_export_snapshot')) return { rows: [{ snapshot: '00001-00001-1' }] };
    if (q === catalog.inventarioSql) return { rows: [{ schema: 'public', name: 'usuarios', kind: 'r', extension_owned: false }] };
    if (q === catalog.catalogoOfflineSql) return { rows: [{ catalogo: { rls: true } }] };
    if (q === 'ROLLBACK') rollback++;
    return { rows: [] };
  } };
  const docker = async (args, opts = {}) => {
    assert.ok(!args.some(x => x.includes(env.PGPASSWORD)));
    if (args[0] === 'ps') return '';
    if (args[0] === 'image') return 'sha256:' + 'a'.repeat(64);
    if (args.includes('pg_dump')) {
      assert.ok(args.includes('--snapshot=00001-00001-1')); assert.ok(args.includes('--format=custom'));
      assert.ok(fs.existsSync(path.join(dir, 'pgpass-temporario')));
      if (falhar) throw Error('Falha sintética de dump');
      fs.writeFileSync(opts.output, 'PGDMP-sintetico'); return '';
    }
    if (args.includes('pg_dumpall')) { assert.ok(args.includes('--no-role-passwords')); fs.writeFileSync(opts.output, 'CREATE ROLE sintetico;'); return ''; }
    if (args.includes('--list')) return '1; 0 1 TABLE DATA public usuarios postgres';
    throw Error('Comando inesperado');
  };
  const op = b.backup(dir, { autorizado: true, escritasPausadas: true }, { env, docker, validarDiretorio: x => x,
    criarPool: () => ({ connect: async () => client, end: async () => { encerrado = true; } }) });
  if (falhar) { await assert.rejects(op); assert.ok(!fs.existsSync(path.join(dir, 'manifest-v2.json'))); }
  else {
    const r = await op; assert.equal(r.tables, 1);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest-v2.json')));
    assert.equal(m.reference.tables[0].count, '0'); await b.validarArtefatos(dir, m);
    assert.ok(!JSON.stringify(m).includes(env.PGPASSWORD));
  }
  assert.equal(rollback, 1); assert.ok(encerrado); assert.ok(!fs.existsSync(path.join(dir, 'pgpass-temporario')));
});
test('timeout de cliente de dump limpa somente container com nome e label comprovados', async () => {
  let name; const calls = [];
  const docker = async args => {
    calls.push(args);
    if (args[0] === 'run') { name = args[args.indexOf('--name') + 1]; throw Error('Timeout sintético'); }
    if (args[0] === 'ps') return name;
    if (args[0] === 'inspect') return JSON.stringify([{ Name: '/' + name, Config: { Labels: { 'tt.backup.client': name } }, HostConfig: { NetworkMode: 'bridge', ReadonlyRootfs: true } }]);
    return '';
  };
  await assert.rejects(b.clienteDescartavel(docker, ['run', '--network', 'bridge', '--read-only', 'imagem-sintetica']));
  assert.deepEqual(calls.slice(-2).map(x => x[0]), ['stop', 'rm']);
});
test('restore offline não carrega dotenv nem db-postgres, mesmo com env de origem herdado', async t => {
  const Module = require('node:module'); const anterior = Module._load;
  const { dir, m } = fixture(t); const mock = dockerMock(m);
  try {
    Module._load = function (name, ...rest) { if (/dotenv|db-postgres/.test(name)) throw Error('ACESSO_ORIGEM'); return anterior.call(this, name, ...rest); };
    await b.executarRestore({ ...mock, dir, m });
  } finally { Module._load = anterior; }
});
test('origem sintética recusa rede, porta, imagem ou label divergentes antes de conectar', async t => {
  const { dir } = fixture(t);
  for (const f of ['database.dump', 'roles.sql']) fs.unlinkSync(path.join(dir, f));
  const name = 'tt-backup-source-' + crypto.randomUUID(), image = 'sha256:' + 'a'.repeat(64);
  for (const alterar of [s => { s.HostConfig.NetworkMode = 'bridge'; }, s => { s.HostConfig.PortBindings = { 5432: [{}] }; },
    s => { s.Image = 'outra'; }, s => { s.Config.Labels['tt.backup.source'] = 'outro'; }]) {
    let executou = false;
    const docker = async args => {
      if (args[0] === 'image') return image;
      assert.equal(args[0], 'inspect');
      const source = { Name: '/' + name, Image: image, Config: { Labels: { 'tt.backup.source': name } },
        HostConfig: { NetworkMode: 'none', PortBindings: {}, ReadonlyRootfs: true } };
      alterar(source); return JSON.stringify([source]);
    };
    await assert.rejects(v2Backup());
    function v2Backup() { return b.backup(dir, { autorizado: true, escritasPausadas: true, origemLocal: name },
      { docker, validarDiretorio: x => x, criarPool: () => { executou = true; throw Error('Conexão indevida'); } }); }
    assert.equal(executou, false);
  }
});
