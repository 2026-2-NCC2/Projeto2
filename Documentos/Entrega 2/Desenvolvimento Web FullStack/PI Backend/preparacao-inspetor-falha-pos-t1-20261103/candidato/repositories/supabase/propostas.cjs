"use strict";

// Leituras, envio e avaliacao. Sem mudanca de provedor.
function criarRepositorioPropostas(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase()
) {
  async function listar(organizador, organizadorId) {
    const { erroResposta, listarPaginas, instante, decimalTexto } = require("./suporte-leitura.cjs");
    const code = "SUPABASE_PROPOSTA_RESPONSE";
    if (organizador && organizadorId === undefined) throw erroResposta(code);
    const campos = ["id", "cotacao_id", "fornecedor_id", "valor", "condicoes_pagamento",
      "detalhes_tecnicos", "status", "criada_em"];
    const projecao = "id, cotacao_id, fornecedor_id, valor::text, condicoes_pagamento, detalhes_tecnicos, status, criada_em, " +
      "cotacao:cotacoes!inner(evento:eventos!inner(id, nome, usuario_id)), fornecedor:usuarios!inner(nome)";
    // Usa o suporte existente: sem snapshot entre paginas; instantes importados
    // e efeitos de concorrencia ainda dependem de validacao integrada posterior.
    return listarPaginas(() => {
      let consulta = cliente.schema("public").from("propostas").select(projecao, { count: "exact" });
      if (organizador) consulta = consulta.eq("cotacao.evento.usuario_id", organizadorId);
      return consulta.order("criada_em", { ascending: false }).order("id", { ascending: false });
    }, item => {
      const cotacao = item.cotacao;
      const evento = cotacao && cotacao.evento;
      const fornecedor = item.fornecedor;
      if (campos.some(campo => !Object.hasOwn(item, campo)) ||
          !cotacao || typeof cotacao !== "object" || Array.isArray(cotacao) ||
          !evento || typeof evento !== "object" || Array.isArray(evento) ||
          !Object.hasOwn(evento, "id") || !Object.hasOwn(evento, "nome") ||
          !fornecedor || typeof fornecedor !== "object" || Array.isArray(fornecedor) ||
          !Object.hasOwn(fornecedor, "nome") ||
          (organizador && evento.usuario_id !== organizadorId)) throw erroResposta(code);
      return {
        id: item.id, cotacao_id: item.cotacao_id, fornecedor_id: item.fornecedor_id,
        valor: decimalTexto(item.valor, code), condicoes_pagamento: item.condicoes_pagamento,
        detalhes_tecnicos: item.detalhes_tecnicos, status: item.status,
        criada_em: instante(item.criada_em, code), evento_id: evento.id,
        evento_nome: evento.nome, fornecedor_nome: fornecedor.nome,
      };
    }, code);
  }

  return {
    async avaliar(propostaId, organizadorId, status) {
      // Organizador vem de req.usuario.id; JWT/perfil e status ficam no handler.
      // Uma RPC, nao SELECT de propriedade seguido de UPDATE independente.
      // NUMERIC textual preserva IDs inteiros grandes aceitos pelo handler.
      const { data, error } = await cliente.schema("public")
        .rpc("avaliar_proposta", {
          p_proposta_id: String(propostaId), p_organizador_id: organizadorId, p_status: status,
        }, { get: false, head: false })
        .retry(false);
      if (error) throw error;
      if (data !== 0 && data !== 1) {
        throw Object.assign(new Error("Resposta invalida ao avaliar proposta."), {
          code: "SUPABASE_PROPOSTA_EVALUATE_RESPONSE", resultadoIncerto: true,
        });
      }
      return data;
    },

    async criar({ cotacaoId, fornecedorId, valor, condicoesPagamento, detalhesTecnicos }) {
      // Perfil, disponibilidade, Number e trim continuam no handler existente.
      // Sem regra nova de duplicidade, transacao ou arredondamento no adaptador.
      const { data, error } = await cliente.schema("public")
        .from("propostas")
        .insert({ cotacao_id: cotacaoId, fornecedor_id: fornecedorId, valor,
          condicoes_pagamento: condicoesPagamento, detalhes_tecnicos: detalhesTecnicos })
        .select("id")
        .single()
        .retry(false);
      // Inclusive 23505: o handler MySQL atual nao converte duplicidade em 409.
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          !Object.hasOwn(data, "id") || !Number.isSafeInteger(data.id) || data.id <= 0) {
        throw Object.assign(new Error("Resposta invalida ao enviar proposta."), {
          code: "SUPABASE_PROPOSTA_CREATE_RESPONSE", resultadoIncerto: true,
        });
      }
      return data.id;
    },

    async listarPorFornecedor(fornecedorId) {
      return require('./propostas-fornecedor.cjs').criarLeituraPropostasFornecedor(cliente).listarPorFornecedor(fornecedorId);
    },
    async listarPorOrganizador(organizadorId) { return listar(true, organizadorId); },
    async listarAdministrativo() { return listar(false); },

    async buscarCotacaoDisponivel(cotacaoId) {
      const { erroResposta } = require("./suporte-leitura.cjs");
      const code = "SUPABASE_PROPOSTA_RESPONSE";
      // CURDATE() usa o dia do banco: nao substituir pelo relogio UTC do Node.
      // PostgreSQL aceita today como entrada DATE. A equivalencia dos fusos
      // MySQL/PostgREST deve ser confirmada na futura validacao integrada.
      const { data, error } = await cliente.schema("public").from("cotacoes")
        .select("id")
        .eq("id", cotacaoId)
        .eq("status", "Aberta")
        .gte("prazo", "today");
      if (error) throw error;
      if (!Array.isArray(data) || data.length > 1 || data.some(item =>
        !item || typeof item !== "object" || Array.isArray(item) ||
        !Number.isSafeInteger(item.id) || item.id <= 0
      )) throw erroResposta(code);
      return data.map(item => ({ id: item.id }));
    },
  };
}

module.exports = { criarRepositorioPropostas };
