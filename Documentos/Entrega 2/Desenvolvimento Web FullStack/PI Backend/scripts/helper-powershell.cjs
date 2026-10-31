"use strict";
const path=require('node:path');
const {comando}=require('./backup-mysql-isolado.cjs');
const permitidos=new Set(['inventario-janela-real.ps1','preparar-diretorio-t0.ps1','processo-recuperacao.ps1']);
function argumentosHelper(nome,args=[]){
  if(!permitidos.has(nome))throw Error('HELPER_POWERSHELL_NAO_PERMITIDO');
  if(!Array.isArray(args)||!args.every(x=>typeof x==='string'&&!x.includes('\0')))throw Error('HELPER_POWERSHELL_ARGUMENTOS_INVALIDOS');
  // Somente este processo filho. RemoteSigned preserva verificacao de origem/assinatura.
  // Politicas de grupo continuam tendo precedencia; nenhuma politica e persistida.
  return ['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',path.join(__dirname,nome),...args];
}
function executarHelper(nome,args=[],opcoes){return comando('powershell',argumentosHelper(nome,args),opcoes);}
module.exports={argumentosHelper,executarHelper};
