"use strict";

// Somente a consulta de propriedade usada pelo GET de custos. Nao implementa
// custos monetarios, escrita ou FOR UPDATE. A fabrica existente conserva o
// controle de configuracao/isolamento; nenhuma rota muda de provedor.
function criarRepositorioCustos(
  cliente = require("../../db-supabase.cjs").criarClienteSupabase()
) {
  return {
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
