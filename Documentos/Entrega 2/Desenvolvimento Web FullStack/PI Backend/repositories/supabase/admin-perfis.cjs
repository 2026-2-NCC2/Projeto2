'use strict';
const { consultarRpc } = require('../../services/eventos.cjs');
function criarRepositorioAdminPerfis(cliente) {
  return {
    async capacidades() {
      const r = await consultarRpc(cliente, 'admin_perfis_capacidades_v1', {});
      if (r.error || r.data !== 1) throw Error('Capacidade não confirmada.');
      return true;
    },
    async alterar(admin, usuario, dados, chave) {
      const r = await consultarRpc(cliente, 'alterar_perfil_admin_v1', {
        p_admin: admin, p_usuario: usuario, p_anterior: dados.perfil_anterior,
        p_novo: dados.perfil_novo, p_motivo: dados.motivo, p_chave: chave,
      });
      const erros = {
        AP400: [400, 'Dados da alteração inválidos.'], AP403: [403, 'Seu acesso administrativo não está mais disponível.'],
        AP404: [404, 'Usuário não encontrado.'], AP409: [409, 'O perfil mudou ou a conta está indisponível. Atualize a lista.'],
        AP412: [409, 'Não é permitido remover o último administrador autorizado.'],
        AP413: [409, 'Não é permitido remover seu próprio acesso administrativo.'],
        '55P03': [409, 'Há outra operação em andamento. Atualize a lista antes de tentar novamente.'],
        '40P01': [409, 'Houve uma alteração concorrente. Atualize a lista antes de tentar novamente.'],
      };
      if (r.error) {
        const e = erros[r.error.code];
        if (e) throw Object.assign(Error(e[1]), { respostaStatus: e[0], seguro: true, resultadoIncerto: false });
        throw Error('Resultado não confirmado.');
      }
      if (r.data?.id !== usuario || r.data?.perfil !== dados.perfil_novo || r.data?.confirmado !== true) throw Error('Resposta incompleta.');
      return { id: r.data.id, perfil: r.data.perfil };
    },
  };
}
module.exports = { criarRepositorioAdminPerfis };
