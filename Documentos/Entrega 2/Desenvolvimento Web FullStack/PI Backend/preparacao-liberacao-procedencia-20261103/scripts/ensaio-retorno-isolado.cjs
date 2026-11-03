"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const { executar } = require("./backup-mysql-isolado.cjs");
// Ensaio de reversao de delta; nao e um migrador de dados de producao.
// pgSql pertence somente ao clone PostgreSQL network=none previamente validado.
async function ensaiarRetorno(dir, pgSql) {
  const uid = 1800000000, a = 1800000000, b = 1800000001, c = 1800000002;
  const marker = "TT-RETORNO-" + crypto.randomBytes(8).toString("hex");
  const passwordHash = require("bcryptjs").hashSync(crypto.randomBytes(32).toString("hex"), 4);
  const user = "INSERT INTO usuarios(id,nome,email,senha,perfil) VALUES (" + uid + ",'" + marker + "','" + marker.toLowerCase() + "@example.invalid','" + passwordHash + "','organizador');";
  const event = (id, suffix) => "(" + id + ",'" + marker + suffix + "','2026-12-01','14:00:00','Isolado','Corporativo',10,'" + marker + "','Em planejamento'," + uid + ")";
  const prefix = "INSERT INTO eventos(id,nome,data,horario,local,categoria,publico,descricao,status,usuario_id) VALUES ";
  const seed = user + prefix + event(a, "-A") + "," + event(b, "-B") + ";";
  let verified = false;
  await executar(dir, true, async ({ ids, sql, snapshot, parsed }) => {
    const mysql = ids[0];
    for (const query of [pgSql, s => sql(mysql, s)]) {
      assert.equal(await query("SELECT COUNT(*) FROM usuarios WHERE id=" + uid + ";"), "0");
      assert.equal(await query("SELECT COUNT(*) FROM eventos WHERE id IN (" + [a, b, c].join(",") + ");"), "0");
    }
    const originalPg = await pgSql("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM eventos t;");
    const originalMysql = await snapshot(mysql);
    await pgSql("BEGIN;" + seed + "COMMIT;"); await sql(mysql, "START TRANSACTION;" + seed + "COMMIT;");
    await pgSql("BEGIN; UPDATE eventos SET nome='" + marker + "-A-novo' WHERE id=" + a + "; DELETE FROM eventos WHERE id=" + b + ";" + prefix + event(c, "-C-novo") + "; COMMIT;");
    const fields = parsed.columns.eventos;
    const current = JSON.parse(await pgSql("SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM eventos t WHERE id IN (" + [a, b, c].join(",") + ");"));
    assert.equal(current.length, 2); assert.ok(current.some(r => r.id === c) && !current.some(r => r.id === b));
    const before = (await snapshot(mysql)).eventos.filter(r => Number(r.id) >= uid);
    assert.equal(before.find(r => Number(r.id) === a).nome, marker + "-A"); assert.ok(before.some(r => Number(r.id) === b));
    // Falha deterministica antes de COMMIT: a conexao encerra e desfaz o UPDATE.
    await assert.rejects(sql(mysql, "START TRANSACTION; UPDATE eventos SET nome='" + marker + "-nao-commit' WHERE id=" + a + ";" + prefix + event(a, "-duplicado") + "; COMMIT;"));
    assert.equal((await snapshot(mysql)).eventos.find(r => Number(r.id) === a).nome, marker + "-A");
    const literal = v => v === null ? "NULL" : "CONVERT(0x" + Buffer.from(String(v), "utf8").toString("hex") + " USING utf8mb4)";
    const changed = current.find(r => r.id === a), inserted = current.find(r => r.id === c);
    const delta = "UPDATE eventos SET " + fields.filter(f => f !== "id").map(f => "`" + f + "`=" + literal(changed[f])).join(",") + " WHERE id=" + a + "; DELETE FROM eventos WHERE id=" + b + "; INSERT INTO eventos(" + fields.map(f => "`" + f + "`").join(",") + ") VALUES (" + fields.map(f => literal(inserted[f])).join(",") + ");";
    await sql(mysql, "START TRANSACTION;" + delta + "COMMIT;");
    const afterMysql = await snapshot(mysql);
    for (const row of current) {
      const restored = afterMysql.eventos.find(r => Number(r.id) === row.id); assert.ok(restored);
      for (const f of fields) assert.equal(restored[f], row[f] === null ? null : String(row[f]));
    }
    assert.ok(!afterMysql.eventos.some(r => Number(r.id) === b));
    const { hashRows } = require("./backup-mysql-isolado.cjs");
    for (const t of Object.keys(parsed.rows)) assert.equal(hashRows(afterMysql[t].filter(r => Number(r.id) < uid), parsed.columns[t]), hashRows(originalMysql[t], parsed.columns[t]));
    assert.equal(await pgSql("SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM eventos t WHERE id < " + uid + ";"), originalPg);
    verified = true;
  });
  assert.ok(verified && !process.exitCode);
  return { verified: true, scope: "INSERT UPDATE DELETE em eventos e identidade ficticia, PostgreSQL para MariaDB; nao e reversao generica dos oito dominios", atomicFailureRollback: true, originalRowsPreserved: true,
    fixtureIds: { usuarios: [uid], eventos: [a, b, c] }, noMainDataWrites: true };
}
module.exports = { ensaiarRetorno };
