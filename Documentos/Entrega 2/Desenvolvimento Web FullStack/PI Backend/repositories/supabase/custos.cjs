"use strict";

// Leituras independentes do GET. Nao fornece conexao, escrita ou FOR UPDATE.
// O PUT Supabase pertence ao adaptador custos-transacao.cjs: a releitura ocorre
// DENTRO da RPC, nunca por uma chamada a este repositorio apos o commit.
// A fabrica conserva configuracao/isolamento; nenhuma rota muda de provedor.
function criarRepositorioCustos(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase()
) {
  return {
    async listarPorEvento(id) {
      // Contrato deliberadamente diferente do MySQL listarPorEvento(id, conexao).
      // Recusar ate undefined explicito: nao fingir que o segundo argumento foi
      // usado para compartilhar uma transacao entre requisicoes REST.
      if (arguments.length > 1) {
        throw Object.assign(new Error("Leitura Supabase independente; conexao transacional nao suportada. Use a substituicao atomica por RPC."), {
          code: "SUPABASE_CUSTO_CONNECTION_UNSUPPORTED",
        });
      }
      const { erroResposta, listarPaginas, decimalTexto } = require("./suporte-leitura.cjs");
      const code = "SUPABASE_CUSTO_RESPONSE";
      let anterior = 0;
      return listarPaginas(() => cliente.schema("public").from("custos_evento")
        .select("id, evento_id, categoria, descricao, valor_estimado::text", { count: "exact" })
        .eq("evento_id", id)
        .order("id", { ascending: true })
        .retry(false), item => {
        if (["id", "evento_id", "categoria", "descricao", "valor_estimado"].some(campo => !Object.hasOwn(item, campo)) ||
            item.evento_id !== id || item.id <= anterior || typeof item.categoria !== "string" ||
            typeof item.descricao !== "string") throw erroResposta(code);
        const valor = decimalTexto(item.valor_estimado, code);
        // Nao aceitar newline final como fim de expressao regular, nem corrigir
        // por trim. Valores historicos negativos continuam validos na LEITURA.
        if (valor !== valor.trim()) throw erroResposta(code);
        anterior = item.id;
        return { id: item.id, evento_id: item.evento_id, categoria: item.categoria,
          descricao: item.descricao, valor_estimado: valor };
      }, code);
    },

    async buscarEventoDoUsuario(id, usuarioId) {
      const { data, error } = await cliente.schema("public")
        .from("eventos")
        .select("id")
        .eq("id", id)
        .eq("usuario_id", usuarioId);

      if (error) throw error;
      if (!Array.isArray(data) || data.length > 1 || data.some(evento =>
        !evento || typeof evento !== "object" || Array.isArray(evento) || evento.id !== id
      )) {
        throw Object.assign(new Error("Resposta invalida ao consultar evento proprio."), {
          code: "SUPABASE_CUSTO_RESPONSE",
        });
      }
      return data.map(evento => ({ id: evento.id }));
    },
  };
}

module.exports = { criarRepositorioCustos };
