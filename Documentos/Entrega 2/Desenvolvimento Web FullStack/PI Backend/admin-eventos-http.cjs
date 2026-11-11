'use strict';
const { autorizar, falha } = require('./services/suporte-transacoes.cjs');
const { validarEvento } = require('./services/eventos.cjs');
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function instalarCriacaoAdmin(app, { autenticar, permitirPerfis, repositorios, ativo = false }) {
  const permitido = () => ativo === true && Boolean(repositorios.adminEventos);
  app.get('/admin/eventos/capacidades', autenticar, permitirPerfis('admin'), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      autorizar(req.usuario, 'admin');
      return res.json(permitido() ? await repositorios.adminEventos.capacidades() : { criar: false, controleCapacidade: false });
    } catch { return res.status(503).json({ erro: 'Não foi possível confirmar a disponibilidade da criação administrativa.' }); }
  });
  app.post('/admin/eventos', autenticar, permitirPerfis('admin'), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let iniciouCriacao = false;
    try {
      const adminId = autorizar(req.usuario, 'admin');
      if (!permitido()) throw falha(503, 'Criação administrativa indisponível.');
      const body = req.body;
      const campos = ['organizador_id', 'nome', 'data', 'horario', 'local', 'publico', 'categoria', 'descricao', 'capacidade_maxima'];
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !campos.includes(k))) {
        throw falha(400, 'Campos não permitidos na criação administrativa.');
      }
      if (!Number.isSafeInteger(body.organizador_id) || body.organizador_id <= 0 || !uuidV4.test(req.headers['idempotency-key'] || '')) {
        throw falha(400, 'Informe organizador e chave de idempotência válidos.');
      }
      const dados = validarEvento(body);
      const capacidades = await repositorios.adminEventos.capacidades();
      if (dados.capacidade_maxima !== undefined && !capacidades.controleCapacidade) throw falha(503, 'Controle de capacidade indisponível.');
      const dono = await repositorios.usuarios.buscarParaAutenticacao(body.organizador_id);
      if (!dono || dono.perfil !== 'organizador') throw falha(400, 'Selecione um organizador disponível.');
      iniciouCriacao = true;
      const evento = await repositorios.adminEventos.criar(adminId, dono.id, dados, req.headers['idempotency-key']);
      return res.status(201).json({ evento });
    } catch (erro) {
      const conhecido = require('./services/suporte-transacoes.cjs').ErroServico;
      const seguro = erro instanceof conhecido;
      return res.status(seguro ? erro.respostaStatus : 503).json({
        erro: seguro ? erro.message : 'Resultado não confirmado. Consulte Eventos antes de repetir.',
        // Uma recusa em um replay não prova que a primeira tentativa não gravou.
        resultado_incerto: iniciouCriacao || !seguro || erro.resultadoIncerto === true,
      });
    }
  });
}
module.exports = { instalarCriacaoAdmin };
