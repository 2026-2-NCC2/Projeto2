"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), { EventEmitter } = require("node:events");
const homolog = require("../homologacao.cjs");
const raiz = path.resolve(__dirname, "..");
const principal = "principal_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const exclusivo = "homologacao_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const projeto = "gnwybroqfvwosiqzsfla";
const config = () => ({ projectName: "PI Backend", projectRef: projeto, SUPABASE_URL: `https://${projeto}.supabase.co`,
  SUPABASE_SECRET_KEY: "sb_secret_ficticia_privada", JWT_SECRET: exclusivo, host: "127.0.0.1", port: 3111 });

test("configuracao: destino fixo, segredo exclusivo, sem fallback ou campos de MySQL", () => {
  assert.equal(homolog.validarConfiguracao(config(), [principal]).port, 3111);
  for (const patch of [{ projectName: "TrocaTicket Testes" }, { projectRef: "outro" }, { SUPABASE_URL: "https://outro.supabase.co" },
    { SUPABASE_SECRET_KEY: undefined }, { JWT_SECRET: principal }, { JWT_SECRET: "x".repeat(64) },
    { JWT_SECRET: "curto" }, { host: "localhost" }, { host: "0.0.0.0" }, { port: 3001 }, { port: 0 },
    { port: "3111" }, { DB_HOST: "mysql.invalid" }, { DB_PROVIDER: "mysql" }]) {
    assert.throws(() => homolog.validarConfiguracao({ ...config(), ...patch }, [principal]));
  }
  for (const referencias of [[], [undefined], ["curto"], [exclusivo]]) {
    assert.throws(() => homolog.validarConfiguracao(config(), referencias));
  }
});
test("entrada: nenhuma flag libera o startup normal Supabase", () => {
  assert.throws(() => homolog.confirmarEntrada(), e => e.code === "HOMOLOG_ENTRY");
  assert.throws(() => require("../config/banco.cjs").validarInicializacaoBanco({
    DB_PROVIDER: "supabase", SUPABASE_URL: config().SUPABASE_URL, SUPABASE_SECRET_KEY: config().SUPABASE_SECRET_KEY,
  }), e => e.code === "DB_PROVIDER_NOT_IMPLEMENTED");
});
test("CLI: importacao inerte, argumentos invalidos e chamada fora do inicializador sao recusados", async () => {
  const { executar } = require("../scripts/iniciar-homologacao-leitura.cjs");
  await assert.rejects(executar(["--config", "C:\\privado\\nao-ler.json"]), e => e.code === "HOMOLOG_ARGS");
  await assert.rejects(executar([]), e => e.code === "HOMOLOG_ENTRY");
});
test("filtro: apenas GET e POST /login passam; bloqueio precede qualquer handler", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"]) {
    for (const route of ["/usuarios", "/eventos/12/custos", "/cotacoes", "/solicitacoes-acesso/6", "/LOGIN", "/login/", "/login/outro"]) {
      let next = false;
      const res = { setHeader() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; } };
      homolog.filtroLeitura({ method, path: route }, res, () => { next = true; });
      assert.equal(next, false); assert.equal(res.statusCode, 405);
    }
  }
  for (const [method, route] of [["GET", "/eventos"], ["GET", "/perfil"], ["POST", "/login"]]) {
    let next = false; homolog.filtroLeitura({ method, path: route }, {}, () => { next = true; }); assert.equal(next, true);
  }
});
function headers() { return { apikey: config().SUPABASE_SECRET_KEY, Authorization: "Bearer " + config().SUPABASE_SECRET_KEY }; }
test("transporte: apenas tabelas de leitura e RPC STABLE conhecida, sempre com credencial de servidor", async () => {
  const calls = [];
  const transporte = homolog.protegerFetch(config(), async (url, options) => {
    calls.push({ url, options }); return new Response("[]", { headers: { "sb-project-ref": projeto } });
  });
  await transporte.fetch(config().SUPABASE_URL + "/rest/v1/usuarios?select=id", { headers: headers() });
  await transporte.fetch(config().SUPABASE_URL + "/rest/v1/rpc/listar_propostas_por_fornecedor", {
    method: "POST", headers: headers(), body: JSON.stringify({ p_fornecedor_id: 3 }),
  });
  assert.equal(calls.length, 2); assert.ok(calls.every(c => c.options.redirect === "error"));
  for (const [route, options] of [
    ["/rest/v1/usuarios", { method: "POST", body: "{}" }],
    ["/rest/v1/eventos", { method: "PATCH", body: "{}" }],
    ["/rest/v1/custos_evento", { method: "DELETE" }],
    ["/rest/v1/rpc/publicar_cotacao", { method: "POST", body: "{}" }],
    ["/rest/v1/rpc/substituir_custos_evento", { method: "POST", body: "{}" }],
    ["/rest/v1/rpc/decidir_solicitacao_acesso", { method: "POST", body: "{}" }],
    ["/rest/v1/rpc/eventos_capacidades_v1", { method: "POST", body: '{"usuario_id":3}' }],
    ["/rest/v1/rpc/listar_propostas_por_fornecedor", { method: "POST", body: '{"p_fornecedor_id":3,"extra":true}' }],
    ["/auth/v1/token", { method: "POST" }],
    ["/rest/v1/usuarios", { headers: { ...headers(), Authorization: "Bearer JWT-DO-USUARIO" } }],
    ["/rest/v1/usuarios", { headers: { ...headers(), "accept-profile": "auth" } }],
  ]) await assert.rejects(transporte.fetch(config().SUPABASE_URL + route, { headers: headers(), ...options }), e => e.code === "HOMOLOG_TRANSPORT");
  await assert.rejects(transporte.fetch("https://outro.supabase.co/rest/v1/usuarios", { headers: headers() }));
  assert.equal(calls.length, 2); transporte.abortar();
});
test("transporte: identidade divergente falha fechada e shutdown aborta consultas pendentes", async () => {
  const outro = homolog.protegerFetch(config(), async () => new Response("[]", { headers: { "sb-project-ref": "outro" } }));
  await assert.rejects(outro.fetch(config().SUPABASE_URL + "/rest/v1/usuarios", { headers: headers() }), e => e.code === "HOMOLOG_PROJECT");
  let signal;
  const pendente = homolog.protegerFetch(config(), async (url, options) => new Promise((resolve, reject) => {
    signal = options.signal; signal.addEventListener("abort", () => reject(Error("abortado")), { once: true });
  }));
  const request = pendente.fetch(config().SUPABASE_URL + "/rest/v1/usuarios", { headers: headers() });
  pendente.abortar(); await assert.rejects(request); assert.equal(signal.aborted, true);
});

