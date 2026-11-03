'use strict';
const {fixture:base}=require('./reinicio-pos-t1.cjs'),crypto=require('node:crypto');
async function fixture(){
 const f=await base(),initial=f.api(),p=await initial.planejarReinicioPosT1();await initial.executar(p,f.authorization);
 const failed=f.estado.ler();failed.controleSelado.etapa='FALHA';failed.controleSelado.motivo='VALIDACAO_REINICIO_RECUSADA';failed.controleSelado.respondedor=structuredClone(f.bridge);failed.controleSelado.protecaoAposFalha={known503:true,pid:f.bridge.pid};f.estado.gravar(failed);f.simularQueda();f.changeCandidate(505);f.events.length=0;
 const read=f.a.inspecionar;
 f.a.inspecionar=async op=>{const v=await read({...op,posT1:true});if(!op.recuperacaoFalhaPosT1)return v;const e=f.estado.ler(),r=e.controleSelado;v.candidato.codigoSha256='c'.repeat(64);v.origem={backend:structuredClone(r.supervisor),controlador:structuredClone(r.controlador)};v.respondedor=structuredClone(r.respondedor);v.pacote={schemaVersion:1,manifestBefore:r.controlador.codigoSha256,manifestAfter:v.candidato.codigoSha256,appliedFilesVerified:true};v.autorizacao={recuperarFalhaPosT1:true,riscoResidualAceito:true,historicoNaoComprovado:true,referencia:'Autorizacao ficticia recuperacao FALHA'};v.provaAusencia={todosAusentes:true,presentes:[],pidsConsultados:require('../../scripts/preflight-falha-pos-t1.cjs').pids(e),capturedUtc:new Date(f.now()).toISOString()};delete v.statusOrigemBytes;for(const w of [v.writersBefore,v.writersAfter]){w.local.knownBackend=null;w.local.knownMaintenanceResponder=structuredClone(r.respondedor);}return v;};
 return {...f,failed:()=>structuredClone(failed),authorization:{autorizar:true,autorizarRecuperacaoFalhaPosT1:true}};
}
module.exports={fixture};
