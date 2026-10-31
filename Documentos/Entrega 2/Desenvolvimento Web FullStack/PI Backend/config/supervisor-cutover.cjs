"use strict";
const {AsyncLocalStorage}=require('node:async_hooks'),{randomUUID}=require('node:crypto');
const {criarBarreiraDeEscritas}=require('./congelamento-escritas.cjs');
const {criarEstadoPrivado}=require('./estado-supervisor.cjs');
const leituras=new Set(['listar','listarPorUsuario','listarAdministrativo','listarPorOrganizador','listarPorFornecedor','listarAtivosParaParticipante','listarDisponiveisParaFornecedor','listarItens','listarPorEvento','buscarPorIdDoUsuario','buscarEventoDoUsuario','buscarEventoAtivo','buscarPorUsuarioEEvento','buscarCotacaoDisponivel','buscarPendentesPorUsuario','buscarIdPorEmail','buscarParaLogin','buscarParaAutenticacao','buscarPerfil']);
function criarSupervisor({estado=criarEstadoPrivado(),instancia=require('./startup-controlado.cjs').obterInstanciaPlanejada()||randomUUID(),pid=process.pid,agora=Date.now}={}){
  const contexto=new AsyncLocalStorage(),barreira=criarBarreiraDeEscritas(),requisicoes=new Set(),esperas=new Set();
  let selado=false,operacoes=0,incertos=0,reinicio=false,instalado=false;
  const erro=code=>Object.assign(Error('Operacao indisponivel durante manutencao.'),{code,respostaStatus:503,resultadoIncerto:false});
  function atualizar(){const e=estado.ler();if(e.congelado){barreira.congelar();selado ||= e.selado;reinicio ||= !e.instancias.includes(instancia);}return e;}
  atualizar();
  function status(){const e=atualizar();const b=barreira.status();return {...b,instancia,pid,selado,faseTransicao:e.transicao?.fase||null,requisicoesPendentes:requisicoes.size,operacoesPersistenciaPendentes:operacoes,resultadosIncertos:b.resultadosIncertos+incertos+(reinicio?1:0)+(e.transicao?.fase==='INCERTA'?1:0),coletadoEm:agora(),controle:'somente_local_privado'};}
  function conferirTransicao(janela,fase){const e=estado.ler(),s=status(),t=e.transicao;if(!e.congelado||t?.id!==janela||t.fase!==fase||t.destino!==instancia||t.pidDestino!==pid||s.resultadosIncertos||s.requisicoesPendentes||s.operacoesPersistenciaPendentes||s.escritasPendentes)throw erro('TRANSICAO_GATE_RECUSADO');return e;}
  function avisar(){queueMicrotask(()=>{for(const w of [...esperas]){let s;try{s=status();}catch{w.fim(erro('SUPERVISOR_ESTADO_INDISPONIVEL'));continue;}if(s.resultadosIncertos)w.fim(erro('FREEZE_RESULTADO_INCERTO'));else if(!s.requisicoesPendentes&&!s.operacoesPersistenciaPendentes&&!s.escritasPendentes)w.fim();}});}
  function middleware(req,res,next){
    try{atualizar();}catch{return res.status(503).json({erro:'Escritas temporariamente suspensas para manutencao.'});}
    if(selado){res.setHeader('Retry-After','60');return res.status(503).json({erro:'Escritas temporariamente suspensas para manutencao.'});}
    const leitura=['GET','HEAD','OPTIONS'].includes(req.method)||(req.method==='POST'&&req.path==='/login');
    const ctx={admitida:!leitura&&!barreira.status().congelado,terminou:false};requisicoes.add(ctx);
    const fim=()=>{ctx.terminou=true;requisicoes.delete(ctx);res.removeListener('finish',fim);res.removeListener('close',fim);avisar();};res.once('finish',fim);res.once('close',fim);
    return contexto.run(ctx,()=>barreira.middleware(req,res,next));
  }
  async function executarPersistencia(acao,escrita=true){
    atualizar();const ctx=contexto.getStore();
    if(escrita&&barreira.status().congelado&&(!ctx?.admitida||ctx.terminou))throw erro('FREEZE_NOVA_ESCRITA_BLOQUEADA');
    if(selado&&(!ctx||ctx.terminou))throw erro('FREEZE_NOVA_OPERACAO_BLOQUEADA');
    const proprio=ctx?null:{admitida:escrita,terminou:false};
    operacoes++;try{return await (proprio?contexto.run(proprio,acao):acao());}catch(e){if(escrita&&e?.resultadoIncerto!==false)incertos++;throw e;}finally{if(proprio)proprio.terminou=true;operacoes--;avisar();}
  }
  const envolvidos=new WeakSet();
  function envolver(obj,servico=false){if(envolvidos.has(obj))return obj;for(const [k,v] of Object.entries(obj))if(typeof v==='function')obj[k]=function(...args){return executarPersistencia(()=>Reflect.apply(v,obj,args),servico||!leituras.has(k));};envolvidos.add(obj);return obj;}
  return {status,middleware,executarPersistencia,
    instrumentar({repositorios,servicos}){return {repositorios:Object.fromEntries(Object.entries(repositorios).map(([k,v])=>[k,k==='provider'?v:envolver(v)])),servicos:Object.fromEntries(Object.entries(servicos).map(([k,v])=>[k,envolver(v,true)]))};},
    instalar(app){if(instalado||app.locals?.supervisorCutover)throw erro('SUPERVISOR_DUPLICADO');app.locals??={};app.locals.supervisorCutover=this;app.use(middleware);instalado=true;
      if(process.env.TROCATICKET_SUPERVISOR_IPC==='1')require('./ipc-supervisor.cjs').anexarIPC(this);return this;},
    congelar(){barreira.congelar();try{let e=estado.ler();if(!e.congelado){e={versao:1,congelado:true,selado:false,instancias:[instancia]};estado.gravar(e);}atualizar();return status();}catch(e){incertos++;throw e;}},
    selar(){if(!status().congelado)throw erro('FREEZE_NAO_ATIVO');selado=true;try{const e=estado.ler();estado.gravar({...e,congelado:true,selado:true});return status();}catch(e){incertos++;throw e;}},
    abrirLeitura(janela){const e=conferirTransicao(janela,'LEITURA');if(e.selado)throw erro('TRANSICAO_GATE_RECUSADO');selado=false;return status();},
    liberarEscritas(janela){const e=conferirTransicao(janela,'LIBERAR');if(!selado||!e.selado)throw erro('TRANSICAO_GATE_RECUSADO');try{estado.gravar({...e,congelado:false,selado:false,transicao:{...e.transicao,fase:'CONCLUIDA'}});barreira.liberar();selado=false;return status();}catch(x){incertos++;barreira.congelar();selado=true;throw x;}},
    aguardarDrenagem(ms=30000){const s=status();if(!s.congelado)return Promise.reject(erro('FREEZE_NAO_ATIVO'));if(!Number.isSafeInteger(ms)||ms<1)return Promise.reject(erro('FREEZE_PRAZO_INVALIDO'));return new Promise((resolve,reject)=>{const w={fim(e){clearTimeout(timer);esperas.delete(w);e?reject(e):resolve(status());}};const timer=setTimeout(()=>w.fim(erro('FREEZE_TIMEOUT')),ms);esperas.add(w);avisar();});}
  };
}
module.exports={criarSupervisor};
