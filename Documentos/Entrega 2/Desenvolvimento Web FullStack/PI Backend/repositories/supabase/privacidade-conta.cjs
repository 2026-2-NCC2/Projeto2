'use strict';

// Cliente selecionado pela fábrica existente. Sem configuração, escrita ou fallback.
function criarRepositorioPrivacidade(cliente, { portfolioAtivo = false } = {}) {
  const tabela = nome => cliente.schema('public').from(nome);
  const pendente = e => ['42P01', 'PGRST205'].includes(e?.code);
  const secao = dados => ({ estado: 'disponivel', dados });
  async function contar(nome, campo, id) {
    const { error, count } = await tabela(nome).select('id', { count: 'exact', head: true }).eq(campo, id);
    if (error) throw error;
    if (!Number.isSafeInteger(count) || count < 0) throw Error('Contagem não confirmada.');
    return count;
  }
  async function aceites(id) {
    const itens = [], chaves = new Set();
    let total;
    do {
      const { data, error, count } = await tabela('termos_aceites')
        .select('usuario_id,documento_id,versao,hash,aceito_em,fluxo', { count: 'exact' })
        .eq('usuario_id', id).order('documento_id').order('versao').range(itens.length, itens.length + 99);
      if (error) {
        if (pendente(error) && itens.length === 0) return { estado: 'infraestrutura_pendente', dados: null };
        throw error;
      }
      if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 ||
          (total !== undefined && count !== total) || itens.length + data.length > count ||
          (!data.length && itens.length < count)) throw Error('Aceites não confirmados.');
      total = count;
      for (const item of data) {
        const chave = JSON.stringify([item.documento_id, item.versao]);
        if (item.usuario_id !== id || item.documento_id !== 'termos-uso' ||
            typeof item.versao !== 'string' || !item.versao ||
            typeof item.hash !== 'string' || !/^[a-f0-9]{64}$/.test(item.hash) ||
            typeof item.aceito_em !== 'string' || !Number.isFinite(Date.parse(item.aceito_em)) ||
            item.fluxo !== 'cadastro' || chaves.has(chave)) throw Error('Aceite inválido.');
        chaves.add(chave);
        // hash identifica o DOCUMENTO aceito, nunca a senha ou credencial.
        itens.push({ documento: item.documento_id, versao: item.versao,
          hash_documento: item.hash, aceito_em: item.aceito_em, fluxo: item.fluxo });
      }
    } while (itens.length < total);
    return secao(itens);
  }
  return {
    // Nome já classificado como leitura pelo supervisor existente.
    async listarPorUsuario(id) {
      if (!Number.isSafeInteger(id) || id <= 0) throw Error('Identidade inválida.');
      const atividades = {};
      // Somente contagens do próprio titular, inclusive de papéis anteriores.
      // Não consulta textos de eventos, clientes, cotações ou propostas concorrentes.
      for (const [chave, nome, campo] of [
        ['eventos_organizados', 'eventos', 'usuario_id'],
        ['inscricoes', 'inscricoes', 'usuario_id'],
        ['propostas_enviadas', 'propostas', 'fornecedor_id'],
        ['solicitacoes_acesso', 'solicitacoes_acesso', 'usuario_id'],
      ]) atividades[chave] = await contar(nome, campo, id);
      let portfolio = { estado: 'nao_habilitado', dados: null };
      if (portfolioAtivo) {
        try { portfolio = secao({ itens: await contar('portfolio_itens', 'fornecedor_id', id) }); }
        catch (e) { if (!pendente(e)) throw e; portfolio = { estado: 'infraestrutura_pendente', dados: null }; }
      }
      return { atividades: secao(atividades), portfolio, aceites: await aceites(id) };
    },
  };
}
module.exports = { criarRepositorioPrivacidade };
