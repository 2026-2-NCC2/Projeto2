"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const diretorio=path.join(os.homedir(),'BackupsTrocaTicket','SupervisorCutover');
function criarEstadoPrivado(dir=diretorio){
  const file=path.join(dir,'estado.json');
  function validar(e){if(e?.versao!==1||typeof e.congelado!=='boolean'||typeof e.selado!=='boolean'||(e.selado&&!e.congelado)||!Array.isArray(e.instancias)||!e.instancias.every(x=>typeof x==='string'))throw Error('SUPERVISOR_ESTADO_INVALIDO');return e;}
  return {diretorio:dir,
    ler(){if(!fs.existsSync(dir))return {versao:1,congelado:false,selado:false,instancias:[]};if(fs.lstatSync(dir).isSymbolicLink()||fs.lstatSync(file).isSymbolicLink())throw Error('SUPERVISOR_ESTADO_INVALIDO');return validar(JSON.parse(fs.readFileSync(file,'utf8')));},
    gravar(e){validar(e);if(!fs.existsSync(dir)||fs.lstatSync(dir).isSymbolicLink())throw Error('SUPERVISOR_DIRETORIO_NAO_PREPARADO');const temp=path.join(dir,'estado-'+crypto.randomUUID()+'.tmp');let fd;try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(e)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,file);}finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}}
  };
}
module.exports={criarEstadoPrivado,diretorio};
