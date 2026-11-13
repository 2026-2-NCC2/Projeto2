'use strict';
const { consultarRpc } = require('../../services/eventos.cjs');
const { falha } = require('../../services/suporte-transacoes.cjs');
function criarRepositorioContratacoes(cliente) {
  async function rpc(nome, args, escrita = false) {
    let resposta;
    try { resposta = await consultarRpc(cliente, nome, args); }
    catch { throw falha(503, 'Resultado não confirmado. Consulte as contratações antes de repetir.', escrita); }
    if (resposta.error) {
      const status = { CT400: 400, CT403: 403, CT404: 404, CT409: 409 }[resposta.error.code];
      if (status) throw falha(status, { 400: 'Dados da contratação inválidos.', 403: 'Operação não autorizada.', 404: 'Registro não encontrado.', 409: 'O registro mudou ou não permite esta operação. Atualize a consulta.' }[status]);
      throw falha(503, 'Resultado não confirmado. Consulte as contratações antes de repetir.', escrita);
    }
    return resposta.data;
  }
  const ator = u => ({ p_ator: u.id, p_perfil: u.perfil });
  return {
    async capacidades() {
      const versao = await rpc('contratacoes_capacidades_v1', {});
      if (versao !== 1) throw falha(503, 'Contratações aguardam preparação autorizada do banco.');
      return { disponivel: true };
    },
    async listar(u, evento) {
      const data = await rpc('listar_contratacoes_v1', { ...ator(u), p_evento: evento });
      if (!Array.isArray(data) || data.some(c => !Number.isSafeInteger(c.id) ||
        (u.perfil === 'fornecedor' && c.fornecedor_id !== u.id) || (u.perfil === 'organizador' && c.organizador_id !== u.id) ||
        (evento !== null && c.evento_id !== evento))) throw falha(503, 'Lista de contratações inválida.');
      return data;
    },
    async formalizar(u, proposta) {
      const data = await rpc('formalizar_contratacao_v1', { p_ator: u.id, p_proposta: proposta }, true);
      if (!Number.isSafeInteger(data?.id) || data.organizador_id !== u.id || data.proposta_id !== proposta) throw falha(503, 'Formalização não confirmada. Consulte a lista.', true);
      return data;
    },
    async alterar(u, contrato, dados) {
      const data = await rpc('alterar_contratacao_v1', { p_ator: u.id, p_contrato: contrato, p_estado: dados.estado, p_motivo: dados.motivo, p_versao: dados.versao }, true);
      if (data?.id !== contrato || data.organizador_id !== u.id || data.estado !== dados.estado) throw falha(503, 'Alteração não confirmada. Consulte a lista.', true);
      return data;
    },
  };
}
module.exports = { criarRepositorioContratacoes };
