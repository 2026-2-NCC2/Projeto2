'use strict';
const { consultarRpc, erroRpc } = require('../../services/eventos.cjs');
const { falha } = require('../../services/suporte-transacoes.cjs');

function criarRepositorioAdminEventos(cliente) {
  return {
    async capacidades() {
      const { data, error } = await consultarRpc(cliente, 'admin_eventos_capacidades_v1', {});
      if (error || data?.versao !== 1 || typeof data.controleCapacidade !== 'boolean') {
        throw falha(503, 'Criação administrativa aguarda preparação autorizada do banco.');
      }
      return { criar: true, controleCapacidade: data.controleCapacidade };
    },
    async criar(adminId, organizadorId, dados, chave) {
      const { data, error } = await consultarRpc(cliente, 'criar_evento_admin_v1', {
        p_admin: adminId, p_organizador: organizadorId, p_dados: dados, p_chave: chave,
      });
      if (error) erroRpc(error);
      if (!Number.isSafeInteger(data?.id) || data.id <= 0 || data.usuario_id !== organizadorId ||
          data.admin_criador_id !== adminId) throw falha(503, 'Resultado não confirmado. Consulte Eventos antes de repetir.', true);
      // A resposta pública não expõe o diário ou o payload de idempotência.
      return { id: data.id, usuario_id: data.usuario_id };
    },
    async reconciliarCriacao(adminId,organizadorId,dados,chave){
      return require('../../services/eventos.cjs').reconciliarCriacaoConfirmada(cliente,{
        tabela:'eventos_criacao_admin',identificador:'evento_id',filtros:{admin_id:adminId,chave},chave,
      },()=>this.criar(adminId,organizadorId,dados,chave));
    },
  };
}
module.exports = { criarRepositorioAdminEventos };
