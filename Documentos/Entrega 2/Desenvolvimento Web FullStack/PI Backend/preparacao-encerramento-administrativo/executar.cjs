'use strict';
// Nenhuma execucao ao importar. Exige autorizacao CLI e nova reconciliacao apos a parada.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(args){assert.equal(args[0],'--encerrar-autorizado');assert.ok(args.includes('--aceitar-reconciliacao-atual-e-lacunas'));
 const arg=k=>{const i=args.indexOf(k);assert.ok(i>=0&&args[i+1]);return args[i+1];},ref=arg('--referencia'),prior=JSON.parse(fs.readFileSync(arg('--relatorio'))),historyFile=path.resolve(arg('--historico-antes-parada')),history=fs.readFileSync(historyFile);
 assert.equal(prior.status,'RECONCILIACAO_ADMINISTRATIVA_APROVADA');assert.equal(sha(history),prior.stateSha256);assert.ok(ref.trim().length>=8);
 const {e,env,v,state}=await require('./reconciliar.cjs').coletar({processosEncerrados:true});
 for(const k of ['controlador','supervisor'])assert.deepEqual(e.controleSelado[k],prior[k==='controlador'?'controller':'supervisor']);
 assert.equal(sha(v.checkpointBytes),prior.checkpointSha256);assert.equal(sha(v.journalBytes),prior.journalSha256);assert.equal(v.environmentSha256,prior.environmentSha256);
 const root=path.resolve(__dirname,'..'),locator=JSON.parse(fs.readFileSync(path.join(root,'evidencias/janela-final-real-20261031.json')));
 const ps=async(name,args)=>JSON.parse((await require('../scripts/helper-powershell.cjs').executarHelper(name,args)).toString().replace(/^\uFEFF/,''));
 const result=await require('./transicao.cjs').encerrar({estado:state,env,v,auth:{autorizarEncerramento:true,aceitarReconciliacaoAtual:true,reconhecerLacunaHistorica:true,reconhecerSnapshotAusente:true,referencia:ref},
  async confirmarAusencia(c,s){assert.equal(sha(fs.readFileSync(path.join(root,'.env'))),v.environmentSha256);assert.equal(sha(fs.readFileSync(path.join(locator.t0Directory,'checkpoint-t0.privado.json'))),prior.checkpointSha256);assert.equal(sha(fs.readFileSync(path.join(state.diretorio,'t1-'+e.transicao.t1.run+'.privado.json'))),prior.journalSha256);const p=await ps('processo-substituicao-selada.ps1',['-Modo','ausentes','-PidsAnteriores',[c.pid,s.pid].join(',')]);assert.equal(p.todosAusentes,true);assert.deepEqual(p.presentes,[]);const inv=await ps('inventario-janela-real.ps1',[]);assert.equal(inv.listeners.length,0);assert.equal(inv.tasks.length,0);assert.equal(inv.mysqlClients.length,0);assert.ok(inv.processes.every(x=>x.pid===process.pid||['MYSQL_LOCAL','CODEX_MCP'].includes(x.category)));},
  adquirirExclusivo(){const file=path.join(state.diretorio,'recuperacao-exclusiva.lock'),id=crypto.randomUUID(),fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,id);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return ()=>{assert.equal(fs.readFileSync(file,'utf8'),id);fs.unlinkSync(file);};},
  async arquivar(bytes){const file=path.join(state.diretorio,'estado-incerta-encerramento-'+Date.now()+'.json'),fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const saved=fs.readFileSync(file);assert.ok(saved.equals(bytes));return {file,sha256:sha(saved)};}});
 console.log(JSON.stringify(result));
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.log(JSON.stringify({status:'ENCERRAMENTO_ADMINISTRATIVO_INTERROMPIDO',code:/^[A-Z0-9_]+$/.test(error.code||'')?error.code:/^[A-Z0-9_]+$/.test(error.message||'')?error.message:'VALIDACAO_RECUSADA',backendStarted:false}));process.exitCode=1;});
module.exports={main};
