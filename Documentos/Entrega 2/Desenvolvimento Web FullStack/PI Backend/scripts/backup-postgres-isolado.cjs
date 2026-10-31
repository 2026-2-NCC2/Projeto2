"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { comando, validarDestino } = require("./backup-mysql-isolado.cjs");
const ref = "gnwybroqfvwosiqzsfla";
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const qi = s => '"' + s.replace(/"/g, '""') + '"';
const pgpass = s => { assert.ok(!/[\r\n\0]/.test(s)); return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:"); };
function canonical(v) { return JSON.stringify(v, (_, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x); }
function rowsHash(rows) { return sha(rows.map(canonical).sort().join("\n")); }
async function executar(dir) {
  dir = validarDestino(dir);
  const env = require("dotenv").parse(fs.readFileSync(path.join(__dirname, "../.env"), "utf8"));
  assert.match(env.PGHOST, /^[a-z0-9.-]+\.pooler\.supabase\.com$/); assert.equal(env.PGUSER, "postgres." + ref);
  assert.equal(env.PGPORT, "5432"); assert.equal(env.PGDATABASE, "postgres"); assert.ok(env.PGPASSWORD);
  const ca = path.join(dir, "supabase-ca-2021.crt"); assert.ok(fs.existsSync(ca));
  const file = path.join(dir, "supabase-completo.dump"), roles = path.join(dir, "supabase-roles-sem-senhas.sql"), pass = path.join(dir, "pgpass-temporario");
  const mp = path.join(dir, "supabase-manifesto.json"); assert.ok(!fs.existsSync(mp) && !fs.existsSync(file));
  const manifest = { project: ref, started: new Date().toISOString(), mainDataWrites: 0, scope: "Dump logico de todo o database PostgreSQL e roles sem senhas; nao inclui objetos Storage nem configuracao da plataforma", status: "PREPARACAO", checks: [] };
  const save = () => fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + "\n");
  const pool = require("../db-postgres.js").criarPoolPostgres({ ...env, PGSSLROOTCERT: ca }); let client, stage = "conexao_tls";
  const docker = args => comando("docker", args, { timeout: 300000 });
  try {
    save(); client = await pool.connect(); assert.ok(client.connection.stream.encrypted && client.connection.stream.authorized);
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'"); await client.query("SET LOCAL timezone='UTC'");
    manifest.serverVersion = (await client.query("SHOW server_version_num")).rows[0].server_version_num;
    assert.equal(manifest.serverVersion, "170011"); manifest.tlsVerified = true;
    const snapshot = (await client.query("SELECT pg_export_snapshot() AS snapshot")).rows[0].snapshot;
    assert.match(snapshot, /^[0-9A-F-]+$/);
    const tables = (await client.query("SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY 1,2")).rows;
    manifest.tables = [];
    for (const t of tables) {
      const rows = (await client.query("SELECT to_jsonb(t) AS row FROM " + qi(t.schema) + "." + qi(t.name) + " t")).rows.map(r => r.row);
      manifest.tables.push({ ...t, count: rows.length, hash: rowsHash(rows) });
    }
    manifest.extensions = (await client.query("SELECT extname,extversion FROM pg_extension ORDER BY extname")).rows;
    manifest.roles = (await client.query("SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname")).rows.map(r => r.rolname);
    const app = manifest.tables.filter(t => t.schema === "public");
    assert.equal(app.length, 8); assert.equal(app.reduce((n, t) => n + t.count, 0), 52);
    manifest.publicRows = 52; manifest.preservedAdditionalTestRows = 10;
    stage = "dump_completo";
    const imageId = (await docker(["image", "inspect", "postgres:17", "--format", "{{.Id}}"])).toString().trim(); manifest.dumpImage = imageId;
    manifest.status = "DUMP_EM_ANDAMENTO"; save();
    fs.writeFileSync(pass, [env.PGHOST, env.PGPORT, env.PGDATABASE, env.PGUSER, env.PGPASSWORD].map(pgpass).join(":") + "\n", { flag: "wx" });
    const args = ["run", "--rm", "--read-only", "--network", "bridge", "--tmpfs", "/tmp:rw,size=64m", "--mount", "type=bind,source=" + dir + ",target=/backup,readonly",
      "--env", "PGHOST=" + env.PGHOST, "--env", "PGPORT=5432", "--env", "PGDATABASE=postgres", "--env", "PGUSER=" + env.PGUSER,
      "--env", "PGSSLMODE=verify-full", "--env", "PGSSLROOTCERT=/backup/supabase-ca-2021.crt", "--env", "PGCONNECT_TIMEOUT=15",
      "--env", "PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000", "--entrypoint", "/bin/sh", imageId,
      "-c", 'cp /backup/pgpass-temporario /tmp/pass && chmod 600 /tmp/pass && export PGPASSFILE=/tmp/pass && exec "$@"', "backup-client"];
    await comando("docker", [...args, "pg_dump", "--format=custom", "--snapshot=" + snapshot], { output: file, timeout: 300000 });
    manifest.dump = { file, bytes: fs.statSync(file).size, sha256: sha(fs.readFileSync(file)) }; save();
    await comando("docker", [...args, "pg_dumpall", "--roles-only", "--no-role-passwords"], { output: roles, timeout: 120000 });
    manifest.roleDump = { file: roles, bytes: fs.statSync(roles).size, sha256: sha(fs.readFileSync(roles)) };
    await client.query("ROLLBACK"); client.release(); client = null;
    manifest.status = "BACKUP_COMPLETO_GERADO"; manifest.completed = new Date().toISOString(); save();
    console.log(JSON.stringify({ status: manifest.status, tlsVerified: true, tableCount: tables.length, publicRows: 52, additionalRowsPreserved: 10, mainDataWrites: 0 }));
  } catch (e) {
    manifest.status = "INTERROMPIDO"; manifest.failure = { stage, code: /^[A-Z0-9_]+$/.test(e.code || "") ? e.code : "VALIDACAO_RECUSADA" }; save();
    console.log(JSON.stringify({ status: manifest.status, failure: manifest.failure, detailsHidden: true })); process.exitCode = 1;
  } finally {
    if (client) { await client.query("ROLLBACK").catch(() => {}); client.release(); } await pool.end();
    if (fs.existsSync(pass)) fs.unlinkSync(pass);
  }
}
if (require.main === module) executar(process.argv[2]).catch(() => { console.log('{"status":"BACKUP_PREPARACAO_RECUSADA","detailsHidden":true}'); process.exitCode = 1; });
module.exports = { pgpass, rowsHash, canonical };
