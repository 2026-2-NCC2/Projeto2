'use strict';
// Preload exclusivo dos testes: proibe sockets, subprocessos e arquivos privados.
const net=require('node:net'),cp=require('node:child_process'),fs=require('node:fs');
const recusar=()=>{throw Error('EFEITO_REAL_PROIBIDO_NO_TESTE');};
net.Socket.prototype.connect=recusar;net.Server.prototype.listen=recusar;
for(const name of ['spawn','spawnSync','fork','exec','execSync','execFile','execFileSync'])cp[name]=recusar;
const privado=file=>typeof file==='string'&&(/BackupsTrocaTicket/i.test(file)||/(^|[\\/])\.env(?:$|\.)/.test(file));
for(const name of ['readFileSync','writeFileSync','appendFileSync','openSync','unlinkSync','renameSync','rmSync','mkdirSync']){const original=fs[name];fs[name]=function(...args){if(privado(args[0])||(name==='renameSync'&&privado(args[1])))recusar();return original.apply(this,args);};}
