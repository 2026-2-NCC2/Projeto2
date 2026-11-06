'use strict';
const {falha,autorizar}=require('./services/suporte-transacoes.cjs');
function criarConsultaCotacaoAdmin(cotacoes){
 return async (ator,entrada)=>{
  autorizar(ator,'admin');
  if(!/^[1-9]\d*$/.test(String(entrada))||!Number.isSafeInteger(Number(entrada))||Number(entrada)>2147483647)throw falha(400,'Cotação inválida.');
  const id=Number(entrada);
  const cotacao=cotacoes.buscarAdministrativo?await cotacoes.buscarAdministrativo(id):(await cotacoes.listarAdministrativo()).find(c=>c.id===id);
  if(!cotacao)throw falha(404,'Cotação não encontrada.');
  const itens=await cotacoes.listarItens(id);
  return {...cotacao,itens};
 };
}
function instalarConsultasAdmin(app,{autenticar,permitirPerfis,repositorios,responderErroServico}){
 const consultar=criarConsultaCotacaoAdmin(repositorios.cotacoes);
 app.get('/admin/cotacoes/:id',autenticar,permitirPerfis('admin'),async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{return res.json(await consultar(req.usuario,req.params.id));}
  catch(e){return responderErroServico(res,e,'Não foi possível consultar a cotação.');}
 });
}
module.exports={instalarConsultasAdmin,criarConsultaCotacaoAdmin};
