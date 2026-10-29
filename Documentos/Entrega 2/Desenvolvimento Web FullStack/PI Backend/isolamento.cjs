"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { randomBytes } = require("node:crypto");

const ESPERADO = Object.freeze({
  host: "127.0.0.1", port: 3307, database: "trocaticket",
  user: "trocaticket_isolado",
  datadir: "C:\\Users\\Lucas\\MariaDBTest\\TrocaTicket\\data",
  version: "10.4.32",
  pidFile: "C:\\Users\\Lucas\\MariaDBTest\\TrocaTicket\\run\\mariadb-test.pid",
  httpHost: "127.0.0.1", httpPort: 3107,
});
const ARQUIVO_CONFIG = "C:\\Users\\Lucas\\MariaDBTest\\TrocaTicket\\backend-isolado.json";
const SQL_IDENTIDADE = `SELECT @@port AS porta, @@datadir AS diretorio,
  DATABASE() AS banco, VERSION() AS versao, @@pid_file AS arquivo_pid,
  @@bind_address AS endereco, CONNECTION_ID() AS conexao_id, CURRENT_USER() AS usuario`;
const TEMPO_MS = 5000;
let contexto = null;
let inicializado = false;

function falha(code) {
  const erro = new Error("Operacao do backend isolado recusada.");
  erro.code = code;
  return erro;
}

function sanitizar(erro) {
  const permitidos = new Set([
    "ER_DUP_ENTRY", "ER_NO_REFERENCED_ROW_2", "ER_ROW_IS_REFERENCED_2",
    "ER_LOCK_WAIT_TIMEOUT", "ER_LOCK_DEADLOCK", "ECONNREFUSED", "ETIMEDOUT", "EADDRINUSE",
    "ISOLATED_CONFIG", "ISOLATED_ENV", "ISOLATED_ENTRY", "ISOLATED_IDENTITY",
    "ISOLATED_TIMEOUT", "ISOLATED_CLOSED", "ISOLATED_BUSY", "ISOLATED_DB_ERROR",
  ]);
  return falha(permitidos.has(erro?.code) ? erro.code : "ISOLATED_DB_ERROR");
}

function normalizar(caminho) {
  if (typeof caminho !== "string" || !path.win32.isAbsolute(caminho)) throw falha("ISOLATED_IDENTITY");
  return path.win32.normalize(caminho).replace(/[\\/]+$/u, "").toLowerCase();
}

function validarConfiguracao(config) {
  const chaves = [...Object.keys(ESPERADO), "password"];
  if (!config || typeof config !== "object" || Array.isArray(config) ||
      Object.keys(config).length !== chaves.length ||
      !chaves.every(chave => Object.hasOwn(config, chave)) ||
      !Object.entries(ESPERADO).every(([chave, valor]) => config[chave] === valor) ||
      typeof config.password !== "string" || config.password.length < 16 ||
      config.password.length > 256 || !config.password.trim() || config.password.includes("\0")) {
    throw falha("ISOLATED_CONFIG");
  }
  return Object.freeze({ ...config });
}

function validarAmbiente(env) {
  if (Object.keys(env).some(chave =>
    /^(?:DB_|DOTENV_)/iu.test(chave) || ["PORT", "JWT_SECRET", "NODE_OPTIONS", "NODE_PATH"].includes(chave.toUpperCase())) ||
    (env.TROCATICKET_AMBIENTE !== undefined && env.TROCATICKET_AMBIENTE !== "isolado")) {
    throw falha("ISOLATED_ENV");
  }
}

function comPrazo(acao, ms, cancelar = () => {}) {
  return new Promise((resolve, reject) => {
    let terminou = false;
    const timer = setTimeout(() => {
      if (terminou) return;
      terminou = true;
      try { cancelar(); } catch { /* cancelamento nao pode vazar erros de infraestrutura */ }
      reject(falha("ISOLATED_TIMEOUT"));
    }, ms);
    Promise.resolve().then(acao).then(valor => {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      resolve(valor);
    }, erro => {
      if (terminou) return;
      terminou = true;
      clearTimeout(timer);
      reject(sanitizar(erro));
    });
  });
}

