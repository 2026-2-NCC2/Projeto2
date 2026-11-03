'use strict';
// Auxiliar somente leitura do fence PowerShell. Sem processo, socket ou driver.
function validarFence({estado,ambiente,estadoBytes,journalBytes,agora=Date.now()}){
  const assert=require('node:assert/strict'),crypto=require('node:crypto'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),e=estado;
  assert.ok(Buffer.isBuffer(estadoBytes)&&Buffer.isBuffer(journalBytes));assert.deepEqual(JSON.parse(estadoBytes),e);
  assert.equal(require('../config/startup-controlado.cjs').fingerprint(ambiente),e.transicao.configuracaoHash);
  const p=e.controleSelado?.procedenciaT1;
  require('../config/procedencia-t1-selada.cjs').conferirProcedenciaT1(e,{posParada:!['ENCERRANDO_SUPERVISOR','ENCERRANDO_CONTROLADOR'].includes(e.controleSelado.etapa),agora});
  assert.equal(sha(journalBytes),p.journalSha256);const record={...e.transicao.t1};delete record.journalSha256;assert.deepEqual(JSON.parse(journalBytes),record);
  return {estadoSha256:sha(estadoBytes),journalSha256:sha(journalBytes)};
}
function main(args=process.argv.slice(2)){
  const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');assert.deepEqual(args,['--somente-validar']);
  const estado=require('../config/estado-supervisor.cjs').criarEstadoPrivado(),estadoBytes=fs.readFileSync(path.join(estado.diretorio,'estado.json')),e=estado.ler(),journalBytes=fs.readFileSync(path.join(estado.diretorio,'t1-'+e.transicao.t1.run+'.privado.json')),ambiente=require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../.env')));
  process.stdout.write(JSON.stringify(validarFence({estado:e,ambiente,estadoBytes,journalBytes}))+'\n');
}
if(require.main===module)try{main();}catch{process.stdout.write('{"ok":false,"code":"POS_T1_FENCE_RECUSADO"}\n');process.exitCode=1;}
module.exports={validarFence,main};
