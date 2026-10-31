"use strict";
// Apenas construir nao cria processos, conexoes, arquivos ou alteracoes de estado.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {executarHelper}=require('./helper-powershell.cjs'),{criarLancadorPlanejado}=require('./lancador-planejado.cjs'),{criarControlador}=require('../config/controlador-supervisor.cjs');
function criarAdaptersLocais({estado,ambiente,relatorioFile,confirmarJanelaExclusiva=false,confirmarContinuidadeSemEscritas=false}){
  let filho,ctl;
  const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
  const ps=async args=>JSON.parse((await executarHelper('processo-recuperacao.ps1',args)).toString().replace(/^\uFEFF/,''));
  function pedir(acao,extra={}){
    assert.ok(filho?.connected,'RECUPERACAO_IPC_AUSENTE');
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID(),timer=setTimeout(()=>fim(Error('RECUPERACAO_IPC_TIMEOUT')),15000);
      function fim(e,s){clearTimeout(timer);filho.removeListener('message',receber);filho.removeListener('exit',saiu);e?reject(e):resolve(s);}
      function saiu(){fim(Error('RECUPERACAO_FILHO_ENCERROU'));}
      function receber(m){if(m?.tipo==='cutover-resposta'&&m.id===id)m.ok?fim(null,m.status):fim(Error('RECUPERACAO_IPC_RECUSADO'));}
      filho.on('message',receber);filho.once('exit',saiu);
      filho.send({tipo:'cutover-supervisor',id,acao,...extra},e=>{if(e)fim(Error('RECUPERACAO_IPC_FALHOU'));});
    });
  }
  return {
    estado,ambiente,
    adquirirExclusivo(){
      assert.equal(confirmarJanelaExclusiva,true);assert.equal(confirmarContinuidadeSemEscritas,true);
      assert.ok(!fs.lstatSync(estado.diretorio).isSymbolicLink());
      const file=path.join(estado.diretorio,'recuperacao-exclusiva.lock'),token=crypto.randomUUID(),fd=fs.openSync(file,'wx',0o600);
      try{fs.writeFileSync(fd,token);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
      return ()=>{assert.equal(fs.readFileSync(file,'utf8'),token,'RECUPERACAO_TRAVA_DIVERGENTE');fs.unlinkSync(file);};
    },
    async inspecionar(){
      assert.equal(confirmarJanelaExclusiva,true,'RECUPERACAO_JANELA_NAO_CONFIRMADA');
      assert.equal(confirmarContinuidadeSemEscritas,true,'RECUPERACAO_CONTINUIDADE_NAO_CONFIRMADA');
      const relatorio=json(relatorioFile),diario=json(path.join(relatorio.journalDirectory,'janela-relatorio.json')),cp=fs.readFileSync(path.join(relatorio.t0Directory,'checkpoint-t0.privado.json'));
      const processo=await ps(['-PidAlvo',String(estado.ler().transicao.pidDestino)]);
      const inv=JSON.parse((await executarHelper('inventario-janela-real.ps1')).toString().replace(/^\uFEFF/,''));
      const known=new Set([process.pid,processo.pid,processo.parentPid]);
      assert.equal(inv.tasks.length,0);assert.ok(inv.processes.every(p=>['CODEX_MCP','MYSQL_LOCAL'].includes(p.category)||known.has(p.pid)));
      assert.ok(inv.listeners.length===1&&inv.listeners[0].pid===processo.pid&&inv.listeners[0].port===3001);
      const response=await fetch('http://127.0.0.1:3001/perfil',{headers:{connection:'close'},signal:AbortSignal.timeout(3000)});await response.arrayBuffer();
      return {relatorio,diario,checkpointId:JSON.parse(cp).checkpointId,checkpointSha256:crypto.createHash('sha256').update(cp).digest('hex'),causaConfirmada:'SMOKE_PERFIL_CAMPO_INEXISTENTE',escritoresControlados:true,controleMantidoDesdeFalha:true,processo,httpManutencao:response.status};
    },
    encerrarConhecido:proof=>ps(['-PidAlvo',String(proof.pid),'-CriadoEm',proof.criadoEm,'-Pai',String(proof.parentPid),'-Encerrar']),
    async lancarSelado(proof){
      const e=estado.ler();assert.ok(e.congelado&&e.selado&&e.transicao.fase==='INCERTA'&&e.transicao.recuperacao.etapa==='ENCERRANDO');
      assert.equal(e.transicao.id,proof.janela);assert.equal(e.transicao.checkpointId,proof.checkpointId);assert.equal(e.transicao.configuracaoHash,proof.configuracaoHash);
      filho=await criarLancadorPlanejado(ambiente)();const instancia=crypto.randomUUID(),ticket=crypto.randomBytes(32).toString('hex');
      estado.gravar({...e,transicao:{...e.transicao,fase:'PREPARADA',pidDestino:filho.pid,destino:instancia,ticket}});
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>fim(Error('RECUPERACAO_STARTUP_TIMEOUT')),15000);
        function fim(e){clearTimeout(timer);filho.removeListener('message',receber);filho.removeListener('exit',saiu);e?reject(e):resolve();}
        function saiu(){fim(Error('RECUPERACAO_STARTUP_ENCERROU'));}
        function receber(m){if(m?.tipo==='cutover-pronta'&&m.janela===proof.janela&&m.instancia===instancia)fim();else if(m?.tipo==='cutover-falha')fim(Error('RECUPERACAO_STARTUP_RECUSADO'));}
        filho.on('message',receber);filho.once('exit',saiu);filho.send({tipo:'cutover-iniciar',janela:proof.janela,instancia,ticket},e=>{if(e)fim(Error('RECUPERACAO_STARTUP_IPC_FALHOU'));});
      });
      ctl=criarControlador({'express-principal':filho},estado);return {pid:filho.pid,instancia};
    },
    consultar:()=>pedir('status'),abrirLeitura:janela=>pedir('abrir-leitura',{janela}),obterControlador:()=>ctl
  };
}
module.exports={criarAdaptersLocais};
