'use strict';
// Futuro dono do IPC: entrada herdada, sem endpoint HTTP nem adocao de outro pai.
function criarComandosControlador({entrada,saida,continuidade,preparar,executar,liberar,smoke,revogarPlano,validarPlano}){
  let instalado=false,fechado=false,ocupado=false,buffer='',planejado,concluida;const usados=new Set();
  const enviar=x=>{if(fechado)return;try{saida.write(JSON.stringify(x)+'\n');}catch{fechar();}};
  function descartarAtual(){const old=planejado;planejado=undefined;if(old)revogarPlano?.(old);}
  function fechar(){if(fechado)return;fechado=true;try{descartarAtual();}finally{continuidade.revogar();entrada.removeListener('data',dados);entrada.removeListener('end',fechar);entrada.removeListener('error',fechar);saida.removeListener('error',fechar);saida.removeListener('close',fechar);}}
  async function emitir(m,anterior){await continuidade.conferir();if(fechado)throw Error();const novo=await preparar();if(fechado||novo.run===anterior){revogarPlano?.(novo);throw Error();}planejado=novo;enviar({pedido:m.pedido,ok:true,run:novo.run,checkpointId:novo.gate.checkpointId,emitidoEm:novo.emitidoEm,expiraEm:novo.expiraEm,...(anterior?{runAnteriorRevogado:anterior}:{})});}
  async function linha(line){
    let m;try{m=JSON.parse(line);}catch{enviar({ok:false,code:'CONTROLE_JSON_RECUSADO'});return;}
    if(fechado||ocupado||!m||typeof m!=='object'||Array.isArray(m)||typeof m.pedido!=='string'||!/^[a-f0-9-]{36}$/.test(m.pedido)||usados.has(m.pedido)||usados.size>=1024){enviar({ok:false,code:'CONTROLE_PEDIDO_RECUSADO'});return;}
    usados.add(m.pedido);ocupado=true;
    try{
      if(m.acao==='status'){const r=await continuidade.conferir();enviar({pedido:m.pedido,ok:true,controllerPid:r.controller.pid,supervisorPid:r.backend.pid,nonce:r.nonce,verificadoEm:r.fim});}
      else if(m.acao==='smoke-isolado'){if(m.autorizarSmoke!==true||typeof smoke!=='function')throw Error();descartarAtual();await continuidade.conferir();if(fechado)throw Error();const r=await smoke();enviar({pedido:m.pedido,ok:true,status:r.status,requests:r.requests,reportFile:r.reportFile});}
      else if(m.acao==='preparar-t1'){if(planejado||concluida)throw Error();await emitir(m);}
      else if(m.acao==='renovar-plano-t1'){if(!planejado||concluida||m.autorizarReemissao!==true||m.runAnterior!==planejado.run||typeof revogarPlano!=='function')throw Error();const anterior=planejado.run;descartarAtual();await emitir(m,anterior);}
      else if(m.acao==='executar-t1'){if(!planejado||m.autorizarT1!==true||m.run!==planejado.run||typeof m.referenciaAutorizacao!=='string'||m.referenciaAutorizacao.length<8)throw Error();await continuidade.conferir();if(fechado)throw Error();validarPlano?.(planejado);const p=planejado;planejado=undefined;const r=await executar(p,{autorizarT1:true,referenciaAutorizacao:m.referenciaAutorizacao});if(r.etapa==='CONCLUIDA'&&r.cleanupVerified&&r.unknownResult===false)concluida={run:r.run};enviar({pedido:m.pedido,ok:true,run:r.run,etapa:r.etapa,createdEventIds:r.createdEventIds,createdCostIds:r.createdCostIds,cleanupVerified:r.cleanupVerified,unknownResult:r.unknownResult});}
      else if(m.acao==='liberar-selado'){if(typeof liberar!=='function'||!concluida||m.autorizarLiberacao!==true||m.run!==concluida.run||typeof m.referenciaAutorizacao!=='string'||m.referenciaAutorizacao.length<8)throw Error();await continuidade.conferir();if(fechado)throw Error();const done=concluida;concluida=undefined;await liberar({run:done.run,autorizarEscritas:true,referenciaAutorizacao:m.referenciaAutorizacao});enviar({pedido:m.pedido,ok:true,run:done.run,etapa:'LIBERADA'});}
      else throw Error();
    }catch(error){const seguros=new Set(['T1_PLANO_EXPIRADO','T1_PLANO_REVOGADO','T1_PLANO_CONSUMIDO','T1_EM_EXECUCAO','T1_EMISSAO_EM_ANDAMENTO','T1_EMISSAO_REUTILIZADA']);enviar({pedido:m.pedido,ok:false,code:seguros.has(error?.code)?error.code:'CONTROLE_OPERACAO_RECUSADA'});}finally{ocupado=false;}
  }
  function dados(chunk){if(fechado)return;buffer+=chunk.toString();if(Buffer.byteLength(buffer)>4096){buffer='';enviar({ok:false,code:'CONTROLE_LIMITE_EXCEDIDO'});fechar();return;}let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);void linha(line);}}
  return {instalar(){if(instalado||fechado)throw Error('CONTROLE_CANAL_RECUSADO');instalado=true;entrada.on('data',dados);entrada.once('end',fechar);entrada.once('error',fechar);saida.once('error',fechar);saida.once('close',fechar);},fechar};
}
module.exports={criarComandosControlador};
