'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const pastaSql = path.join(__dirname, '../../Banco de dados');
const lerSql = nome => fs.readFileSync(path.join(pastaSql, nome), 'utf8');
const sql = lerSql('eventos_admin.incremental.sql');

test('migração administrativa preserva RPC original, bloqueios e auditoria mínima', () => {
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.gerir_evento|ALTER TABLE public\.eventos\s|DELETE FROM|UPDATE public\.usuarios/);
  assert.match(sql, /ORDER BY id FOR UPDATE/);
  assert.match(sql, /perfil::text='admin'/); assert.match(sql, /perfil::text='organizador'/);
  assert.match(sql, /PRIMARY KEY\(admin_id,chave\)/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /evento:=public\.gerir_evento_v1/);
  assert.match(sql, /INSERT INTO public\.eventos_criacao_admin/);
});

function conferirEndpointDocker(endpoint) {
  if (typeof endpoint !== 'string' || !(endpoint.startsWith('npipe:////./pipe/') || /^unix:\/\/\/[^\r\n]+$/.test(endpoint))) {
    throw Error('O ensaio exige Docker por socket local; endpoint TCP/remoto recusado.');
  }
  return endpoint;
}
test('ensaio PostgreSQL aceita somente socket Docker local, nunca endpoint TCP/remoto', () => {
  for (const endpoint of ['npipe:////./pipe/dockerDesktopLinuxEngine', 'unix:///var/run/docker.sock']) assert.equal(conferirEndpointDocker(endpoint), endpoint);
  for (const endpoint of [undefined, '', 'tcp://127.0.0.1:2375', 'tcp://remoto.invalid:2376', 'ssh://remoto.invalid', 'https://remoto.invalid']) {
    assert.throws(() => conferirEndpointDocker(endpoint), /socket local/);
  }
});

function falhaTransitoriaDeConexao(erro) {
  return ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', '57P03', '57P01'].includes(erro.code) ||
    (!erro.code && /^(Connection terminated unexpectedly|Connection terminated due to connection timeout|Connection terminated|timeout expired|Query read timeout)$/.test(erro.message));
}
function redigir(texto, segredo) { return String(texto ?? '').split(segredo).join('[redigido]'); }

// Só consulta de prontidão é repetida. DDL, migrações e cenários não têm retry.
async function aguardarSql({ criarCliente, limiteMs = 30000, agora = Date.now, pausar = ms => new Promise(r => setTimeout(r, ms)) }) {
  const inicio = agora();
  let tentativas = 0, ultimoErro;
  while (agora() - inicio < limiteMs) {
    const restante = limiteMs - (agora() - inicio);
    const cliente = criarCliente(Math.max(1, Math.min(1000, restante)));
    let timer;
    tentativas++;
    cliente.on('error', () => {}); // Cliente descartável: a operação é aguardada e o cliente sempre encerrado.
    try {
      const resposta = await Promise.race([
        (async () => { await cliente.connect(); return cliente.query('SELECT 1 AS pronto'); })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(Error('Prazo total de prontidão SQL excedido.'), { code: 'A751_READY_TIMEOUT' })), restante); }),
      ]);
      assert.equal(resposta.rows[0]?.pronto, 1, 'Sonda SQL retornou resultado inesperado.');
      return { tentativas, decorridoMs: agora() - inicio };
    } catch (erro) {
      ultimoErro = erro;
      Object.assign(erro, { tentativas, decorridoMs: agora() - inicio });
      if (!falhaTransitoriaDeConexao(erro)) throw erro;
    } finally { clearTimeout(timer); await cliente.end(); }
    const espera = Math.min(100, limiteMs - (agora() - inicio));
    if (espera > 0) await pausar(espera);
  }
  throw Object.assign(Error('PostgreSQL não confirmou prontidão SQL no prazo total.'), {
    code: 'A751_READY_TIMEOUT', tentativas, decorridoMs: agora() - inicio,
    ultimoCodigo: ultimoErro?.code, ultimaMensagem: ultimoErro?.message,
  });
}

