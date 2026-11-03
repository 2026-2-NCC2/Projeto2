"use strict";
const crypto=require('node:crypto'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {avaliarCongelamentoGlobal}=require('../config/preparacao-global-cutover.cjs');
const {executarDeltaFinal}=require('./executar-delta-final.cjs');
const {validarArtefatosT0}=require('./backups-t0.cjs');
const {validar,fingerprint}=require('./delta-cutover.cjs');
const {lerDump}=require('./reconciliar-cutover-leitura.cjs');
const {lerCopyPublic}=require('./ler-copy-t0.cjs');
function salvarCheckpoint({checkpointId,checkpoint,backups}){validarArtefatosT0(backups);const file=path.join(backups.directory,'checkpoint-t0.privado.json');fs.writeFileSync(file,JSON.stringify({checkpointId,checkpoint,backups},null,2)+'\n',{flag:'wx',mode:0o600});return file;}
async function prepararT0Delta(op){
  const {inventario,supervisores,evidenciasExternas,conferirPersistencia,produzirBackups,coletarReadOnly,columns,agora=Date.now,validarArtefatos=validarArtefatosT0,salvarCheckpointPrivado=salvarCheckpoint}=op;
  async function gate(){const statuses=await supervisores.status();assert.deepEqual(Object.keys(statuses).sort(),inventario.processos.map(p=>p.id).sort());for(const s of Object.values(statuses))assert.ok(s.selado&&s.requisicoesPendentes===0&&s.escritasPendentes===0&&s.operacoesPersistenciaPendentes===0&&s.resultadosIncertos===0);const g=avaliarCongelamentoGlobal({...inventario,persistenciaConferida:await conferirPersistencia()},[...Object.entries(statuses).map(([id,s])=>({id,...s})),...await evidenciasExternas()],agora());assert.equal(g.status,'APTO_PARA_COLETA');return g;}
  await gate();assert.equal(typeof salvarCheckpointPrivado,'function');
  const backups=await produzirBackups({somenteLeitura:true,semRepetirRestauracoes:true});validarArtefatosT0(backups);assert.equal(await validarArtefatos(backups),true);await gate();
  const checkpoint=await coletarReadOnly({projeto:'gnwybroqfvwosiqzsfla',somenteLeitura:true});assert.ok(checkpoint.mysqlReadOnly&&checkpoint.supabaseReadOnly&&checkpoint.tlsVerificado&&checkpoint.catalogoConferido);
  assert.equal(fingerprint(validar(lerDump(fs.readFileSync(backups.mysqlDataFile,'utf8'),true).rows,columns)),fingerprint(validar(checkpoint.mysql,columns)),'T0_MYSQL_DUMP_DIVERGENTE');
  assert.equal(fingerprint(validar(lerCopyPublic(fs.readFileSync(backups.postgresDataFile,'utf8')),columns)),fingerprint(validar(checkpoint.supabase,columns)),'T0_POSTGRES_DUMP_DIVERGENTE');
  // O adapter salva rows/catalogos somente no diretorio ACL privado. Nunca retorna rows ao log.
  const checkpointId=crypto.randomUUID(),checkpointFile=await salvarCheckpointPrivado({checkpointId,checkpoint,backups});
  assert.equal(typeof checkpointFile,'string');assert.equal(path.dirname(fs.realpathSync(checkpointFile)),fs.realpathSync(backups.directory));
  const delta=await executarDeltaFinal({inventario,supervisores,evidenciasExternas,conferirPersistencia,coletarReadOnly,checkpoints:{mysql:checkpoint.mysql,supabase:checkpoint.supabase},columns,agora});
  assert.equal(delta.status,'DELTA_APROVADO_SEM_EXECUTAR_CUTOVER');return {status:delta.status,checkpointId,checkpointFile,checkpointSha256:typeof checkpointFile==='string'?crypto.createHash('sha256').update(fs.readFileSync(checkpointFile)).digest('hex'):null,backupsT0Verificados:true,cutoverExecutado:false,restoreTestsRepeated:false};
}
module.exports={prepararT0Delta};
