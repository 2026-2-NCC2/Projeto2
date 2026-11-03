'use strict';
// Somente hashes/estrutura: nao inicia codigo operacional, processos ou bancos.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=__dirname,root=path.resolve(dir,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function codigo(base){const files=[];function walk(d){for(const e of fs.readdirSync(path.join(base,d),{withFileTypes:true})){const f=path.join(d,e.name);assert.ok(!fs.lstatSync(path.join(base,f)).isSymbolicLink());if(e.isDirectory())walk(f);else if(/\.(cjs|js|ps1)$/.test(f))files.push(f);}}for(const d of ['config','repositories','services','scripts'])walk(d);for(const e of fs.readdirSync(base,{withFileTypes:true}))if(e.isFile()&&(/\.(cjs|js)$/.test(e.name)||['package.json','package-lock.json'].includes(e.name)))files.push(e.name);return sha(JSON.stringify(files.sort().map(f=>[f,sha(fs.readFileSync(path.join(base,f)))])));}
function verificar(expected){
 assert.match(expected,/^[a-f0-9]{64}$/);const bytes=fs.readFileSync(path.join(dir,'manifest-preparacao.json'));assert.equal(sha(bytes),expected,'PREPARACAO_SELO_DIVERGENTE');const seal=JSON.parse(bytes);assert.equal(new Set(seal.files.map(f=>f.file)).size,seal.files.length);
 for(const f of seal.files){const file=path.resolve(dir,f.file);assert.ok(file.startsWith(dir+path.sep));assert.ok(!fs.lstatSync(file).isSymbolicLink());assert.equal(sha(fs.readFileSync(file)),f.sha256,'PREPARACAO_ARQUIVO_DIVERGENTE');}
 const plan=JSON.parse(fs.readFileSync(path.join(dir,'plano-implantacao.json'))),admission=JSON.parse(fs.readFileSync(path.join(dir,'manifest-admissao.json')));assert.equal(sha(fs.readFileSync(path.join(dir,'manifest-admissao.json'))),plan.packageSha256);assert.equal(sha(fs.readFileSync(path.join(dir,'restabelecimento-pos-t1.patch'))),plan.patchSha256);assert.equal(plan.delta.length,5);assert.equal(admission.manifestAfter,plan.targetDiskManifest);assert.equal(codigo(path.join(dir,'candidato')),plan.targetDiskManifest);assert.ok(!fs.existsSync(path.join(dir,'candidato/.env')));
 const current=codigo(root),published=current===plan.targetDiskManifest;assert.ok(published||current===plan.baseDiskManifest,'PREPARACAO_BASE_DIVERGENTE');for(const f of plan.delta){const file=path.join(root,f.file),expected=published?f.afterSha256:f.beforeSha256;if(expected===null)assert.equal(fs.existsSync(file),false);else assert.equal(sha(fs.readFileSync(file)),expected);}
 // Fixtures modificadas servem apenas ao ensaio. Testes ativos do manifesto
 // anterior conservam seus hashes originais e nao integram o delta de codigo.
 for(const f of admission.files){const source=f.file.startsWith('tests/')?path.join(root,f.file):path.join(dir,'candidato',f.file);assert.equal(sha(fs.readFileSync(source)),f.afterSha256);}
 return {ok:true,exit_code:0,mode:published?'ALVO_PUBLICADO_SEM_READMISSAO_AUTOMATICA':'PREPARADO_NAO_IMPLANTADO',deltaFiles:5,targetHashesVerified:admission.files.length,readmissionExecuted:false};
}
if(require.main===module){try{assert.equal(process.argv.length,3);console.log(JSON.stringify(verificar(process.argv[2])));}catch{console.log(JSON.stringify({ok:false,exit_code:1,code:'PREPARACAO_RECUSADA'}));process.exitCode=1;}}
module.exports={verificar};