test('contas de teste: permite exclusivamente GET de estado por um usuario_id inteiro', async () => {
  const calls = [];
  const transporte = homolog.protegerFetch(config(), async (url, options) => {
    calls.push({ url, options });
    return new Response('[]', { headers: { 'sb-project-ref': projeto } });
  });
  const base = config().SUPABASE_URL + '/rest/v1/contas_teste_imagens';
  for (const id of [1, 7, 2147483647]) {
    await transporte.fetch(base + '?select=estado&usuario_id=eq.' + id, { headers: headers() });
  }
  assert.equal(calls.length, 3);
  const invalidas = [
    '', '?select=estado', '?usuario_id=eq.7', '?select=*&usuario_id=eq.7',
    '?select=estado,email&usuario_id=eq.7', '?select=estado&usuario_id=eq.0',
    '?select=estado&usuario_id=eq.-1', '?select=estado&usuario_id=eq.01',
    '?select=estado&usuario_id=eq.2147483648', '?select=estado&usuario_id=eq.9007199254740992',
    '?select=estado&usuario_id=in.(7,8)', '?select=estado&usuario_id=gt.0',
    '?select=estado&usuario_id=eq.7&usuario_id=eq.8', '?select=estado&select=email&usuario_id=eq.7',
    '?select=estado&usuario_id=eq.7&or=(usuario_id.eq.8)', '?select=estado&usuario_id=eq.7&limit=1',
    '?select=estado&usuario_id=eq.7&offset=1', '?select=estado&usuario_id=eq.7&order=usuario_id',
    '?select=estado&usuario_id=eq.7&on_conflict=usuario_id',
  ];
  for (const query of invalidas) await assert.rejects(transporte.fetch(base + query, { headers: headers() }), e => e.code === 'HOMOLOG_TRANSPORT');
  const url = base + '?select=estado&usuario_id=eq.7';
  for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) {
    await assert.rejects(transporte.fetch(url, { method, headers: headers() }), e => e.code === 'HOMOLOG_TRANSPORT');
  }
  for (const extra of [{ body: '{}' }, { headers: { ...headers(), Prefer: 'count=exact' } },
    { headers: { ...headers(), Range: '0-1' } }, { headers: { ...headers(), 'Range-Unit': 'items' } },
    { headers: { ...headers(), 'Accept-Profile': 'auth' } }, { headers: { ...headers(), Authorization: 'Bearer JWT-USUARIO' } }]) {
    await assert.rejects(transporte.fetch(url, { headers: headers(), ...extra }), e => e.code === 'HOMOLOG_TRANSPORT');
  }
  for (const tabela of ['contas_teste_imagens_extra', 'termos_aceites', 'pg_roles', 'contas_teste_imagens/7']) {
    await assert.rejects(transporte.fetch(config().SUPABASE_URL + '/rest/v1/' + tabela + '?select=estado&usuario_id=eq.7', { headers: headers() }), e => e.code === 'HOMOLOG_TRANSPORT');
  }
  assert.equal(calls.length, 3); transporte.abortar();
});

