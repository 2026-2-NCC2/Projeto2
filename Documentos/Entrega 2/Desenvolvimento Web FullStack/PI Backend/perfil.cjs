"use strict";

const camposPermitidos = Object.freeze(["nome", "telefone", "biografia"]);
function validarAlteracoesPerfil(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !Object.keys(body).length || Object.keys(body).some(k => !camposPermitidos.includes(k))) {
    throw new Error("Informe apenas nome, telefone e biografia.");
  }
  const dados = {};
  for (const campo of camposPermitidos) {
    if (!Object.hasOwn(body, campo)) continue;
    const valor = body[campo];
    if (typeof valor !== "string") throw new Error("Os campos de perfil devem ser textos.");
    const texto = valor.trim();
    if (campo === "nome" && (!texto || texto.length > 100 || /[\p{Cc}]/u.test(texto))) {
      throw new Error("Informe um nome de 1 a 100 caracteres.");
    }
    if (campo === "telefone" && (texto.length > 30 ||
        (texto && (!/^[+\d\s().-]+$/.test(texto) || !/\d/.test(texto))) || /[\p{Cc}]/u.test(texto))) {
      throw new Error("Informe um telefone válido de até 30 caracteres.");
    }
    if (campo === "biografia" && (texto.length > 1000 || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(texto))) {
      throw new Error("A biografia deve ter até 1000 caracteres e não conter controles inválidos.");
    }
    dados[campo] = campo !== "nome" && !texto ? null : texto;
  }
  return dados;
}

function respostaPerfil(usuario) {
  return { id: usuario.id, nome: usuario.nome, email: usuario.email,
    telefone: usuario.telefone ?? null, biografia: usuario.biografia ?? null,
    edicao_disponivel: usuario.edicao_disponivel === true };
}

module.exports = { validarAlteracoesPerfil, respostaPerfil,
  validarProfissional: require("./perfil-profissional.cjs").validarProfissional };
