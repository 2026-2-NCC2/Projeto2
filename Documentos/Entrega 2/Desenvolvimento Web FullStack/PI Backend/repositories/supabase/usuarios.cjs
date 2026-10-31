"use strict";

const campos = ["id", "nome", "email"];

// Leituras e cadastro de usuarios. A fabrica existente continua responsavel pela
// configuracao/isolamento; importar este modulo nao inicializa cliente algum.
// Rotas, autenticacao e selecao do provedor permanecem inalteradas.
function criarRepositorioUsuarios(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase()
) {
  return {
    async criar({ nome, email, senhaHash, perfil }) {
      // Normalizacao, validacao e bcrypt continuam no handler existente.
      // Receber apenas o hash ja calculado, sem selecionar/devolver a senha.
      try {
        const { data, error } = await cliente.schema("public")
          .from("usuarios")
          .insert({ nome, email, senha: senhaHash, perfil })
          .select("id")
          .single()
          .retry(false);
        if (error) throw error;
        if (!data || typeof data !== "object" || Array.isArray(data) ||
            !Object.hasOwn(data, "id") || !Number.isSafeInteger(data.id) || data.id <= 0) {
          // INSERT pode ter sido confirmado: nao devolver ID falso nem repetir.
          throw Object.assign(new Error("Resposta invalida ao cadastrar usuario."), {
            code: "SUPABASE_USUARIO_CREATE_RESPONSE", resultadoIncerto: true,
          });
        }
        return data.id;
      } catch (error) {
        if (error?.code === "23505") {
          // Mesmo caminho 409 da corrida no INSERT MySQL, sem dados do conflito.
          throw Object.assign(new Error("Conflito de unicidade no cadastro."), {
            code: "ER_DUP_ENTRY",
          });
        }
        throw error;
      }
    },

    async buscarParaLogin(email) {
      const camposLogin = ["id", "nome", "email", "senha", "perfil"];
      const { data, error } = await cliente.schema("public")
        .from("usuarios")
        .select(camposLogin.join(", "))
        .eq("email", email)
        .maybeSingle();

      // Hash somente para o bcrypt do backend; nao autentica nem emite JWT.
      // Normalizacao, resposta HTTP e exclusao do hash do JSON ficam no handler.
      if (error) throw error;
      if (data === null) return undefined;
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          camposLogin.some(campo => !Object.hasOwn(data, campo)) ||
          !Number.isSafeInteger(data.id) || data.id <= 0) {
        throw Object.assign(new Error("Resposta invalida ao consultar usuario."), {
          code: "SUPABASE_USUARIO_RESPONSE",
        });
      }
      return Object.fromEntries(camposLogin.map(campo => [campo, data[campo]]));
    },

    async buscarIdPorEmail(email) {
      const { data, error } = await cliente.schema("public")
        .from("usuarios")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      // Normalizacao e decisao de duplicidade continuam no handler de cadastro.
      if (error) throw error;
      if (data === null) return undefined;
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          !Number.isSafeInteger(data.id) || data.id <= 0) {
        throw Object.assign(new Error("Resposta invalida ao consultar usuario."), {
          code: "SUPABASE_USUARIO_RESPONSE",
        });
      }
      return { id: data.id };
    },

    async buscarParaAutenticacao(id) {
      const camposAutenticacao = ["id", "nome", "email", "perfil"];
      const { data, error } = await cliente.schema("public")
        .from("usuarios")
        .select(camposAutenticacao.join(", "))
        .eq("id", id)
        .maybeSingle();

      // Apenas persistencia: nao verifica JWT, autoriza perfis ou cria sessao.
      // O middleware existente continua responsavel pelos HTTP 401/500.
      if (error) throw error;
      if (data === null) return undefined;
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          camposAutenticacao.some(campo => !Object.hasOwn(data, campo)) || data.id !== id) {
        throw Object.assign(new Error("Resposta invalida ao consultar usuario."), {
          code: "SUPABASE_USUARIO_RESPONSE",
        });
      }
      return Object.fromEntries(camposAutenticacao.map(campo => [campo, data[campo]]));
    },

    async buscarPerfil(id) {
      const { data, error } = await cliente.schema("public")
        .from("usuarios")
        .select(campos.join(", "))
        .eq("id", id)
        .maybeSingle();

      // O handler existente decide o HTTP: ausencia e 404; falha e 500.
      // Nao consultar senha/perfil, repetir a leitura ou recorrer ao MySQL.
      if (error) throw error;
      if (data === null) return undefined;
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          campos.some(campo => !Object.hasOwn(data, campo)) || data.id !== id) {
        throw Object.assign(new Error("Resposta invalida ao consultar perfil."), {
          code: "SUPABASE_USUARIO_RESPONSE",
        });
      }
      return Object.fromEntries(campos.map(campo => [campo, data[campo]]));
    },

    async listar() {
      const camposLista = ["id", "nome", "email", "perfil"];
      const usuarios = [];
      const ids = new Set();
      let total;
      // Preserva lista completa e id DESC, sem truncar no limite do PostgREST.
      // Paginas REST nao compartilham snapshot. Detectar inconsistencias nao
      // garante ausencia de todas as alteracoes concorrentes entre chamadas.
      do {
        const { data, error, count } = await cliente.schema("public").from("usuarios")
          .select(camposLista.join(", "), { count: "exact" })
          .order("id", { ascending: false })
          .range(usuarios.length, usuarios.length + 999);
        if (error) throw error;
        if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 ||
            (total !== undefined && count !== total) || usuarios.length + data.length > count ||
            (data.length === 0 && usuarios.length < count)) {
          throw Object.assign(new Error("Resposta invalida ao listar usuarios."), { code: "SUPABASE_USUARIO_RESPONSE" });
        }
        total = count;
        for (const usuario of data) {
          if (!usuario || typeof usuario !== "object" || Array.isArray(usuario) ||
              camposLista.some(campo => !Object.hasOwn(usuario, campo)) ||
              !Number.isSafeInteger(usuario.id) || usuario.id <= 0 || ids.has(usuario.id)) {
            throw Object.assign(new Error("Resposta invalida ao listar usuarios."), { code: "SUPABASE_USUARIO_RESPONSE" });
          }
          ids.add(usuario.id);
          usuarios.push(Object.fromEntries(camposLista.map(campo => [campo, usuario[campo]])));
        }
      } while (usuarios.length < total);
      return usuarios;
    },
  };
}

module.exports = { criarRepositorioUsuarios };