test('SDK real: recusas permanentes de transporte e projeto não provocam retries', { timeout: 3000 }, async () => {
  const { createClient } = require('@supabase/supabase-js');
  for (const caso of ['parametro', 'tabela', 'escrita', 'projeto', 'permissao']) {
    let tentativas = 0, rede = 0;
    const transporte = homolog.protegerFetch(config(), async () => {
      rede++;
      return new Response(caso === 'permissao' ? JSON.stringify({ code: '42501', message: 'Recusa sintética' }) : '[]',
        { status: caso === 'permissao' ? 403 : 200, headers: { 'sb-project-ref': caso === 'projeto' ? 'outro' : projeto } });
    });
    const client = createClient(config().SUPABASE_URL, config().SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (...args) => { tentativas++; return transporte.fetch(...args); } },
    });
    let query = client.schema('public').from(caso === 'tabela' ? 'tabela_proibida' : 'contas_teste_imagens');
    query = caso === 'escrita' ? query.insert({ usuario_id: 7, estado: 'ativa' }) : query.select(caso === 'parametro' ? '*' : 'estado').eq('usuario_id', 7).maybeSingle();
    const r = await query;
    assert.ok(r.error); assert.equal(tentativas, 1);
    assert.equal(rede, ['projeto', 'permissao'].includes(caso) ? 1 : 0);
    // O SDK serializa AbortError com code vazio. Os códigos HOMOLOG_* são
    // verificados nos testes diretos do transporte; aqui verificamos o aborto
    // reconhecido pelo SDK, o número de tentativas e a ausência de rede indevida.
    if (caso === 'permissao') assert.equal(r.error.code, '42501');
    else { assert.equal(r.error.code, ''); assert.match(r.error.message, /^AbortError: Homologação recusada/); }
    transporte.abortar();
  }
});

test('capacidades: SQL versionado tem corpo constante, sem argumentos ou efeitos colaterais', () => {
  for (const [arquivo, versao] of [['eventos_gestao.incremental.sql', 1], ['eventos_capacidade.incremental.sql', 3]]) {
    const sql = fs.readFileSync(path.join(raiz, '../Banco de dados', arquivo), 'utf8');
    const declaracao = sql.match(/CREATE(?: OR REPLACE)? FUNCTION public\.eventos_capacidades_v1\(\) RETURNS integer LANGUAGE sql STABLE\s+SECURITY INVOKER\s+SET search_path=pg_catalog AS \$\$ SELECT ([13]) \$\$;/);
    assert.ok(declaracao, arquivo); assert.equal(Number(declaracao[1]), versao);
    if (versao === 1) {
      assert.match(sql, /REVOKE ALL ON FUNCTION[^;]*public\.eventos_capacidades_v1\(\) FROM PUBLIC,anon,authenticated;/);
      assert.match(sql, /GRANT EXECUTE ON FUNCTION[^;]*public\.eventos_capacidades_v1\(\) TO service_role;/);
    }
  }
});