test('prontidão SQL repete somente falhas transitórias e encerra todas as conexões', async () => {
  let tempo = 0, clientes = 0, encerrados = 0;
  const resultado = await aguardarSql({ agora: () => tempo, pausar: async ms => { tempo += ms; }, criarCliente: () => {
    const numero = ++clientes;
    return { on() {}, async connect() { if (numero === 1) throw Error('Connection terminated unexpectedly'); },
      async query(sql) { assert.equal(sql, 'SELECT 1 AS pronto'); return { rows: [{ pronto: 1 }] }; }, async end() { encerrados++; } };
  } });
  assert.equal(resultado.tentativas, 2); assert.equal(encerrados, 2);
  assert.equal(resultado.decorridoMs, 100);
});

test('prontidão SQL não mascara autenticação inválida, SQL inesperado ou resultado inválido', async () => {
  for (const codigo of ['28P01', '42501', 'XX000', undefined]) {
    let tentativas = 0, encerrados = 0;
    await assert.rejects(aguardarSql({ criarCliente: () => {
      tentativas++;
      return { on() {}, async connect() {}, async query() {
        if (codigo) throw Object.assign(Error('Falha permanente'), { code: codigo });
        return { rows: [{ pronto: 0 }] };
      }, async end() { encerrados++; } };
    } }), e => codigo ? e.code === codigo : e instanceof assert.AssertionError);
    assert.equal(tentativas, 1); assert.equal(encerrados, 1);
  }
});

test('prontidão SQL limita tempo e tentativas, inclusive conexão sem resposta; diagnóstico redige senha', async () => {
  let tempo = 0, tentativas = 0;
  await assert.rejects(aguardarSql({ limiteMs: 250, agora: () => tempo, pausar: async ms => { tempo += ms; }, criarCliente: () => {
    tentativas++;
    return { on() {}, async connect() { throw Object.assign(Error('Recusada'), { code: 'ECONNREFUSED' }); }, async end() {} };
  } }), e => e.code === 'A751_READY_TIMEOUT' && e.tentativas === 3 && e.ultimoCodigo === 'ECONNREFUSED');
  assert.equal(tentativas, 3);
  let encerrados = 0;
  await assert.rejects(aguardarSql({ limiteMs: 20, criarCliente: () => ({ on() {}, connect: () => new Promise(() => {}), async end() { encerrados++; } }) }), { code: 'A751_READY_TIMEOUT' });
  assert.equal(encerrados, 1);
  assert.equal(redigir('password=senha-sintetica', 'senha-sintetica'), 'password=[redigido]');
});

