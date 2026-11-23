"use strict";
// Configuracao pura: nao le .env, banco, estado privado ou servicos externos.
function configurarHospedagem(env = {}) {
  if (env.TROCATICKET_DEMONSTRACAO !== undefined && !['true', 'false'].includes(env.TROCATICKET_DEMONSTRACAO)) {
    throw new Error('HOSPEDAGEM_DEMONSTRACAO_INVALIDA');
  }
  const demonstracao = env.TROCATICKET_DEMONSTRACAO === 'true';
  if (demonstracao && (env.TROCATICKET_HOMOLOGACAO !== undefined ||
      (env.TROCATICKET_AMBIENTE !== undefined && env.TROCATICKET_AMBIENTE !== 'principal'))) {
    throw new Error('HOSPEDAGEM_MODOS_INCOMPATIVEIS');
  }
  const producao = env.NODE_ENV === 'production';
  const origem = env.CORS_ORIGIN === undefined && !producao && !demonstracao
    ? 'http://localhost:5173' : env.CORS_ORIGIN;
  let url;
  try {
    if (typeof origem !== 'string' || !origem || /[\s,*]/u.test(origem)) throw Error();
    url = new URL(origem);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== origem || url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !producao && !demonstracao)) ||
        ((producao || demonstracao) && local)) throw Error();
  } catch {
    throw new Error('HOSPEDAGEM_CORS_ORIGIN_INVALIDA');
  }
  if (producao && env.TROCATICKET_DEMONSTRACAO === undefined) {
    throw new Error('HOSPEDAGEM_MODO_EXPLICITO_OBRIGATORIO');
  }
  return Object.freeze({ demonstracao, origemCors: url.origin });
}
module.exports = { configurarHospedagem };