test('capacidades: somente POST no caminho exato, corpo literal vazio e sem parâmetros', async () => {
  const calls = [], base = config().SUPABASE_URL;
  const transporte = homolog.protegerFetch(config(), async (url, options) => {
    calls.push({ url, options }); return new Response('3', { headers: { 'sb-project-ref': projeto } });
  });
  const rota = '/rest/v1/rpc/eventos_capacidades_v1';
  const permitido = { method: 'POST', body: '{}', headers: { ...headers(), 'Content-Profile': 'public', 'Content-Type': 'application/json' } };
  await transporte.fetch(base + rota, permitido); assert.equal(calls.length, 1);
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    await assert.rejects(transporte.fetch(base + rota, { ...permitido, method }), e => e.code === 'HOMOLOG_TRANSPORT');
  }
  for (const body of [undefined, '', 'null', '[]', '{ }', '{"p_usuario":7}', '{"acao":"criar"}', '{}{}']) {
    await assert.rejects(transporte.fetch(base + rota, { ...permitido, body }), e => e.code === 'HOMOLOG_TRANSPORT');
  }
  for (const extra of ['?select=*', '?p_usuario=7', '?limit=1', '?on_conflict=id', '/']) {
    await assert.rejects(transporte.fetch(base + rota + extra, permitido), e => e.code === 'HOMOLOG_TRANSPORT');
  }
  for (const patch of [{ Prefer: 'count=exact' }, { Prefer: 'tx=commit' }, { Range: '0-1' }, { 'Range-Unit': 'items' },
    { 'Content-Profile': 'auth' }, { Authorization: 'Bearer JWT-USUARIO' }, { apikey: 'chave-incorreta' }]) {
    await assert.rejects(transporte.fetch(base + rota, { ...permitido, headers: { ...permitido.headers, ...patch } }), e => e.code === 'HOMOLOG_TRANSPORT');
  }
  for (const rpc of ['gerir_evento_v1', 'inscrever_evento_v1', 'eventos_vagas_v3', 'rpc_desconhecida', 'eventos_capacidades_v1_extra']) {
    await assert.rejects(transporte.fetch(base + '/rest/v1/rpc/' + rpc, permitido), e => e.code === 'HOMOLOG_TRANSPORT');
  }
  await assert.rejects(transporte.fetch('https://outro.supabase.co' + rota, permitido), e => e.code === 'HOMOLOG_TRANSPORT');
  assert.equal(calls.length, 1); assert.equal(calls[0].options.redirect, 'error'); transporte.abortar();
  for (const ref of [null, 'outro']) {
    const incorreto = homolog.protegerFetch(config(), async () => new Response('3', { headers: ref ? { 'sb-project-ref': ref } : {} }));
    await assert.rejects(incorreto.fetch(base + rota, permitido), e => e.code === 'HOMOLOG_PROJECT');
    incorreto.abortar();
  }
});

test('capacidades: SDK e repositório reais preservam marcadores, ausência da função e falha fechada', async () => {
  const { createClient } = require('@supabase/supabase-js');
  const { criarRepositorioEventos } = require('../repositories/supabase/eventos.cjs');
  for (const caso of [1, 3, 'PGRST202', '42883', '42501', 99]) {
    let tentativas = 0;
    const transporte = homolog.protegerFetch(config(), async (url, options) => {
      tentativas++; assert.equal(url, config().SUPABASE_URL + '/rest/v1/rpc/eventos_capacidades_v1');
      assert.equal(options.method, 'POST'); assert.equal(options.body, '{}');
      return new Response(typeof caso === 'string' ? JSON.stringify({ code: caso, message: 'Falha sintética' }) : JSON.stringify(caso),
        { status: typeof caso === 'string' ? caso === '42501' ? 403 : 404 : 200, headers: { 'sb-project-ref': projeto } });
    });
    const client = createClient(config().SUPABASE_URL, config().SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transporte.fetch },
    });
    const repo = criarRepositorioEventos(client, { gestaoSegura: true });
    if (caso === '42501' || caso === 99) await assert.rejects(repo.capacidades(), e => e.respostaStatus === 503);
    else {
      const caps = await repo.capacidades();
      assert.equal(caps.controleVersao, [1, 3].includes(caso)); assert.equal(caps.controleCapacidade === true, caso === 3);
      assert.equal(caps.excluir, false);
    }
    assert.equal(tentativas, 1); transporte.abortar();
  }
});

test('capacidades: SDK não repete RPC bloqueada por argumentos inesperados', { timeout: 3000 }, async () => {
  const { createClient } = require('@supabase/supabase-js'); let tentativas = 0, rede = 0;
  const transporte = homolog.protegerFetch(config(), async () => { rede++; throw Error('Transporte não deveria executar'); });
  const client = createClient(config().SUPABASE_URL, config().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...args) => { tentativas++; return transporte.fetch(...args); } },
  });
  const r = await client.schema('public').rpc('eventos_capacidades_v1', { p_usuario: 7 });
  assert.ok(r.error); assert.match(r.error.message, /^AbortError:/);
  assert.equal(tentativas, 1); assert.equal(rede, 0); transporte.abortar();
});

