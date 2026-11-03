'use strict';
// Inerte. O adaptador operacional deve usar o canal original; nunca o adotar.
const assert=require('node:assert/strict');
const UUID=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function validarResultadoFerramenta(result) {
  assert.ok(result&&Number.isInteger(result.exit_code)&&result.exit_code===0&&!result.session_id,'FERRAMENTA_PROCESSO_NAO_APROVADO');
  assert.ok(typeof result.output==='string'&&result.output.length<=65536,'FERRAMENTA_SAIDA_INVALIDA');
  let receipt;try{receipt=JSON.parse(result.output);}catch{throw Error('FERRAMENTA_JSON_INVALIDO');}
  assert.ok(receipt&&!Array.isArray(receipt)&&receipt.ok===true&&receipt.exit_code===0,'FERRAMENTA_RECIBO_RECUSADO');
  return receipt;
}
function criarContinuidade({controllerPid,supervisorPid,lerStatus,publicar,agora=Date.now,monotono=()=>require('node:perf_hooks').performance.now()}) {
  let busy=false,failed=false,last=null,lastMono,receipt=null;
  const pedidos=new Set(),nonces=new Set();
  const recusar=code=>{throw Error(code);};
  function recente(o,limit=30000) {
    assert.ok(o&&o.ok===true&&o.controllerPid===controllerPid&&o.supervisorPid===supervisorPid,'OBS_IDENTIDADE_RECUSADA');
    assert.ok(UUID.test(o.pedido)&&UUID.test(o.nonce),'OBS_UUID_INVALIDO');
    assert.ok(Number.isSafeInteger(o.verificadoEm)&&o.verificadoEm<=agora()&&agora()-o.verificadoEm<limit,'OBS_EXPIRADA');
  }
  return {
    async atualizar() {
      if(failed)recusar('OBS_SEQUENCIA_INTERROMPIDA');
      if(busy)recusar('OBS_CONCORRENTE');busy=true;
      try {
        const started=monotono(),o=await lerStatus();recente(o,10000);
        assert.ok(!pedidos.has(o.pedido)&&!nonces.has(o.nonce),'OBS_REUTILIZADA');
        pedidos.add(o.pedido);nonces.add(o.nonce);
        if(last)assert.ok(o.verificadoEm>last.verificadoEm,'OBS_ORDEM_RECUSADA');
        const r=await publicar(o,receipt?.statusSha256||null);
        assert.ok(r&&r.ok===true&&r.exit_code===0&&/^[a-f0-9]{64}$/.test(r.statusSha256),'OBS_PUBLICACAO_RECUSADA');
        recente(o,15000);assert.ok(monotono()-started<15000,'OBS_ORCAMENTO_EXCEDIDO');
        last=structuredClone(o);lastMono=monotono();receipt=structuredClone(r);return structuredClone(r);
      } catch(e) {failed=true;throw e;} finally {busy=false;}
    },
    conferirAntesDeEtapa() {
      assert.ok(!failed&&!busy&&last&&receipt,'OBS_NAO_CONFIRMADA');recente(last,15000);
      assert.ok(monotono()>=lastMono&&monotono()-lastMono<15000,'OBS_RELOGIO_OU_PAUSA');
      return structuredClone(receipt);
    },
    interromper(){failed=true;},
  };
}
async function acompanharPreflight({continuidade,consultarProcesso,esperar}) {
  // Reserva e lancamento pertencem ao coordenador oficial. Aqui nao ha spawn,
  // admissao, estado, tickets, dados ou encerramento de processos.
  let fenced=false;
  try {
    for(;;) {
      if(!fenced)continuidade.conferirAntesDeEtapa();
      const result=await consultarProcesso();
      assert.ok(result&&typeof result.running==='boolean','PROCESSO_RESULTADO_AUSENTE');
      if(!fenced)continuidade.conferirAntesDeEtapa();
      if(!result.running) {
        assert.ok(Number.isInteger(result.exit_code)&&result.exit_code===0,'PROCESSO_RECUSADO');
        assert.ok(result.admissaoConfirmada===true&&result.ipcExclusivo===true&&result.httpStatus===503,'PROCESSO_SEM_CONFIRMACAO');
        return result;
      }
      // O adaptador deve conferir estado+identidade reais, nao somente stdout.
      if(result.fenceVerificado===true)fenced=true;
      if(!fenced)await continuidade.atualizar();
      await esperar(5000);
    }
  } catch(e) {continuidade.interromper();throw e;}
}
module.exports={criarContinuidade,acompanharPreflight,validarResultadoFerramenta};
