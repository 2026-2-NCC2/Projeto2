'use strict';
// Não migra, não cria contas/buckets e não altera credenciais. Toda ativação
// repete o preflight de leitura no projeto de produção explicitamente validado.
async function prepararImagens({env,supervisor}){
  const preflight=require('../scripts/preflight-imagens-producao.cjs');
  const evidencia=await preflight.executar(env,{exigirDiarioVazio:false,validarContasTeste:true});
  if(!evidencia.aprovado)throw Object.assign(Error('Imagens recusadas pelo preflight.'),{code:'IMAGENS_PREFLIGHT',etapa:evidencia.bloqueio});
  const {c,pg}=preflight.configurar(env);
  const pool=require('../db-postgres.js').criarPoolPostgres(pg,{queryTimeoutMs:10000});
  const clienteStorage=require('./cliente-storage.cjs').criarClienteStorage(c);
  const contasTeste=require('./contas-teste.cjs').criarCicloContasTeste({pool,clienteStorage});
  const integracao=require('./integracao.cjs').prepararIntegracaoImagens({pool,clienteStorage,origemStorage:c.url,supervisor,contasTeste});
  let eventos;
  try{eventos=await require('../eventos-imagens-inicializacao.cjs').prepararImagensEvento({env,pool,clienteStorage,origemStorage:c.url,supervisor,contasTeste});}
  catch(e){await pool.end();throw e;}
  let timer, limpezaEmAndamento, parando = false;
  async function limpar(opcoes) {
    if (parando || limpezaEmAndamento) return;
    limpezaEmAndamento = (async()=>{
      // Um único timer e uma única drenagem, compartilhados com fotos de perfil.
      // Uma falha de perfil não impede a tentativa do diário de eventos.
      const resultados=await Promise.allSettled([integracao.limpar(opcoes),...(eventos?[eventos.limpar(opcoes)]:[])]);
      const falha=resultados.find(r=>r.status==='rejected');if(falha)throw falha.reason;
      return resultados[0].value;
    })();
    try { return await limpezaEmAndamento; }
    finally { limpezaEmAndamento = undefined; }
  }
  async function pararLimpeza() {
    parando = true;
    clearInterval(timer);
    await limpezaEmAndamento;
  }
  return {integracao,eventos,contasTeste,pool,evidencia,
    async iniciarLimpeza(){
      if(timer || parando || limpezaEmAndamento)throw Error('Limpeza já agendada.');
      const diagnostico=await limpar(); // dry-run obrigatório
      if (parando) return diagnostico;
      timer=setInterval(()=>limpar({executar:true}).catch(()=>console.error('[Imagens] Limpeza pendente; diário preservado.')),60000);
      timer.unref();return diagnostico;
    },
    pararLimpeza,
    async fechar(){await pararLimpeza();await pool.end();},
  };
}
module.exports={prepararImagens};
