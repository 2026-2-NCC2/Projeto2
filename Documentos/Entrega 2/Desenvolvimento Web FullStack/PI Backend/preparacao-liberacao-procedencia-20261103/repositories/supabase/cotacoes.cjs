"use strict";

const campos = ["id", "evento_id", "prazo", "modalidade", "observacoes", "status", "criada_em"];

function respostaInvalida() {
  return Object.assign(new Error("Resposta invalida ao listar cotacoes."), { code: "SUPABASE_COTACAO_RESPONSE" });
}

function validarCalendario(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw respostaInvalida();
  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(`${valor}T00:00:00Z`);
  if (!Number.isFinite(data.getTime()) || data.getUTCFullYear() !== ano ||
      data.getUTCMonth() + 1 !== mes || data.getUTCDate() !== dia) throw respostaInvalida();
}

// DATE acompanha o Date local do mysql2 atual. TIMESTAMPTZ conserva o instante
// informado pelo offset, sem reinterpretar como horario local. A fidelidade dos
// instantes importados ainda depende de reconciliacao/integracao posterior.
function dataLocal(valor) {
  validarCalendario(valor);
  const data = new Date(`${valor}T00:00:00`);
  if (!Number.isFinite(data.getTime())) throw respostaInvalida();
  return data;
}

function instante(valor) {
  if (typeof valor !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(valor)) {
    throw respostaInvalida();
  }
  validarCalendario(valor.slice(0, 10));
  if (Number(valor.slice(11, 13)) > 23 || Number(valor.slice(14, 16)) > 59 ||
      Number(valor.slice(17, 19)) > 59) throw respostaInvalida();
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) throw respostaInvalida();
  return data;
}

// Leituras comuns apenas. Sem publicacao, locks ou troca das rotas MySQL.
function criarRepositorioCotacoes(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase()
) {
  async function listar(organizador, usuarioId, fornecedor = false) {
    if (organizador && usuarioId === undefined) throw respostaInvalida();
    const dadosEvento = organizador || fornecedor;
    const eventoCampos = organizador ? "nome, data, local, usuario_id" : fornecedor ? "nome, data, local" : "nome";
    const resultado = [];
    const ids = new Set();
    let total;
    // Contagem e IDs detectam algumas inconsistencias. REST paginado nao
    // garante snapshot; nao retornar lista parcial nem repetir automaticamente.
    do {
      let consulta = cliente.schema("public").from("cotacoes")
        .select(`${campos.join(", ")}, evento:eventos!inner(${eventoCampos})`, { count: "exact" });
      if (organizador) consulta = consulta.eq("evento.usuario_id", usuarioId);
      // Valor de entrada DATE interpretado pelo PostgreSQL em cada requisicao,
      // nao uma data UTC calculada no Node. Validar o fuso da sessao PostgREST
      // contra o MySQL antes de ativar: nao se presume que sejam iguais.
      if (fornecedor) consulta = consulta.eq("status", "Aberta").gte("prazo", "today");
      const { data, error, count } = await consulta.order("id", { ascending: false })
        .range(resultado.length, resultado.length + 999);
      if (error) throw error;
      if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 ||
          (total !== undefined && count !== total) || resultado.length + data.length > count ||
          (data.length === 0 && resultado.length < count)) throw respostaInvalida();
      total = count;
      for (const cotacao of data) {
        if (!cotacao || typeof cotacao !== "object" || Array.isArray(cotacao) ||
            campos.some(campo => !Object.hasOwn(cotacao, campo)) ||
            !Number.isSafeInteger(cotacao.id) || cotacao.id <= 0 || ids.has(cotacao.id) ||
            !cotacao.evento || typeof cotacao.evento !== "object" || Array.isArray(cotacao.evento) ||
            typeof cotacao.evento.nome !== "string" ||
            (organizador && cotacao.evento.usuario_id !== usuarioId) ||
            (dadosEvento && !Object.hasOwn(cotacao.evento, "local"))) throw respostaInvalida();
        const item = { id: cotacao.id, evento_id: cotacao.evento_id, evento_nome: cotacao.evento.nome };
        if (dadosEvento) {
          item.evento_data = dataLocal(cotacao.evento.data);
          item.evento_local = cotacao.evento.local;
        }
        Object.assign(item, {
          prazo: dataLocal(cotacao.prazo), modalidade: cotacao.modalidade,
          observacoes: cotacao.observacoes, status: cotacao.status, criada_em: instante(cotacao.criada_em),
        });
        ids.add(cotacao.id);
        resultado.push(item);
      }
    } while (resultado.length < total);
    return resultado;
  }

  return {
    async listarPorOrganizador(usuarioId) { return listar(true, usuarioId); },
    async listarAdministrativo() { return listar(false); },
    async listarDisponiveisParaFornecedor() { return listar(false, undefined, true); },

    async listarItens(cotacaoId) {
      const { erroResposta, listarPaginas, decimalTexto } = require("./suporte-leitura.cjs");
      const code = "SUPABASE_COTACAO_RESPONSE";
      return listarPaginas(() => cliente.schema("public").from("itens_cotacao")
        .select("id, categoria, descricao, valor_estimado::text", { count: "exact" })
        .eq("cotacao_id", cotacaoId)
        .order("id", { ascending: true }), item => {
        if (["categoria", "descricao", "valor_estimado"].some(campo => !Object.hasOwn(item, campo))) {
          throw erroResposta(code);
        }
        return { id: item.id, categoria: item.categoria, descricao: item.descricao,
          valor_estimado: decimalTexto(item.valor_estimado, code) };
      }, code);
    },
  };
}

module.exports = { criarRepositorioCotacoes };
