"use strict";
const { contexto, falha } = require('./politica.cjs');
// Router preparado para montagem explícita em homologação. A exportação de
// rotas.cjs usada pelo servidor normal continua bloqueada, sem flag de .env.
function criarRouterImagens({ autenticar, servico, agora = Date.now }) {
  const express = require('express');
  const router = express.Router();
  const limites = new Map(); let ativos = 0;
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
    const mime = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!['application/octet-stream', 'image/jpeg', 'image/png', 'image/webp'].includes(mime) ||
        (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) return next(falha(415, 'Envie uma imagem binária JPEG, PNG ou WebP, sem compressão HTTP.'));
    if (ativos >= 2) return next(falha(429, 'Processamento ocupado. Tente novamente mais tarde.'));
    ativos++;
    // Inclui recepção do corpo, codec, Storage e commit. Não libera a vaga
    // apenas por desconexão HTTP enquanto a operação ainda pode estar ativa.
    let terminou = false, processando = false;
    const liberar = () => { if (!terminou) { terminou = true; ativos--; } };
    const timeout = setTimeout(() => req.destroy(), 15000);
    req.once('aborted', () => { clearTimeout(timeout); if (!processando) liberar(); });
    express.raw({ type: () => true, limit: req.politicaImagem.bytes, inflate: false })(req, res, async erro => {
      clearTimeout(timeout);
      if (erro) { liberar(); return next(erro); }
      try {
        if (req.aborted) return;
        processando = true;
        const resultado = await servico.substituir(req.usuario, req.params.tipo, req.body);
        if (!res.destroyed) res.status(200).json({ mensagem: 'Imagem atualizada.', ...resultado });
      } catch (erro) { next(erro); } finally { liberar(); }
    });
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
