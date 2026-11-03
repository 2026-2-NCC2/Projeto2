'use strict';
// Verificador somente leitura. Nao importa runtime nem drivers.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function conferir({bundle,bundleSha256,bundleBytes,read,plan,proposal,currentManifest,currentHashes,targetManifest,patch}){
 assert.equal(sha(bundleBytes),bundleSha256,'PACOTE_SELO_DIVERGENTE');assert.equal(bundle.files.length,12);
 assert.equal(new Set(bundle.files.map(f=>f.file)).size,12,'PACOTE_ARQUIVOS_DUPLICADOS');
 for(const f of bundle.files){assert.ok(!path.isAbsolute(f.file)&&!f.file.split(/[\\/]/).includes('..'),'PACOTE_CAMINHO_RECUSADO');assert.equal(sha(read(f.file)),f.sha256,'PACOTE_ARQUIVO_DIVERGENTE');}
 assert.equal(plan.delta.length,1);assert.equal(plan.delta[0].file,'scripts/substituir-controlador-selado.cjs');assert.equal(plan.protected27.length,27);assert.equal(proposal.files.length,27);
 assert.equal(plan.patchSha256,sha(patch));assert.equal(plan.packageSha256,sha(read('manifest-alteracoes.json')));
 assert.equal(proposal.manifestBefore,plan.admittedManifest);assert.equal(proposal.manifestAfter,plan.targetDiskManifest);assert.equal(targetManifest,plan.targetDiskManifest);
 assert.equal(sha(read('candidato/substituir-controlador-selado.cjs')),plan.delta[0].afterSha256);
 const before=currentManifest===plan.baseDiskManifest,after=currentManifest===plan.targetDiskManifest;assert.ok(before||after,'PACOTE_DISCO_DIVERGENTE');
 for(const f of plan.protected27){const target=proposal.files.find(x=>x.file===f.file);assert.ok(target);assert.equal(target.afterSha256,f.file===plan.delta[0].file?plan.delta[0].afterSha256:f.sha256);assert.equal(currentHashes[f.file],after?target.afterSha256:f.sha256,'PACOTE_HASH_ATIVO_DIVERGENTE');}
 return {ok:true,exit_code:0,mode:after?'APLICADO_NAO_REAPLICAR':'PREPARADO_NAO_IMPLANTADO',protectedHashesVerified:27,deltaFiles:1,admissionExecuted:false};
}
function verificar(expected){
 assert.match(expected,/^[a-f0-9]{64}$/);const dir=__dirname,root=path.resolve(dir,'..');
 function read(file){const f=path.resolve(dir,file);assert.ok(f.startsWith(dir+path.sep));assert.ok(!fs.lstatSync(f).isSymbolicLink());return fs.readFileSync(f);}
 const bundleBytes=read('manifest-correcao.json'),bundle=JSON.parse(bundleBytes),plan=JSON.parse(read('plano-implantacao.json')),proposal=JSON.parse(read('manifest-alteracoes.json'));
 const {manifest}=require('./montar-pacote.cjs');const currentHashes=Object.fromEntries(plan.protected27.map(x=>[x.file,sha(fs.readFileSync(path.join(root,x.file)))]));
 return conferir({bundle,bundleSha256:expected,bundleBytes,read,plan,proposal,currentManifest:manifest(),currentHashes,targetManifest:manifest({[plan.delta[0].file.replaceAll('/',path.sep)]:read('candidato/substituir-controlador-selado.cjs')}),patch:read('diagnostico.patch')});
}
if(require.main===module){try{assert.equal(process.argv.length,3);console.log(JSON.stringify(verificar(process.argv[2])));}catch{console.log(JSON.stringify({ok:false,exit_code:1,code:'PACOTE_RECUSADO'}));process.exitCode=1;}}
module.exports={conferir,verificar};
