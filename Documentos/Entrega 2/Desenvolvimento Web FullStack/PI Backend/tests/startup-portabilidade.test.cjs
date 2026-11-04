"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const startup = require('../config/startup-controlado.cjs');
const { criarEstadoPrivado } = require('../config/estado-supervisor.cjs');
const env = { DB_PROVIDER: 'supabase', SUPABASE_URL: 'https://gnwybroqfvwosiqzsfla.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_ficticia_portabilidade', JWT_SECRET: 'ficticio-'.repeat(8) };
const limpo = () => ({ versao: 1, congelado: false, selado: false, instancias: [] });
const validar = (e = limpo(), ambiente = env) => startup.validarEntrada(ambiente, 'principal', { estado: { ler: () => e } });

test('manifesto corresponde ao encerramento, sem afirmar ausencia historica de escritas', () => {
  const m = require('../config/ativacao-supabase.json');
  const evidencia = require('../evidencias/resultado-encerramento-administrativo-20261103.json');
  assert.equal(evidencia.status, 'ENCERRAMENTO_E_HTTP_NORMAL_APROVADOS');
  assert.equal(evidencia.phase, 'CONCLUIDA');
  assert.equal(m.projeto, evidencia.project);
  assert.equal(m.provider, evidencia.provider);
  assert.equal(m.criterio, evidencia.criterion);
  assert.equal(m.ausenciaHistoricaDeEscritasComprovada, evidencia.historicalAbsenceOfWritesProven);
  assert.equal(m.lacunaHistoricaExplicitamenteAceita, evidencia.historicalGapExplicitlyAccepted);
  assert.equal(m.snapshotIndependenteAnteriorAusente, evidencia.missingIndependentPriorSnapshotAcknowledged);
  assert.doesNotMatch(JSON.stringify(m), /JWT_SECRET|SUPABASE_SECRET_KEY|sb_secret_|configuracaoHash/);
});

test('computador sem diretorio privado inicia; estado e ambiente permanecem intactos', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-portabilidade-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ausente = path.join(dir, 'nao-existe');
  const antes = JSON.stringify(env);
  assert.equal(startup.validarEntrada(env, 'principal', { estado: criarEstadoPrivado(ausente) }).provider, 'supabase');
  assert.equal(fs.existsSync(ausente), false);
  assert.equal(JSON.stringify(env), antes);
});

test('rotacao de ambas credenciais independe do hash historico apos conclusao', () => {
  const e = { ...limpo(), transicao: { fase: 'CONCLUIDA', configuracaoHash: startup.fingerprint(env) } };
  assert.equal(validar(e, { ...env, JWT_SECRET: 'rotacionado-'.repeat(6), SUPABASE_SECRET_KEY: 'sb_secret_rotacionada' }).provider, 'supabase');
  for (const DB_PROVIDER of [undefined, 'mysql']) assert.throws(() => validar(e, { ...env, DB_PROVIDER }), /STARTUP_MYSQL_APOS_ATIVACAO_RECUSADO/);
  assert.throws(() => validar(e, { ...env, SUPABASE_URL: 'https://outro.supabase.co' }), /STARTUP_PROJETO_DIVERGENTE/);
  assert.throws(() => validar(e, { ...env, SUPABASE_SECRET_KEY: 'publica' }), { code: 'SUPABASE_CONFIG' });
  assert.throws(() => validar(e, { ...env, JWT_SECRET: 'curto' }), /STARTUP_JWT_INVALIDO/);
});

for (const fase of ['INCERTA', 'PREPARADA', 'INICIADA', 'LEITURA', 'LIBERAR', 'DESCONHECIDA', null]) {
  test('manifesto nao libera transicao local ' + fase, () => {
    assert.throws(() => validar({ ...limpo(), transicao: { fase } }), /STARTUP_ESTADO_LOCAL_BLOQUEADO/);
  });
}
for (const bloqueio of [{ congelado: true }, { congelado: true, selado: true }, { selado: true },
  { transicao: null }, { transicao: [] }, { versao: 2 }, { instancias: null }]) {
  test('manifesto nao supera estado invalido ' + JSON.stringify(bloqueio), () => {
    assert.throws(() => validar({ ...limpo(), ...bloqueio }));
    assert.throws(() => validar({ ...limpo(), transicao: { fase: 'CONCLUIDA' }, ...bloqueio }));
  });
}

test('estado em disco: arquivo ausente, JSON corrompido e schema invalido bloqueiam', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-estado-invalido-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const estado = criarEstadoPrivado(dir);
  const executar = () => startup.validarEntrada(env, 'principal', { estado });
  assert.throws(executar, { code: 'ENOENT' });
  for (const bytes of ['{', '{}', JSON.stringify({ ...limpo(), congelado: 'false' }), JSON.stringify({ ...limpo(), transicao: { fase: 'INCERTA' } })]) {
    fs.writeFileSync(path.join(dir, 'estado.json'), bytes);
    assert.throws(executar);
  }
});

test('erros de leitura nao sao convertidos em ausencia de estado', () => {
  assert.throws(() => startup.validarEntrada(env, 'principal', { estado: { ler() { throw Object.assign(Error('negado'), { code: 'EACCES' }); } } }), { code: 'EACCES' });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config/estado-supervisor.cjs'), 'utf8'), {
    module, require: name => name === 'node:fs' ? { lstatSync() { throw Object.assign(Error('negado'), { code: 'EACCES' }); } } : require(name),
  });
  assert.throws(() => module.exports.criarEstadoPrivado('ficticio').ler(), { code: 'EACCES' });
});

test('manifesto ausente, corrompido, divergente ou ilegivel falha fechado', () => {
  for (const valor of [null, '{', '{}', JSON.stringify({ ...require('../config/ativacao-supabase.json'), projeto: 'outro' }), 'EACCES']) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../config/startup-controlado.cjs'), 'utf8'), {
      module, process, __dirname: path.join(__dirname, '../config'), require: name => {
        if (name === 'node:fs') return { readFileSync() {
          if (valor === null || valor === 'EACCES') throw Object.assign(Error('leitura recusada'), { code: valor === null ? 'ENOENT' : 'EACCES' });
          return valor;
        } };
        return name.startsWith('./') ? require(path.join(__dirname, '../config', name)) : require(name);
      },
    });
    assert.throws(() => module.exports.validarEntrada(env, 'principal', { estado: { ler: limpo } }));
  }
});

test('manifesto nao fornece capacidades para migracao ou recuperacao', () => {
  const estado = { ler: limpo, gravar() { assert.fail('nao deve gravar'); } };
  assert.throws(() => startup.consumirEntrada({ estado, env, instancia: 'fake', ticket: 'fake' }));
  assert.throws(() => startup.consumirRestabelecimento({ estado, env, instancia: 'fake', ticket: 'fake' }));
  assert.throws(() => startup.consumirSubstituicao({ estado, env, instancia: 'fake', ticket: 'fake' }));
  assert.equal(startup.validarEntrada({}, 'isolado').provider, 'mysql');
});
