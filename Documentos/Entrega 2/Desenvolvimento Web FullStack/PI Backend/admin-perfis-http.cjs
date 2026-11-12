'use strict';
const perfis = ['participante', 'organizador', 'fornecedor', 'admin'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function instalarGestaoPerfis(app, { autenticar, permitirPerfis, repositorios, ativo = false }) {
  const disponivel = () => ativo === true && Boolean(repositorios.adminPerfis);
  app.get('/admin/usuarios/perfis/capacidades', autenticar, permitirPerfis('admin'), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { return res.json({ alterar: disponivel() ? await repositorios.adminPerfis.capacidades() : false, modelo: 'unico' }); }
    catch { return res.status(503).json({ erro: 'Não foi possível confirmar a disponibilidade. Tente novamente.' }); }
  });
  app.patch('/admin/usuarios/:id/perfil', autenticar, permitirPerfis('admin'), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!disponivel()) return res.status(503).json({ erro: 'Gerenciamento de perfis ainda indisponível.', resultado_incerto: false });
    const body = req.body, id = Number(req.params.id), chave = req.headers['idempotency-key'];
    if (!Number.isSafeInteger(id) || id < 1 || !uuid.test(chave || '') || !body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(k => !['perfil_anterior', 'perfil_novo', 'motivo', 'confirmado'].includes(k))
      || body.confirmado !== true || !perfis.includes(body.perfil_anterior) || !perfis.includes(body.perfil_novo)
      || body.perfil_anterior === body.perfil_novo || typeof body.motivo !== 'string'
      || Array.from(body.motivo.trim()).length < 10 || Array.from(body.motivo.trim()).length > 1000 || /[\x00-\x1f\x7f]/.test(body.motivo)) {
      return res.status(400).json({ erro: 'Selecione um perfil diferente, confirme a alteração e informe motivo de 10 a 1000 caracteres.', resultado_incerto: false });
    }
    try {
      const usuario = await repositorios.adminPerfis.alterar(req.usuario.id, id, { ...body, motivo: body.motivo.trim() }, chave);
      return res.json({ usuario });
    } catch (erro) {
      const status = Number.isInteger(erro.respostaStatus) ? erro.respostaStatus : 503;
      return res.status(status).json({ erro: erro.seguro ? erro.message : 'Resultado não confirmado. Atualize a lista antes de repetir.', resultado_incerto: erro.resultadoIncerto !== false });
    }
  });
}
module.exports = { instalarGestaoPerfis };
