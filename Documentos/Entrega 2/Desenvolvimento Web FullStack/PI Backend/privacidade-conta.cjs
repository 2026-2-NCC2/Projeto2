'use strict';
const { validarProfissional } = require('./perfil-profissional.cjs');
const disponivel = dados => ({ estado: 'disponivel', dados });
const pendente = () => ({ estado: 'infraestrutura_pendente', dados: null });

async function consultarDadosPessoais(usuario, repositorios) {
  if (!Number.isSafeInteger(usuario?.id) || usuario.id <= 0 ||
      !['participante', 'organizador', 'fornecedor', 'admin'].includes(usuario.perfil)) throw Error('Identidade inválida.');
  const { usuarios, privacidade } = repositorios;
  if (!privacidade) throw Error('Consulta não habilitada neste provedor.');
  const pessoal = await usuarios.buscarPerfil(usuario.id);
  if (!pessoal || pessoal.id !== usuario.id || typeof pessoal.nome !== 'string' || typeof pessoal.email !== 'string') throw Error('Cadastro não confirmado.');
  const perfilPessoal = pessoal.edicao_disponivel === true
    ? disponivel({ telefone: pessoal.telefone, biografia: pessoal.biografia }) : pendente();
  if (perfilPessoal.dados && ['telefone', 'biografia'].some(k => pessoal[k] !== null && typeof pessoal[k] !== 'string')) throw Error('Perfil inválido.');
  let profissional;
  try {
    const dados = await usuarios.buscarProfissional(usuario.id);
    if (!dados || dados.id !== usuario.id || dados.perfil !== usuario.perfil) throw Error('Perfil não confirmado.');
    const validado = validarProfissional({ redes_sociais: dados.redes_sociais,
      ...(['organizador', 'fornecedor'].includes(usuario.perfil) ? { dados_comerciais: dados.dados_comerciais } : {}) }, usuario.perfil);
    profissional = disponivel({ redes_sociais: validado.redes_sociais,
      dados_comerciais: validado.dados_comerciais ?? null });
  } catch (e) {
    if (e.code !== 'PROFISSIONAL_MIGRACAO_PENDENTE') throw e;
    profissional = pendente();
  }
  const resumo = await privacidade.listarPorUsuario(usuario.id);
  const categorias = { cadastro: disponivel({ id: pessoal.id, nome: pessoal.nome, email: pessoal.email, perfil: usuario.perfil }),
    perfil_pessoal: perfilPessoal, perfil_profissional: profissional,
    atividades: resumo.atividades, portfolio: resumo.portfolio, aceites: resumo.aceites };
  return { versao: 1, situacao: Object.values(categorias).some(s => s.estado !== 'disponivel') ? 'limitada' : 'disponivel',
    categorias,
    limitacoes: [
      'Consulta do cadastro, perfil, contagens próprias e aceites; não é uma cópia integral nem uma exportação de todos os dados tratados.',
      'Contagens podem incluir atividades de papéis anteriores e são consultadas separadamente, sem snapshot único entre categorias.',
      'Textos comerciais compartilhados, arquivos de imagens, diários operacionais, logs e backups não estão incluídos nesta consulta.',
      'Bases legais, prazos de retenção, responsáveis e canal de atendimento ainda dependem de definição e revisão. Consulte o Contato de Privacidade.',
    ] };
}

function instalarPrivacidadeConta(app, { autenticar, repositorios, exportacaoHabilitada = false }) {
  // Fechado por padrao, inclusive em producao. Sem quota distribuida, nao ativar
  // no servidor real sem avaliacao e aprovacao explicita do risco operacional.
  app.get('/minha-privacidade/exportacao', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  }, autenticar, async (req, res) => {
    if (Object.keys(req.query || {}).length || req.originalUrl?.includes('?') ||
        req.body !== undefined || req.headers?.['transfer-encoding'] ||
        (req.headers?.['content-length'] && req.headers['content-length'] !== '0')) {
      return res.status(400).json({ erro: 'A exportação não aceita parâmetros ou corpo.' });
    }
    if (exportacaoHabilitada !== true) return res.status(503).json({ erro: 'Exportação em validação. A operação real aguarda aprovação do risco de ausência de quota distribuída.' });
    try {
      const consulta = await consultarDadosPessoais(req.usuario, repositorios);
      const { gerarExportacao } = require('./exportacao-privacidade.cjs');
      const json = gerarExportacao(consulta, req.usuario);
      res.setHeader('Content-Type', 'application/json');
      // O frontend principal usa outra porta; expor somente o nome fixo do anexo,
      // sem mudar origens, credenciais ou permissoes CORS existentes.
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      res.setHeader('Content-Disposition', 'attachment; filename="dados-privacidade.json"');
      return res.send(json);
    } catch {
      return res.status(503).json({ erro: 'Não foi possível gerar uma cópia limitada confirmada de até 5 MB. Nenhum arquivo foi disponibilizado.' });
    }
  });
  app.get('/minha-privacidade/dados', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  }, autenticar, async (req, res) => {
    // A consulta não possui parâmetros de seleção de titular.
    if (Object.keys(req.query || {}).length || (req.body && Object.keys(req.body).length)) {
      return res.status(400).json({ erro: 'Esta consulta não aceita parâmetros.' });
    }
    try { return res.json(await consultarDadosPessoais(req.usuario, repositorios)); }
    catch { return res.status(503).json({ erro: 'Não foi possível confirmar a consulta de privacidade. Tente novamente mais tarde.' }); }
  });
}
module.exports = { instalarPrivacidadeConta, consultarDadosPessoais };
