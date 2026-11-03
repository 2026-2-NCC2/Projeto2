'use strict';
const {hash}=require('./gate-final-selado.cjs'),{randomUUID}=require('node:crypto');
async function fixture(){
  const f=await require('./substituicao-selada.cjs').fixture(),g=await require('./pos-t1.cjs').fixture(),e=f.estado.ler();
  f.origin.backend.boot=e.transicao.destino;f.origin.controlador.boot='controle-original';f.origin.controlador.codigoSha256='b'.repeat(64);
  const summary=require('../../scripts/gate-reconciliacao-recuperacao.cjs').resumo(f.checkpoint,f.v.snapshot,f.columns);
  const x=structuredClone(g.journal);Object.assign(x,{pid:f.origin.backend.pid,instancia:e.transicao.destino,organizadorId:1,checkpointId:e.transicao.checkpointId,configuracaoHash:e.transicao.configuracaoHash,beforeHash:summary.hashes.supabase,afterHash:summary.hashes.supabase,terminadoEm:f.now()-1000});
  for(const proof of x.verificacoes){proof.baseHash=summary.hashes.supabase;proof.mysqlHash=summary.hashes.mysql;for(const event of proof.eventosNovos)event.usuario_id=1;}
  let journal=Buffer.from(JSON.stringify(x)+'\n');e.transicao.t1={...x,journalSha256:hash(journal)};
  e.controleSelado={id:'controle-anterior',epoch:2,etapa:'ATIVO',fasePreservada:e.transicao.fase,checkpointId:e.transicao.checkpointId,configuracaoHash:e.transicao.configuracaoHash,controlador:structuredClone(f.origin.controlador),supervisor:structuredClone(f.origin.backend),consumidos:['1'.repeat(64),'2'.repeat(64)],ticketControlador:null,ticketSupervisor:null,relatorioFile:'/ficticio/aprovado.json',relatorioAtual:'/ficticio/aprovado.json'};f.estado.gravar(e);
  const read=f.a.inspecionar,post=f.a.inspecionarAposParada;
  f.a.inspecionar=async op=>{const v=await read(op);if(!op.posT1)return v;return {...v,autorizacao:{implantarPosT1:true,referencia:'Autorizacao ficticia implantacao pos T1'},pacote:{schemaVersion:1,manifestBefore:'b'.repeat(64),manifestAfter:'a'.repeat(64),appliedFilesVerified:true},statusOrigemBytes:Buffer.from(JSON.stringify({ok:true,pedido:randomUUID(),nonce:randomUUID(),controllerPid:101,supervisorPid:202,verificadoEm:f.now()})),t1JournalBytes:journal,estadoBytes:Buffer.from(JSON.stringify(f.estado.ler())+'\n'),estadoSha256:hash(f.estado.ler())};};
  f.a.inspecionarAposParada=async()=>({...await post(),t1JournalBytes:journal,respondedor:f.bridge});
  return {...f,summary,journal:()=>journal,changeJournal:bytes=>{journal=bytes;},authorization:{autorizar:true,autorizarImplantacaoPosT1:true}};
}
module.exports={fixture};
