"use strict";
const { exigirConfiguracao } = require('./homologacao-config.cjs');
// Aplicação exclusiva. Não importa server.js, cutover, MySQL, .env ou worker.
// Mesmo após preflight aprovado, não monta o router de uploads candidato.
function criarAppHomologacao(config, usuarios, evidencia) {
  exigirConfiguracao(config);
  if(evidencia?.aprovado!==true || evidencia.ref!==config.ref || evidencia.escritasHabilitadas!==false)throw Error('IH_PREFLIGHT');
  const express=require('express'),jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs');
  const app=express(),tentativas=new Map();
  app.use((req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.headers.origin && req.headers.origin!=='http://127.0.0.1:5273')return res.status(403).json({erro:'Origem não autorizada.'});
    const t=Date.now();for(const [ip,e] of tentativas)if(e.ate<=t)tentativas.delete(ip);
    const e=tentativas.get(req.ip)||{total:0,ate:t+60000};
    if(e.total>=60 || (!tentativas.has(req.ip)&&tentativas.size>=1000))return res.status(429).json({erro:'Aguarde antes de tentar novamente.'});
    e.total++;tentativas.set(req.ip,e);next();
  });
  const autorizada=u=>u && config.contas.some(c=>c.id===u.id && c.email===u.email && c.perfil===u.perfil);
  async function autenticar(req,res,next) {
    let payload;
    try {
      payload=jwt.verify((req.headers.authorization||'').replace(/^Bearer /,''),config.jwtSecret,{algorithms:['HS256']});
      if(!Number.isSafeInteger(payload.id))throw Error();
    } catch {return res.status(401).json({erro:'Token inválido ou expirado.'});}
    const conta=config.contas.find(c=>c.id===payload.id);
    if(!conta)return res.status(403).json({erro:'Conta não autorizada para homologação.'});
    try {
      const u=await usuarios.buscarParaLogin(conta.email);
      if(!autorizada(u)||u.id!==payload.id)return res.status(403).json({erro:'Conta não autorizada para homologação.'});
      req.usuario={id:u.id,perfil:u.perfil,nome:u.nome,email:u.email};next();
    } catch {res.status(503).json({erro:'Não foi possível validar a conta.'});}
  }
  require('./rotas.cjs').instalarRotasImagens(app,autenticar);
  app.post('/login',express.json({limit:'8kb',inflate:false}),async(req,res)=>{
    const {email,senha}=req.body||{};
    if(typeof email!=='string'||typeof senha!=='string'||senha.length>256)return res.status(400).json({erro:'Informe email e senha.'});
    const conta=config.contas.find(c=>c.email===email.trim().toLowerCase());
    if(!conta)return res.status(401).json({erro:'Email ou senha incorretos.'});
    try {
      const u=await usuarios.buscarParaLogin(conta.email);
      if(!autorizada(u)||!await bcrypt.compare(senha,u.senha))return res.status(401).json({erro:'Email ou senha incorretos.'});
      res.json({token:jwt.sign({id:u.id,perfil:u.perfil},config.jwtSecret,{algorithm:'HS256',expiresIn:'1h'}),
        usuario:{id:u.id,nome:u.nome,email:u.email,perfil:u.perfil}});
    } catch {res.status(503).json({erro:'Login de homologação indisponível.'});}
  });
  app.get('/perfil',autenticar,(req,res)=>res.json(req.usuario));
  app.get('/__homologacao',(req,res)=>res.json({ambiente:'imagens-homologacao',projectRef:config.ref,imagensHabilitadas:false}));
  app.use((req,res)=>res.status(404).json({erro:'Rota indisponível nesta homologação.'}));
  app.use((erro,req,res,next)=>{
    if(res.headersSent)return next(erro);
    res.status(erro.type==='entity.too.large'?413:400).json({erro:'Requisição recusada.'});
  });
  return app;
}
module.exports={criarAppHomologacao};
