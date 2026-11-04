'use strict';
async function prepararImagensEvento(opcoes) {
  const ativacao=require('./config/ativacao-eventos-imagens.json');
  if(ativacao.versao!==1||typeof ativacao.ativo!=='boolean'||ativacao.projeto!=='gnwybroqfvwosiqzsfla')throw Error('EVENTOS_IMAGENS_ATIVACAO_INVALIDA');
  if(!ativacao.ativo)return null;
  if(!/^evidencias\/eventos-imagens-descartaveis-[0-9a-f-]{36}\.json$/.test(ativacao.evidencia||''))throw Error('EVENTOS_IMAGENS_HOMOLOGACAO_PENDENTE');
  const evidencia=require('./'+ativacao.evidencia);
  if(evidencia.aprovado!==true||evidencia.projeto!==ativacao.projeto)throw Error('EVENTOS_IMAGENS_HOMOLOGACAO_PENDENTE');
  const infra=await require('./scripts/preflight-eventos-imagens.cjs').executar(opcoes.env);
  if(!infra.pronto)throw Error('EVENTOS_IMAGENS_INFRA_INDISPONIVEL');
  return require('./eventos-imagens.cjs').prepararIntegracaoImagensEvento(opcoes);
}
module.exports={prepararImagensEvento};