async function consultarProcesso(signal) {
  // Somente leitura do listener/PID; nunca encerra processos ou servicos.
  const comando = "$ErrorActionPreference='Stop'; " +
    "$itens=@(Get-NetTCPConnection -State Listen -LocalPort 3307); " +
    "if($itens.Count -ne 1 -or $itens[0].LocalAddress -ne '127.0.0.1'){throw 'IDENTITY'}; " +
    "$idBanco=[int]$itens[0].OwningProcess; $banco=Get-Process -Id $idBanco; " +
    "[pscustomobject]@{pid=$idBanco;nome=$banco.ProcessName}|ConvertTo-Json -Compress";
  const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", comando], {
    windowsHide: true, timeout: TEMPO_MS, maxBuffer: 16384, signal,
  });
  return JSON.parse(stdout);
}

async function validarIdentidade(conexao, promessa, config, deps, signal) {
  signal.throwIfAborted();
  const [linhas] = await promessa.query(SQL_IDENTIDADE);
  signal.throwIfAborted();
  const id = Array.isArray(linhas) && linhas.length === 1 ? linhas[0] : null;
  if (!id || id.porta !== 3307 || id.banco !== "trocaticket" || id.endereco !== "127.0.0.1" ||
      typeof id.versao !== "string" || !/^10\.4\.32-MariaDB(?:$|[-+])/u.test(id.versao) ||
      normalizar(id.diretorio) !== normalizar(config.datadir) ||
      normalizar(id.arquivo_pid) !== normalizar(config.pidFile) ||
      !Number.isSafeInteger(id.conexao_id) || id.conexao_id <= 0 || id.conexao_id !== conexao.threadId ||
      ![`${config.user}@localhost`, `${config.user}@127.0.0.1`].includes(id.usuario)) {
    throw falha("ISOLATED_IDENTITY");
  }
  // A comparacao canonica tambem recusa junctions que redirecionem para o XAMPP.
  for (const caminho of [config.datadir, config.pidFile]) {
    signal.throwIfAborted();
    if (normalizar(await deps.realpath(caminho)) !== normalizar(caminho)) throw falha("ISOLATED_IDENTITY");
  }
  signal.throwIfAborted();
  const textoPid = (await deps.readFile(config.pidFile, { encoding: "utf8", signal })).trim();
  signal.throwIfAborted();
  const processo = await deps.consultarProcesso(signal);
  signal.throwIfAborted();
  if (!/^[1-9]\d*$/u.test(textoPid) || !Number.isSafeInteger(Number(textoPid)) ||
      processo.pid !== Number(textoPid) || !["mysqld", "mariadbd"].includes(processo.nome?.toLowerCase())) {
    throw falha("ISOLATED_IDENTITY");
  }
}