// Respostas em streaming inteiramente locais: nenhum fetch ou socket real.
function respostaLenta(options, observacao) {
  return new Response(new ReadableStream({
    start(controller) {
      observacao.controller = controller;
      options.signal.addEventListener("abort", () => controller.error(options.signal.reason), { once: true });
    },
  }), { status: 206, headers: { "sb-project-ref": projeto, "content-type": "application/json" } });
}

test("transporte: shutdown apos headers aborta leitura do corpo em andamento", async () => {
  const observado = {}; let signal, original;
  const transporte = homolog.protegerFetch(config(), async (url, options) => {
    signal = options.signal; original = respostaLenta(options, observado); return original;
  });
  const response = await transporte.fetch(config().SUPABASE_URL + "/rest/v1/usuarios", { headers: headers() });
  assert.equal(response, original); assert.equal(response.status, 206);
  observado.controller.enqueue(new TextEncoder().encode("["));
  const leitura = response.text();
  const rejeicao = assert.rejects(leitura, e => e.name === "AbortError");
  transporte.abortar(); await rejeicao;
  assert.equal(signal.aborted, true); assert.equal(response.bodyUsed, true);
  transporte.abortar();
});

test("transporte: shutdown apos headers cancela corpo ainda nao consumido", async () => {
  const observado = {};
  const transporte = homolog.protegerFetch(config(), async (url, options) => respostaLenta(options, observado));
  const response = await transporte.fetch(config().SUPABASE_URL + "/rest/v1/usuarios", { headers: headers() });
  assert.equal(response.bodyUsed, false);
  transporte.abortar();
  await assert.rejects(response.json(), e => e.name === "AbortError");
});

test("transporte: streaming normal preserva Response, headers, clone e JSON", async () => {
  const observado = {}; let original;
  const transporte = homolog.protegerFetch(config(), async (url, options) => {
    original = respostaLenta(options, observado); return original;
  });
  const response = await transporte.fetch(config().SUPABASE_URL + "/rest/v1/usuarios", { headers: headers() });
  assert.equal(response, original); assert.equal(response.bodyUsed, false);
  assert.equal(response.headers.get("sb-project-ref"), projeto);
  const clone = response.clone(), leitura = response.json(), copia = clone.text();
  observado.controller.enqueue(new TextEncoder().encode('[{"id":7}]'));
  observado.controller.close();
  assert.deepEqual(await leitura, [{ id: 7 }]); assert.equal(await copia, '[{"id":7}]');
  transporte.abortar();
});

test("transporte: aborto do chamador apos headers interrompe corpo", async () => {
  const chamador = new AbortController(), observado = {};
  const transporte = homolog.protegerFetch(config(), async (url, options) => respostaLenta(options, observado));
  const response = await transporte.fetch(config().SUPABASE_URL + "/rest/v1/usuarios", {
    headers: headers(), signal: chamador.signal,
  });
  const leitura = response.text(), rejeicao = assert.rejects(leitura, e => e.name === "AbortError");
  chamador.abort(); await rejeicao; transporte.abortar();
});

test("transporte: timeout de 15s continua interrompendo corpo apos headers", async t => {
  const prazo = new AbortController(), observado = {};
  t.mock.method(AbortSignal, "timeout", ms => { assert.equal(ms, 15000); return prazo.signal; });
  const transporte = homolog.protegerFetch(config(), async (url, options) => respostaLenta(options, observado));
  const response = await transporte.fetch(config().SUPABASE_URL + "/rest/v1/usuarios", { headers: headers() });
  const leitura = response.text(), motivo = new DOMException("Prazo simulado", "TimeoutError");
  const rejeicao = assert.rejects(leitura, e => e === motivo);
  prazo.abort(motivo); await rejeicao; transporte.abortar();
});

