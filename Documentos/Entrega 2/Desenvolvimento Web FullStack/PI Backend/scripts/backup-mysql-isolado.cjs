"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const { lerDump } = require("./reconciliar-cutover-leitura.cjs");
const image = "mariadb:10.4.32", project = path.resolve(__dirname, ".."), roots = "C:\\Users\\Lucas\\BackupsTrocaTicket";
function validarDestino(dir) {
  const real = fs.realpathSync(dir), base = fs.realpathSync(roots), relative = path.relative(base, real);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && /^backup-20261031-[a-f0-9]{32}$/.test(relative));
  assert.equal(path.dirname(real).toLowerCase(), base.toLowerCase()); return real;
}
function quoteOption(v) { assert.ok(typeof v === "string" && !v.includes("\0")); return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"'; }
async function comando(bin, args, { input, output, errorLog, timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [], stderr = []; let bytes = 0, expired = false;
    const timer = setTimeout(() => { expired = true; p.kill(); }, timeout);
    const file = output ? fs.createWriteStream(output, { flags: "wx" }) : null;
    p.stdout.on("data", c => { if (file) file.write(c); else { bytes += c.length; if (bytes > 32 * 1024 * 1024) p.kill(); else stdout.push(c); } });
    p.stderr.on("data", c => { if (stderr.reduce((n, b) => n + b.length, 0) < 262144) stderr.push(c); });
    p.once("error", () => { clearTimeout(timer); file?.end(); reject(Object.assign(Error("Subprocesso indisponivel."), { code: "BACKUP_SUBPROCESS" })); });
    p.once("close", code => {
      clearTimeout(timer);
      const end = () => {
        if (code !== 0 || expired) {
          if (errorLog) fs.writeFileSync(errorLog, Buffer.concat(stderr));
          const mysqlCode = Buffer.concat(stderr).toString("utf8").match(/ERROR\s+(\d+)/)?.[1];
          reject(Object.assign(Error("Operacao de backup/restauracao recusada."), { code: expired ? "BACKUP_TIMEOUT" : "BACKUP_COMMAND", mysqlCode }));
        } else resolve(Buffer.concat(stdout));
      };
      if (file) file.end(end); else end();
    });
    p.stdin.on("error", () => {});
    if (input === undefined) p.stdin.end(); else p.stdin.end(input);
  });
}
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
function hashRows(rows, columns) {
  const sorted = [...rows].sort((a, b) => Number(a.id) - Number(b.id));
  return digest(JSON.stringify(sorted.map(r => columns.map(k => r[k] === null ? null : String(r[k])))));
}
async function executar(dir, restaurarExistente = false, aposRestaurar, somenteNovoEnsaio = false) {
  dir = validarDestino(dir);
  const env = require("dotenv").parse(fs.readFileSync(path.join(project, ".env"), "utf8"));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(env.DB_HOST));
  assert.ok(/^[A-Za-z0-9_]+$/.test(env.DB_NAME) && env.DB_USER && Object.hasOwn(env, "DB_PASSWORD"));
  const name = path.basename(dir), label = "tt.backup.run=" + name;
  const file = path.join(dir, "mysql-atual.sql"), manifestPath = path.join(dir, "mysql-manifesto.json");
  const manifest = restaurarExistente ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : { run: name, scope: "Banco MySQL da aplicacao completo: schema, dados, routines, events, triggers", mainDataWrites: 0,
    backup: file, restoreContainers: [], status: "PREPARACAO", checks: [] };
  if (restaurarExistente) {
    assert.equal(manifest.run, name); assert.equal(manifest.backup, file);
    assert.ok(manifest.restoreContainers.every(c => c.removed));
    assert.equal(digest(fs.readFileSync(file)), manifest.sha256);
    manifest.previousAttempts ??= [];
    manifest.previousAttempts.push({ status: manifest.status, failure: manifest.failure, restoreVerified: manifest.restoreVerified, rollbackDrill: manifest.rollbackDrill, containers: manifest.restoreContainers });
    manifest.restoreContainers = []; delete manifest.failure; delete manifest.cleanupFailed;
    if (!somenteNovoEnsaio) { manifest.restoreVerified = false; delete manifest.rollbackDrill; }
  }
  const save = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const check = (v, name) => { assert.ok(v, name); manifest.checks.push(name); save(); };
  const sourceConfig = path.join(dir, "mysql-source-temporario.cnf"), rootSecret = path.join(dir, "clone-password-temporario.txt"), cloneConfig = path.join(dir, "clone-client-temporario.cnf");
  const ids = [];
  const docker = args => comando("docker", args);
  async function validarClone(id) {
    assert.ok(ids.includes(id) && /^[a-f0-9]{64}$/.test(id));
    const [c] = JSON.parse((await docker(["inspect", id])).toString());
    assert.equal(c.Id, id); assert.equal(c.Config.Labels["tt.backup.run"], name);
    assert.equal(c.HostConfig.NetworkMode, "none"); assert.ok(!c.HostConfig.PortBindings || Object.keys(c.HostConfig.PortBindings).length === 0);
    assert.ok(c.HostConfig.Tmpfs["/var/lib/mysql"]); assert.equal(c.HostConfig.ReadonlyRootfs, true);
    const bindPath = p => p.replace(/\//g, "\\").replace(/^\\run\\desktop\\mnt\\host\\([a-z])\\/i, (_, d) => d + ":\\").replace(/^\\host_mnt\\([a-z])\\/i, (_, d) => d + ":\\").toLowerCase();
    assert.ok(c.Mounts.every(m => (m.Type === "tmpfs" && ["/tmp", "/run/mysqld", "/var/lib/mysql"].includes(m.Destination)) ||
      (m.Type === "bind" && m.RW === false && [rootSecret, cloneConfig].some(p => bindPath(p) === bindPath(m.Source)))));
  }
  async function sql(id, text, database = env.DB_NAME) {
    await validarClone(id);
    return (await comando("docker", ["exec", "-i", id, "mysql", "--defaults-extra-file=/run/secrets/client.cnf", "--batch", "--raw", "--skip-column-names", database], { input: "SET SESSION time_zone='+00:00';\n" + text })).toString("utf8").trim();
  }
  let stage = "backup_mysql";
  try {
    if (!restaurarExistente) {
    fs.writeFileSync(sourceConfig, "[client]\nhost=" + quoteOption(env.DB_HOST) + "\nport=" + Number(env.DB_PORT || 3306) + "\nuser=" + quoteOption(env.DB_USER) + "\npassword=" + quoteOption(env.DB_PASSWORD) + "\nprotocol=tcp\n", { flag: "wx" });
    save();
    await comando("C:\\xampp\\mysql\\bin\\mysqldump.exe", ["--defaults-extra-file=" + sourceConfig, "--single-transaction", "--skip-lock-tables", "--quick", "--hex-blob", "--complete-insert", "--default-character-set=utf8mb4", "--routines", "--events", "--triggers", "--databases", env.DB_NAME], { output: file });
    fs.unlinkSync(sourceConfig);
    }
    const dump = fs.readFileSync(file), parsed = lerDump(dump.toString("utf8"), true);
    manifest.sha256 = digest(dump); manifest.bytes = dump.length;
    manifest.tableCounts = Object.fromEntries(Object.entries(parsed.rows).map(([t, rows]) => [t, rows.length]));
    manifest.status = "BACKUP_GERADO"; save();
    check(Object.keys(parsed.rows).length === 8 && Object.values(parsed.rows).reduce((n, r) => n + r.length, 0) === 42, "backup atual com oito tabelas e 42 registros");
    console.log(JSON.stringify({ stage, status: "OK", bytes: manifest.bytes, rows: 42, externalDirectory: dir }));
    stage = "containers_isolados";
    const password = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(rootSecret, password, { flag: "wx" });
    fs.writeFileSync(cloneConfig, "[client]\nuser=root\npassword=" + quoteOption(password) + "\nprotocol=socket\n", { flag: "wx" });
    const imageId = (await docker(["image", "inspect", image, "--format", "{{.Id}}"])).toString().trim();
    manifest.image = { tag: image, id: imageId }; save();
    for (const suffix of (somenteNovoEnsaio ? ["a"] : ["a", "b"])) {
      const id = (await docker(["run", "--detach", "--name", "tt-mysql-" + name.slice(-16) + "-" + suffix, "--label", label,
        "--network", "none", "--read-only", "--memory", "768m", "--cpus", "1", "--pids-limit", "256", "--tmpfs", "/tmp:rw,size=128m",
        "--tmpfs", "/run/mysqld:rw,size=16m", "--tmpfs", "/var/lib/mysql:rw,size=512m",
        "--mount", "type=bind,source=" + rootSecret + ",target=/run/secrets/password,readonly",
        "--mount", "type=bind,source=" + cloneConfig + ",target=/run/secrets/client.cnf,readonly",
        "--env", "MYSQL_ROOT_PASSWORD_FILE=/run/secrets/password", imageId, "--event-scheduler=OFF", "--skip-name-resolve"])).toString().trim();
      assert.match(id, /^[a-f0-9]{64}$/); ids.push(id); manifest.restoreContainers.push({ id, network: "none", ports: [], removed: false }); save();
      await validarClone(id);
      let ready = false;
      for (let tries = 0; tries < 60; tries++) {
        try {
          const pid1 = (await docker(["exec", id, "cat", "/proc/1/comm"])).toString().trim();
          if (!/^(mysqld|mariadbd)$/.test(pid1)) throw Error("Bootstrap pendente");
          const probe = await comando("docker", ["exec", id, "mysql", "--defaults-extra-file=/run/secrets/client.cnf", "--batch", "--skip-column-names", "-e", "SELECT 1"]);
          assert.equal(probe.toString().trim(), "1"); ready = true; break;
        } catch { await new Promise(r => setTimeout(r, 1000)); }
      }
      check(ready, "clone " + suffix + " pronto sem rede/portas");
      await validarClone(id);
      await comando("docker", ["exec", "-i", id, "mysql", "--defaults-extra-file=/run/secrets/client.cnf"], { input: dump });
    }
    async function snapshot(id) {
      const result = {};
      for (const [table, columns] of Object.entries(parsed.columns)) {
        const pairs = columns.map(c => "'" + c + "',CAST(`" + c + "` AS CHAR)").join(",");
        const raw = await sql(id, "SELECT JSON_OBJECT(" + pairs + ") FROM `" + table + "` ORDER BY id;");
        const rows = raw ? raw.split(/\r?\n/).map(line => JSON.parse(line)) : []; result[table] = rows;
      }
      return result;
    }
    stage = "restauracao_integridade";
    const baseline = {};
    for (const id of (somenteNovoEnsaio ? [] : ids)) {
      const rows = await snapshot(id); baseline[id] = rows;
      for (const table of Object.keys(parsed.rows)) check(hashRows(rows[table], parsed.columns[table]) === hashRows(parsed.rows[table], parsed.columns[table]), "restauracao integral " + table + " clone " + ids.indexOf(id));
    }
    if (!somenteNovoEnsaio) { manifest.restoreVerified = true; save(); console.log(JSON.stringify({ stage, status: "OK", clones: 2, rowsEach: 42 })); }
    if (aposRestaurar) {
      stage = "ensaio_postgres_para_mysql"; await aposRestaurar({ ids, sql, snapshot, parsed });
      manifest.crossProviderCallbackVerified = true; manifest.status = "MYSQL_RESTAURADO_E_RETORNO_POSTGRES_VERIFICADO"; save(); return;
    }
    stage = "ensaio_retorno_apos_escritas";
    const marker = "TT-ROLLBACK-" + name.slice(-16), uid = 1700000000, a = 1700000000, b = 1700000001, c = 1700000002;
    const fakeHash = require("bcryptjs").hashSync(crypto.randomBytes(32).toString("hex"), 4);
    const event = (id, label) => "(" + id + ",'" + marker + "-" + label + "','2026-12-01','14:00:00','Isolado','Corporativo',10,'" + marker + "','Em planejamento'," + uid + ")";
    const prefix = "INSERT INTO eventos(id,nome,data,horario,local,categoria,publico,descricao,status,usuario_id) VALUES ";
    const seed = "START TRANSACTION; INSERT INTO usuarios(id,nome,email,senha,perfil) VALUES (" + uid + ",'" + marker + "','" + marker.toLowerCase() + "@example.invalid','" + fakeHash + "','organizador');" + prefix + event(a, "A") + "," + event(b, "B") + "; COMMIT;";
    for (const id of ids) {
      assert.equal(await sql(id, "SELECT COUNT(*) FROM usuarios WHERE id=" + uid + ";"), "0");
      assert.equal(await sql(id, "SELECT COUNT(*) FROM eventos WHERE id IN (" + [a, b, c].join(",") + ");"), "0"); await sql(id, seed);
    }
    const [destination, rollbackTarget] = ids;
    await sql(destination, "START TRANSACTION; UPDATE eventos SET nome='" + marker + "-A-novo' WHERE id=" + a + "; DELETE FROM eventos WHERE id=" + b + ";" + prefix + event(c, "C-novo") + "; COMMIT;");
    const after = await snapshot(destination), before = await snapshot(rollbackTarget);
    check(hashRows(after.eventos, parsed.columns.eventos) !== hashRows(before.eventos, parsed.columns.eventos), "retorno direto ao checkpoint antigo perderia mudancas");
    check(before.eventos.find(r => Number(r.id) === a).nome === marker + "-A" && before.eventos.some(r => Number(r.id) === b) && !before.eventos.some(r => Number(r.id) === c), "precondicoes do delta inverso conferidas");
    await sql(rollbackTarget, "START TRANSACTION; UPDATE eventos SET nome='" + marker + "-A-novo' WHERE id=" + a + " AND nome='" + marker + "-A'; DELETE FROM eventos WHERE id=" + b + ";" + prefix + event(c, "C-novo") + "; COMMIT;");
    const reconciled = await snapshot(rollbackTarget);
    for (const table of Object.keys(parsed.rows)) {
      check(hashRows(after[table], parsed.columns[table]) === hashRows(reconciled[table], parsed.columns[table]), "retorno preserva insert/update/delete " + table);
      check(hashRows(after[table].filter(r => Number(r.id) < 1700000000), parsed.columns[table]) === hashRows(parsed.rows[table], parsed.columns[table]), "dados originais preservados no ensaio " + table);
    }
    manifest.rollbackDrill = { verified: true, scope: "Dois clones MariaDB: deltas INSERT UPDATE DELETE apos commit, nao e prova de retorno PostgreSQL para MySQL", sourceWrites: 0, fixtureIds: { usuarios: [uid], eventos: [a, b, c] }, rowsBefore: 42, syntheticRowsOnly: true };
    manifest.status = "MYSQL_BACKUP_RESTAURADO_E_ENSAIO_APROVADO"; save();
  } catch (e) {
    manifest.status = "INTERROMPIDO"; manifest.failure = { stage, code: /^BACKUP_/.test(e.code ?? "") ? e.code : "VALIDACAO_ISOLAMENTO_OU_RESTAURACAO", mysqlCode: e.mysqlCode }; process.exitCode = 1; save();
  } finally {
    for (const id of ids) {
      try { await validarClone(id); await docker(["stop", "--time", "10", id]); await docker(["rm", id]); manifest.restoreContainers.find(c => c.id === id).removed = true; }
      catch { manifest.cleanupFailed = true; process.exitCode = 1; }
    }
    for (const f of [sourceConfig, rootSecret, cloneConfig]) if (fs.existsSync(f)) fs.unlinkSync(f);
    if (fs.existsSync(file) && manifest.sha256) check(digest(fs.readFileSync(file)) === manifest.sha256, "hash do backup preservado apos ensaio");
    save(); console.log(JSON.stringify({ status: manifest.status, backup: manifest.backup, manifest: manifestPath, rows: manifest.tableCounts,
      restoreVerified: !!manifest.restoreVerified, rollbackDrillVerified: !!manifest.rollbackDrill?.verified, containersRemoved: manifest.restoreContainers.every(c => c.removed), failure: manifest.failure, mainDataWrites: 0 }));
  }
}
if (require.main === module) {
  if (process.argv.length !== 3 && !(process.argv.length === 4 && process.argv[3] === "--restaurar-isolado")) { console.log('{"status":"BACKUP_ARGUMENTO_INVALIDO"}'); process.exitCode = 1; }
  else executar(process.argv[2], process.argv[3] === "--restaurar-isolado").catch(() => { console.log('{"status":"BACKUP_PREPARACAO_RECUSADA","detailsHidden":true}'); process.exitCode = 1; });
}
module.exports = { quoteOption, hashRows, comando, validarDestino, executar };
