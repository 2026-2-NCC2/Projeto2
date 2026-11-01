'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),crypto=require('node:crypto');
const {fixture:base}=require('./helpers/gate-final-selado.cjs'),{criarSubstituicaoSelada}=require('../scripts/substituicao-controlador-selada.cjs');
async function fixture({invalidAck=false,retomada=false,writerAtivo=false,candidatoVivo=false}={}){
  const f=await base();f.advance(Date.now()-f.now());const root=path.resolve(__dirname,'..'),norm=p=>path.normalize(p),e=f.estado.ler(),now=Date.now();e.transicao.pidDestino=202;f.estado.gravar(e);f.estado.diretorio='/ficticio/state';
  const report={...f.report,supervisorPid:202,controllerPid:101,finishedUtc:new Date(now-30000).toISOString()},files=new Map([[norm(path.join(root,'evidencias/janela-final-real-20261031.json')),Buffer.from(JSON.stringify({t0Directory:'/ficticio/t0'}))],[norm('/ficticio/t0/checkpoint-t0.privado.json'),f.checkpointBytes],[norm('/ficticio/report.json'),Buffer.from(JSON.stringify(report))]]),fds=new Map();let nextFd=10,port=202,nextBridge=707,backend,sup,smokes=0;
  const born=new Date(now-1000).toISOString(),proof=(pid,parentPid,created=born)=>({pid,parentPid,criadoEm:created,entradaConhecida:true}),self=proof(process.pid,process.ppid),oldOwner=proof(101,1,new Date(now-120000).toISOString()),oldBackend={...proof(202,101,new Date(now-110000).toISOString()),portaExclusivaLocal:true};
  const actors=new Map([[process.pid,self],[101,oldOwner],[202,oldBackend]]),bridges=new Map(),forks=[],nativeStops=[];
  if(retomada){
    const responder={...proof(707,process.pid),role:'MANUTENCAO_SEM_BACKEND',portaExclusivaLocal:true};actors.delete(202);actors.set(707,responder);bridges.set(707,{});port=707;nextBridge=708;
    const original=f.estado.ler();f.estado.gravar({...original,transicao:{...original.transicao,pidDestino:888,destino:'boot-morto'},controleSelado:{id:'substituicao-falhou',epoch:1,etapa:'FALHA',estadoBase:original,origem:{backend:oldBackend,controlador:oldOwner},controlador:{...proof(999,1),boot:'controlador-morto'},supervisor:{...proof(888,999),boot:'boot-morto'},fasePreservada:'INICIADA',configuracaoHash:original.transicao.configuracaoHash,checkpointId:original.transicao.checkpointId,checkpointSha256:crypto.createHash('sha256').update(f.checkpointBytes).digest('hex'),respondedor:responder,relatorioFile:'/ficticio/report.json',consumidos:[],ticketControlador:{hash:'a'.repeat(64)},ticketSupervisor:null}});
    if(candidatoVivo)actors.set(999,proof(999,1));
  }
  function fork(file,args,opt){
    forks.push({file,opt});const p=new EventEmitter();p.connected=true;p.exitCode=null;p.disconnect=()=>{p.connected=false;};p.unref=()=>{};p.kill=()=>{actors.delete(p.pid);if(port===p.pid)port=null;p.connected=false;p.exitCode=1;p.emit('exit',1);return true;};
    if(file.endsWith('manutencao-validacao.cjs')){p.pid=nextBridge++;actors.set(p.pid,proof(p.pid,process.pid));bridges.set(p.pid,p);port=p.pid;assert.equal(opt.env.JWT_SECRET,undefined);queueMicrotask(()=>p.emit('message',{tipo:'manutencao-validacao-pronta',pid:p.pid,boot:'bridge-'+p.pid,role:'MANUTENCAO_SEM_BACKEND'}));return p;}
    assert.ok(file.endsWith('iniciar-supervisor-substituido.cjs'));p.pid=404;backend=p;actors.set(404,proof(404,process.pid));p.send=(m,cb)=>{
      if(m.tipo==='substituicao-admitir'){require('../config/startup-controlado.cjs').consumirSubstituicao({estado:f.estado,env:f.env,ticket:m.ticket,instancia:m.instancia,pid:404,parentPid:process.pid,instalar:false});sup=require('../config/supervisor-cutover.cjs').criarSupervisor({estado:f.estado,pid:404,instancia:m.instancia});queueMicrotask(()=>p.emit('message',{tipo:'substituicao-selada',id:m.id,pid:invalidAck?999:404,instancia:m.instancia}));}
      else if(m.tipo==='substituicao-ouvir'){assert.equal(port,null);port=404;queueMicrotask(()=>p.emit('message',{tipo:'substituicao-pronta',id:m.id,pid:404,instancia:'child-boot'}));}
      else if(m.tipo==='cutover-supervisor'){assert.equal(m.acao,'status');queueMicrotask(()=>p.emit('message',{tipo:'cutover-resposta',id:m.id,ok:true,status:sup.status()}));}
      else throw Error('IPC_INESPERADO');cb?.();
    };queueMicrotask(()=>p.emit('message',{tipo:'substituicao-aguardando',pid:404,parentPid:process.pid,boot:'child-boot'}));return p;
  }
  async function helper(name,args=[]){const arg=k=>args[args.indexOf(k)+1],pid=Number(arg('-PidAlvo'));let result;
    if(name==='processo-substituicao-selada.ps1'){
      const mode=arg('-Modo');if(mode==='ausentes'){const ids=arg('-PidsAnteriores').split(',').map(Number);result={todosAusentes:ids.every(x=>!actors.has(x)),presentes:ids.filter(x=>actors.has(x))};}
      else if(mode==='encerrar'){assert.ok(actors.has(pid));assert.equal(actors.get(pid).criadoEm,arg('-CriadoEm'));nativeStops.push(pid);actors.delete(pid);if(port===pid)port=null;result={pid,encerrado:true};}
      else{assert.ok(actors.has(pid));result=actors.get(pid);}
    }else if(name==='processo-recuperacao.ps1'){assert.ok(actors.has(pid)&&port===pid);result={...actors.get(pid),portaExclusivaLocal:true};}
    else if(name==='inspecionar-manutencao-validacao.ps1'){if(args.includes('-PortaLivre'))result={portaLivre:port===null};else{assert.ok(bridges.has(pid)&&port===pid);result={...actors.get(pid),role:'MANUTENCAO_SEM_BACKEND',portaExclusivaLocal:true,backendSupervisor:false};}}
    else if(name==='inventario-janela-real.ps1')result={processes:[...actors.keys()].map(pid=>({pid,category:'BACKEND_POSSIVEL'})),listeners:port===null?[]:[{pid:port,port:3001}],mysqlClients:[],tasks:[]};
    else if(name==='inspecionar-controlador-persistente.ps1')result={controlador:self,backend:{...actors.get(404),portaExclusivaLocal:port===404},ipcConsultado:false};
    else throw Error('HELPER_NAO_SIMULADO');return Buffer.from(JSON.stringify(result));
  }
  const fakeFs={...fs,readFileSync(file,...args){if(files.has(norm(file)))return args[0]==='utf8'?files.get(norm(file)).toString('utf8'):files.get(norm(file));assert.ok(path.resolve(file).startsWith(root)&&!String(file).endsWith('.env'),'LEITURA_PRIVADA_REAL_PROIBIDA');return fs.readFileSync(file,...args);},openSync(file,flag){assert.equal(flag,'wx');assert.ok(!files.has(norm(file)));const fd=nextFd++;files.set(norm(file),Buffer.alloc(0));fds.set(fd,norm(file));return fd;},writeFileSync(fd,bytes){assert.ok(fds.has(fd));files.set(fds.get(fd),Buffer.from(bytes));},fsyncSync(){},closeSync(fd){fds.delete(fd);},unlinkSync(file){assert.ok(files.has(norm(file)));files.delete(norm(file));}};
  const entrada=new PassThrough(),saida=new PassThrough(),outputs=[];saida.on('data',x=>outputs.push(JSON.parse(x.toString())));
  const context={module:{exports:{}},__dirname:path.join(root,'scripts'),process:{pid:process.pid,ppid:process.ppid,env:process.env},Buffer,Date,AbortSignal,setTimeout,clearTimeout,fetch:async url=>{assert.equal(url,'http://127.0.0.1:3001/perfil');assert.ok(port!==null);return {status:503,arrayBuffer:async()=>new ArrayBuffer(0)};},require(name){
    if(name==='node:fs')return fakeFs;if(name==='node:child_process')return {fork};if(name==='./helper-powershell.cjs')return {executarHelper:helper};if(name==='./backups-t0.cjs')return {validarArtefatosT0(){}};
    if(name==='./substituicao-controlador-selada.cjs'){const protocol=require('../scripts/substituicao-controlador-selada.cjs');return {...protocol,conferirLeitura:(data,...args)=>protocol.conferirLeitura(host(data),...args)};}
    if(name==='./inspecao-escritores-readonly.cjs')return {async conferirEscritoresBanco(){return {capturedUtc:new Date().toISOString(),mysql:{otherClients:writerAtivo?1:0,otherTransactions:0,enabledJobs:0,scheduler:'OFF'},supabase:{sessions:[],activeCron:0,httpQueue:0,tlsVerified:true}};}};
    if(name==='./coletar-delta-readonly.cjs')return {criarColetorReadOnly(){return async()=>{const n=Date.now();return {...structuredClone(f.checkpoint),projeto:'gnwybroqfvwosiqzsfla',mysqlReadOnly:true,supabaseReadOnly:true,tlsVerificado:true,catalogoConferido:true,capturas:{mysql:{inicio:n,fim:n},supabase:{inicio:n,fim:n}}};};}};
    if(name==='./operacoes-controlador-selado.cjs')return {criarOperacoesControlador(){return {async smoke(){smokes++;return {status:'SMOKE_FICTICIO',requests:26};},preparar(){throw Error('T1_NAO_CHAMAR');},executar(){throw Error('T1_NAO_CHAMAR');},liberar(){throw Error('NAO_LIBERAR');}};}};
    return require(name.startsWith('.')?path.resolve(root,'scripts',name):name);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/runtime-substituicao-selada.cjs'),'utf8'),context);
  const a=context.module.exports.criarRuntimeSubstituicao({estado:f.estado,ambiente:f.env,aceite:{legadoSemIpc:true,riscoResidualAceito:true,historicoNaoComprovado:true,referencia:'Autorizacao ficticia E2E'},relatorioFile:'/ficticio/report.json',entrada,saida});a.instalarCanal();
  function host(x){if(Buffer.isBuffer(x))return Buffer.from(x);if(Array.isArray(x))return Array.from(x,host);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,host(v)]));return x;}
  for(const name of ['inspecionar','inspecionarAposParada','garantir503','lancarSupervisorPausado']){const original=a[name];a[name]=async(...args)=>host(await original(...args));}
  return {...f,a,entrada,outputs,actors,forks,nativeStops,smokes:()=>smokes,port:()=>port,backend:()=>backend};
}
test('runtime integrado troca o par com IO falso e conserva stdin retomavel depois da admissao',async()=>{
  const f=await fixture(),api=criarSubstituicaoSelada(f.a),p=await api.planejar();assert.equal(f.forks.length,0);await api.executar(p,{autorizar:true});assert.deepEqual(f.nativeStops,[202,101,707]);assert.equal(f.port(),404);assert.equal(f.smokes(),0);assert.equal(f.estado.ler().transicao.fase,'INICIADA');
  f.entrada.write(JSON.stringify({acao:'status',pedido:crypto.randomUUID()})+'\n');await new Promise(r=>setTimeout(r,10));assert.equal(f.outputs.at(-1).ok,true);assert.equal(f.outputs.at(-1).controllerPid,process.pid);
  f.entrada.write(JSON.stringify({acao:'smoke-isolado',autorizarSmoke:true,pedido:crypto.randomUUID()})+'\n');await new Promise(r=>setTimeout(r,10));assert.equal(f.smokes(),1);assert.equal(f.outputs.at(-1).requests,26);assert.equal(f.estado.ler().transicao.t1,undefined);
  f.entrada.end();await new Promise(r=>setTimeout(r,40));assert.equal(f.estado.ler().controleSelado.etapa,'FALHA');assert.equal(f.actors.has(404),false);assert.equal(f.port(),708);
});
test('runtime recusa ack de outro PID antes de vincular e mantem ponte conhecida',async()=>{const f=await fixture({invalidAck:true}),api=criarSubstituicaoSelada(f.a),p=await api.planejar();await assert.rejects(api.executar(p,{autorizar:true}));assert.equal(f.port(),707);assert.equal(f.actors.has(404),false);assert.equal(f.estado.ler().controleSelado.etapa,'FALHA');assert.equal(f.estado.ler().transicao.fase,'INICIADA');});