// Controlador real em VM: filesystem, processo e listen simulados. Nunca le o
// .env real, cria arquivo privado, abre porta 3111 ou carrega clientes reais.
function controlador(op = {}) {
  const envPath = path.join(raiz, ".env");
  const processo = new EventEmitter(); processo.env = { JWT_SECRET: principal, DB_HOST: "mysql.invalid", DB_PORT: "3306", PGHOST: "postgres.invalid", ...op.herdado };
  const inicial = { ...processo.env }, imports = [], middleware = [], eventos = [], timers = new Set();
  let ready, appLoaded = 0, validacoesNormais = 0;
  const server = new EventEmitter(); server.listening = false;
  server.close = callback => { eventos.push("close"); server.listening = false; if (callback) queueMicrotask(callback); };
  server.closeAllConnections = () => eventos.push("closeAll"); server.closeIdleConnections = () => eventos.push("idle");
  const cfg = { ...config(), ...op.patch };
  const fsFake = { ...fs,
    realpathSync(p) { assert.equal(p, envPath); return op.junction ? envPath + ".outro" : p; },
    statSync() { return { isFile: () => true, size: 1000 }; },
    readFileSync(p) {
      if (p === envPath) {
        if (op.ausente) throw Error("arquivo secreto ausente");
        const valores = { DB_PROVIDER: "mysql", DB_HOST: "mysql.invalid", PGHOST: "postgres.invalid",
          SUPABASE_URL: "https://principal.invalid", SUPABASE_SECRET_KEY: "sb_secret_principal_nao_usar",
          ...(op.semPrincipal ? {} : { JWT_SECRET: principal }),
          HOMOLOG_SUPABASE_URL: cfg.SUPABASE_URL, HOMOLOG_SUPABASE_SECRET_KEY: cfg.SUPABASE_SECRET_KEY,
          HOMOLOG_JWT_SECRET: cfg.JWT_SECRET, ...op.env };
        return Object.entries(valores).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join("\n");
      }
      throw Error("Arquivo inesperado: " + p);
    },
  };
  if (op.semPrincipal) delete processo.env.JWT_SECRET;
  const originalFetch = async () => { throw Error("HTTP externo proibido no teste"); };
  const context = { module: { exports: {} }, __dirname: raiz, process: processo,
    URL, Headers, Response, AbortController, AbortSignal, global: { fetch: originalFetch },
    setTimeout(fn, ms) {
      let timer; timer = setTimeout(() => { timers.delete(timer); fn(); }, ms === 10000 ? 15 : 10);
      timers.add(timer); return timer;
    }, clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
  };
  const req = name => {
    imports.push(name);
    if (name === "node:fs") return fsFake;
    if (name === "node:path") return path;
    if (name === "./config/banco.cjs") return require("../config/banco.cjs");
    if (name === "dotenv") return { parse: require("dotenv").parse, config() { throw Error("dotenv.config proibido"); } };
    if (name === "./server.js") {
      appLoaded++; assert.equal(processo.env.JWT_SECRET, exclusivo); assert.equal(processo.env.DB_HOST, undefined);
      assert.equal(processo.env.DB_PORT, undefined); assert.equal(processo.env.PGHOST, undefined);
      assert.equal(processo.env.DB_PROVIDER, "supabase"); assert.equal(context.global.fetch === originalFetch, false);
      if (!op.appReal) return function backendNaoExecutado() {};
      const client = { schema() { throw Error("Consulta no startup proibida"); } };
      function factoryRequire(nome) {
        imports.push(nome);
        if (nome === "../db") throw Error("db.js proibido");
        if (nome === "../db-supabase.cjs") return { criarClienteSupabase(env) {
          assert.equal(env.JWT_SECRET, exclusivo); return client;
        } };
        if (nome === "../isolamento.cjs") return { modoExecucao: () => "principal" };
        return require(path.resolve(raiz, "repositories", nome));
      }
      const repoModule = { exports: {} };
      vm.runInNewContext(fs.readFileSync(path.join(raiz, "repositories/index.cjs"), "utf8"), {
        module: repoModule, process: processo, require: factoryRequire,
      });
      const appModule = { exports: {} };
      function appRequire(nome) {
        if (nome === "./homologacao.cjs") return context.module.exports;
        if (nome === "./repositories/index.cjs") return repoModule.exports;
        if (nome === "./config/banco.cjs") return { ...require("../config/banco.cjs"), validarInicializacaoBanco(...args) {
          validacoesNormais++; return require("../config/banco.cjs").validarInicializacaoBanco(...args);
        } };
        if (nome === "./isolamento.cjs") return { modoExecucao: () => "principal" };
        if (["express", "dotenv"].includes(nome)) return req(nome);
        if (["bcryptjs", "jsonwebtoken", "cors"].includes(nome)) return require(nome);
        return require(path.resolve(raiz, nome));
      }
      vm.runInNewContext(fs.readFileSync(path.join(raiz, "server.js"), "utf8"), {
        module: appModule, process: processo, Buffer, require: appRequire, console: { log() {}, error() {} },
      });
      req.cache[path.join(raiz, "server.js")] = appModule;
      return appModule.exports;
    }
    if (name === "express") {
      const express = () => {
        const app = { disable() {}, use(fn) { middleware.push(fn); }, listen(port, host, callback) {
      eventos.push(["listen", port, host]); ready = callback;
      if (op.listenThrow) throw Error("erro privado");
      if (op.ocupada) queueMicrotask(() => server.emit("error", Error("EADDRINUSE privado")));
      else if (!op.timeout) queueMicrotask(() => { server.listening = true; callback(); });
      return server;
        } };
        for (const method of ["get", "post", "put", "patch", "delete"]) app[method] = () => {};
        return app;
      };
      express.json = () => function jsonSimulado() {};
      return express;
    }
    throw Error("Importacao proibida: " + name);
  };
  req.main = { filename: op.foraInicializador ? path.join(raiz, "server.js") : path.join(raiz, "scripts/iniciar-homologacao-leitura.cjs") };
  req.cache = op.mysqlCarregado ? { [path.join(raiz, "node_modules/mysql2/index.js")]: {} } : {};
  context.require = req;
  vm.runInNewContext(fs.readFileSync(path.join(raiz, "homologacao.cjs"), "utf8"), context);
  return { api: context.module.exports, imports, middleware, eventos, processo, inicial, timers,
    appLoaded: () => appLoaded, validacoesNormais: () => validacoesNormais, restored: () => context.global.fetch === originalFetch,
    late() { server.listening = true; ready(); } };
}
test("inicializador: contexto autorizado, porta fixa e filtro montado antes do backend", async () => {
  const a = controlador();
  const controle = await a.api.iniciarHomologacao();
  assert.equal(a.api.confirmarEntrada(), true); assert.equal(a.appLoaded(), 1);
  assert.deepEqual(a.eventos[0], ["listen", 3111, "127.0.0.1"]);
  assert.equal(a.middleware[0], a.api.filtroLeitura);
  assert.equal(a.imports.some(p => /mysql|\.\/db$/.test(p)), false);
  assert.equal(a.processo.listenerCount("SIGINT"), 1);
  a.processo.env.JWT_SECRET = principal; assert.throws(() => a.api.confirmarEntrada());
  a.processo.env.JWT_SECRET = exclusivo;
  await controle.fechar(); await controle.fechar();
  assert.deepEqual(a.processo.env, a.inicial); assert.equal(a.restored(), true); assert.equal(a.timers.size, 0);
  assert.equal(a.processo.listenerCount("SIGINT"), 0); assert.equal(a.eventos.filter(e => e === "close").length, 1);
});
test("entrada autorizada carrega server.js e fabrica reais, sem dotenv.config, db.js ou consultas", async () => {
  const a = controlador({ appReal: true });
  const controle = await a.api.iniciarHomologacao();
  assert.equal(a.appLoaded(), 1); assert.equal(a.validacoesNormais(), 0);
  assert.equal(a.imports.includes("../db"), false);
  assert.equal(a.imports.some(n => n.includes("/mysql/")), false);
  assert.equal(a.imports.filter(n => n.startsWith("./supabase/")).length, 7);
  assert.equal(a.eventos.filter(e => Array.isArray(e) && e[0] === "listen").length, 1);
  await controle.fechar();
});
test("inicializador: entrada indevida, arquivo ausente, junction, JWT igual e referencia ausente sao recusados", async () => {
  for (const op of [{ foraInicializador: true }, { mysqlCarregado: true }, { ausente: true }, { junction: true },
    { patch: { JWT_SECRET: principal } }, { patch: { SUPABASE_URL: "https://outro.supabase.co" } }, { semPrincipal: true }]) {
    const a = controlador(op);
    await assert.rejects(a.api.iniciarHomologacao(), e => /^HOMOLOG_/.test(e.code));
    assert.equal(a.appLoaded(), 0); assert.equal(a.eventos.length, 0); assert.equal(a.timers.size, 0);
  }
  const a = controlador();
  await assert.rejects(a.api.iniciarHomologacao(path.join(raiz, "config.json")), e => e.code === "HOMOLOG_ARGS");
});
test("inicializador: porta ocupada, erro de listen e timeout liberam somente recursos proprios", async () => {
  for (const op of [{ ocupada: true }, { listenThrow: true }, { timeout: true }]) {
    const a = controlador(op);
    await assert.rejects(a.api.iniciarHomologacao(), e => e.code === "HOMOLOG_START");
    assert.deepEqual(a.processo.env, a.inicial); assert.equal(a.restored(), true); assert.equal(a.timers.size, 0);
    assert.equal(a.eventos.filter(e => Array.isArray(e) && e[0] === "listen").length, 1);
    if (op.timeout) { a.late(); assert.equal(a.eventos.at(-1), "close"); }
  }
});

