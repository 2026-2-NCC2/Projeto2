"use strict";
const erro=(status,mensagem)=>Object.assign(Error(mensagem),{status,resultadoIncerto:status>=500});
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function validarItem(body,edicao=false){
  const campos=['titulo','descricao','categoria',...(edicao?['versao']:[])];
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!campos.includes(k)))throw erro(400,'Informe somente título, descrição e categoria.');
  const dados={};
  for(const [campo,max]of [['titulo',120],['descricao',2000],['categoria',80]]){
    const v=body[campo];
    if(typeof v!=='string'||!v.trim()||v.trim().length>max||(campo==='descricao'?/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/:/[\p{Cc}]/u).test(v))throw erro(400,'Preencha os campos e respeite seus limites de tamanho.');
    dados[campo]=v.trim();
  }
  if(edicao)dados.versao=validarVersao(body.versao);
  return dados;
}
function validarVersao(v){if(!Number.isInteger(v)||v<1||v>=2147483647)throw erro(400,'Versão inválida. Recarregue o portfólio.');return v;}
function pagina(req){const p=String(req.query?.pagina??'1');if(!/^[1-9]\d{0,3}$/.test(p))throw erro(400,'Página inválida.');return Number(p);}
function instalarPortfolio(app,{autenticar,permitirPerfis,repo,limitarFrequencia}){
  const disponivel=(req,res,next)=>repo?next():res.status(503).json({erro:'O portfólio aguarda ativação e preparação do banco de dados.'});
  const fornecedor=permitirPerfis('fornecedor');
  const leitores=permitirPerfis('participante','organizador','fornecedor','admin');
  const escrita=limitarFrequencia?limitarFrequencia(30,60000):(req,res,next)=>next();
  function responder(res,e){
    if(['42P01','42703','PGRST204','PGRST205'].includes(e.code))return res.status(503).json({erro:'O portfólio aguarda preparação do banco de dados.'});
    return res.status([400,403,404,409].includes(e.status)?e.status:503).json({erro:[400,403,404,409].includes(e.status)?e.message:'Resultado não confirmado. Recarregue o portfólio antes de tentar novamente.'});
  }
  const executar=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){responder(res,e);}};
  app.get('/portfolio',autenticar,fornecedor,disponivel,executar(async(req,res)=>res.json(await repo.listarPorFornecedor(req.usuario.id,pagina(req)))));
  app.post('/portfolio',autenticar,fornecedor,disponivel,escrita,executar(async(req,res)=>res.status(201).json(await repo.criar(req.usuario.id,validarItem(req.body)))));
  app.patch('/portfolio/:id',autenticar,fornecedor,disponivel,escrita,executar(async(req,res)=>{
    if(!uuid(req.params.id))throw erro(400,'Item inválido.');
    const item=await repo.atualizar(req.usuario.id,req.params.id,validarItem(req.body,true));
    if(!item)throw erro(409,'Item não encontrado, sem permissão ou alterado. Recarregue o portfólio.');res.json(item);
  }));
  app.delete('/portfolio/:id',autenticar,fornecedor,disponivel,escrita,executar(async(req,res)=>{
    if(!uuid(req.params.id)||!req.body||Object.keys(req.body).length!==1||!Object.hasOwn(req.body,'versao'))throw erro(400,'Informe o item e sua versão.');
    const item=await repo.excluir(req.usuario.id,req.params.id,validarVersao(req.body.versao));
    if(!item)throw erro(409,'Item não encontrado, sem permissão ou alterado. Recarregue o portfólio.');res.json({mensagem:'Item removido.'});
  }));
  app.get('/fornecedores',autenticar,leitores,disponivel,executar(async(req,res)=>res.json(await repo.listar(pagina(req)))));
  app.get('/fornecedores/:id/portfolio',autenticar,leitores,disponivel,executar(async(req,res)=>{
    const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0||id>2147483647)throw erro(400,'Fornecedor inválido.');
    const publico=await repo.buscarPerfil(id);if(!publico)throw erro(404,'Fornecedor não encontrado.');
    res.json({fornecedor:publico,...await repo.listarPorFornecedor(id,pagina(req))});
  }));
}
module.exports={instalarPortfolio,validarItem,validarVersao,uuid,erro};
