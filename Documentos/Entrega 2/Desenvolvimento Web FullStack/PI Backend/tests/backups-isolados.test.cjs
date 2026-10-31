"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { quoteOption, hashRows } = require("../scripts/backup-mysql-isolado.cjs");
const { pgpass, rowsHash } = require("../scripts/backup-postgres-isolado.cjs");
test("defaults privado escapa caracteres sem coloca-los na linha de comando", () => {
  assert.equal(quoteOption('a"b\\c\n'), '"a\\"b\\\\c\\n"');
  assert.throws(() => quoteOption("a\0b"));
});

test("pgpass escapa separadores e rejeita injecao de linhas", () => {
  assert.equal(pgpass('ficticio:a\\b'), 'ficticio\\:a\\\\b');
  for (const v of ['a\nb', 'a\rb', 'a\0b']) assert.throws(() => pgpass(v));
});

test("integridade PostgreSQL independe da ordem e preserva tipos e duplicatas", () => {
  assert.equal(rowsHash([{ a: 1, b: null }, { a: 2 }]), rowsHash([{ a: 2 }, { b: null, a: 1 }]));
  assert.notEqual(rowsHash([{ a: 1 }]), rowsHash([{ a: '1' }]));
  assert.notEqual(rowsHash([{ a: 1 }]), rowsHash([{ a: 1 }, { a: 1 }]));
});
test("integridade detecta alteracoes, inclusive credenciais, sem devolver valores", () => {
  const a = [{ id: "1", senha: "ficticio-a" }, { id: "2", senha: "ficticio-b" }];
  const b = [{ id: "2", senha: "ficticio-b" }, { id: "1", senha: "ficticio-a" }];
  assert.equal(hashRows(a, ["id", "senha"]), hashRows(b, ["id", "senha"]));
  b[0].senha = "outro"; assert.notEqual(hashRows(a, ["id", "senha"]), hashRows(b, ["id", "senha"]));
  assert.match(hashRows(a, ["id", "senha"]), /^[a-f0-9]{64}$/);
});
