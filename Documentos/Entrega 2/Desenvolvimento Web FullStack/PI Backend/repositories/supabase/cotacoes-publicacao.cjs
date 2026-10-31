"use strict";

const { prepararPublicacao } = require("../../services/validacao-publicacao.cjs");
const { decimalTexto } = require("./suporte-leitura.cjs");
const mensagens = {
  TP400: [400, "Informe evento, prazo válido e itens da cotação."],
  TP401: [400, "O prazo da cotação deve ser uma data válida e não pode estar no passado."],
  TP402: [400, "Cadastre custos no evento antes de publicar a cotação."],
  TP403: [403, "Você não tem permissão para realizar esta ação."],
  TP404: [404, "Evento não encontrado ou não pertence ao usuário."],
  TP409: [409, "Os custos foram alterados. Consulte e revise a lista antes de publicar."],
};
const mensagemIncerta = "Não foi possível confirmar a publicação. Consulte as cotações antes de tentar novamente.";
class ErroPublicacao extends Error {}
function erro(code, status, message, incerto = false) {
  return Object.assign(new ErroPublicacao(message), { code, respostaStatus: status, resultadoIncerto: incerto });
}

// Isolado das rotas. usuarioId deve vir EXCLUSIVAMENTE de req.usuario.id.
// hojeUtc e capturado no backend antes da espera pelos locks, como no handler.
function criarAdaptadorPublicacaoCotacoes(cliente, { timeoutMs = 15000, agora = () => new Date() } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 || typeof agora !== "function") {
    throw erro("PUBLICACAO_CONFIG", 500, "Configuração inválida.");
  }
  let banco = cliente;
  return { async publicar(usuarioId, payload) {
    const { evento_id, prazo, observacoes, revisados, hojeUtc } = prepararPublicacao(usuarioId, payload, agora);
    const controle = new AbortController();
    let timer;
    try {
      if (banco === undefined) banco = require("../../db-supabase.cjs").criarClienteSupabase();
      const consulta = banco.schema("public").rpc("publicar_cotacao", {
        p_usuario_id: usuarioId, p_evento_id: Number(evento_id), p_prazo: prazo,
        p_hoje_utc: hojeUtc, p_observacoes: observacoes || "", p_itens: revisados,
      }, { get: false, head: false }).retry(false).abortSignal(controle.signal);
      const limite = new Promise((_, reject) => {
        timer = setTimeout(() => { reject(erro("PUBLICACAO_TIMEOUT", 500, mensagemIncerta, true)); controle.abort(); }, timeoutMs);
      });
      const resposta = await Promise.race([consulta, limite]);
      if (resposta?.error) {
        const codigo = resposta.error.code;
        const contrato = typeof codigo === "string" && Object.hasOwn(mensagens, codigo) && mensagens[codigo];
        if (contrato) throw erro(codigo, ...contrato);
        throw Error("RPC");
      }
      const c = resposta?.data;
      if (!c || typeof c !== "object" || Array.isArray(c) || !Number.isSafeInteger(c.id) || c.id <= 0 || c.evento_id !== Number(evento_id) || c.prazo !== prazo ||
          c.modalidade !== "Fechada" || c.status !== "Aberta" || c.observacoes !== (observacoes || "") ||
          !Array.isArray(c.itens) || c.itens.length !== revisados.length || !c.itens.length) throw Error("resposta");
      const snapshots = Array.from(c.itens, (i, n) => {
        const r = revisados[n];
        if (!i || typeof i !== "object" || Array.isArray(i) || i.categoria !== r.categoria || i.descricao !== r.descricao ||
            decimalTexto(i.valor_estimado, "PUBLICACAO_RESPOSTA") !== r.valor_estimado) throw Error("snapshot");
        return { categoria: i.categoria, descricao: i.descricao, valor_estimado: i.valor_estimado };
      });
      return { mensagem: "Cotação publicada com sucesso!", cotacao: { id: c.id, evento_id: c.evento_id,
        prazo, modalidade: "Fechada", observacoes: c.observacoes, status: "Aberta", itens: snapshots } };
    } catch (falha) {
      if (falha instanceof ErroPublicacao) throw falha;
      throw erro("PUBLICACAO_RESULTADO_INCERTO", 500, mensagemIncerta, true);
    } finally { clearTimeout(timer); controle.abort(); }
  } };
}
module.exports = { criarAdaptadorPublicacaoCotacoes };