function criarAdaptadorProtegido(entrada, dependencias = {}) {
  const config = validarConfiguracao(entrada);
  const deps = {
    criarConexao: opcoes => require("mysql2").createConnection(opcoes),
    realpath: fs.realpath, readFile: fs.readFile, consultarProcesso,
    tempoMs: TEMPO_MS, aoFalhar: () => {}, ...dependencias,
  };
  const unidades = new Set();
  const aguardando = new Set();
  let fechado = false;
  let encerramento;

  function destruir(unidade) {
    if (unidade.liberada) return;
    unidade.liberada = true;
    unidade.abortador.abort();
    try { unidade.raw.destroy(); } catch { /* recurso proprio ja encerrado */ }
    unidades.delete(unidade);
    if (unidades.size === 0) for (const resolver of aguardando) resolver();
  }

  async function getConnection() {
    if (fechado) throw falha("ISOLATED_CLOSED");
    if (unidades.size >= 10) throw falha("ISOLATED_BUSY");
    let unidade;
    try {
      const raw = deps.criarConexao({
        host: config.host, port: config.port, user: config.user,
        password: config.password, database: config.database,
        connectTimeout: TEMPO_MS, multipleStatements: false, flags: ["-LOCAL_FILES"],
      });
      unidade = { raw, liberada: false, ocupada: false, abortador: new AbortController() };
      unidades.add(unidade);
      raw.on("error", () => {
        if (unidade.liberada) return;
        fechado = true;
        for (const ativa of unidades) destruir(ativa);
        try { deps.aoFalhar(); } catch { /* falha fechada */ }
      });
      const promessa = raw.promise();
      // A conexao fisica fica disponivel para cancelamento antes de qualquer await.
      await comPrazo(async () => {
        await new Promise((resolve, reject) => raw.connect(erro => erro ? reject(erro) : resolve()));
        unidade.abortador.signal.throwIfAborted();
        await validarIdentidade(raw, promessa, config, deps, unidade.abortador.signal);
      }, deps.tempoMs, () => destruir(unidade));
      if (fechado || unidade.liberada) throw falha("ISOLATED_CLOSED");

      async function operar(metodo, args) {
        if (fechado || unidade.liberada) throw falha("ISOLATED_CLOSED");
        if (unidade.ocupada) throw falha("ISOLATED_BUSY");
        unidade.ocupada = true;
        try {
          const resultado = await comPrazo(() => promessa[metodo](...args), deps.tempoMs, () => destruir(unidade));
          if (unidade.liberada) throw falha("ISOLATED_CLOSED");
          return resultado;
        } finally {
          unidade.ocupada = false;
        }
      }

      return Object.freeze({
        query: (...args) => operar("query", args),
        execute: (...args) => operar("execute", args),
        beginTransaction: () => operar("beginTransaction", []),
        commit: () => operar("commit", []),
        rollback: () => operar("rollback", []),
        // Sem reutilizacao nesta etapa: fechar a propria sessao evita estado residual.
        release: () => destruir(unidade),
      });
    } catch (erro) {
      if (unidade) destruir(unidade);
      // Nao continua operando depois de falha de verificacao, mesmo apos o startup.
      fechado = true;
      for (const ativa of unidades) destruir(ativa);
      try { deps.aoFalhar(); } catch { /* falha fechada */ }
      throw sanitizar(erro);
    }
  }

  async function executar(metodo, args) {
    const conexao = await getConnection();
    try { return await conexao[metodo](...args); }
    finally { conexao.release(); }
  }

  function end() {
    if (encerramento) return encerramento;
    fechado = true;
    encerramento = comPrazo(() => unidades.size === 0 ? undefined :
      new Promise(resolve => aguardando.add(resolve)), deps.tempoMs,
    () => { for (const ativa of unidades) destruir(ativa); }).finally(() => aguardando.clear());
    return encerramento;
  }

  return Object.freeze({
    query: (...args) => executar("query", args),
    execute: (...args) => executar("execute", args),
    getConnection, end,
  });
}

function modoExecucao() {
  const modo = process.env.TROCATICKET_AMBIENTE;
  if (modo === undefined || modo === "principal") {
    if (contexto) throw falha("ISOLATED_ENV");
    if (Number(process.env.PORT) === 3107 || Number(process.env.DB_PORT) === 3307) throw falha("ISOLATED_ENTRY");
    return "principal";
  }
  if (modo !== "isolado" || !contexto || process.env.JWT_SECRET !== contexto.jwt || process.env.PORT !== "3107") {
    throw falha("ISOLATED_ENTRY");
  }
  return "isolado";
}

function obterBancoIsolado() {
  if (modoExecucao() !== "isolado") throw falha("ISOLATED_ENTRY");
  return contexto.db;
}

async function carregarConfiguracao(arquivo, dependencias = {}) {
  const deps = { realpath: fs.realpath, readFile: fs.readFile, tempoMs: TEMPO_MS, ...dependencias };
  const abortador = new AbortController();
  try {
    return await comPrazo(async () => {
      if (normalizar(arquivo) !== normalizar(ARQUIVO_CONFIG) ||
          normalizar(await deps.realpath(arquivo)) !== normalizar(ARQUIVO_CONFIG)) throw falha("ISOLATED_CONFIG");
      abortador.signal.throwIfAborted();
      const texto = await deps.readFile(arquivo, { encoding: "utf8", signal: abortador.signal });
      abortador.signal.throwIfAborted();
      if (texto.length > 16384) throw falha("ISOLATED_CONFIG");
      return validarConfiguracao(JSON.parse(texto));
    }, deps.tempoMs, () => abortador.abort());
  } catch { throw falha("ISOLATED_CONFIG"); }
}

