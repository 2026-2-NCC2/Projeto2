'use strict';
const path=require('node:path'),{randomUUID}=require('node:crypto'),{hash}=require('./gate-final-selado.cjs');
async function fixture(options){
  const f=await require('./operacoes-controlador.cjs').fixture(options);await f.ops.smoke();
  f.estado.diretorio='/ficticio/state';const before=await f.o.leitura();
  const summary=require('../../scripts/gate-reconciliacao-recuperacao.cjs').resumo(f.checkpoint,before.snapshot,f.columns),e=f.estado.ler(),run=randomUUID(),marker='TT-T1-'+run;
  const ev={id:99,usuario_id:4,nome:marker,descricao:marker},cost={id:99,evento_id:99,descricao:marker,valor_estimado:'0.10'};
  const journal={run,marker,organizadorId:4,checkpointId:e.transicao.checkpointId,configuracaoHash:e.transicao.configuracaoHash,pid:e.transicao.pidDestino,instancia:e.transicao.destino,etapa:'CONCLUIDA',autorizacao:'Autorizacao ficticia T1',createdEventIds:[99],createdCostIds:[99],beforeHash:summary.hashes.supabase,afterHash:summary.hashes.supabase,unknownResult:false,retryCount:0,cleanupVerified:true,additional10RowsPreserved:true,terminadoEm:f.now()-1000,operacoes:[['POST','/eventos',201],['PUT','/eventos/99/custos',200],['SQL','LIMPEZA_IDS',200]].map(([method,route,status])=>({id:randomUUID(),method,route,status,iniciadoEm:f.now()-2000})),verificacoes:[0,1,2].map(i=>({baseHash:summary.hashes.supabase,mysqlHash:summary.hashes.mysql,eventosNovos:i===2?[]:[ev],custosNovos:i===1?[cost]:[]}))};
  const file=path.normalize(path.join(f.estado.diretorio,'t1-'+run+'.privado.json'));
  function saveJournal(x=journal){const bytes=Buffer.from(JSON.stringify(x)+'\n');f.files.set(file,bytes);const n=f.estado.ler();n.transicao.t1={...structuredClone(x),journalSha256:hash(bytes)};f.estado.gravar(n);}
  saveJournal();const originalRead=f.o.leitura;let readCount=0;
  f.o.leitura=async(...args)=>{readCount++;const v=await originalRead(...args);if(options?.sequencias)for(const seq of v.snapshot.catalogos.supabase.sequences)if(['eventos_id_seq','custos_evento_id_seq'].includes(seq.sequencename))seq.last_value=99;return v;};
  return {...f,journal,journalFile:file,saveJournal,summary,reads:()=>readCount,auth:{run,autorizarRenovacao:true,referenciaAutorizacao:'Autorizacao ficticia renovacao pos T1'}};
}
module.exports={fixture};
