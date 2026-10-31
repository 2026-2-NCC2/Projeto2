"use strict";
const {randomUUID}=require('node:crypto');
function criarControlador(filhos,estado){
  filhos={...filhos};
  const pedidos=new Map(),remover=[];
  function registrar(id,c){
    filhos[id]=c;
    const receber=m=>{const p=pedidos.get(m?.id);if(m?.tipo!=='cutover-resposta'||!p||p.filho!==id||p.conexao!==c)return;clearTimeout(p.timer);pedidos.delete(m.id);m.ok?p.resolve(m.status):p.reject(Object.assign(Error('SUPERVISOR_FILHO_RECUSOU'),{code:m.code}));};
    const saiu=()=>{for(const [key,p] of pedidos)if(p.filho===id&&p.conexao===c){clearTimeout(p.timer);pedidos.delete(key);p.reject(Error('SUPERVISOR_FILHO_DESCONECTADO'));}};
    c.on('message',receber);c.on('exit',saiu);c.on('disconnect',saiu);remover.push(()=>{c.removeListener('message',receber);c.removeListener('exit',saiu);c.removeListener('disconnect',saiu);});
  }
  for(const [id,c] of Object.entries(filhos))registrar(id,c);
  function pedir(id,acao,prazo=30000,extra={}){const c=filhos[id];if(!c?.connected)return Promise.reject(Error('SUPERVISOR_FILHO_DESCONECTADO'));return new Promise((resolve,reject)=>{const key=randomUUID();const timer=setTimeout(()=>{pedidos.delete(key);reject(Error('SUPERVISOR_IPC_TIMEOUT'));},prazo+1000);pedidos.set(key,{filho:id,conexao:c,resolve,reject,timer});const falhou=()=>{clearTimeout(timer);pedidos.delete(key);reject(Error('SUPERVISOR_IPC_FALHOU'));};try{c.send({tipo:'cutover-supervisor',id:key,acao,prazo,...extra},err=>{if(err)falhou();});}catch{falhou();}});}
  async function todos(acao,prazo){const entries=await Promise.all(Object.keys(filhos).map(async id=>[id,await pedir(id,acao,prazo)]));return Object.fromEntries(entries);}
  const transicao=require('./transicao-controlada.cjs').criarTransicao({estado,pedir,obterFilho:id=>filhos[id],registrar});
  return {status:()=>todos('status'),
    substituirPlanejado(op){if(Object.keys(filhos).length!==1)return Promise.reject(Error('TRANSICAO_EXIGE_INSTANCIA_UNICA'));return transicao.substituir(op);},
    liberarPlanejado(op){if(Object.keys(filhos).length!==1)return Promise.reject(Error('TRANSICAO_EXIGE_INSTANCIA_UNICA'));return transicao.liberar(op);},
    async congelar(){const s=await todos('status');const instancias=Object.values(s).map(x=>x.instancia);if(!instancias.length||instancias.some(x=>typeof x!=='string')||new Set(instancias).size!==instancias.length)throw Error('SUPERVISOR_INVENTARIO_INVALIDO');
      const old=estado.ler();if(old.congelado)throw Error('SUPERVISOR_JANELA_JA_ABERTA');estado.gravar({versao:1,congelado:true,selado:false,instancias});return todos('congelar');},
    async selarEDrenar(prazo=30000){if(!estado.ler().congelado)throw Error('FREEZE_NAO_ATIVO');await todos('selar');return todos('drenar',prazo);},
    fechar(){for(const r of remover)r();for(const p of pedidos.values()){clearTimeout(p.timer);p.reject(Error('SUPERVISOR_CONTROLADOR_ENCERRADO'));}pedidos.clear();}
  };
}
module.exports={criarControlador};
