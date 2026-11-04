"use strict";
const { validarProfissional } = require("../../perfil-profissional.cjs");
const campos = "id, perfil, redes_sociais, dados_comerciais";
function conferir({ data, error }, id) {
  if (error) {
    if (["42703", "PGRST204"].includes(error.code)) throw Object.assign(new Error("Migração profissional pendente."), { code: "PROFISSIONAL_MIGRACAO_PENDENTE" });
    throw error;
  }
  if (data === null) return undefined;
  if (!data || data.id !== id || !["organizador", "fornecedor", "participante", "admin"].includes(data.perfil) ||
      !Object.hasOwn(data, "redes_sociais") || !Object.hasOwn(data, "dados_comerciais")) throw new Error("Resposta profissional inválida.");
  const redes = validarProfissional({ redes_sociais: data.redes_sociais }, data.perfil).redes_sociais;
  // Mudanças de papel não expõem dados comerciais de um papel anterior.
  let comerciais = null;
  if (["fornecedor", "organizador"].includes(data.perfil)) {
    const valor = data.dados_comerciais;
    const visiveis = data.perfil === "organizador" && valor && typeof valor === "object" && !Array.isArray(valor)
      ? Object.fromEntries(Object.entries(valor).filter(([k]) => k !== "categorias_servicos")) : valor;
    comerciais = validarProfissional({ dados_comerciais: visiveis }, data.perfil).dados_comerciais;
  }
  return { id, perfil: data.perfil, redes_sociais: redes, dados_comerciais: comerciais, edicao_disponivel: true };
}
function criarRepositorioProfissional(cliente) {
  return {
    async buscarProfissional(id) {
      return conferir(await cliente.schema("public").from("usuarios").select(campos).eq("id", id).maybeSingle(), id);
    },
    async atualizarProfissional(id, perfil, dados) {
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Identidade inválida.");
      const valores = validarProfissional(dados, perfil);
      // Mesmo filtro de papel na escrita evita gravar permissões de um papel alterado durante a requisição.
      const resposta = conferir(await cliente.schema("public").from("usuarios").update(valores)
        .eq("id", id).eq("perfil", perfil).select(campos).maybeSingle().retry(false), id);
      if (resposta && Object.entries(valores).some(([k, v]) => !require("node:util").isDeepStrictEqual(resposta[k], v))) throw new Error("Persistência profissional não confirmada.");
      return resposta;
    },
  };
}
module.exports = { criarRepositorioProfissional };
