'use strict';
// Nenhum driver, subprocesso, servidor ou escrita. Manifesto atual e 27 hashes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function classificar({pacote,pins,state,stateSha,manifestHash,fileHashes,envHash,checkpointHash,journalHash,journalMatchesState}){
  assert.equal(pacote.files.length,27,'RETOMADA_PACOTE_INCOMPLETO');
  assert.ok(pacote.files.every(x=>fileHashes[x.file]===x.afterSha256),'RETOMADA_ARQUIVOS_PARCIAIS_OU_DIVERGENTES');
  assert.equal(manifestHash,pacote.manifestAfter,'RETOMADA_MANIFESTO_DIVERGENTE');
  assert.equal(envHash,pins.environmentSha256,'RETOMADA_AMBIENTE_ALTERADO');assert.equal(checkpointHash,pins.checkpointSha256,'RETOMADA_CHECKPOINT_ALTERADO');assert.equal(journalHash,pins.journalSha256,'RETOMADA_DIARIO_ALTERADO');assert.ok(journalMatchesState,'RETOMADA_DIARIO_DIVERGENTE');
  const t=state.transicao,c=state.controleSelado;
  assert.ok(state.congelado&&state.selado&&t?.fase==='INICIADA'&&c?.etapa==='ATIVO'&&t.t1?.etapa==='CONCLUIDA'&&t.t1.cleanupVerified===true&&t.t1.unknownResult===false,'RETOMADA_ESTADO_RECUSADO');
  if(c.modo==='IMPLANTACAO_POS_T1')return 'JA_ADMITIDO_NAO_RELANCAR';
  assert.equal(stateSha,pins.expectedStateSha256,'RETOMADA_ESTADO_ALTERADO');assert.equal(c.controlador.codigoSha256,pacote.manifestBefore,'RETOMADA_ORIGEM_DIVERGENTE');assert.equal(c.supervisor.pid,t.pidDestino);
  return 'APLICADO_AGUARDANDO_ADMISSAO';
}
function snapshot(){
  const root=path.resolve(__dirname,'..'),privateDir=path.join(require('node:os').homedir(),'BackupsTrocaTicket/SupervisorCutover'),pins=JSON.parse(fs.readFileSync(path.join(__dirname,'origem-operacional.json'))),packageFile=path.join(__dirname,'manifest-alteracoes.json'),pb=fs.readFileSync(packageFile);assert.equal(sha(pb),pins.packageSha256,'RETOMADA_PACOTE_ALTERADO');const pacote=JSON.parse(pb);
  const safe=file=>{assert.ok(!fs.lstatSync(file).isSymbolicLink(),'RETOMADA_REPARSE_RECUSADO');return fs.readFileSync(file);};
  const stateFile=path.join(privateDir,'estado.json'),sb=safe(stateFile),state=JSON.parse(sb),fileHashes={};
  for(const x of pacote.files){const f=path.resolve(root,x.file);assert.ok(f.startsWith(root+path.sep));fileHashes[x.file]=fs.existsSync(f)?sha(safe(f)):'AUSENTE';}
  const files=[];function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const f=path.join(dir,e.name);assert.ok(!fs.lstatSync(path.join(root,f)).isSymbolicLink());if(e.isDirectory())walk(f);else if(/\.(?:cjs|js|ps1)$/.test(e.name))files.push(f);}}
  for(const d of ['config','repositories','services','scripts'])walk(d);for(const e of fs.readdirSync(root,{withFileTypes:true}))if(e.isFile()&&(/\.(?:js|cjs)$/.test(e.name)||['package.json','package-lock.json'].includes(e.name)))files.push(e.name);
  const manifestHash=sha(JSON.stringify(files.sort().map(f=>[f,sha(safe(path.join(root,f)))]))),baseline=JSON.parse(safe(path.join(root,'evidencias/janela-final-real-20261031.json'))),cp=path.join(baseline.t0Directory,'checkpoint-t0.privado.json'),x=state.transicao.t1;assert.match(x.run,/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);const jb=safe(path.join(privateDir,'t1-'+x.run+'.privado.json')),jr={...x};delete jr.journalSha256;
  const mode=classificar({pacote,pins,state,stateSha:sha(sb),manifestHash,fileHashes,envHash:sha(safe(path.join(root,'.env'))),checkpointHash:sha(safe(cp)),journalHash:sha(jb),journalMatchesState:sha(jb)===x.journalSha256&&JSON.stringify(JSON.parse(jb))===JSON.stringify(jr)});assert.ok(safe(stateFile).equals(sb),'RETOMADA_ESTADO_ALTERADO_DURANTE_LEITURA');
  if(mode==='APLICADO_AGUARDANDO_ADMISSAO')assert.ok(!fs.existsSync(path.join(privateDir,'recuperacao-exclusiva.lock')),'RETOMADA_LOCK_CUTOVER_PENDENTE');
  return {ok:true,exit_code:0,mode,checkedUtc:new Date().toISOString(),backendRoot:root,privateDir,stateFile,stateHash:sha(sb),manifestHash,packageFile,packageSha256:pins.packageSha256,controller:state.controleSelado.controlador,supervisor:state.controleSelado.supervisor,controllerPid:state.controleSelado.controlador.pid,supervisorPid:state.transicao.pidDestino,patchApplyRequired:false,hashesVerified:27};
}
if(require.main===module){try{assert.deepEqual(process.argv.slice(2),['--verificar']);process.stdout.write(JSON.stringify(snapshot())+'\n');}catch(e){process.stdout.write(JSON.stringify({ok:false,exit_code:1,code:/^RETOMADA_[A-Z_]+$/.test(e.message||'')?e.message:'RETOMADA_VERIFICACAO_RECUSADA'})+'\n');process.exitCode=1;}}
module.exports={classificar,snapshot};
