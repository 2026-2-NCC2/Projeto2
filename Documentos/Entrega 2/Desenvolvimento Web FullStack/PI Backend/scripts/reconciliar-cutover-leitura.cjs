"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const assert = require("node:assert/strict");
const TABLES = ["usuarios", "eventos", "custos_evento", "cotacoes", "itens_cotacao", "propostas", "inscricoes", "solicitacoes_acesso"];
const FKS = { eventos: { usuario_id: "usuarios" }, custos_evento: { evento_id: "eventos" }, cotacoes: { evento_id: "eventos" },
  itens_cotacao: { cotacao_id: "cotacoes" }, propostas: { cotacao_id: "cotacoes", fornecedor_id: "usuarios" },
  inscricoes: { usuario_id: "usuarios", evento_id: "eventos" }, solicitacoes_acesso: { usuario_id: "usuarios" } };
function lerDump(sql, mysql = false) {
  const out = Object.fromEntries(TABLES.map(t => [t, []]));
  const columns = {};
  const re = /INSERT\s+INTO\s+(?:public\.)?[`"]?([a-z_]+)[`"]?\s*\(([^)]+)\)\s*VALUES/gi;
  let m;
  while ((m = re.exec(sql))) {
    assert.ok(TABLES.includes(m[1]), "Tabela conhecida");
    const cols = m[2].replace(/[`"\s]/g, "").split(","); columns[m[1]] = cols;
    let i = re.lastIndex;
    const space = () => { while (/\s/.test(sql[i] ?? "") && i < sql.length) i++; };
    const value = () => {
      space();
      if (sql[i] === "'") {
        i++; let v = "";
        while (i < sql.length) {
          const c = sql[i++];
          if (c === "'") { if (sql[i] === "'") { v += "'"; i++; } else return v; }
          else if (c === "\\" && mysql) {
            const e = sql[i++]; v += ({ "0": "\0", b: "\b", n: "\n", r: "\r", t: "\t", Z: "\x1a" })[e] ?? e;
          } else v += c;
        }
        throw Error("DUMP_LITERAL_INCOMPLETO");
      }
      const start = i; while (i < sql.length && !/[,)]/.test(sql[i])) i++;
      const v = sql.slice(start, i).trim();
      if (v === "NULL") return null;
      assert.match(v, /^-?\d+(?:\.\d+)?$/, "Literal numerico/NULL suportado"); return v;
    };
    for (;;) {
      space(); assert.equal(sql[i++], "(", "Inicio de tupla");
      const row = {};
      for (let j = 0; j < cols.length; j++) { row[cols[j]] = value(); space(); assert.equal(sql[i++], j === cols.length - 1 ? ")" : ",", "Separador de tupla"); }
      out[m[1]].push(row); space();
      if (sql[i] === ";") { i++; break; }
      assert.equal(sql[i++], ",", "Proxima tupla");
    }
    re.lastIndex = i;
  }
  assert.equal(Object.keys(columns).length, 8, "Oito tabelas no dump"); return { rows: out, columns };
}
const email = r => String(r.email).trim().toLowerCase();
function normal(field, value) {
  if (value === null || value === undefined) return value;
  if (field === "valor" || field === "valor_estimado") {
    const text = String(value); assert.match(text, /^-?\d+(?:\.\d{1,2})?$/);
    const [a, b = ""] = text.replace(/^-/, "").split("."), integer = BigInt(a).toString(), fraction = b.padEnd(2, "0");
    const negative = text.startsWith("-") && (integer !== "0" || fraction !== "00");
    return (negative ? "-" : "") + integer + "." + fraction;
  }
  // Componentes de calendario apenas; nao inferir fuso de DATETIME MySQL.
  if (["criada_em", "data_inscricao"].includes(field)) return String(value).replace("T", " ").replace(/(?:Z|\+00(?::00)?)$/, "").replace(/\.0+$/, "");
  return String(value);
}
function comparar(a, b) {
  const result = {};
  for (const table of TABLES) {
    const x = new Map(a[table].map(r => [String(r.id), r])), y = new Map(b[table].map(r => [String(r.id), r]));
    assert.equal(x.size, a[table].length); assert.equal(y.size, b[table].length);
    const fields = {}, changed = [];
    for (const [id, row] of x) if (y.has(id)) {
      const dif = Object.keys(row).filter(k => normal(k, row[k]) !== normal(k, y.get(id)[k]));
      if (dif.length) { changed.push(id); for (const k of dif) fields[k] = (fields[k] ?? 0) + 1; }
    }
    result[table] = { origem: x.size, destino: y.size, ausentesDestino: [...x.keys()].filter(id => !y.has(id)),
      extrasDestino: [...y.keys()].filter(id => !x.has(id)), idsDivergentes: changed, camposDivergentes: fields };
  }
  return result;
}
function identidades(a, b) {
  const targetId = new Map(b.usuarios.map(r => [String(r.id), r]));
  const byEmail = new Map(); for (const r of b.usuarios) { const key = email(r); byEmail.set(key, [...(byEmail.get(key) ?? []), r]); }
  const collisions = [], remaps = [], missing = []; let same = 0, hashesDivergentes = 0, perfisDivergentes = 0;
  for (const r of a.usuarios) {
    const id = String(r.id), t = targetId.get(id), matches = byEmail.get(email(r)) ?? [];
    if (t && email(t) !== email(r)) collisions.push(id);
    if (!matches.length) missing.push(id);
    else if (matches.length === 1) {
      if (String(matches[0].id) !== id) remaps.push({ origem: id, destino: String(matches[0].id) }); else same++;
      if (r.senha !== matches[0].senha) hashesDivergentes++;
      if (r.perfil !== matches[0].perfil) perfisDivergentes++;
    }
  }
  return { mesmoIdEEmail: same, idsComOutraIdentidade: collisions, mesmoEmailIdDiferente: remaps, identidadesAusentes: missing,
    hashesDivergentes, perfisDivergentes, emailsDuplicadosDestino: [...byEmail.values()].filter(v => v.length > 1).length };
}
function integridade(rows) {
  const ids = Object.fromEntries(TABLES.map(t => [t, new Set(rows[t].map(r => String(r.id)))]));
  return Object.fromEntries(Object.entries(FKS).map(([table, fields]) => [table, Object.fromEntries(Object.entries(fields)
    .map(([col, parent]) => [col, rows[table].filter(r => r[col] !== null && !ids[parent].has(String(r[col]))).length]))]));
}
function classificarAdicionais(imported, source, target, testEmails = [], evidence = {}) {
  const sourceById = Object.fromEntries(TABLES.map(t => [t, new Map((source?.[t] ?? []).map(r => [String(r.id), r]))]));
  const targetById = Object.fromEntries(TABLES.map(t => [t, new Map(target[t].map(r => [String(r.id), r]))]));
  const normalizedTestEmails = new Set(testEmails.filter(Boolean).map(v => String(v).trim().toLowerCase()));
  const fixtureEventIds = new Set(Object.keys(evidence).filter(k => k.startsWith("eventos:")).map(k => k.split(":")[1]));
  function eventoRelacionado(table, row) {
    if (table === "eventos") return String(row.id);
    if (["custos_evento", "cotacoes", "inscricoes"].includes(table)) return String(row.evento_id);
    if (["itens_cotacao", "propostas"].includes(table)) return String(targetById.cotacoes.get(String(row.cotacao_id))?.evento_id);
    return undefined;
  }
  const result = [];
  for (const table of TABLES) {
    const historical = new Set(imported[table].map(r => String(r.id)));
    for (const row of target[table].filter(r => !historical.has(String(r.id)))) {
      const id = String(row.id), original = sourceById[table].get(id);
      const fields = original ? Object.keys(original).filter(k => normal(k, original[k]) !== normal(k, row[k])) : [];
      let origem = source ? original ? fields.length ? "MESMO_ID_DIVERGENTE_DA_ORIGEM_ATUAL" : "TAMBEM_PRESENTE_NA_ORIGEM_ATUAL" : "APENAS_NO_DESTINO_ATUAL" : "ORIGEM_ATUAL_NAO_CONFERIDA";
      if (table === "usuarios" && original && email(original) !== email(row)) origem = "COLISAO_DE_IDENTIDADE";
      const contaTesteConfigurada = table === "usuarios" && normalizedTestEmails.has(email(row));
      const evento = eventoRelacionado(table, row);
      const vinculos = Object.entries(FKS[table] ?? {}).map(([column, parent]) => ({ campo: column, tabela: parent, id: String(row[column]),
        existeDestino: targetById[parent].has(String(row[column])), existeOrigemAtual: source ? sourceById[parent].has(String(row[column])) : null }));
      const marcadorTeste = [row.nome, row.descricao, row.observacoes, row.detalhes_tecnicos, row.justificativa]
        .some(v => typeof v === "string" && /(?:\btest(?:e)?\b|homolog|descart|fixture|tt[-_ ])/i.test(v));
      const finalidade = contaTesteConfigurada ? "CONTA_DE_TESTE_DECLARADA_NO_ENV" : evidence[table + ":" + id] ? "FIXTURE_CONFIRMADA_POR_EVIDENCIA_LOCAL"
        : evento && fixtureEventIds.has(evento) ? "VINCULADO_A_EVENTO_DE_TESTE_CONFIRMADO" : marcadorTeste ? "INDICIO_TEXTUAL_DE_TESTE_NAO_CONCLUSIVO" : "FINALIDADE_NAO_COMPROVADA";
      result.push({ tabela: table, id, origem, finalidade, camposDivergentesDaOrigemAtual: fields, contaTesteConfigurada,
        evidencia: evidence[table + ":" + id], eventoRelacionado: evento, vinculos, marcadorTeste,
        decisao: "PRESERVAR_SEM_ALTERACAO_ATE_DECISAO_EXPLICITA" });
    }
  }
  return result;
}
function conferirIdentidadeRelacionada(source, target) {
  const a = new Map(source.usuarios.map(r => [String(r.id), r])), b = new Map(target.usuarios.map(r => [String(r.id), r]));
  const result = {};
  for (const [table, fields] of Object.entries(FKS)) for (const [col, parent] of Object.entries(fields)) if (parent === "usuarios") {
    const rows = new Map(target[table].map(r => [String(r.id), r]));
    result[table + "." + col] = source[table].filter(r => {
      const t = rows.get(String(r.id)); if (!t) return false;
      const x = a.get(String(r[col])), y = b.get(String(t[col]));
      return !x || !y || email(x) !== email(y);
    }).map(r => String(r.id));
  }
  return result;
}
function compararInstantes(epochs, target) {
  const report = {};
  for (const [table, columns] of Object.entries(epochs)) {
    const targetRows = new Map(target[table].map(r => [String(r.id), r]));
    for (const [column, entries] of Object.entries(columns)) {
      const item = { comparados: 0, idsDivergentes: [], diferencasMilissegundos: {}, idsSemPrecisaoComparavel: [] };
      for (const [id, epoch] of Object.entries(entries)) {
        const row = targetRows.get(id); if (!row || epoch === null || row[column] === null) continue;
        const raw = String(epoch), ms = Number(epoch) * 1000, destination = Date.parse(row[column]);
        if (!Number.isFinite(ms) || !Number.isFinite(destination) || !/(?:Z|[+-]\d\d:\d\d)$/.test(row[column]) || /\.\d{3}\d*[1-9]\d*$/.test(raw)) {
          item.idsSemPrecisaoComparavel.push(id); continue;
        }
        item.comparados++;
        const delta = destination - ms;
        if (delta !== 0) { item.idsDivergentes.push(id); item.diferencasMilissegundos[delta] = (item.diferencasMilissegundos[delta] ?? 0) + 1; }
      }
      report[table + "." + column] = item;
    }
  }
  return report;
}
function evidenciasFixtures(dir) {
  const result = {};
  const files = [
    ["eventos", "testEventId", "eventos-publicar-https-45ad5fa7-6424-4ae7-bf86-33cdb34caa00.json"],
    ["usuarios", "testUserId", "usuarios-criar-https-4313ea84-e760-4889-8f1f-bb90e0fb416c.json"],
    ["propostas", "proposalId", "propostas-criar-https-0a151341-304a-4d00-a4f8-b56dd410e365.json"],
    ["solicitacoes_acesso", "requestId", "solicitacoes-acesso-criar-https-1bfdce4d-7349-43f2-b93a-b5368522cdde.json"],
  ];
  for (const [table, field, name] of files) {
    const file = path.join(dir, name); if (!fs.existsSync(file)) continue;
    const e = JSON.parse(fs.readFileSync(file, "utf8"));
    if (e.status === "PASS" && e.insertAttempts === 1 && e.projectOriginVerified === true && e.projectHeaderVerified === true && Number.isSafeInteger(e[field]))
      result[table + ":" + e[field]] = name;
  }
  return result;
}
async function lerMysql(env) {
  if (!["DB_HOST", "DB_USER", "DB_NAME"].every(k => typeof env[k] === "string" && env[k].trim()) || !Object.hasOwn(env, "DB_PASSWORD")) return null;
  const mysql = require("mysql2/promise");
  const connection = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD,
    database: env.DB_NAME, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, connectTimeout: 10000, multipleStatements: false });
  try {
    const [[context]] = await connection.query("SELECT DATABASE() AS banco, @@port AS porta, @@session.time_zone AS fuso_sessao, @@global.time_zone AS fuso_global, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offset_minutos");
    assert.equal(context.banco, env.DB_NAME);
    const [tables] = await connection.execute("SELECT TABLE_NAME AS nome, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?,?,?,?,?,?,?,?)", TABLES);
    assert.equal(tables.length, 8); assert.ok(tables.every(t => t.engine === "InnoDB"));
    const [temporal] = await connection.execute("SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna, DATA_TYPE AS tipo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?,?,?,?,?,?,?,?) AND COLUMN_NAME IN ('criada_em','data_inscricao')", TABLES);
    await connection.query("SET TRANSACTION READ ONLY"); await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const rows = {}, epochs = {};
    for (const table of TABLES) {
      const fields = temporal.filter(c => c.tabela === table && c.tipo === "timestamp").map(c => c.coluna);
      assert.ok(fields.every(c => ["criada_em", "data_inscricao"].includes(c)));
      const aliases = fields.map(c => ", UNIX_TIMESTAMP(`" + c + "`) AS `__epoch_" + c + "`").join("");
      const [data] = await connection.query("SELECT *" + aliases + " FROM `" + table + "` ORDER BY id");
      rows[table] = data; epochs[table] = {};
      for (const column of fields) {
        epochs[table][column] = {};
        for (const row of data) { epochs[table][column][String(row.id)] = row["__epoch_" + column]; delete row["__epoch_" + column]; }
      }
    }
    return { rows, epochs, context: { bancoEsperado: true, porta: context.porta, fusoSessao: context.fuso_sessao, fusoGlobal: context.fuso_global,
      offsetAtualMinutos: context.offset_minutos, colunasTemporais: temporal, snapshot: "InnoDB READ ONLY consistente" } };
  } finally { try { await connection.rollback(); } finally { await connection.end(); } }
}
async function lerSupabase(config, columns) {
  const rows = {};
  for (const table of TABLES) {
    rows[table] = []; let total;
    for (let offset = 0; offset <= 100000; offset += 1000) {
      const url = new URL(config.SUPABASE_URL + "/rest/v1/" + table);
      url.searchParams.set("select", columns[table].join(",")); url.searchParams.set("order", "id.asc");
      const response = await fetch(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(15000), headers: {
        apikey: config.SUPABASE_SECRET_KEY, authorization: "Bearer " + config.SUPABASE_SECRET_KEY, "accept-profile": "public", Prefer: "count=exact",
        "Range-Unit": "items", Range: offset + "-" + (offset + 999) } });
      assert.ok(response.ok && response.headers.get("sb-project-ref") === config.projectRef, "Projeto/HTTP confirmados");
      const count = Number(response.headers.get("content-range")?.split("/")[1]);
      assert.ok(Number.isSafeInteger(count) && count >= 0 && count <= 100000);
      if (total === undefined) total = count; else assert.equal(count, total, "Contagem mudou durante pagina");
      const page = await response.json(); assert.ok(Array.isArray(page)); rows[table].push(...page);
      if (rows[table].length === total) break;
      assert.equal(page.length, 1000, "Pagina parcial inesperada");
    }
    assert.equal(rows[table].length, total);
  }
  return rows;
}
async function executar() {
  assert.deepEqual(process.argv.slice(2), ["--somente-leitura"]);
  const root = path.resolve(__dirname, "../.."), sourceFile = path.join(root, "Banco de dados/trocaticket.sql"), targetFile = path.join(root, "Banco de dados/trocaticket_supabase.sql");
  const sourceText = fs.readFileSync(sourceFile, "utf8"), targetText = fs.readFileSync(targetFile, "utf8");
  const source = lerDump(sourceText, true), imported = lerDump(targetText);
  const report = { inicio: new Date().toISOString(), writes: 0, status: "LEITURA_EM_ANDAMENTO", sourceSnapshotCertifiedCurrent: false,
    snapshotMysqlSHA256: crypto.createHash("sha256").update(sourceText).digest("hex"), snapshotImportacaoSHA256: crypto.createHash("sha256").update(targetText).digest("hex"),
    dumps: comparar(source.rows, imported.rows), identidadesDumps: identidades(source.rows, imported.rows),
    limitacoes: ["Dumps sao referencia historica; nao certificam a origem atual.", "Snapshots MySQL e REST nao sao atomicos entre provedores.", "Comparacao temporal e de componentes; fuso/instantes precisam de validacao explicita.", "Hashes bcrypt comparados apenas em memoria; diferenca nao prova mudanca da senha em texto.", "Nao foi identificada reconciliacao integral anterior certificada para datar o delta."] };
  const dir = path.join(root, "PI Backend/evidencias"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "cutover-reconciliacao-" + crypto.randomUUID() + ".json");
  try {
    const env = require("dotenv").parse(fs.readFileSync(path.join(root, "PI Backend/.env"), "utf8"));
    report.etapa = "MYSQL_READ_ONLY";
    const atual = await lerMysql(env);
    report.origemAtualDisponivel = !!atual;
    report.origemAtualLidaEmSnapshotConsistente = !!atual;
    report.certificacaoCutoverFinal = false;
    report.timezoneDumpMysql = sourceText.match(/SET\s+time_zone\s*=\s*["']([^"']+)["']/i)?.[1];
    if (atual) { report.contextoOrigem = atual.context; report.origemAtualVsDump = comparar(source.rows, atual.rows); }
    const config = require("../homologacao.cjs").carregarConfiguracao();
    report.etapa = "SUPABASE_GET";
    const destino = await lerSupabase(config, source.columns); report.projectRef = config.projectRef;
    report.destinoVsImportacao = comparar(imported.rows, destino); report.identidadesVsImportacao = identidades(imported.rows, destino);
    report.integridadeDestino = integridade(destino);
    if (atual) { report.atualVsDestino = comparar(atual.rows, destino); report.identidadesAtuais = identidades(atual.rows, destino); report.integridadeOrigem = integridade(atual.rows);
      report.relacionamentosComOutraIdentidade = conferirIdentidadeRelacionada(atual.rows, destino); report.instantesTimestamp = compararInstantes(atual.epochs, destino);
      report.timestampsVerificadosPorEpoch = true;
      report.limitacoes = report.limitacoes.map(s => s.startsWith("Comparacao temporal") ? "TIMESTAMP comparado tambem por UNIX_TIMESTAMP da origem e instante UTC do destino; calendario local isolado nao indica mudanca de dados." : s); }
    const evidencias = evidenciasFixtures(path.join(root, "PI Backend/evidencias"));
    report.classificacaoAdicionais = classificarAdicionais(imported.rows, atual?.rows, destino,
      [env.HOMOLOG_ADMIN_EMAIL, env.HOMOLOG_PARTICIPANTE_EMAIL, env.HOMOLOG_TEST_EMAIL], evidencias);
    const runFile = path.join(root, "PI Backend/fixtures/hw-f779e63e398b4da5bfb473d218ec7121.manifesto.json");
    if (fs.existsSync(runFile)) {
      const run = JSON.parse(fs.readFileSync(runFile, "utf8"));
      report.residuosDaHomologacaoEscrita = Object.fromEntries(TABLES.map(t => [t, destino[t].filter(r => run.createdIds[t].includes(Number(r.id))).map(r => r.id)]));
    }
    report.status = atual ? "COMPARADO_SEM_AUTORIZAR_CUTOVER" : "ORIGEM_ATUAL_PENDENTE";
    report.etapa = "CONCLUIDA";
  } catch (e) { report.status = "INTERROMPIDA_SEM_ESCRITAS"; report.falha = "FONTE_TRANSPORTE_OU_INCONSISTENCIA";
    if (/^[A-Z][A-Z0-9_]{1,60}$/.test(e.code ?? "")) report.codigoFalha = e.code;
    process.exitCode = 1; }
  report.fim = new Date().toISOString();
  // Apenas contagens, IDs e nomes de campos. Nenhum row, email, hash ou segredo.
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ reportFile: file, ...report }));
}
if (require.main === module) executar().catch(() => { console.log('{"status":"PREPARACAO_RECUSADA","writes":0}'); process.exitCode = 1; });
module.exports = { lerDump, comparar, identidades, integridade, classificarAdicionais, conferirIdentidadeRelacionada, compararInstantes, evidenciasFixtures };
