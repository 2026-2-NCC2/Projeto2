"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {argumentosHelper,executarHelper}=require('../scripts/helper-powershell.cjs');
const root=path.resolve(__dirname,'..');
function ps(args){const r=spawnSync('powershell',args,{encoding:'utf8',windowsHide:true,timeout:20000});assert.ifError(r.error);return r;}
function policies(){const r=ps(['-NoProfile','-NonInteractive','-Command',"[pscustomobject]@{effective=[string](Get-ExecutionPolicy);scopes=@(Get-ExecutionPolicy -List|ForEach-Object {[pscustomobject]@{scope=[string]$_.Scope;policy=[string]$_.ExecutionPolicy}})}|ConvertTo-Json -Depth 4 -Compress"]);assert.equal(r.status,0);return JSON.parse(r.stdout.replace(/^\uFEFF/,''));}
test('helpers usam RemoteSigned no filho e recusam scripts fora da lista',()=>{
  const args=argumentosHelper('preparar-diretorio-t0.ps1',['-Destino','C:\\destino com espacos']);
  assert.deepEqual(args.slice(0,5),['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File']);
  assert.equal(args[5],path.join(root,'scripts/preparar-diretorio-t0.ps1'));
  assert.deepEqual(args.slice(6),['-Destino','C:\\destino com espacos']);
  assert.throws(()=>argumentosHelper('../server.js'),/NAO_PERMITIDO/);
  assert.throws(()=>argumentosHelper('inventario-janela-real.ps1',[null]),/ARGUMENTOS_INVALIDOS/);
});
test('inventario real somente leitura funciona sem alterar politicas',async()=>{
  const before=policies();
  const r=JSON.parse((await executarHelper('inventario-janela-real.ps1')).toString().replace(/^\uFEFF/,''));
  for(const k of ['processes','listeners','mysqlClients','tasks'])assert.ok(Array.isArray(r[k]));
  assert.deepEqual(policies(),before);
});
test('helper privado carrega mas recusa destino invalido sem criar arquivos',()=>{
  const before=policies(),invalid=path.join(root,'evidencias','destino-helper-nao-permitido');
  assert.equal(fs.existsSync(invalid),false);
  const r=ps(argumentosHelper('preparar-diretorio-t0.ps1',['-Destino',invalid]));
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/T0_DESTINO_INVALIDO/);
  assert.doesNotMatch(r.stderr,/UnauthorizedAccess|PSSecurityException/);
  assert.equal(fs.existsSync(invalid),false);
  assert.deepEqual(policies(),before);
});
