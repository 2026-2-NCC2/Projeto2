"use strict";
const { contexto, falha } = require('./politica.cjs');
// Router preparado para montagem explícita em homologação. A exportação de
// rotas.cjs usada pelo servidor normal continua bloqueada, sem flag de .env.
function criarRouterImagens({ autenticar, servico, agora = Date.now, receber = require('./http-binario.cjs').criarRecebedorImagens() }) {
  const express = require('express');
  const router = express.Router();
  const limites = new Map();
  router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(autenticar);
  router.use('/:tipo', (req, res, next) => {
    try {
      const politica = contexto(req.usuario, req.params.tipo);
      if (Object.keys(req.query).length) throw falha(400, 'Não envie identificadores ou caminhos.');
      const tempo = agora();
      for (const [chave, estado] of limites) if (estado.ate <= tempo) limites.delete(chave);
      // Dois limites independentes: por conta e IP. Sem X-Forwarded-For.
      for (const chave of ['conta:' + req.usuario.id, 'ip:' + req.ip]) {
        if (!limites.has(chave) && limites.size >= 10000) throw falha(429, 'Muitas solicitações.');
        const estado = limites.get(chave) || { total: 0, escritas: 0, ate: tempo + 60000 };
        if (estado.total >= 60 || (req.method !== 'GET' && estado.escritas >= 6)) {
          res.setHeader('Retry-After', String(Math.max(1, Math.ceil((estado.ate-tempo)/1000))));
          throw falha(429, 'Muitas solicitações. Tente novamente mais tarde.');
        }
        estado.total++; if (req.method !== 'GET') estado.escritas++;
        limites.set(chave, estado);
      }
      req.politicaImagem = politica;
      next();
    } catch (erro) { next(erro); }
  });
  router.put('/:tipo', (req, res, next) => {
    return receber(req,res,next,{bytes:req.politicaImagem.bytes,acao:entrada=>servico.substituir(req.usuario,req.params.tipo,entrada)});
  });
  router.get('/:tipo', async (req, res, next) => {
    try { res.json({ imagem: await servico.consultar(req.usuario, req.params.tipo) }); } catch (erro) { next(erro); }
  });
  router.delete('/:tipo', async (req, res, next) => {
    try { await servico.remover(req.usuario, req.params.tipo); res.json({ mensagem: 'Imagem removida. Limpeza física agendada.' }); } catch (erro) { next(erro); }
  });
  router.use((erro, req, res, next) => {
    if (res.headersSent || res.destroyed) return next(erro);
    const status = erro.type === 'entity.too.large' ? 413 : [400,401,403,409,413,415,422,429,503].includes(erro.status) ? erro.status : 503;
    res.status(status).json({ erro: status === 413 ? 'A imagem excede o limite permitido.' :
      status === 503 ? 'Não foi possível confirmar a operação. Consulte suas imagens antes de tentar novamente.' : erro.message });
  });
  return router;
}
module.exports = { criarRouterImagens };