// Drivers e Docker são carregados apenas pelos dois testes opt-in.
async function ambienteDescartavel(t, versao) {
  const { spawnSync } = require('node:child_process'), { Client, Pool } = require('pg');
  const senha = randomUUID(), inicio = Date.now();
  const executar = (args, combinar = false) => {
    const r = spawnSync('docker', args, { encoding: 'utf8', stdio: 'pipe', timeout: 10000 });
    if (r.error || r.status !== 0) throw Object.assign(Error(redigir(r.stderr || r.error?.message || 'Comando Docker falhou.', senha)), { code: r.error?.code || 'DOCKER_EXIT_' + r.status });
    return (r.stdout + (combinar ? '\n' + r.stderr : '')).trim();
  };
  const contexto = executar(['context', 'show']);
  const endpoint = conferirEndpointDocker(process.env.DOCKER_HOST || executar(['context', 'inspect', contexto, '--format', '{{.Endpoints.docker.Host}}']));
  const docker = (args, combinar = false) => executar(['--host', endpoint, ...args], combinar);
  const nome = 'tt-admin-eventos-v' + versao + '-' + randomUUID();
  let pool, erroPool, etapa = 'criação do container', prontidao;
  function diagnosticar(erro) {
    let estado, logs;
    try { estado = docker(['inspect', '--format', '{{.State.Status}} running={{.State.Running}} exit={{.State.ExitCode}}', nome]); }
    catch (e) { estado = e.message; }
    try { logs = docker(['logs', '--timestamps', '--tail', '60', nome], true).split('\n').filter(l => /LOG:|FATAL:|PANIC:|ERROR:|init process|waiting for server|server started|server stopped/.test(l)).join('\n'); }
    catch (e) { logs = e.message; }
    t.diagnostic(redigir(JSON.stringify({ versao, etapa, tipo: erro.name, codigo: erro.code ?? null, mensagem: erro.message,
      ultimoCodigo: erro.ultimoCodigo, ultimaMensagem: erro.ultimaMensagem,
      decorridoMs: Date.now() - inicio, tentativas: erro.tentativas ?? prontidao?.tentativas ?? 0, estado, logs }), senha));
  }
  // Registrar antes do run também cobre falha parcial na criação. Nunca remover nomes genéricos.
  t.after(async () => {
    try { await pool?.end(); }
    finally {
      let existe = true;
      try { docker(['inspect', '--format', '{{.Id}}', nome]); }
      catch (e) { if (/No such (object|container)/i.test(e.message)) existe = false; else throw e; }
      if (existe) {
        docker(['stop', '--time', '1', nome]);
        t.diagnostic(`Container v${versao} removido: ${nome}`);
      }
    }
    if (erroPool) throw Error('Conexão ociosa do pool falhou; consultar diagnóstico.');
  });
  try {
  docker(['run', '--detach', '--rm', '--pull=never', '--name', nome, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=' + senha, 'postgres:17']);
  etapa = 'mapeamento da porta';
  const endereco = docker(['port', nome, '5432/tcp']);
  assert.match(endereco, /^127\.0\.0\.1:\d+$/);
  const conexao = { host: '127.0.0.1', port: Number(endereco.split(':')[1]), user: 'postgres', password: senha, database: 'postgres', ssl: false };
  etapa = 'prontidão TCP e SELECT 1';
  prontidao = await aguardarSql({ criarCliente: timeout => new Client({ ...conexao, connectionTimeoutMillis: timeout, query_timeout: timeout }) });
  t.diagnostic(`Prontidão SQL v${versao}: ${prontidao.tentativas} tentativa(s), ${prontidao.decorridoMs}ms; ${endereco}`);
  pool = new Pool({ ...conexao, max: 6, query_timeout: 10000, connectionTimeoutMillis: 5000 });
  pool.on('error', erro => { erroPool = erro; diagnosticar(erro); });
  etapa = 'preparação inicial da fixture';
  await pool.query(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE usuarios(id integer PRIMARY KEY,perfil text NOT NULL);
    INSERT INTO usuarios VALUES(7,'organizador'),(8,'fornecedor'),(9,'participante'),(10,'admin'),(11,'organizador'),(12,'admin');
    CREATE TABLE contas_teste_imagens(usuario_id integer PRIMARY KEY,estado text NOT NULL);
    CREATE TABLE eventos(id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,nome varchar(100) NOT NULL,data date NOT NULL,horario time NOT NULL,
      local varchar(200) NOT NULL,categoria varchar(100),publico integer NOT NULL,descricao text,status varchar(50),usuario_id integer REFERENCES usuarios(id));
    CREATE TABLE inscricoes(id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,usuario_id integer REFERENCES usuarios(id),evento_id integer REFERENCES eventos(id),
      status text DEFAULT 'Confirmada', UNIQUE(usuario_id,evento_id));
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT,UPDATE ON usuarios TO service_role;
    GRANT SELECT ON contas_teste_imagens TO service_role;
    GRANT SELECT,INSERT,UPDATE ON eventos,inscricoes TO service_role;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;`);
  etapa = 'migração de gestão v1';
  await pool.query(lerSql('eventos_gestao.incremental.sql'));
  if (versao === 3) { etapa = 'migração de capacidade v3'; await pool.query(lerSql('eventos_capacidade.incremental.sql')); }
  etapa = 'cenários funcionais';
  return pool;
  } catch (erro) {
    diagnosticar(erro);
    throw Object.assign(Error(redigir(erro.message, senha)), { code: erro.code });
  }
}

async function transacaoComo(pool, papel, consulta, argumentos = []) {
  assert.ok(['service_role', 'anon', 'authenticated'].includes(papel));
  const c = await pool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL READ COMMITTED'); await c.query('SET LOCAL ROLE ' + papel);
    const resultado = await c.query(consulta, argumentos);
    await c.query('COMMIT'); return resultado;
  } catch (erro) { await c.query('ROLLBACK'); throw erro; } finally { c.release(); }
}
async function contagens(pool) {
  return (await pool.query(`SELECT (SELECT count(*)::integer FROM eventos) AS eventos,
    (SELECT count(*)::integer FROM eventos_criacao_admin) AS auditorias`)).rows[0];
}
// Timeout ou falha genérica não equivalem à recusa de negócio esperada.
async function rejeitarSemGravar(pool, operacao, codigo) {
  const antes = await contagens(pool);
  await assert.rejects(operacao, erro => {
    assert.equal(erro.code, codigo, `Esperado ${codigo}; recebido ${erro.code || erro.name}`); return true;
  });
  assert.deepEqual(await contagens(pool), antes);
}
test('asserção de recusa não aprova timeout ou erro inesperado como regra de negócio', async () => {
  const pool = { query: async () => ({ rows: [{ eventos: 0, auditorias: 0 }] }) };
  const falhar = code => async () => { throw Object.assign(Error('Falha simulada'), { code }); };
  for (const code of ['EV403', '55P03', 'TA001']) await rejeitarSemGravar(pool, falhar(code), code);
  for (const code of ['55P03', 'XX000', undefined]) {
    await assert.rejects(rejeitarSemGravar(pool, falhar(code), 'EV403'), assert.AssertionError);
  }
});
async function aguardarLock(pool, pid) {
  const limite = Date.now() + 1500;
  while (Date.now() < limite) {
    const r = await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid]);
    if (r.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(r => setTimeout(r, 10));
  }
  assert.fail('A concorrência não chegou ao lock esperado antes do prazo; cenário não validado.');
}

async function conferirPrivilegios(pool) {
  const crud = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], extras = ['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
  const tabelas = ['usuarios', 'eventos', 'inscricoes', 'contas_teste_imagens', 'eventos_criacao_admin'];
  const funcoes = ['public.criar_evento_admin_v1(integer,integer,jsonb,uuid)', 'public.admin_eventos_capacidades_v1()',
    'public.gerir_evento_v1(text,integer,integer,jsonb,integer,uuid)', 'public.eventos_capacidades_v1()'];
  for (const papel of ['anon', 'authenticated', 'service_role']) {
    const role = (await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1', [papel])).rows[0];
    assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, papel === 'service_role');
    for (const tabela of tabelas) {
      const permitidos = papel !== 'service_role' ? [] : tabela === 'usuarios' ? ['SELECT', 'UPDATE'] :
        tabela === 'contas_teste_imagens' ? ['SELECT'] : tabela === 'eventos_criacao_admin' ? ['SELECT', 'INSERT'] : ['SELECT', 'INSERT', 'UPDATE'];
      for (const privilegio of [...crud, ...extras]) {
        const r = await pool.query('SELECT has_table_privilege($1,$2,$3) AS permitido', [papel, 'public.' + tabela, privilegio]);
        assert.equal(r.rows[0].permitido, permitidos.includes(privilegio), `${papel}/${tabela}/${privilegio}`);
        assert.equal((await pool.query('SELECT has_table_privilege($1,$2,$3) AS permitido', [papel, 'public.' + tabela, privilegio + ' WITH GRANT OPTION'])).rows[0].permitido, false);
      }
    }
    for (const funcao of funcoes) {
      assert.equal((await pool.query('SELECT has_function_privilege($1,$2,$3) AS permitido', [papel, funcao, 'EXECUTE'])).rows[0].permitido, papel === 'service_role');
      assert.equal((await pool.query('SELECT has_function_privilege($1,$2,$3) AS permitido', [papel, funcao, 'EXECUTE WITH GRANT OPTION'])).rows[0].permitido, false);
    }
    for (const tabela of ['eventos', 'inscricoes']) {
      const seq = (await pool.query("SELECT pg_get_serial_sequence($1,'id') AS nome", ['public.' + tabela])).rows[0].nome;
      assert.ok(seq);
      for (const privilegio of ['USAGE', 'SELECT', 'UPDATE']) {
        assert.equal((await pool.query('SELECT has_sequence_privilege($1,$2,$3) AS permitido', [papel, seq, privilegio])).rows[0].permitido,
          papel === 'service_role' && privilegio === 'USAGE');
        assert.equal((await pool.query('SELECT has_sequence_privilege($1,$2,$3) AS permitido', [papel, seq, privilegio + ' WITH GRANT OPTION'])).rows[0].permitido, false);
      }
    }
  }
  assert.equal((await pool.query("SELECT has_schema_privilege('service_role','public','USAGE') AS permitido")).rows[0].permitido, true);
  const rls = (await pool.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.eventos_criacao_admin'::regclass")).rows[0];
  assert.equal(rls.relrowsecurity, true); assert.equal(rls.relforcerowsecurity, true);
}

for (const versao of [1, 3]) test(`PostgreSQL isolado v${versao}: criação administrativa`, {
  skip: process.env.TROCATICKET_ADMIN_EVENTOS_SQL_LOCAL !== '1', timeout: 240000,
}, async t => {
  const pool = await ambienteDescartavel(t, versao);
  await t.test('defaults amplos e grant inesperado abortam integralmente a migração', async () => {
    await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role');
    await pool.query('CREATE ROLE observador; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO observador');
    const c = await pool.connect();
    try { await assert.rejects(c.query(sql), /Privilégios inesperados/); }
    finally { await c.query('ROLLBACK'); c.release(); }
    const estruturas = (await pool.query(`SELECT to_regclass('public.eventos_criacao_admin') AS tabela,
      to_regprocedure('public.criar_evento_admin_v1(integer,integer,jsonb,uuid)') AS criar,
      to_regprocedure('public.admin_eventos_capacidades_v1()') AS capacidades`)).rows[0];
    assert.deepEqual(estruturas, { tabela: null, criar: null, capacidades: null });
    await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM observador');
    await pool.query(sql);
  });
  const dados = { nome: 'Evento sintético', data: '2099-01-01', horario: '10:00', local: 'Local', categoria: 'Social', publico: 20, descricao: '' };
  async function criar({ admin = 10, dono = 7, chave = randomUUID(), payload = dados, aoConectar } = {}) {
    if (!aoConectar) return (await transacaoComo(pool, 'service_role', 'SELECT public.criar_evento_admin_v1($1,$2,$3,$4) AS evento', [admin, dono, payload, chave])).rows[0].evento;
    const c = await pool.connect();
    try {
      aoConectar(c.processID);
      await c.query('BEGIN ISOLATION LEVEL READ COMMITTED'); await c.query('SET LOCAL ROLE service_role');
      const r = await c.query('SELECT public.criar_evento_admin_v1($1,$2,$3,$4) AS evento', [admin, dono, payload, chave]);
      await c.query('COMMIT'); return r.rows[0].evento;
    } catch (erro) { await c.query('ROLLBACK'); throw erro; } finally { c.release(); }
  }
  await t.test('criação autorizada separa autoria e proprietário; replay sequencial não grava novamente', async () => {
    const chave = randomUUID(), antes = await contagens(pool), criado = await criar({ chave });
    assert.deepEqual(await criar({ chave }), criado);
    const linha = (await pool.query('SELECT e.usuario_id,e.status,a.* FROM eventos e JOIN eventos_criacao_admin a ON a.evento_id=e.id WHERE e.id=$1', [criado.id])).rows[0];
    assert.equal(linha.usuario_id, 7); assert.equal(linha.organizador_id, 7); assert.equal(linha.admin_id, 10);
    assert.equal(linha.status, 'Em planejamento'); assert.ok(linha.criado_em); assert.equal(linha.assinatura.length, 32);
    assert.deepEqual(await contagens(pool), { eventos: antes.eventos + 1, auditorias: antes.auditorias + 1 });
    await rejeitarSemGravar(pool, () => criar({ chave, payload: { ...dados, nome: 'Outro' } }), 'EV409');
    await rejeitarSemGravar(pool, () => criar({ chave, dono: 11 }), 'EV409');
  });
  await t.test('administrador e proprietário iguais são argumentos inválidos EV400', async () => {
    await rejeitarSemGravar(pool, () => criar({ admin: 10, dono: 10 }), 'EV400');
  });
  await t.test('estado enviado pelo cliente é recusado como EV400', async () => {
    await rejeitarSemGravar(pool, () => criar({ payload: { ...dados, status: 'Ativo' } }), 'EV400');
  });
  for (const admin of [7, 8, 9, 999]) await t.test(`ator ${admin} sem perfil admin válido é recusado como EV403`, async () => {
    await rejeitarSemGravar(pool, () => criar({ admin, dono: 11 }), 'EV403');
  });
  for (const dono of [8, 9, 12, 999]) await t.test(`proprietário ${dono} sem perfil organizador válido é recusado como EV403`, async () => {
    await rejeitarSemGravar(pool, () => criar({ dono }), 'EV403');
  });
  await t.test('concorrência com mesma chave confirma uma criação, sem aceitar timeout como sucesso', async () => {
    const antes = await contagens(pool), chave = randomUUID();
    const resultados = await Promise.allSettled([criar({ chave }), criar({ chave })]);
    for (const r of resultados) assert.equal(r.status, 'fulfilled', `Criação concorrente falhou: ${r.reason?.code || r.reason?.name}`);
    assert.deepEqual(resultados[0].value, resultados[1].value);
    assert.deepEqual(await contagens(pool), { eventos: antes.eventos + 1, auditorias: antes.auditorias + 1 });
  });
  for (const [id, perfil] of [[7, 'organizador'], [10, 'admin']]) await t.test(`perfil de ${perfil} alterado enquanto criação aguarda lock`, async () => {
    const antes = await contagens(pool), c = await pool.connect();
    let tentativa;
    try {
      await c.query('BEGIN'); await c.query("UPDATE usuarios SET perfil='participante' WHERE id=$1", [id]);
      let conectado;
      const conexao = new Promise(resolve => { conectado = resolve; });
      tentativa = criar({ aoConectar: conectado }).then(valor => ({ valor }), erro => ({ erro }));
      const pid = await Promise.race([conexao, tentativa.then(() => { throw Error('Criação terminou antes de confirmar a conexão e o lock.'); })]);
      await aguardarLock(pool, pid);
      await c.query('COMMIT');
      const resultado = await tentativa;
      assert.equal(resultado.erro?.code, 'EV403', 'Exigir recusa de perfil; timeout 55P03 ou erro inesperado não validam este cenário.');
      assert.deepEqual(await contagens(pool), antes);
    } finally {
      await c.query('ROLLBACK'); c.release(); await tentativa;
      await pool.query('UPDATE usuarios SET perfil=$2 WHERE id=$1', [id, perfil]);
    }
  });
  await t.test('timeout de lock é 55P03 e não é confundido com regra de negócio', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN'); await c.query('SELECT id FROM usuarios WHERE id=7 FOR UPDATE');
      await rejeitarSemGravar(pool, () => criar(), '55P03');
    } finally { await c.query('ROLLBACK'); c.release(); }
  });
  await t.test('contas em encerramento ou excluídas não podem atuar como administrador ou proprietário', async () => {
    for (const usuario of [7, 10]) for (const estado of ['encerrando', 'excluida']) {
      await pool.query('INSERT INTO contas_teste_imagens VALUES($1,$2)', [usuario, estado]);
      try { await rejeitarSemGravar(pool, () => criar(), 'EV403'); }
      finally { await pool.query('DELETE FROM contas_teste_imagens WHERE usuario_id=$1', [usuario]); }
    }
  });
  await t.test('falha específica na auditoria reverte evento e diário juntos', async () => {
    await pool.query(`CREATE FUNCTION impedir_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION USING ERRCODE='TA001',MESSAGE='falha simulada na auditoria'; END $$;
      CREATE TRIGGER impedir BEFORE INSERT ON eventos_criacao_admin FOR EACH ROW EXECUTE FUNCTION impedir_auditoria();`);
    try { await rejeitarSemGravar(pool, () => criar(), 'TA001'); }
    finally { await pool.query('DROP TRIGGER impedir ON eventos_criacao_admin; DROP FUNCTION impedir_auditoria()'); }
  });
  await t.test('capacidades correspondem à versão; v3 preserva limite explícito, NULL e omissão', async () => {
    const capacidade = (await transacaoComo(pool, 'service_role', 'SELECT public.admin_eventos_capacidades_v1() AS valor')).rows[0].valor;
    assert.deepEqual(capacidade, { versao: 1, controleCapacidade: versao === 3 });
    assert.equal((await pool.query('SELECT public.eventos_capacidades_v1() AS versao')).rows[0].versao, versao);
    if (versao !== 3) return;
    for (const payload of [dados, { ...dados, capacidade_maxima: null }, { ...dados, capacidade_maxima: 15 }]) {
      const criado = await criar({ payload });
      const e = (await pool.query('SELECT capacidade_maxima,status,usuario_id FROM eventos WHERE id=$1', [criado.id])).rows[0];
      assert.equal(e.capacidade_maxima, payload.capacidade_maxima ?? null); assert.equal(e.status, 'Em planejamento'); assert.equal(e.usuario_id, 7);
    }
    for (const capacidade_maxima of [0, -1, 1.5, '15', 2147483648]) await rejeitarSemGravar(pool, () => criar({ payload: { ...dados, capacidade_maxima } }), 'EV400');
  });
  await t.test('privilégios efetivos mínimos, sequences, RLS e RPCs sem exposição direta', async () => {
    await conferirPrivilegios(pool);
    for (const papel of ['anon', 'authenticated']) {
      await rejeitarSemGravar(pool, () => transacaoComo(pool, papel, 'SELECT public.criar_evento_admin_v1($1,$2,$3,$4)', [10, 7, dados, randomUUID()]), '42501');
      await assert.rejects(transacaoComo(pool, papel, 'SELECT public.admin_eventos_capacidades_v1()'), { code: '42501' });
      await assert.rejects(transacaoComo(pool, papel, 'SELECT * FROM public.eventos_criacao_admin'), { code: '42501' });
    }
    await assert.rejects(transacaoComo(pool, 'service_role', 'DELETE FROM public.eventos_criacao_admin WHERE false'), { code: '42501' });
  });
  await t.test('criação original do Organizador permanece independente da auditoria administrativa', async () => {
    const antes = await contagens(pool);
    const r = await transacaoComo(pool, 'service_role', "SELECT public.gerir_evento_v1('criar',7,NULL,$1,NULL,$2) AS evento", [dados, randomUUID()]);
    assert.equal(r.rows[0].evento.usuario_id, 7); assert.equal(r.rows[0].evento.status, 'Em planejamento');
    assert.deepEqual(await contagens(pool), { eventos: antes.eventos + 1, auditorias: antes.auditorias });
  });
});
