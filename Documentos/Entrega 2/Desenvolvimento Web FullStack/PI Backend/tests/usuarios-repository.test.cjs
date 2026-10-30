"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { criarRepositorioUsuarios } = require("../repositories/mysql/usuarios.cjs");

// Sem drivers, .env ou conexões. As projeções e parâmetros são parte dos
// contratos existentes; a lógica HTTP é exercitada pelas suítes de contratos
// e segurança com este mesmo repositório real e seu banco substituído.
const usuario = { id: 7, nome: "Pessoa", email: "pessoa@example.invalid", perfil: "participante" };
const novo = { nome: " Pessoa ", email: "PESSOA@example.invalid", senhaHash: "hash-bcrypt", perfil: "participante" };
const casos = [
  { metodo: "listar", args: [],
    sql: "SELECT id, nome, email, perfil FROM usuarios ORDER BY id DESC",
    params: undefined, linhas: [usuario], esperado: linhas => linhas },
  { metodo: "buscarIdPorEmail", args: [novo.email],
    sql: "SELECT id FROM usuarios WHERE email = ?",
    params: [novo.email], linhas: [{ id: 7 }], esperado: linhas => linhas[0] },
  { metodo: "criar", args: [novo],
    sql: "INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)",
    params: [novo.nome, novo.email, novo.senhaHash, novo.perfil],
    linhas: { insertId: "9007199254740993" }, esperado: resultado => resultado.insertId },
  { metodo: "buscarParaLogin", args: [novo.email],
    sql: "SELECT id, nome, email, senha, perfil FROM usuarios WHERE email = ?",
    params: [novo.email], linhas: [{ ...usuario, senha: novo.senhaHash }], esperado: linhas => linhas[0] },
  { metodo: "buscarParaAutenticacao", args: [7],
    sql: "SELECT id, nome, email, perfil FROM usuarios WHERE id = ?",
    params: [7], linhas: [usuario], esperado: linhas => linhas[0] },
  { metodo: "buscarPerfil", args: [7],
    sql: "SELECT id, nome, email FROM usuarios WHERE id = ?",
    params: [7], linhas: [{ id: 7, nome: usuario.nome, email: usuario.email }], esperado: linhas => linhas[0] },
];

for (const caso of casos) {
  test(`${caso.metodo}: SQL parametrizado e retorno sem conversao`, async () => {
    let chamadas = 0;
    const repo = criarRepositorioUsuarios({ async execute(...args) {
      chamadas++;
      assert.deepEqual(args, caso.params === undefined ? [caso.sql] : [caso.sql, caso.params]);
      return [caso.linhas, [{ metadado: "nao deve vazar" }]];
    } });
    assert.strictEqual(await repo[caso.metodo](...caso.args), caso.esperado(caso.linhas));
    assert.equal(chamadas, 1);
  });

  test(`${caso.metodo}: propaga o erro original sem retry ou mapeamento HTTP`, async () => {
    for (const code of ["ER_DUP_ENTRY", "ECONNREFUSED"]) {
      let chamadas = 0;
      const erro = Object.assign(new Error("falha simulada"), { code });
      const repo = criarRepositorioUsuarios({ async execute() { chamadas++; throw erro; } });
      await assert.rejects(() => repo[caso.metodo](...caso.args), recebido => recebido === erro);
      assert.equal(chamadas, 1);
    }
  });

  if (caso.metodo !== "criar") test(`${caso.metodo}: resultado vazio`, async () => {
    const linhas = [];
    const repo = criarRepositorioUsuarios({ async execute() { return [linhas]; } });
    assert.strictEqual(await repo[caso.metodo](...caso.args), caso.esperado(linhas));
  });
}

test("repositorios usam somente seu adaptador injetado, sem cache de usuario/perfil", async () => {
  let consultas = 0;
  const a = criarRepositorioUsuarios({ async execute() {
    consultas++;
    return [[{ ...usuario, perfil: consultas === 1 ? "participante" : "fornecedor" }]];
  } });
  const b = criarRepositorioUsuarios({ async execute() { return [[]]; } });
  assert.equal((await a.buscarParaAutenticacao(7)).perfil, "participante");
  assert.equal(await b.buscarParaAutenticacao(7), undefined);
  assert.equal((await a.buscarParaAutenticacao(7)).perfil, "fornecedor");
  assert.equal(consultas, 2);
});
