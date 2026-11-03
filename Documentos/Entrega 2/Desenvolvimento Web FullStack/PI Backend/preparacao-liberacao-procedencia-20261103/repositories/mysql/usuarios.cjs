"use strict";

// Recebe o mesmo pool/adaptador escolhido por db.js, inclusive no modo isolado.
// Não normaliza entradas, trata erros, autentica ou gerencia conexões.
function criarRepositorioUsuarios(db) {
  return {
    async listar() {
      const [usuarios] = await db.execute(
        "SELECT id, nome, email, perfil FROM usuarios ORDER BY id DESC"
      );
      return usuarios;
    },

    async buscarIdPorEmail(email) {
      const [usuarios] = await db.execute(
        "SELECT id FROM usuarios WHERE email = ?", [email]
      );
      return usuarios[0];
    },

    async criar({ nome, email, senhaHash, perfil }) {
      const [resultado] = await db.execute(
        "INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)",
        [nome, email, senhaHash, perfil]
      );
      return resultado.insertId;
    },

    // O hash é necessário apenas à comparação bcrypt no login.
    async buscarParaLogin(email) {
      const [usuarios] = await db.execute(
        "SELECT id, nome, email, senha, perfil FROM usuarios WHERE email = ?", [email]
      );
      return usuarios[0];
    },

    async buscarParaAutenticacao(id) {
      const [usuarios] = await db.execute(
        "SELECT id, nome, email, perfil FROM usuarios WHERE id = ?", [id]
      );
      return usuarios[0];
    },

    async buscarPerfil(id) {
      const [usuarios] = await db.execute(
        "SELECT id, nome, email FROM usuarios WHERE id = ?", [id]
      );
      return usuarios[0];
    },
  };
}

module.exports = { criarRepositorioUsuarios };
