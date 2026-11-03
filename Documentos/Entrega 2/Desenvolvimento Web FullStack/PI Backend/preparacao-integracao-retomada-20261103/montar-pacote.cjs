'use strict';
// Montagem local apenas: nao aplica patch, nao inicia processos ou bancos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),old=path.join(root,'preparacao-retomada-status-20261102'),diag=path.join(root,'preparacao-diagnostico-retomada-20261103');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(file){assert.ok(!fs.lstatSync(file).isSymbolicLink());return fs.readFileSync(file);}
function write(file,bytes){const dest=path.resolve(__dirname,file);assert.ok(dest.startsWith(__dirname+path.sep));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}
function replace(source,from,to){assert.equal(source.split(from).length,2,'ALVO_DE_INTEGRACAO_DIVERGENTE');return source.replace(from,to);}
function manifest(overlay={}){const files=[];function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const f=path.join(dir,e.name);assert.ok(!fs.lstatSync(path.join(root,f)).isSymbolicLink());if(e.isDirectory())walk(f);else if(/\.(?:cjs|js|ps1)$/.test(e.name))files.push(f);}}for(const d of ['config','repositories','services','scripts'])walk(d);for(const e of fs.readdirSync(root,{withFileTypes:true}))if(e.isFile()&&(/\.(?:cjs|js)$/.test(e.name)||['package.json','package-lock.json'].includes(e.name)))files.push(e.name);return sha(JSON.stringify(files.sort().map(f=>[f,sha(overlay[f]||read(path.join(root,f)))])));}
function montar(){
 const prior=JSON.parse(read(path.join(root,'preparacao-implantacao-pos-t1-20261102/manifest-alteracoes.json')));
 assert.equal(prior.files.length,27);for(const f of prior.files)assert.equal(sha(read(path.join(root,f.file))),f.afterSha256,'HASH_PUBLICADO_DIVERGENTE');assert.equal(manifest(),prior.manifestAfter);
 const entry='scripts/substituir-controlador-selado.cjs',candidate=read(path.join(diag,'candidato/substituir-controlador-selado.cjs')),before=read(path.join(root,entry));
 const proposal={...prior,preparedUtc:new Date().toISOString(),activeCodeApplied:false,realDeploymentExecuted:false,manifestAfter:manifest({[entry.replaceAll('/',path.sep)]:candidate}),files:prior.files.map(f=>({...f,afterSha256:f.file===entry?sha(candidate):f.afterSha256}))};
 write('candidato/substituir-controlador-selado.cjs',candidate);write('manifest-alteracoes.json',JSON.stringify(proposal,null,2)+'\n');
 const pins=JSON.parse(read(path.join(old,'origem-operacional.json')));pins.packageSha256=sha(read(path.join(__dirname,'manifest-alteracoes.json')));write('origem-operacional.json',JSON.stringify(pins,null,2)+'\n');
 for(const f of ['status-atomico.ps1','publicar-status.ps1'])write(f,read(path.join(old,f)));
 write('processo-verificado.ps1',read(path.join(diag,'processo-verificado.ps1')));
 write('continuidade-observacao.cjs',read(path.join(diag,'continuidade-observacao.cjs')));
 let snapshot=read(path.join(old,'snapshot-retomada.cjs')).toString();snapshot=replace(snapshot,"path.join(root,'preparacao-implantacao-pos-t1-20261102/manifest-alteracoes.json')","path.join(__dirname,'manifest-alteracoes.json')");write('snapshot-retomada.cjs',snapshot);
 let sequence=read(path.join(old,'sequencia-segura.ps1')).toString();
 sequence=replace(sequence,"if ($m.files.Count -ne 6)","if ($m.files.Count -ne 12)");
 sequence=replace(sequence,"if ([IO.Path]::GetDirectoryName($target) -ine $PSScriptRoot)","if (!$target.StartsWith($PSScriptRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase))");
 write('sequencia-segura.ps1',sequence);
 let resume=read(path.join(old,'retomar-operacional.ps1')).toString();resume=replace(resume,". (Join-Path $PSScriptRoot 'sequencia-segura.ps1')",". (Join-Path $PSScriptRoot 'sequencia-segura.ps1')\n. (Join-Path $PSScriptRoot 'processo-verificado.ps1')");
 resume=replace(resume,"Publish-StatusAtomico -Directory $s.privateDir -Destination $StatusFile -StateFile $s.stateFile -ExpectedStateHash $s.stateHash -ExpectedDestinationHash $expected -StatusJson $json -ControllerPid $s.controllerPid -SupervisorPid $s.supervisorPid","Invoke-VerifiedHelper -ScriptFile (Join-Path $PSScriptRoot 'publicar-status.ps1') -Arguments @('-AutorizarPublicacao','-CorrecaoSha256',$CorrecaoSha256,'-ObservacaoFile',$ObservacaoFile,'-StatusFile',$StatusFile,'-ExpectedDestinationHash',$expected)");
 // O Node persistente continua em primeiro plano. LASTEXITCODE aqui e nativo,
 // legitimo: nao trocar por runner que captura/fecha stdin ou mata no timeout.
 write('retomar-operacional.ps1',resume);
 let publisher=read(path.join(diag,'publicar-verificado.ps1')).toString();
 publisher=replace(publisher,"param([switch]$AutorizarPublicacao,","param([string]$CorrecaoSha256,[switch]$AutorizarPublicacao,");
 publisher=replace(publisher,"$original=Join-Path $PSScriptRoot '../preparacao-retomada-status-20261102'","$original=$PSScriptRoot");
 publisher=replace(publisher,"$approved='43ba0c318f92caee38d3ec38b41ff33057ec10525052935960324fde85074a33'","$approved=$CorrecaoSha256");write('publicar-verificado.ps1',publisher);
 const lines=b=>b.toString().split('\n').slice(0,-1),a=lines(before),b=lines(candidate),file='PI Backend/'+entry;
 const patch=`diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${a.length} +1,${b.length} @@\n`+a.map(l=>'-'+l+'\n').join('')+b.map(l=>'+'+l+'\n').join('');write('diagnostico.patch',patch);
 write('plano-implantacao.json',JSON.stringify({schemaVersion:1,baseDiskManifest:prior.manifestAfter,targetDiskManifest:proposal.manifestAfter,admittedManifest:prior.manifestBefore,protected27:prior.files.map(f=>({file:f.file,sha256:f.afterSha256})),delta:[{file:entry,beforeSha256:sha(before),afterSha256:sha(candidate)}],patchSha256:sha(patch),packageSha256:pins.packageSha256,realDeploymentExecuted:false},null,2)+'\n');
 const names=['status-atomico.ps1','publicar-status.ps1','processo-verificado.ps1','continuidade-observacao.cjs','snapshot-retomada.cjs','origem-operacional.json','sequencia-segura.ps1','retomar-operacional.ps1','publicar-verificado.ps1','candidato/substituir-controlador-selado.cjs','manifest-alteracoes.json','plano-implantacao.json'];
 const bundle={schemaVersion:1,files:names.map(file=>({file,sha256:sha(read(path.join(__dirname,file)))}))};write('manifest-correcao.json',JSON.stringify(bundle,null,2)+'\n');
 return {bundleSha256:sha(read(path.join(__dirname,'manifest-correcao.json'))),packageSha256:pins.packageSha256,baseDiskManifest:prior.manifestAfter,targetDiskManifest:proposal.manifestAfter,deltaFiles:1,protectedActiveHashes:27,applied:false};
}
if(require.main===module)console.log(JSON.stringify(montar()));
module.exports={montar,manifest};
