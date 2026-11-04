'use strict';
const {falha}=require('./imagens/politica.cjs');
const {validarPosicao}=require('./eventos-imagens.cjs');
function instalarImagensEvento(app,{autenticar,obterIntegracao,receber,agora=Date.now}) {
  const express=require('express'),router=express.Router({mergeParams:true}),limites=new Map();
  app.get('/eventos/imagens/capacidades',autenticar,(_req,res)=>{
    const pronto=Boolean(obterIntegracao());
    res.setHeader('Cache-Control','no-store');
    res.json({consultar:pronto,alterar:pronto,limiteGaleria:8});
  });
  router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.use(autenticar);
  router.use((req,res,next)=>{
    try {
      const servico=obterIntegracao()?.servico;
      if(!servico)throw falha(503,'Imagens de eventos aguardam validação da infraestrutura.');
      const id=Number(req.params.eventoId);
      if(!/^[1-9]\d*$/.test(req.params.eventoId)||!Number.isSafeInteger(id))throw falha(400,'Evento inválido.');
      if(Object.keys(req.query).length)throw falha(400,'Não envie caminhos, donos ou identificadores adicionais.');
      const tempo=agora();for(const [k,v] of limites)if(v.ate<=tempo)limites.delete(k);
      for(const k of ['conta:'+req.usuario.id,'ip:'+req.ip]){
        const v=limites.get(k)||{total:0,escritas:0,ate:tempo+60000};
        if(limites.size>=10000&&!limites.has(k)||v.total>=60||req.method!=='GET'&&v.escritas>=6)throw falha(429,'Muitas solicitações. Aguarde antes de tentar novamente.');
        v.total++;if(req.method!=='GET')v.escritas++;limites.set(k,v);
      }
      req.eventoImagens={id,servico};next();
    }catch(e){next(e);}
  });
  router.get('/',async(req,res,next)=>{try{res.json({imagens:await req.eventoImagens.servico.listar(req.usuario,req.eventoImagens.id)});}catch(e){next(e);}});
  router.use('/:posicao',(req,res,next)=>{
    try{if(!/^[0-8]$/.test(req.params.posicao))throw falha(400,'Posição inválida.');validarPosicao(Number(req.params.posicao));if(req.usuario.perfil!=='organizador')throw falha(403,'Somente o organizador proprietário pode alterar imagens.');next();}catch(e){next(e);}
  });
  router.put('/:posicao',(req,res,next)=>receber(req,res,next,{bytes:10485760,acao:entrada=>req.eventoImagens.servico.substituir(req.usuario,req.eventoImagens.id,Number(req.params.posicao),entrada)}));
  router.delete('/:posicao',async(req,res,next)=>{try{
    if(Number(req.headers['content-length']||0)>0||req.headers['transfer-encoding'])throw falha(400,'Remoção não aceita corpo.');
    await req.eventoImagens.servico.remover(req.usuario,req.eventoImagens.id,Number(req.params.posicao));res.json({mensagem:'Imagem desvinculada; limpeza em quarentena.'});
  }catch(e){next(e);}});
  router.use((erro,req,res,next)=>{
    if(res.headersSent||res.destroyed)return next(erro);
    const status=erro.type==='entity.too.large'?413:[400,401,403,404,409,413,415,422,429,503].includes(erro.status)?erro.status:503;
    res.status(status).json({erro:status===503?'Não foi possível confirmar a operação. Consulte as imagens antes de repetir.':status===413?'A imagem excede 10 MiB.':erro.message});
  });
  app.use('/eventos/:eventoId/imagens',router);
}
module.exports={instalarImagensEvento};
