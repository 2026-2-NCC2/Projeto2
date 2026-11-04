'use strict';
const {falha}=require('./politica.cjs');
// Compartilhado entre perfil e eventos: a vaga inclui corpo, codec, Storage e commit.
function criarRecebedorImagens() {
  let ativos=0;
  return (req,res,next,{bytes,acao})=>{
    const mime=(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
    if(!['application/octet-stream','image/jpeg','image/png','image/webp'].includes(mime)||
      (req.headers['content-encoding']&&req.headers['content-encoding']!=='identity'))return next(falha(415,'Envie JPEG, PNG ou WebP binário, sem compressão HTTP.'));
    if(ativos>=2)return next(falha(429,'Processamento ocupado. Tente novamente mais tarde.'));
    ativos++;
    let terminou=false,processando=false;
    const liberar=()=>{if(!terminou){terminou=true;ativos--;}};
    const timeout=setTimeout(()=>req.destroy(),15000);
    req.once('aborted',()=>{clearTimeout(timeout);if(!processando)liberar();});
    require('express').raw({type:()=>true,limit:bytes,inflate:false})(req,res,async erro=>{
      clearTimeout(timeout);
      if(erro){liberar();return next(erro);}
      try{if(req.aborted)return;processando=true;const r=await acao(req.body);if(!res.destroyed)res.json({mensagem:'Imagem atualizada.',...r});}
      catch(e){next(e);}finally{liberar();}
    });
  };
}
module.exports={criarRecebedorImagens};
