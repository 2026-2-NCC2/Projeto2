"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { comando, validarDestino } = require("./backup-mysql-isolado.cjs");
const { rowsHash } = require("./backup-postgres-isolado.cjs");
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const qi = s => '"' + s.replace(/"/g, '""') + '"';
async function executar(dir, ensaio = false) {
  dir = validarDestino(dir); const name = path.basename(dir), mp = path.join(dir, "supabase-manifesto.json");
  const m = JSON.parse(fs.readFileSync(mp, "utf8"));
  assert.ok(["BACKUP_COMPLETO_GERADO", "RESTAURACAO_INTERROMPIDA", ...(ensaio ? ["BACKUP_COMPLETO_RESTAURADO"] : [])].includes(m.status));
  if (m.restore) { assert.equal(m.restore.removed, true); m.restoreAttempts ??= []; m.restoreAttempts.push(m.restore); delete m.restore; }
  for (const x of [m.dump, m.roleDump]) { assert.equal(path.dirname(x.file), dir); assert.equal(sha(fs.readFileSync(x.file)), x.sha256); }
  const save = () => fs.writeFileSync(mp, JSON.stringify(m, null, 2) + "\n");
  let id, stage = "clone_isolado";
  async function validar() {
    assert.match(id, /^[a-f0-9]{64}$/); const [c] = JSON.parse((await comando("docker", ["inspect", id])).toString());
    assert.equal(c.Config.Labels["tt.backup.run"], name); assert.equal(c.HostConfig.NetworkMode, "none");
    assert.ok(!c.HostConfig.PortBindings || Object.keys(c.HostConfig.PortBindings).length === 0); assert.equal(c.HostConfig.ReadonlyRootfs, true);
    assert.ok(c.HostConfig.Tmpfs["/isolated"]); assert.equal(c.Config.User, "postgres");
    assert.ok(c.Mounts.every(x => x.Type === "tmpfs" || (x.Type === "bind" && !x.RW && ["/backup/dump", "/backup/roles"].includes(x.Destination))));
  }
  async function sql(text) {
    await validar(); return (await comando("docker", ["exec", "-i", id, "psql", "-X", "-U", "supabase_admin", "-h", "/tmp", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-q"], { input: "SET timezone='UTC';\n" + text, errorLog: path.join(dir, "restore-" + stage + "-privado.log"), timeout: 120000 })).toString().trim();
  }
  try {
    const image = "supabase/postgres:17.11.0.016", imageId = (await comando("docker", ["image", "inspect", image, "--format", "{{.Id}}"])).toString().trim();
    id = (await comando("docker", ["run", "--detach", "--name", "tt-pg-" + name.slice(-16), "--label", "tt.backup.run=" + name,
      "--network", "none", "--read-only", "--memory", "1536m", "--cpus", "2", "--pids-limit", "256", "--user", "postgres",
      "--tmpfs", "/tmp:rw,size=128m,mode=1777", "--tmpfs", "/isolated:rw,size=1g,uid=100,gid=101,mode=0700",
      "--mount", "type=bind,source=" + m.dump.file + ",target=/backup/dump,readonly",
      "--mount", "type=bind,source=" + m.roleDump.file + ",target=/backup/roles,readonly", "--entrypoint", "/bin/sh", imageId, "-c",
      "initdb -D /isolated/data -U supabase_admin --auth-local=trust --auth-host=reject --no-locale --encoding=UTF8 >/tmp/init.log 2>&1 && exec postgres -D /isolated/data -k /tmp -c listen_addresses= -c unix_socket_permissions=0700 -c shared_preload_libraries=pg_stat_statements"])).toString().trim();
    m.restore = { container: id, image, imageId, network: "none", ports: [], removed: false, bootstrapRole: "supabase_admin, preserva grantor original de memberships PostgreSQL 17" }; save();
    await validar(); let ready = false;
    for (let i = 0; i < 60; i++) { try { assert.equal(await sql("SELECT 1;"), "1"); ready = true; break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
    assert.ok(ready); stage = "restauracao_roles";
    const roles = fs.readFileSync(m.roleDump.file, "utf8").replace(/^CREATE ROLE supabase_admin;\r?\n/gm, "");
    await sql(roles); stage = "restauracao_completa";
    await validar(); await comando("docker", ["exec", id, "pg_restore", "--exit-on-error", "--single-transaction", "--dbname=postgres", "--host=/tmp", "--username=supabase_admin", "/backup/dump"], { errorLog: path.join(dir, "restore-" + stage + "-privado.log"), timeout: 300000 });
    stage = "comparacao_integral";
    for (const t of m.tables) {
      const text = await sql("SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM " + qi(t.schema) + "." + qi(t.name) + " t;");
      const rows = JSON.parse(text); assert.equal(rows.length, t.count); assert.equal(rowsHash(rows), t.hash);
    }
    const ext = JSON.parse(await sql("SELECT jsonb_agg(jsonb_build_object('extname',extname,'extversion',extversion) ORDER BY extname) FROM pg_extension;"));
    assert.deepEqual(ext, m.extensions);
    m.restore.verified = true; m.restore.tablesCompared = m.tables.length; m.restore.publicRows = m.publicRows;
    if (ensaio) {
      stage = "schema_e_delta_leitura";
      const env = require("dotenv").parse(fs.readFileSync(path.join(__dirname, "../.env"), "utf8"));
      assert.match(env.PGHOST, /^[a-z0-9.-]+\.pooler\.supabase\.com$/); assert.equal(env.PGUSER, "postgres.gnwybroqfvwosiqzsfla"); assert.equal(env.PGPORT, "5432"); assert.equal(env.PGDATABASE, "postgres");
      const pool = require("../db-postgres.js").criarPoolPostgres({ ...env, PGSSLROOTCERT: path.join(dir, "supabase-ca-2021.crt") }); let source;
      try {
        source = await pool.connect(); assert.ok(source.connection.stream.encrypted && source.connection.stream.authorized);
        await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); await source.query("SET LOCAL timezone='UTC'"); await source.query("SET LOCAL statement_timeout='30s'");
        const { catalogoSql } = require("./catalogo-backup.cjs"), { canonical } = require("./backup-postgres-isolado.cjs");
        const live = (await source.query(catalogoSql)).rows[0].catalogo, restored = JSON.parse(await sql(catalogoSql));
        assert.equal(canonical(restored), canonical(live));
        for (const t of m.tables) {
          const rows = (await source.query("SELECT to_jsonb(t) AS row FROM " + qi(t.schema) + "." + qi(t.name) + " t")).rows.map(r => r.row);
          assert.equal(rows.length, t.count); assert.equal(rowsHash(rows), t.hash);
        }
        m.restore.publicCatalogVerified = true; m.restore.rpcCount = live.functions?.length || 0; m.sourceUnchangedSinceBackup = true;
      } finally { if (source) { await source.query("ROLLBACK").catch(() => {}); source.release(); } await pool.end(); }
      stage = "ensaio_retorno_postgres_mysql"; m.crossProviderRollback = await require("./ensaio-retorno-isolado.cjs").ensaiarRetorno(dir, sql);
    }
    m.status = "BACKUP_COMPLETO_RESTAURADO"; save();
    console.log(JSON.stringify({ status: m.status, tablesVerified: m.tables.length, publicRows: m.publicRows, extensionsVerified: ext.length, mainDataWrites: 0 }));
  } catch (e) {
    m.restore ??= {}; m.restore.failure = { stage, code: /^[A-Z0-9_]+$/.test(e.code || "") ? e.code : "INTEGRIDADE_OU_ISOLAMENTO" }; m.status = "RESTAURACAO_INTERROMPIDA"; save(); process.exitCode = 1;
    console.log(JSON.stringify({ status: m.status, failure: m.restore.failure, detailsHidden: true }));
  } finally {
    if (id) { try { await validar(); await comando("docker", ["stop", "--time", "10", id]); await comando("docker", ["rm", id]); m.restore.removed = true; } catch { m.restore.cleanupFailed = true; process.exitCode = 1; } }
    for (const x of [m.dump, m.roleDump]) assert.equal(sha(fs.readFileSync(x.file)), x.sha256);
    save(); console.log(JSON.stringify({ containerRemoved: !!m.restore?.removed, backupChecksumsPreserved: true }));
  }
}
if (require.main === module) executar(process.argv[2], process.argv[3] === "--ensaio-retorno").catch(() => { console.log('{"status":"RESTAURACAO_PREPARACAO_RECUSADA","detailsHidden":true}'); process.exitCode = 1; });
