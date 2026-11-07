"use strict";
const { createHash } = require('node:crypto');
const artefato = require('../PI React/src/pages/publicas/termosUso.json');
class ErroTermos extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}
function criarTermosCadastro(repo, documento = artefato) {
  const conteudo = JSON.stringify(documento);
  const hash = createHash('sha256').update(conteudo, 'utf8').digest('hex');
  async function vigente() {
    if (documento.estado !== 'aprovado' || typeof documento.aprovacao !== 'string' || !documento.aprovacao.trim() || !repo?.termoVigente) {
      throw new ErroTermos(503, 'Cadastro indisponível: não há Termos de Uso aprovados e publicados.');
    }
    let atual;
    try { atual = await repo.termoVigente(); }
    catch { throw new ErroTermos(503, 'Cadastro indisponível: infraestrutura de aceite não validada.'); }
    if (!atual || atual.documento_id !== documento.id || atual.versao !== documento.versao || atual.hash !== hash || atual.conteudo !== conteudo || atual.ativo !== true || !atual.aprovado_em) {
      throw new ErroTermos(503, 'Cadastro indisponível: publicação dos Termos não confirmada.');
    }
    return { id: documento.id, versao: documento.versao, hash, conteudo: documento };
  }
  async function validar(aceite) {
    if (!aceite || typeof aceite !== 'object' || Array.isArray(aceite) || aceite.aceito !== true ||
      Object.keys(aceite).sort().join(',') !== 'aceito,documento,hash,versao') {
      throw new ErroTermos(400, 'É necessário aceitar os Termos de Uso apresentados para cadastrar a conta.');
    }
    const atual = await vigente();
    if (aceite.documento !== atual.id || aceite.versao !== atual.versao || aceite.hash !== atual.hash) {
      throw new ErroTermos(409, 'A versão dos Termos mudou. Reabra o cadastro e revise o documento antes de aceitar.');
    }
    return { documento: atual.id, versao: atual.versao, hash: atual.hash };
  }
  return { vigente, validar };
}
module.exports = { criarTermosCadastro, ErroTermos };
