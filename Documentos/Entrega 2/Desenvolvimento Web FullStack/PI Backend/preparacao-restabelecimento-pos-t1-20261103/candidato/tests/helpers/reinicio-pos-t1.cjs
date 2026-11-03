'use strict';
const {fixture:base}=require('./implantacao-pos-t1.cjs'),crypto=require('node:crypto');
async function fixture(){
 const f=await base();f.simularQueda();const read=f.a.inspecionar;
 f.a.inspecionar=async op=>{const v=await read(op);if(!op.reinicioPosT1)return v;const r=f.estado.ler().controleSelado;
  v.candidato.criadoEm=new Date(f.now()-400).toISOString();v.respondedor=structuredClone(f.bridge);
  v.autorizacao={restabelecerPosT1:true,riscoResidualAceito:true,historicoNaoComprovado:true,referencia:'Autorizacao ficticia pos reboot T1'};
  v.provaReinicio={todosAusentes:true,presentes:[],pidsConsultados:[r.controlador.pid,r.supervisor.pid],lastBootUtc:new Date(f.now()-500).toISOString(),capturedUtc:new Date(f.now()).toISOString()};
  const report={...JSON.parse(v.relatorioBytes),finishedUtc:new Date(f.now()-2000).toISOString()};v.relatorioBytes=Buffer.from(JSON.stringify(report));v.relatorioSha256=crypto.createHash('sha256').update(v.relatorioBytes).digest('hex');
  delete v.statusOrigemBytes;
  for(const w of [v.writersBefore,v.writersAfter]){w.local.knownBackend=null;w.local.knownMaintenanceResponder=structuredClone(f.bridge);}return v;
 };
 return {...f,authorization:{autorizar:true,autorizarRestabelecimentoPosT1:true}};
}
module.exports={fixture};
