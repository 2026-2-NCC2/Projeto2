"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { TABELAS } = require("../homologacao-escrita.cjs");
function tokensCorpo(sql) {
  const match = sql.match(/\bAS\s+(\$[a-zA-Z_]*\$)([\s\S]*?)\1/i);
  if (!match) throw Error("HW_CATALOGO_CORPO");
  // Literais antes dos comentarios: '--' dentro de texto nao e comentario.
  return (match[2].match(/'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\r\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9]*|\d+|[^\s]/g) ?? [])
    .filter(s => !s.startsWith("--") && !s.startsWith("/*"))
    .map(s => /^['"]/.test(s) ? s : s.toLowerCase());
}
function validarCatalogo(catalogo) {
  const exigir = ok => { if (!ok) throw Error("HW_CATALOGO_DIVERGENTE"); };
  exigir(catalogo.transaction_read_only === "on" && catalogo.custom_triggers.length === 0);
  exigir(catalogo.tables.length === 8 && new Set(catalogo.tables.map(t => t.name)).size === 8);
  for (const table of catalogo.tables) {
    exigir(TABELAS.includes(table.name) && table.rls);
    for (const [role, permissoes] of Object.entries(table.privileges_by_role)) {
      exigir(["service_role", "anon", "authenticated"].includes(role));
      exigir(["select", "insert", "update", "delete"].every(k => permissoes[k] === (role === "service_role")));
    }
    exigir(Object.keys(table.privileges_by_role).length === 3);
  }
  const nomes = ["avaliar_proposta", "decidir_solicitacao_acesso", "publicar_cotacao", "substituir_custos_evento"];
  exigir(catalogo.functions.length === 4 && new Set(catalogo.functions.map(f => f.name)).size === 4);
  const evidencias = [];
  for (const f of catalogo.functions) {
    exigir(nomes.includes(f.name) && f.security_definer === false && f.public_execute_grant === false &&
      f.execute_by_role.service_role === true && f.execute_by_role.anon === false && f.execute_by_role.authenticated === false &&
      f.configuration.length === 1 && f.configuration[0] === 'search_path=""');
    const fonte = fs.readFileSync(path.join(__dirname, "../../Banco de dados/rpc_" + f.name + ".preparacao.sql"), "utf8");
    const corpo = JSON.stringify(tokensCorpo(f.definition));
    exigir(corpo === JSON.stringify(tokensCorpo(fonte)));
    evidencias.push({ name: f.name, bodyTokensSHA256: crypto.createHash("sha256").update(corpo).digest("hex"), invoker: true, serviceRoleOnly: true });
  }
  const fkLocal = fs.readFileSync(path.join(__dirname, "../../Banco de dados/trocaticket_supabase.sql"), "utf8");
  exigir(catalogo.foreign_keys.length === 9 && new Set(catalogo.foreign_keys.map(f => f.name)).size === 9);
  for (const fk of catalogo.foreign_keys) {
    exigir(TABELAS.includes(fk.table) && TABELAS.includes(fk.references));
    const re = new RegExp('ADD CONSTRAINT "' + fk.name + '" (FOREIGN KEY[^;]+)');
    const local = fkLocal.match(re)?.[1]?.split(/,\s*ADD CONSTRAINT/)[0];
    const normal = s => s.replace(/public\./g, "").replace(/"/g, "").replace(/\s+/g, " ").replace(/\s*([(),])\s*/g, "$1").trim();
    exigir(!!local && normal(local) === normal(fk.definition));
  }
  return evidencias;
}
module.exports = { validarCatalogo, tokensCorpo };