test(".env: parse exclusivo nao altera ambiente nem usa credenciais principais ou herdadas", () => {
  const a = controlador({ herdado: { HOMOLOG_SUPABASE_URL: "https://herdado.invalid", HOMOLOG_JWT_SECRET: principal } });
  const cfg = a.api.carregarConfiguracao();
  assert.equal(cfg.SUPABASE_URL, config().SUPABASE_URL);
  assert.equal(cfg.SUPABASE_SECRET_KEY, config().SUPABASE_SECRET_KEY);
  assert.equal(cfg.JWT_SECRET, exclusivo);
  const jwt = require("jsonwebtoken");
  const legado = jwt.sign({ id: 7, perfil: "organizador" }, principal, { algorithm: "HS256" });
  assert.throws(() => jwt.verify(legado, cfg.JWT_SECRET, { algorithms: ["HS256"] }), /invalid signature/);
  const novo = jwt.sign({ id: 7 }, cfg.JWT_SECRET, { algorithm: "HS256" });
  assert.equal(jwt.verify(novo, cfg.JWT_SECRET, { algorithms: ["HS256"] }).id, 7);
  assert.deepEqual(a.processo.env, a.inicial);
  assert.equal(a.appLoaded(), 0); assert.deepEqual(a.eventos, []);
  assert.throws(() => a.api.carregarConfiguracao("outro.env"), e => e.code === "HOMOLOG_ARGS");
});