async function iniciarBackendIsolado(entrada, dependencias = {}) {
  const deps = {
    autorizado: () => require.main?.filename === path.join(__dirname, "scripts", "iniciar-backend-isolado.cjs"),
    carregarApp: () => require("./server"),
    gerarJwt: () => randomBytes(32).toString("hex"),
    eventos: process, tempoMs: TEMPO_MS, ...dependencias,
  };
  if (!deps.autorizado() || contexto || inicializado) throw falha("ISOLATED_ENTRY");
  validarAmbiente(process.env);
  const config = validarConfiguracao(entrada);
  const jwt = deps.gerarJwt();
  if (typeof jwt !== "string" || !/^[a-f0-9]{64}$/u.test(jwt)) throw falha("ISOLATED_CONFIG");
  inicializado = true; // Um processo/entrypoint por execucao; impede startup concorrente e app em cache.
  let servidor;
  let fechando;
  let pronto = false;
  let escutaCancelada = false;
  const anteriores = Object.fromEntries(["TROCATICKET_AMBIENTE", "JWT_SECRET", "PORT"].map(chave => [chave, process.env[chave]]));
  const db = criarAdaptadorProtegido(config, {
    ...deps.banco, aoFalhar: () => { if (pronto) void encerrar().catch(() => {}); },
  });

  function restaurar() {
    contexto = null;
    for (const [chave, valor] of Object.entries(anteriores)) {
      if (valor === undefined) delete process.env[chave];
      else process.env[chave] = valor;
    }
  }

  function sinal() { void encerrar().catch(() => { process.exitCode = 1; }); }

  function encerrar() {
    if (fechando) return fechando;
    fechando = (async () => {
      deps.eventos.removeListener("SIGINT", sinal);
      deps.eventos.removeListener("SIGTERM", sinal);
      try {
        if (servidor?.listening) {
          await comPrazo(() => new Promise((resolve, reject) => {
            servidor.close(erro => erro ? reject(erro) : resolve());
            servidor.closeIdleConnections?.();
          }), deps.tempoMs, () => servidor.closeAllConnections?.());
        }
      } finally {
        try { await db.end(); } finally { restaurar(); }
      }
    })();
    return fechando;
  }

  try {
    const teste = await db.getConnection();
    teste.release();
    contexto = { db, jwt };
    process.env.TROCATICKET_AMBIENTE = "isolado";
    process.env.JWT_SECRET = jwt;
    process.env.PORT = "3107";
    const app = deps.carregarApp();
    await comPrazo(() => new Promise((resolve, reject) => {
      servidor = app.listen(config.httpPort, config.httpHost);
      servidor.on("error", erro => {
        if (!pronto) reject(erro);
        else void encerrar().catch(() => { process.exitCode = 1; });
      });
      servidor.once("listening", () => {
        if (escutaCancelada) {
          servidor.close(() => {});
          servidor.closeAllConnections?.();
        } else resolve();
      });
    }), deps.tempoMs, () => {
      escutaCancelada = true;
      servidor?.close(() => {});
    });
    pronto = true;
    deps.eventos.on("SIGINT", sinal);
    deps.eventos.on("SIGTERM", sinal);
    return Object.freeze({ encerrar });
  } catch (erro) {
    try { await encerrar(); } catch { /* erro original sanitizado abaixo */ }
    throw sanitizar(erro);
  }
}

module.exports = {
  ESPERADO, ARQUIVO_CONFIG, SQL_IDENTIDADE, validarConfiguracao, validarAmbiente,
  carregarConfiguracao, criarAdaptadorProtegido, modoExecucao, obterBancoIsolado,
  iniciarBackendIsolado, sanitizar,
};
