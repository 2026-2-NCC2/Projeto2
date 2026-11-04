'use strict';
const {falha,ErroServico}=require('./suporte-transacoes.cjs');
const ESTADOS=Object.freeze(['Em planejamento','Ativo','Cancelado','Encerrado']);
function inicioFuturo(data,horario,agora=new Date()){
  const dia=data instanceof Date?`${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`:data;
  const partes=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(agora);
  return `${dia} ${horario.length===5?horario+':00':horario}`>partes;
}
function validarEvento(dados){
  if(!dados||typeof dados!=='object'||Array.isArray(dados))throw falha(400,'Informe os dados do evento.');
  const texto=(nome,limite,padrao,opcional=false)=>{
    const v=dados[nome]===undefined?padrao:dados[nome];
    if(typeof v!=='string'||Array.from(v.trim()).length>limite||(!opcional&&!v.trim())||
      (nome==='descricao'?/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/:/[\x00-\x1f\x7f]/).test(v))throw falha(400,`Campo ${nome} inválido.`);
    return v.trim();
  };
  const data=dados.data,horario=dados.horario;
  if(typeof data!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data)||data<'1000-01-01'||
    !Number.isFinite(Date.parse(data))||new Date(data+'T00:00:00Z').toISOString().slice(0,10)!==data||
    typeof horario!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)||
    !Number.isSafeInteger(dados.publico)||dados.publico<1||dados.publico>2147483647)throw falha(400,'Informe data, horário e público válidos.');
  if(dados.capacidade_maxima!==undefined && dados.capacidade_maxima!==null &&
    (!Number.isSafeInteger(dados.capacidade_maxima)||dados.capacidade_maxima<1||dados.capacidade_maxima>2147483647))
    throw falha(400,'Capacidade máxima deve ser um inteiro entre 1 e 2147483647.');
  return {...(dados.capacidade_maxima!==undefined?{capacidade_maxima:dados.capacidade_maxima}:{}),nome:texto('nome',100),data,horario,local:texto('local',200),categoria:texto('categoria',100,'Corporativo'),publico:dados.publico,descricao:texto('descricao',10000,'',true)};
}
function erroRpc(erro){
  const mensagens={LT409:'Evento lotado. Não há vagas disponíveis.',DU409:'Você já está inscrito neste evento.',
    IN409:'Evento indisponível para inscrição.',CP409:'Capacidade abaixo do total de inscritos confirmados.'};
  if(mensagens[erro?.code])throw falha(409,mensagens[erro.code]);
  const status=({EV400:400,EV403:403,EV404:404,EV409:409,'23505':409,'22P02':400})[erro?.code];
  if(status)throw falha(status,({400:'Dados inválidos.',403:'Operação não autorizada.',404:'Evento não encontrado.',409:'O evento mudou ou a operação não é permitida. Consulte novamente.'})[status]);
  throw falha(503,'Gestão segura indisponível. Aguarde a preparação do banco e consulte o evento antes de repetir.',true);
}
async function consultarRpc(cliente,nome,args){
  const controle=new AbortController();let timer;
  try{
    const consulta=cliente.schema('public').rpc(nome,args).retry(false).abortSignal(controle.signal);
    return await Promise.race([consulta,new Promise((_,reject)=>{timer=setTimeout(()=>{
      controle.abort();reject(falha(503,'Resultado não confirmado. Consulte o evento antes de repetir.',true));
    },10000)})]);
  }catch(e){
    if(e instanceof ErroServico)throw e;
    throw falha(503,'Resultado não confirmado. Consulte o evento antes de repetir.',true);
  }finally{clearTimeout(timer);controle.abort();}
}
module.exports={ESTADOS,validarEvento,inicioFuturo,erroRpc,consultarRpc};
