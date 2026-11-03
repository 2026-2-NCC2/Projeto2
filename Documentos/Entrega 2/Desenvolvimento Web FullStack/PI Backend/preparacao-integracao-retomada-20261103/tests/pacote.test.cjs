'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {conferir,verificar}=require('../verificar-pacote.cjs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),dir=path.resolve(__dirname,'..');
function fixture(){const map=new Map();for(const e of fs.readdirSync(dir,{recursive:true,withFileTypes:true}))if(e.isFile()){const base=e.parentPath||e.path;map.set(path.relative(dir,path.join(base,e.name)).replaceAll(path.sep,'/'),fs.readFileSync(path.join(base,e.name)));}const read=f=>map.get(f.replaceAll(path.sep,'/'));const bundleBytes=read('manifest-correcao.json'),bundle=JSON.parse(bundleBytes),plan=JSON.parse(read('plano-implantacao.json')),proposal=JSON.parse(read('manifest-alteracoes.json'));return {bundle,bundleBytes,bundleSha256:sha(bundleBytes),read,plan,proposal,currentManifest:plan.baseDiskManifest,currentHashes:Object.fromEntries(plan.protected27.map(x=>[x.file,x.sha256])),targetManifest:plan.targetDiskManifest,patch:read('diagnostico.patch')};}
test('pacote real selado confere 27 hashes sem implantar',()=>{const bytes=fs.readFileSync(path.join(dir,'manifest-correcao.json')),r=verificar(sha(bytes));assert.equal(r.mode,'PREPARADO_NAO_IMPLANTADO');assert.equal(r.protectedHashesVerified,27);assert.equal(r.admissionExecuted,false);});
test('pacote aplicado simulado retorna nao reaplicar',()=>{const f=fixture();f.currentManifest=f.plan.targetDiskManifest;f.currentHashes=Object.fromEntries(f.proposal.files.map(x=>[x.file,x.afterSha256]));assert.equal(conferir(f).mode,'APLICADO_NAO_REAPLICAR');});
for(const [name,change] of [
 ['selo adulterado',f=>f.bundleSha256='0'.repeat(64)],
 ['arquivo adulterado',f=>{const read=f.read;f.read=x=>x==='retomar-operacional.ps1'?Buffer.from('alterado'):read(x);}],
 ['patch adulterado',f=>f.patch=Buffer.from('adulterado')],
 ['manifesto parcial',f=>f.currentManifest='parcial'],
 ['hash ativo divergente',f=>f.currentHashes[f.plan.protected27[0].file]='alterado'],
 ['mais de uma mudanca',f=>f.plan.delta.push({...f.plan.delta[0]})],
 ['origem admitida divergente',f=>f.plan.admittedManifest='alterado'],
 ['manifesto alvo divergente',f=>f.targetManifest='alterado']
])test('pacote recusa '+name,()=>{const f=fixture();change(f);assert.throws(()=>conferir(f));});
test('gate cumulativo preserva os 26 arquivos sem alteracao',()=>{const f=fixture();assert.equal(f.proposal.files.filter(x=>f.plan.protected27.find(y=>y.file===x.file).sha256!==x.afterSha256).length,1);assert.equal(f.proposal.manifestBefore,f.plan.admittedManifest);assert.notEqual(f.plan.admittedManifest,f.plan.baseDiskManifest);});
test('componentes validados anteriormente permanecem byte a byte',()=>{for(const [file,previous] of [['candidato/substituir-controlador-selado.cjs','preparacao-diagnostico-retomada-20261103/candidato/substituir-controlador-selado.cjs'],['processo-verificado.ps1','preparacao-diagnostico-retomada-20261103/processo-verificado.ps1'],['status-atomico.ps1','preparacao-retomada-status-20261102/status-atomico.ps1']])assert.ok(fs.readFileSync(path.join(dir,file)).equals(fs.readFileSync(path.join(dir,'..',previous))),file);});