test('retomada explicita encerra apenas remanescente original e admite nova geracao',async()=>{
  const f=await fixture({retomada:true}),api=criarSubstituicaoSelada(f.a);await f.a.prepararRetomada();assert.deepEqual(f.nativeStops,[101]);assert.equal(f.port(),707);assert.ok(f.estado.ler().controleSelado.consumidos.includes('a'.repeat(64)));
  const p=await api.planejarRecuperacao();await api.executar(p,{autorizar:true,autorizarRecuperacao:true});assert.equal(f.estado.ler().controleSelado.epoch,2);assert.deepEqual(f.nativeStops,[101,707]);assert.equal(f.port(),404);assert.equal(f.estado.ler().transicao.fase,'INICIADA');f.entrada.end();await new Promise(r=>setTimeout(r,40));
});

test('retomada recusa escritor de banco antes de encerrar remanescente',async()=>{const f=await fixture({retomada:true,writerAtivo:true});await assert.rejects(f.a.prepararRetomada());assert.deepEqual(f.nativeStops,[]);assert.ok(f.actors.has(101));assert.equal(f.port(),707);});

test('retomada nao encerra candidato anterior ainda vivo',async()=>{const f=await fixture({retomada:true,candidatoVivo:true});await assert.rejects(f.a.prepararRetomada(),/CANDIDATO_ANTERIOR_AINDA_ATIVO/);assert.deepEqual(f.nativeStops,[]);assert.ok(f.actors.has(999));assert.equal(f.port(),707);});
