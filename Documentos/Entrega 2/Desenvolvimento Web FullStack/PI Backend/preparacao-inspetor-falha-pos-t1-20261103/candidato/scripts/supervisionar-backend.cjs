"use strict";
const {fork}=require('node:child_process'),path=require('node:path'),readline=require('node:readline');
// Somente execucao explicita inicia servidor. Nao e importado pelo startup comum.
async function main(){
  if(process.argv[2]!=='--iniciar')throw Error('SUPERVISOR_INICIO_EXPLICITO_NECESSARIO');
  const estado=require('../config/estado-supervisor.cjs').criarEstadoPrivado();estado.ler();
  const filho=fork(path.join(__dirname,'../server.js'),[],{cwd:path.join(__dirname,'..'),windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,TROCATICKET_SUPERVISOR_IPC:'1'}});
  const controle=require('../config/controlador-supervisor.cjs').criarControlador({'express-principal':filho},estado);
  const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  for await(const line of rl){try{
    const action=line.trim();const result=action==='status'?await controle.status():action==='congelar'?await controle.congelar():action==='selar-e-drenar'?await controle.selarEDrenar():null;
    if(result===null)throw Error('SUPERVISOR_COMANDO_INVALIDO');console.log(JSON.stringify({ok:true,status:result}));
  }catch{console.log('{"ok":false,"status":"SUPERVISOR_BLOQUEADO_SEM_RETRY"}');}}
  controle.fechar();filho.disconnect(); // Nao libera freeze, nao mata transacoes.
}
if(require.main===module)main().catch(()=>{console.log('{"status":"SUPERVISOR_NAO_INICIADO","detailsHidden":true}');process.exitCode=1;});
