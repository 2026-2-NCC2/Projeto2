'use strict';

const LIMITE_BYTES = 5_000_000; // 5 MB decimais, verificados depois da serializacao completa.
const estados = ['disponivel', 'infraestrutura_pendente', 'nao_habilitado'];
const papeis = ['participante', 'organizador', 'fornecedor', 'admin'];
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exigir = condicao => { if (!condicao) throw Error('Exportação não confirmada.'); };

// Projecao fechada: textos livres, contatos, links e TODOS os hashes ficam fora.
// A consulta D.3 permanece intacta e continua sendo a unica fonte de leitura.
function gerarExportacao(consulta, usuario) {
  exigir(objeto(consulta) && consulta.versao === 1 && objeto(consulta.categorias));
  exigir(Number.isSafeInteger(usuario?.id) && usuario.id > 0 && papeis.includes(usuario.perfil));
  const fonte = consulta.categorias;
  const nomes = ['cadastro', 'perfil_pessoal', 'perfil_profissional', 'atividades', 'portfolio', 'aceites'];
  for (const nome of nomes) {
    const s = fonte[nome];
    exigir(objeto(s) && estados.includes(s.estado));
    exigir(s.estado === 'disponivel' ? s.dados !== null && s.dados !== undefined : s.dados === null);
  }
  const limitada = nomes.some(n => fonte[n].estado !== 'disponivel');
  exigir(consulta.situacao === (limitada ? 'limitada' : 'disponivel'));
  const cadastro = fonte.cadastro;
  exigir(cadastro.estado === 'disponivel' && objeto(cadastro.dados) && cadastro.dados.id === usuario.id && cadastro.dados.perfil === usuario.perfil);
  const categorias = { cadastro: { estado: 'disponivel', dados: { id: usuario.id, perfil: usuario.perfil } } };
  for (const nome of ['perfil_pessoal', 'perfil_profissional']) {
    exigir(fonte[nome].estado !== 'disponivel' || objeto(fonte[nome].dados));
    categorias[nome] = { estado: fonte[nome].estado, dados: null, excluida_por_minimizacao: true };
  }
  for (const [nome, campos] of [
    ['atividades', ['eventos_organizados', 'inscricoes', 'propostas_enviadas', 'solicitacoes_acesso']],
    ['portfolio', ['itens']],
  ]) {
    const s = fonte[nome];
    exigir(nome !== 'atividades' || s.estado === 'disponivel');
    if (s.estado !== 'disponivel') { categorias[nome] = { estado: s.estado, dados: null }; continue; }
    exigir(objeto(s.dados) && campos.every(k => Number.isSafeInteger(s.dados[k]) && s.dados[k] >= 0));
    categorias[nome] = { estado: s.estado, dados: Object.fromEntries(campos.map(k => [k, s.dados[k]])) };
  }
  const aceites = fonte.aceites;
  if (aceites.estado !== 'disponivel') categorias.aceites = { estado: aceites.estado, dados: null };
  else {
    exigir(Array.isArray(aceites.dados));
    const chaves = new Set();
    categorias.aceites = { estado: 'disponivel', dados: aceites.dados.map(a => {
      exigir(objeto(a) && a.documento === 'termos-uso' && a.fluxo === 'cadastro' &&
        typeof a.versao === 'string' && /^[a-zA-Z0-9._-]{1,80}$/.test(a.versao) &&
        typeof a.aceito_em === 'string' && Number.isFinite(Date.parse(a.aceito_em)) &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(a.aceito_em) && !chaves.has(a.versao));
      chaves.add(a.versao);
      return { documento: 'termos-uso', versao: a.versao, aceito_em: new Date(a.aceito_em).toISOString(), fluxo: 'cadastro' };
    }) };
  }
  const resultado = { versao: 1, escopo: 'copia_limitada', situacao: 'limitada',
    situacao_consulta: consulta.situacao, snapshot_transacional_unico: false,
    categorias, limitacoes: [
      'Esta é uma cópia limitada, não uma exportação integral dos dados pessoais.',
      'Nome, e-mail, telefone, biografia, redes sociais, dados comerciais, textos livres, links e hashes foram excluídos por minimização.',
      'Inclui apenas identificador e perfil próprios, contagens próprias e metadados limitados de aceites.',
      'Não inclui registros detalhados, dados privados de terceiros, imagens, logs ou backups.',
      'As consultas são separadas, sem snapshot transacional único. Indisponibilidade não significa ausência de dados.',
      'A quota distribuída de três downloads por hora por usuário permanece pendente. Operação real exige aprovação explícita desse risco.',
    ] };
  const json = JSON.stringify(resultado);
  exigir(Buffer.byteLength(json, 'utf8') <= LIMITE_BYTES);
  return json;
}

module.exports = { gerarExportacao, LIMITE_BYTES };
