'use strict';
const { falha, ErroServico } = require('./services/suporte-transacoes.cjs');
const perfis = ['organizador', 'fornecedor', 'admin'];
function id(valor) {
  if (!/^[1-9]\d*$/.test(String(valor)) || !Number.isSafeInteger(Number(valor))) throw falha(400, 'Identificador inválido.');
  return Number(valor);
}
function instalarContratacoes(app, { autenticar, repositorios, ativo = false }) {
  const habilitado = () => ativo === true && Boolean(repositorios.contratacoes);
  const proteger = handler => [autenticar, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!perfis.includes(req.usuario?.perfil) || !Number.isSafeInteger(req.usuario?.id) || req.usuario.id <= 0) throw falha(403, 'Acesso não autorizado.');
      await handler(req, res);
    } catch (erro) {
      const seguro = erro instanceof ErroServico;
      res.status(seguro ? erro.respostaStatus : 503).json({ erro: seguro ? erro.message : 'Não foi possível confirmar a operação. Consulte novamente.', resultado_incerto: erro.resultadoIncerto === true });
    }
  }];
  const exigir = () => { if (!habilitado()) throw falha(503, 'Contratações indisponíveis neste ambiente.'); };
  app.get('/contratacoes/capacidades', ...proteger(async (_req, res) => {
    res.json(habilitado() ? await repositorios.contratacoes.capacidades() : { disponivel: false });
  }));
  app.get('/contratacoes', ...proteger(async (req, res) => {
    exigir();
    if (Object.keys(req.query || {}).some(k => k !== 'evento')) throw falha(400, 'Filtro não permitido.');
    res.json(await repositorios.contratacoes.listar(req.usuario, req.query?.evento === undefined ? null : id(req.query.evento)));
  }));
  app.post('/contratacoes', ...proteger(async (req, res) => {
    if (req.usuario.perfil !== 'organizador') throw falha(403, 'Somente o Organizador pode formalizar contratações.');
    exigir();
    if (!req.body || Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, 'proposta_id')) throw falha(400, 'Informe somente a proposta aprovada.');
    res.status(201).json(await repositorios.contratacoes.formalizar(req.usuario, id(req.body.proposta_id)));
  }));
  app.patch('/contratacoes/:id', ...proteger(async (req, res) => {
    if (req.usuario.perfil !== 'organizador') throw falha(403, 'Somente o Organizador responsável pode alterar a contratação.');
    exigir();
    const b = req.body;
    if (!b || Object.keys(b).length !== 3 || Object.keys(b).some(k => !['estado', 'motivo', 'versao'].includes(k)) ||
      !['concluido', 'cancelado'].includes(b.estado) || typeof b.motivo !== 'string' || b.motivo.trim().length < 3 || b.motivo.trim().length > 1000 || !Number.isSafeInteger(b.versao) || b.versao < 1) throw falha(400, 'Informe situação, versão e justificativa de 3 a 1000 caracteres.');
    res.json(await repositorios.contratacoes.alterar(req.usuario, id(req.params.id), { ...b, motivo: b.motivo.trim() }));
  }));
}
module.exports = { instalarContratacoes };