test(".env: campos exclusivos ausentes ou vazios recusam fallback e nao vazam segredos", () => {
  for (const campo of ["HOMOLOG_SUPABASE_URL", "HOMOLOG_SUPABASE_SECRET_KEY", "HOMOLOG_JWT_SECRET"]) {
    for (const valor of [undefined, ""]) {
      const a = controlador({ env: { [campo]: valor }, herdado: {
        [campo]: config()[campo.slice("HOMOLOG_".length)],
      } });
      assert.throws(() => a.api.carregarConfiguracao(), e => {
        assert.doesNotMatch(e.message, /sb_secret_|ABCDEFGHIJKLMNOPQRSTUVWXYZ|mysql\.invalid/);
        return true;
      });
      assert.deepEqual(a.processo.env, a.inicial); assert.equal(a.appLoaded(), 0);
    }
  }
});

test(".env: JWT exclusivo difere de ambas referencias e variaveis herdadas sao restauradas", async () => {
  for (const op of [{ herdado: { JWT_SECRET: exclusivo } }, { env: { JWT_SECRET: exclusivo } }]) {
    const a = controlador(op);
    assert.throws(() => a.api.carregarConfiguracao());
    assert.deepEqual(a.processo.env, a.inicial);
  }
  const a = controlador({ herdado: { HOMOLOG_JWT_SECRET: "nao_reutilizar", SUPABASE_SECRET_KEY: "nao_reutilizar" } });
  const controle = await a.api.iniciarHomologacao();
  assert.equal(a.processo.env.JWT_SECRET, exclusivo);
  assert.equal(a.processo.env.HOMOLOG_JWT_SECRET, undefined);
  assert.equal(a.processo.env.SUPABASE_SECRET_KEY, config().SUPABASE_SECRET_KEY);
  await controle.fechar(); assert.deepEqual(a.processo.env, a.inicial);
});

test(".env: variaveis de homologacao nao mudam MySQL padrao nem liberam Supabase normal", () => {
  const env = { HOMOLOG_SUPABASE_URL: config().SUPABASE_URL,
    HOMOLOG_SUPABASE_SECRET_KEY: config().SUPABASE_SECRET_KEY, HOMOLOG_JWT_SECRET: exclusivo };
  const { validarInicializacaoBanco } = require("../config/banco.cjs");
  assert.deepEqual(validarInicializacaoBanco(env), { provider: "mysql" });
  assert.throws(() => validarInicializacaoBanco({ ...env, DB_PROVIDER: "supabase",
    SUPABASE_URL: config().SUPABASE_URL, SUPABASE_SECRET_KEY: config().SUPABASE_SECRET_KEY }),
  e => e.code === "DB_PROVIDER_NOT_IMPLEMENTED");
});
