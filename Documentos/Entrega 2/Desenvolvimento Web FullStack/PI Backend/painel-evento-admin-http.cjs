'use strict';
function instalarPainelEventoAdmin(app,{autenticar,permitirPerfis,repositorios,responderErroServico}){
 const servico=require('./services/painel-evento-admin.cjs').criarPainelEventoAdmin(repositorios);
 app.get('/admin/eventos/:id/painel',autenticar,permitirPerfis('admin'),async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{return res.json(await servico.consultar(req.usuario,req.params.id));}
  catch(e){return responderErroServico(res,e,'Não foi possível carregar o painel do evento.');}
 });
}
module.exports={instalarPainelEventoAdmin};
