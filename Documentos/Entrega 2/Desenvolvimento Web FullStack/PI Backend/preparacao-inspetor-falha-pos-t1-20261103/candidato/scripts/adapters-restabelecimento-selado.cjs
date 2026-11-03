"use strict";
// Construir e inerte. Nenhum caminho e chamado automaticamente ou por HTTP.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{fork}=require('node:child_process');
const {executarHelper}=require('./helper-powershell.cjs'),{criarLancadorRestabelecimento}=require('./lancador-planejado.cjs'),{comando}=require('./backup-mysql-isolado.cjs');
function criarAdaptersRestabelecimento({estado,ambiente,evidenciaPreFile,evidenciaSha256,janelaExclusivaConfirmada=false,riscoResidualAceito=false,referenciaAutorizacao}){
  let child,controlador;const root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  const ps=async(name,args)=>JSON.parse((await executarHelper(name,args)).toString().replace(/^\uFEFF/,''));
  function troca(m,tipo){return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>fim(Error('RESTABELECIMENTO_IPC_TIMEOUT')),15000);
    function fim(e,x){clearTimeout(timer);child.removeListener('message',receber);child.removeListener('exit',saiu);e?reject(e):resolve(x);}
    function saiu(){fim(Error('RESTABELECIMENTO_FILHO_ENCERROU'));}function receber(x){if(x?.tipo==='restabelecimento-falhou')fim(Error('RESTABELECIMENTO_FILHO_RECUSOU'));else if(x?.tipo===tipo&&x.id===m.id&&x.pid===child.pid)fim(null,x);}
    child.on('message',receber);child.once('exit',saiu);child.send(m,e=>{if(e)fim(Error('RESTABELECIMENTO_IPC_FALHOU'));});
  });}
  async function local(expected){
    const p=await ps('inspecionar-manutencao-validacao.ps1',['-PidAlvo',String(expected.pid)]);assert.deepEqual({...p,boot:expected.boot},expected);
    const inv=await ps('inventario-janela-real.ps1',[]);assert.equal(inv.tasks.length,0);assert.ok(inv.processes.every(x=>x.pid===process.pid||x.pid===p.pid||['MYSQL_LOCAL','CODEX_MCP'].includes(x.category)));assert.ok(inv.listeners.length===1&&inv.listeners[0].pid===p.pid&&inv.listeners[0].port===3001);
    const r=await fetch('http://127.0.0.1:3001/perfil',{headers:{connection:'close'},signal:AbortSignal.timeout(3000)});await r.arrayBuffer();
    return {capturedUtc:new Date().toISOString(),knownMaintenanceResponder:expected,knownBackend:null,backendSupervisorPresent:false,unknownProcessCount:0,tasks:0,mysqlClientPids:inv.mysqlClients.map(x=>x.pid),httpStatus:r.status};
  }
  return {
    estado,ambiente,
    adquirirExclusivo(){assert.equal(janelaExclusivaConfirmada,true);assert.equal(riscoResidualAceito,true);assert.ok(!fs.lstatSync(estado.diretorio).isSymbolicLink());const file=path.join(estado.diretorio,'recuperacao-exclusiva.lock'),token=crypto.randomUUID(),fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,token);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return ()=>{assert.equal(fs.readFileSync(file,'utf8'),token);fs.unlinkSync(file);};},
    async inspecionar(){
      assert.equal(janelaExclusivaConfirmada,true);assert.equal(riscoResidualAceito,true);const e=estado.ler(),bytes=fs.readFileSync(evidenciaPreFile);assert.equal(sha(bytes),evidenciaSha256);const pre=JSON.parse(bytes);
      const original=JSON.parse(fs.readFileSync(path.join(root,'evidencias/janela-final-real-20261031.json'),'utf8')),checkpointBytes=fs.readFileSync(path.join(original.t0Directory,'checkpoint-t0.privado.json')),saved=JSON.parse(checkpointBytes),cp=saved.checkpoint;
      const origem=await ps('inspecionar-origem-restabelecimento.ps1',['-PidHistorico',String(e.transicao.pidDestino)]),respondedor=pre.writersAfter.local.knownMaintenanceResponder;
      const {TABLES}=require('./delta-cutover.cjs'),columns=Object.fromEntries(TABLES.map(t=>[t,Object.keys(cp.mysql[t][0]||cp.supabase[t][0])])),ca=path.join(os.homedir(),'BackupsTrocaTicket/backup-20261031-e51f28697254468aa205e99c9a1fbe15/supabase-ca-2021.crt'),{conferirEscritoresBanco}=require('./inspecao-escritores-readonly.cjs');
      const writersBefore={local:await local(respondedor),database:await conferirEscritoresBanco(ambiente,ca)},snapshot=await require('./coletar-delta-readonly.cjs').criarColetorReadOnly(ambiente,columns,cp.catalogos,ca)({projeto:'gnwybroqfvwosiqzsfla',somenteLeitura:true}),writersAfter={database:await conferirEscritoresBanco(ambiente,ca),local:await local(respondedor)};
      assert.ok(fs.readFileSync(evidenciaPreFile).equals(bytes));assert.ok(fs.readFileSync(path.join(original.t0Directory,'checkpoint-t0.privado.json')).equals(checkpointBytes));
      return {origemOriginalAusente:origem.origemOriginalAusente,janelaExclusivaConfirmada,riscoResidualAceito,referenciaAutorizacao,historicoComprovado:false,checkpointBytes,evidenciaBytes:bytes,evidenciaSha256,respondedor,writersBefore,writersAfter,snapshot,columns};
    },
    async lancarPausado(){child=await criarLancadorRestabelecimento(ambiente)();controlador=require('../config/controlador-supervisor.cjs').criarControlador({'express-principal':child},estado);return child;},
    admitirSemEscutar:m=>troca({tipo:'restabelecimento-admitir',...m},'restabelecimento-selado'),
    consultar:async()=>(await controlador.status())['express-principal'],
    encerrarRespondedor:p=>ps('inspecionar-manutencao-validacao.ps1',['-PidAlvo',String(p.pid),'-CriadoEm',p.criadoEm,'-Pai',String(p.parentPid),'-Encerrar']),
    portaLivre:async()=>(await ps('inspecionar-manutencao-validacao.ps1',['-PortaLivre'])).portaLivre,
    ouvir:id=>troca({tipo:'restabelecimento-ouvir',id},'restabelecimento-pronto'),
    async gerarEvidenciaV2(){
      const stdout=(await comando(process.execPath,[path.join(__dirname,'reconciliacao-formal-leitura.cjs'),'--somente-leitura'],{timeout:120000})).toString().trim().split(/\r?\n/),last=JSON.parse(stdout.at(-1));assert.equal(last.status,'RECONCILIACAO_ATUAL_APROVADA');assert.equal(fs.realpathSync(path.dirname(last.evidenceFile)),fs.realpathSync(path.join(root,'evidencias')));
      const bytes=fs.readFileSync(last.evidenceFile),r=JSON.parse(bytes),aceite={criterio:'EQUIVALENCIA_ATUAL',reconheceLacunaHistorica:true,aceitaRiscoResidual:true,aceitaControleOperacionalSemLockGlobal:true,referenciaAutorizacao,aceitoEm:new Date().toISOString(),evidenciaSha256:sha(bytes),checkpointId:r.checkpointId,checkpointSha256:r.checkpointSha256,janelaId:r.janelaId,configuracaoHash:r.configuracaoHash};
      const adapters=require('./adapters-recuperacao-local.cjs').criarAdaptersLocais({estado,ambiente,relatorioFile:path.join(root,'evidencias/janela-final-real-20261031.json'),confirmarJanelaExclusiva:true,reconciliacaoFile:last.evidenceFile,aceitacaoReconciliacao:aceite});
      const plano=require('./recuperacao-supervisor.cjs').conferirEvidencias(estado.ler(),ambiente,await adapters.inspecionar());assert.equal(plano.decisaoSeguranca.continuidadeHistoricaComprovada,false);
      return {schemaVersion:2,supervisorAdmitido:true,pid:child.pid,httpStatus:503,checkpointId:r.checkpointId,semDivergencias:true,gateAprovado:true,evidenceFile:last.evidenceFile};
    },
    async manter503EmFalha(){
      if(child&&child.exitCode===null){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('RESTABELECIMENTO_LIMPEZA_TIMEOUT')),15000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();});}controlador?.fechar();
      if(!(await ps('inspecionar-manutencao-validacao.ps1',['-PortaLivre'])).portaLivre)return {portaOcupadaPreservada:true};
      const clean=Object.fromEntries(['SystemRoot','USERPROFILE','HOMEDRIVE','HOMEPATH','PATH','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
      const fallback=fork(path.join(__dirname,'manutencao-validacao.cjs'),['--somente-manutencao'],{cwd:root,windowsHide:true,detached:true,stdio:['ignore','ignore','ignore','ipc'],env:clean});
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('MANUTENCAO_FALLBACK_TIMEOUT')),12000);fallback.once('message',m=>{clearTimeout(timer);m?.tipo==='manutencao-validacao-pronta'?resolve():reject(Error('MANUTENCAO_FALLBACK_FALHOU'));});fallback.once('exit',()=>{clearTimeout(timer);reject(Error('MANUTENCAO_FALLBACK_ENCERROU'));});});fallback.disconnect();fallback.unref();return {fallback503Pid:fallback.pid};
    },
    obterControlador:()=>controlador
  };
}
module.exports={criarAdaptersRestabelecimento};
