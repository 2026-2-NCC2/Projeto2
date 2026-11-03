"use strict";

const campos = ["id", "nome", "data", "horario", "local", "categoria",
  "publico", "descricao", "status", "usuario_id"];

function respostaInvalida() {
  return Object.assign(new Error("Resposta invalida ao consultar evento."), {
    code: "SUPABASE_EVENTO_RESPONSE",
  });
}

// O mysql2 atual devolve DATE como Date a meia-noite no fuso local do backend.
// PostgREST devolve YYYY-MM-DD: preservar a serializacao existente, sem usar UTC
// implicitamente e sem alterar o fuso do processo.
function converterData(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw respostaInvalida();
  }
  const [ano, mes, dia] = valor.split("-").map(Number);
  const calendario = new Date(`${valor}T00:00:00Z`);
  if (!Number.isFinite(calendario.getTime()) || calendario.getUTCFullYear() !== ano ||
      calendario.getUTCMonth() + 1 !== mes || calendario.getUTCDate() !== dia) {
    throw respostaInvalida();
  }
  const data = new Date(`${valor}T00:00:00`);
  if (!Number.isFinite(data.getTime())) throw respostaInvalida();
  return data;
}

// Leituras, cadastro, edicao, exclusao e publicacao. Nao selecionados pelas
// rotas ainda. Reutiliza a fabrica existente; importar o modulo e inerte.
// Injetar o cliente permite testes sem SDK, credenciais ou consultas reais.
function criarRepositorioEventos(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase()
) {
  // O contrato MySQL retorna a lista inteira. O limite de linhas do PostgREST
  // nao pode truncar silenciosamente esse retorno. Cada pagina exige contagem
  // exata; respostas incompletas/inconsistentes falham, sem retry ou fallback.
  // Chamadas REST separadas nao garantem snapshot transacional entre paginas.
  async function listarTodas(montarConsulta, selecao, administrativo = false, usuarioId) {
    const resultado = [];
    const ids = new Set();
    let total;
    do {
      const { data, error, count } = await montarConsulta()
        .range(resultado.length, resultado.length + 999);
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 ||
          (total !== undefined && count !== total) ||
          resultado.length + data.length > count ||
          (data.length === 0 && resultado.length < count)) {
        throw respostaInvalida();
      }
      total = count;
      for (const evento of data) {
        if (!evento || typeof evento !== "object" || Array.isArray(evento) ||
            selecao.some(campo => !Object.hasOwn(evento, campo)) ||
            !Number.isSafeInteger(evento.id) || evento.id <= 0 || ids.has(evento.id) ||
            (usuarioId !== undefined && evento.usuario_id !== usuarioId)) {
          throw respostaInvalida();
        }
        const item = Object.fromEntries(selecao.map(campo => [campo,
          campo === "data" ? converterData(evento.data) : evento[campo]]));
        if (administrativo) {
          if (!evento.organizador || Array.isArray(evento.organizador) ||
              typeof evento.organizador.nome !== "string") throw respostaInvalida();
          item.organizador_nome = evento.organizador.nome;
        }
        ids.add(evento.id);
        resultado.push(item);
      }
    } while (resultado.length < total);
    return resultado;
  }

  return {
    async publicar(id, usuarioId) {
      // Mesmo UPDATE atomico do MySQL: propriedade e estado conferidos na escrita.
      // Nao confundir com publicar_cotacao, que possui outro contrato/transacao.
      const { data: linhas, error } = await cliente.schema("public")
        .from("eventos")
        .update({ status: "Ativo" })
        .eq("id", id)
        .eq("usuario_id", usuarioId)
        .eq("status", "Em planejamento")
        .select("id")
        .retry(false);
      if (error) throw error;
      if (!Array.isArray(linhas) || linhas.length > 1 ||
          (linhas.length === 1 && (!linhas[0] || typeof linhas[0] !== "object" ||
            Array.isArray(linhas[0]) || !Object.hasOwn(linhas[0], "id") ||
            !Number.isSafeInteger(linhas[0].id) || linhas[0].id <= 0 || linhas[0].id !== id))) {
        throw Object.assign(new Error("Resposta invalida ao publicar evento."), {
          code: "SUPABASE_EVENTO_PUBLISH_RESPONSE", resultadoIncerto: true,
        });
      }
      return linhas.length;
    },

    async excluir(id, usuarioId) {
      // Uma unica exclusao condicional. FKs/cascatas pertencem ao banco;
      // nao remover dependencias manualmente nem ocultar falhas de integridade.
      const { data: linhas, error } = await cliente.schema("public")
        .from("eventos")
        .delete()
        .eq("id", id)
        .eq("usuario_id", usuarioId)
        .select("id")
        .retry(false);
      if (error) throw error;
      if (!Array.isArray(linhas) || linhas.length > 1 ||
          (linhas.length === 1 && (!linhas[0] || typeof linhas[0] !== "object" ||
            Array.isArray(linhas[0]) || !Object.hasOwn(linhas[0], "id") ||
            !Number.isSafeInteger(linhas[0].id) || linhas[0].id <= 0 || linhas[0].id !== id))) {
        throw Object.assign(new Error("Resposta invalida ao excluir evento."), {
          code: "SUPABASE_EVENTO_DELETE_RESPONSE", resultadoIncerto: true,
        });
      }
      return linhas.length;
    },

    async criar({ nome, data, horario, local, categoria, publico, descricao, status, usuarioId }) {
      // Validacoes/defaults e identidade do organizador continuam no handler.
      // Nao aceitar usuario_id extra do corpo como substituto de usuarioId.
      const { data: criado, error } = await cliente.schema("public")
        .from("eventos")
        .insert({ nome, data, horario, local, categoria, publico, descricao, status, usuario_id: usuarioId })
        .select("id")
        .single()
        .retry(false);
      // FK, NOT NULL, tipo/data e demais erros mantem o caminho 500 existente.
      if (error) throw error;
      if (!criado || typeof criado !== "object" || Array.isArray(criado) ||
          !Object.hasOwn(criado, "id") || !Number.isSafeInteger(criado.id) || criado.id <= 0) {
        throw Object.assign(new Error("Resposta invalida ao cadastrar evento."), {
          code: "SUPABASE_EVENTO_CREATE_RESPONSE", resultadoIncerto: true,
        });
      }
      return criado.id;
    },

    async atualizar(id, usuarioId, { nome, data, horario, local, categoria, publico, descricao }) {
      // Mesmo UPDATE condicional por id E proprietario, sem leitura previa.
      // Status e usuario_id nao sao editaveis; validacoes/perfil ficam no handler.
      const { data: linhas, error } = await cliente.schema("public")
        .from("eventos")
        .update({ nome, data, horario, local, categoria, publico, descricao })
        .eq("id", id)
        .eq("usuario_id", usuarioId)
        .select("id")
        .retry(false);
      if (error) throw error;
      if (!Array.isArray(linhas) || linhas.length > 1 ||
          (linhas.length === 1 && (!linhas[0] || typeof linhas[0] !== "object" ||
            Array.isArray(linhas[0]) || !Object.hasOwn(linhas[0], "id") ||
            !Number.isSafeInteger(linhas[0].id) || linhas[0].id <= 0 || linhas[0].id !== id))) {
        throw Object.assign(new Error("Resposta invalida ao atualizar evento."), {
          code: "SUPABASE_EVENTO_UPDATE_RESPONSE", resultadoIncerto: true,
        });
      }
      // Corresponde a affectedRows com FOUND_ROWS do mysql2: 1 mesmo sem mudanca.
      return linhas.length;
    },

    async listarPorUsuario(usuarioId) {
      return listarTodas(() => cliente.schema("public").from("eventos")
        .select(campos.join(", "), { count: "exact" })
        .eq("usuario_id", usuarioId)
        .order("id", { ascending: false }), campos, false, usuarioId);
    },

    async listarAdministrativo() {
      return listarTodas(() => cliente.schema("public").from("eventos")
        .select(`${campos.join(", ")}, organizador:usuarios!inner(nome)`, { count: "exact" })
        .order("id", { ascending: false }), campos, true);
    },

    async listarAtivosParaParticipante() {
      const camposParticipante = campos.filter(campo => campo !== "usuario_id");
      return listarTodas(() => cliente.schema("public").from("eventos")
        .select(camposParticipante.join(", "), { count: "exact" })
        .eq("status", "Ativo")
        .order("data", { ascending: true })
        .order("id", { ascending: true }), camposParticipante);
    },

    async buscarPorIdDoUsuario(id, usuarioId) {
      const { data, error } = await cliente.schema("public")
        .from("eventos")
        .select(campos.join(", "))
        .eq("id", id)
        .eq("usuario_id", usuarioId)
        .maybeSingle();

      // Propagar falhas ao handler, que ja define a mensagem e o HTTP 500.
      // Nao converter falha em 404, repetir consulta ou usar fallback MySQL.
      if (error) throw error;
      if (data === null) return undefined;
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          campos.some(campo => !Object.hasOwn(data, campo)) ||
          data.id !== id || data.usuario_id !== usuarioId) {
        throw respostaInvalida();
      }
      return Object.fromEntries(campos.map(campo => [campo,
        campo === "data" ? converterData(data.data) : data[campo]]));
    },
  };
}

module.exports = { criarRepositorioEventos };
