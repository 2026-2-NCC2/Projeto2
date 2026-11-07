'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const http = require('node:http'), express = require('express'), jwt = require('jsonwebtoken');
const { criarRepositorioPrivacidade } = require('../repositories/supabase/privacidade-conta.cjs');
const { consultarDadosPessoais, instalarPrivacidadeConta } = require('../privacidade-conta.cjs');
const { gerarExportacao, LIMITE_BYTES } = require('../exportacao-privacidade.cjs');
const segredo = 'segredo-sintetico-exclusivo-dos-testes-de-privacidade';

function fixture({ portfolioAtivo = true } = {}) {
  const perfis = { 7: 'organizador', 8: 'fornecedor', 9: 'participante', 10: 'admin' };
  const usuarios = Object.entries(perfis).map(([id, perfil]) => ({ id: Number(id), perfil, nome: `Pessoa ${id}`, email: `p${id}@example.invalid`,
    telefone: null, biografia: null, redes_sociais: null, dados_comerciais: null, edicao_disponivel: true,
    senha: 'HASH_SENHA_PROIBIDO', token: 'JWT_PROIBIDO', segredo: 'SEGREDO_PROIBIDO' }));
  const tabelas = {
    eventos: [{ id: 1, usuario_id: 7 }, { id: 2, usuario_id: 77 }],
    inscricoes: [{ id: 1, usuario_id: 9 }, { id: 2, usuario_id: 99 }],
    propostas: [{ id: 1, fornecedor_id: 8, detalhes_tecnicos: 'PROPOSTA_PRIVADA' }, { id: 2, fornecedor_id: 88 }],
    solicitacoes_acesso: [{ id: 1, usuario_id: 9, justificativa: 'JUSTIFICATIVA_PRIVADA' }],
    portfolio_itens: [{ id: 1, fornecedor_id: 8, descricao: 'CONTEUDO_COM_TERCEIROS' }],
    termos_aceites: usuarios.map(u => ({ usuario_id: u.id, documento_id: 'termos-uso', versao: 'SINTETICA.1', hash: 'a'.repeat(64),
      aceito_em: '2030-01-01T00:00:00Z', fluxo: 'cadastro', email: 'TERCEIRO_PROIBIDO' })),
  };
  const calls = [], falhas = {};
  const cliente = { schema(s) { assert.equal(s, 'public'); return { from(nome) {
    const filtros = []; let opcoes, campos, intervalo;
    const q = {
      select(c, o) { campos = c; opcoes = o; return q; },
      eq(c, v) { filtros.push([c, v]); return q; }, order() { return q; },
      range(a, b) { intervalo = [a, b]; return q; },
      then(ok, fail) {
        calls.push({ nome, campos, opcoes, filtros: [...filtros] });
        let rows = (tabelas[nome] || []).filter(r => filtros.every(([c, v]) => r[c] === v));
        const count = rows.length;
        if (intervalo) rows = rows.slice(intervalo[0], intervalo[1] + 1);
        return Promise.resolve(falhas[nome] ? { error: { code: falhas[nome], message: 'SEGREDO_PROIBIDO' } } :
          { data: opcoes?.head ? null : rows, count }).then(ok, fail);
      },
    }; return q;
  } }; } };
  const repositorios = { usuarios: {
    buscarPerfil: async id => usuarios.find(u => u.id === id),
    buscarProfissional: async id => usuarios.find(u => u.id === id),
    buscarParaAutenticacao: async id => usuarios.find(u => u.id === id),
  }, privacidade: criarRepositorioPrivacidade(cliente, { portfolioAtivo }) };
  return { usuarios, repositorios, calls, falhas, tabelas };
}

for (const [id, papel] of [[7, 'organizador'], [8, 'fornecedor'], [9, 'participante'], [10, 'admin']]) {
  test(`${papel}: consulta e projeções limitadas ao próprio titular`, async () => {
    const f = fixture(), usuario = f.usuarios.find(u => u.id === id);
    const r = await consultarDadosPessoais(usuario, f.repositorios);
    assert.equal(r.versao, 1); assert.equal(r.categorias.cadastro.dados.id, id);
    assert.equal(r.categorias.aceites.dados.length, 1);
    assert.equal(r.categorias.atividades.dados.eventos_organizados, id === 7 ? 1 : 0);
    assert.equal(r.categorias.atividades.dados.propostas_enviadas, id === 8 ? 1 : 0);
    assert.equal(r.categorias.atividades.dados.inscricoes, id === 9 ? 1 : 0);
    for (const c of f.calls) {
      assert.equal(c.filtros.length, 1); assert.equal(c.filtros[0][1], id);
      if (c.nome !== 'termos_aceites') { assert.equal(c.campos, 'id'); assert.equal(c.opcoes.head, true); }
    }
    const json = JSON.stringify(r);
    for (const proibido of ['HASH_SENHA_PROIBIDO', 'JWT_PROIBIDO', 'SEGREDO_PROIBIDO', 'TERCEIRO_PROIBIDO', 'PROPOSTA_PRIVADA', 'CONTEUDO_COM_TERCEIROS', 'JUSTIFICATIVA_PRIVADA']) assert.ok(!json.includes(proibido));
    assert.deepEqual(Object.keys(r.categorias.cadastro.dados), ['id', 'nome', 'email', 'perfil']);
  });
}

test('infraestrutura opcional ausente é explícita; listas vazias só com consulta confirmada', async () => {
  const f = fixture({ portfolioAtivo: false }); f.falhas.termos_aceites = '42P01';
  const r = await consultarDadosPessoais(f.usuarios[0], f.repositorios);
  assert.equal(r.situacao, 'limitada');
  assert.deepEqual(r.categorias.aceites, { estado: 'infraestrutura_pendente', dados: null });
  assert.deepEqual(r.categorias.portfolio, { estado: 'nao_habilitado', dados: null });
  assert.ok(!f.calls.some(c => c.nome === 'portfolio_itens'));
  delete f.falhas.termos_aceites; f.tabelas.termos_aceites = [];
  assert.deepEqual((await consultarDadosPessoais(f.usuarios[0], f.repositorios)).categorias.aceites.dados, []);
});

test('perfil legado e profissional pendente não são apresentados como perfil vazio completo', async () => {
  const f = fixture(); f.usuarios[0].edicao_disponivel = false;
  f.repositorios.usuarios.buscarProfissional = async () => { throw Object.assign(Error('falha'), { code: 'PROFISSIONAL_MIGRACAO_PENDENTE' }); };
  const r = await consultarDadosPessoais(f.usuarios[0], f.repositorios);
  assert.equal(r.categorias.perfil_pessoal.estado, 'infraestrutura_pendente');
  assert.equal(r.categorias.perfil_profissional.estado, 'infraestrutura_pendente');
});

test('participante não recebe dados comerciais residuais de um papel anterior', async () => {
  const f = fixture(); const participante = f.usuarios.find(u => u.id === 9);
  participante.dados_comerciais = { nome_comercial: 'DADO_COMERCIAL_NAO_VISIVEL' };
  const r = await consultarDadosPessoais(participante, f.repositorios);
  assert.equal(r.categorias.perfil_profissional.dados.dados_comerciais, null);
  assert.ok(!JSON.stringify(r).includes('DADO_COMERCIAL_NAO_VISIVEL'));
});

test('falha de banco, permissão ou coluna inesperada aborta a consulta', async () => {
  for (const [tabela, code] of [['eventos', '42P01'], ['inscricoes', 'ETIMEDOUT'], ['termos_aceites', '42501'], ['portfolio_itens', '42703']]) {
    const f = fixture(); f.falhas[tabela] = code;
    await assert.rejects(consultarDadosPessoais(f.usuarios[0], f.repositorios));
  }
});

test('aceites de outro titular ou duplicados fazem falhar fechado', async () => {
  const f = fixture(); f.tabelas.termos_aceites.push({ ...f.tabelas.termos_aceites[0] });
  await assert.rejects(consultarDadosPessoais(f.usuarios[0], f.repositorios));
  const g = fixture(); g.repositorios.usuarios.buscarPerfil = async () => g.usuarios[1];
  await assert.rejects(consultarDadosPessoais(g.usuarios[0], g.repositorios));
});

test('aceites são paginados sem truncar registros no limite REST', async () => {
  const f = fixture(); f.tabelas.termos_aceites = Array.from({ length: 101 }, (_, i) => ({ ...f.tabelas.termos_aceites[0], versao: `v${i}` }));
  assert.equal((await consultarDadosPessoais(f.usuarios[0], f.repositorios)).categorias.aceites.dados.length, 101);
});

async function iniciar(t, exportacaoHabilitada = false) {
  const f = fixture(), app = express(); app.use(express.json());
  // Executa o middleware EXISTENTE, com JWT real e somente repositório sintético.
  const fonte = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const inicio = fonte.indexOf('async function autenticar('), fim = fonte.indexOf("require('./portfolio.cjs')", inicio);
  const autenticar = vm.runInNewContext(fonte.slice(inicio, fim) + ';autenticar', {
    jwt, process: { env: { JWT_SECRET: segredo } }, usuariosRepository: f.repositorios.usuarios,
    console: { error() { throw Error('Log inesperado'); } },
  });
  instalarPrivacidadeConta(app, { autenticar, repositorios: f.repositorios, exportacaoHabilitada });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  return { ...f, async request(rota, token, body) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path: rota, method: 'GET',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify(body)) } : {}) } }, res => {
        let s = ''; res.on('data', c => { s += c; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(s), headers: res.headers }));
      }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
  } };
}
const token = (id, expiresIn = '1h') => jwt.sign({ id, perfil: 'admin' }, segredo, { algorithm: 'HS256', expiresIn });
test('HTTP real: ausência, token inválido e expirado são recusados antes da consulta', async t => {
  const f = await iniciar(t);
  for (const tok of [undefined, 'invalido', token(7, -1), token(999)]) {
    const r = await f.request('/minha-privacidade/dados', tok);
    assert.equal(r.status, 401);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers.pragma, 'no-cache');
  }
  assert.equal(f.calls.length, 0);
});
test('HTTP real: ID de cliente é recusado e admin continua restrito à própria conta', async t => {
  const f = await iniciar(t);
  for (const rota of ['/minha-privacidade/dados?usuario_id=8', '/minha-privacidade/dados?id=8']) {
    const r = await f.request(rota, token(7));
    assert.equal(r.status, 400); assert.equal(r.headers['cache-control'], 'no-store');
  }
  assert.equal((await f.request('/minha-privacidade/dados', token(7), { usuario_id: 8 })).status, 400);
  assert.equal(f.calls.length, 0);
  for (const id of [7, 8, 9, 10]) {
    const r = await f.request('/minha-privacidade/dados', token(id));
    assert.equal(r.status, 200); assert.equal(r.body.categorias.cadastro.dados.id, id);
    assert.equal(r.headers['cache-control'], 'no-store');
  }
});
test('HTTP real: falha tardia não devolve cadastro ou resumo parcial', async t => {
  const f = await iniciar(t); f.falhas.termos_aceites = 'ETIMEDOUT';
  const r = await f.request('/minha-privacidade/dados', token(7));
  assert.equal(r.status, 503); assert.deepEqual(Object.keys(r.body), ['erro']);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.ok(!JSON.stringify(r).includes('SEGREDO_PROIBIDO'));
});

for (const [id, papel] of [[7, 'organizador'], [8, 'fornecedor'], [9, 'participante'], [10, 'admin']]) {
  test(`exportação ${papel}: própria conta, headers, projeção fechada e mesmas leituras D.3`, async t => {
    const f = await iniciar(t, true);
    const pessoa = f.usuarios.find(u => u.id === id);
    pessoa.nome = 'NOME_LIVRE_TERCEIRO'; pessoa.email = 'CONTATO_TERCEIRO';
    pessoa.biografia = 'BIO_TERCEIRO'; pessoa.telefone = '123';
    pessoa.dados_comerciais = papel === 'organizador' || papel === 'fornecedor' ? { descricao: 'DESCRICAO_TERCEIRO' } : null;
    pessoa.redes_sociais = { site_pessoal: 'https://privado.example.invalid/' };
    const r = await f.request('/minha-privacidade/exportacao', token(id));
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-disposition'], 'attachment; filename="dados-privacidade.json"');
    assert.equal(r.headers['access-control-expose-headers'], 'Content-Disposition');
    assert.match(r.headers['content-type'], /^application\/json/);
    assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers.pragma, 'no-cache');
    assert.equal(r.body.escopo, 'copia_limitada'); assert.equal(r.body.snapshot_transacional_unico, false);
    assert.deepEqual(r.body.categorias.cadastro.dados, { id, perfil: papel });
    assert.equal(r.body.categorias.aceites.dados.length, 1);
    assert.deepEqual(Object.keys(r.body.categorias.aceites.dados[0]), ['documento', 'versao', 'aceito_em', 'fluxo']);
    const json = JSON.stringify(r.body);
    for (const valor of ['NOME_LIVRE_TERCEIRO', 'CONTATO_TERCEIRO', 'BIO_TERCEIRO', 'DESCRICAO_TERCEIRO', 'privado.example', 'hash', 'JWT_PROIBIDO', 'SEGREDO_PROIBIDO', 'TERCEIRO_PROIBIDO', 'PROPOSTA_PRIVADA']) {
      // As limitações explicam a exclusão de hashes, mas nenhum campo/hash é exportado.
      if (valor === 'hash') { assert.equal(r.body.categorias.aceites.dados[0].hash_documento, undefined); continue; }
      assert.ok(!json.includes(valor), valor);
    }
    const chamadas = structuredClone(f.calls); f.calls.length = 0;
    await consultarDadosPessoais(pessoa, f.repositorios);
    assert.deepEqual(f.calls, chamadas);
  });
}

test('exportação: bloqueada por padrão e por valores não booleanos, sem consultar ou anexar arquivo', async t => {
  for (const habilitada of [false, 'true']) {
    const f = await iniciar(t, habilitada);
    const r = await f.request('/minha-privacidade/exportacao', token(7));
    assert.equal(r.status, 503); assert.equal(r.headers['content-disposition'], undefined);
    assert.equal(f.calls.length, 0); assert.match(r.body.erro, /quota distribuída/);
  }
});

test('exportação: JWT ausente/inválido/expirado e usuário inexistente não consultam dados', async t => {
  const f = await iniciar(t, true);
  for (const tok of [undefined, 'invalido', token(7, -1), token(999)]) {
    const r = await f.request('/minha-privacidade/exportacao', tok);
    assert.equal(r.status, 401); assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['content-disposition'], undefined);
  }
  assert.equal(f.calls.length, 0);
});

test('exportação: qualquer query ou corpo é recusado antes da consulta, inclusive objeto vazio', async t => {
  const f = await iniciar(t, true);
  for (const url of ['/minha-privacidade/exportacao?id=8', '/minha-privacidade/exportacao?usuario_id=8', '/minha-privacidade/exportacao?formato=json']) {
    assert.equal((await f.request(url, token(7))).status, 400);
  }
  for (const body of [{}, { usuario_id: 8 }, { token: 'outro' }]) assert.equal((await f.request('/minha-privacidade/exportacao', token(7), body)).status, 400);
  assert.equal(f.calls.length, 0);
});

test('exportação: indisponibilidade opcional é preservada, nunca convertida em ausência', async t => {
  const f = await iniciar(t, true); f.falhas.termos_aceites = '42P01';
  f.repositorios.usuarios.buscarProfissional = async () => { throw Object.assign(Error(), { code: 'PROFISSIONAL_MIGRACAO_PENDENTE' }); };
  const r = await f.request('/minha-privacidade/exportacao', token(7));
  assert.equal(r.status, 200); assert.equal(r.body.situacao_consulta, 'limitada');
  assert.deepEqual(r.body.categorias.aceites, { estado: 'infraestrutura_pendente', dados: null });
  assert.equal(r.body.categorias.perfil_profissional.estado, 'infraestrutura_pendente');
  const g = fixture({ portfolioAtivo: false });
  const d = JSON.parse(gerarExportacao(await consultarDadosPessoais(g.usuarios[0], g.repositorios), g.usuarios[0]));
  assert.deepEqual(d.categorias.portfolio, { estado: 'nao_habilitado', dados: null });
});

test('exportação: falha tardia, permissão e identidade divergente não geram anexo nem conteúdo parcial', async t => {
  for (const code of ['ETIMEDOUT', '42501', '42703']) {
    const f = await iniciar(t, true); f.falhas.termos_aceites = code;
    const r = await f.request('/minha-privacidade/exportacao', token(7));
    assert.equal(r.status, 503); assert.equal(r.headers['content-disposition'], undefined);
    assert.deepEqual(Object.keys(r.body), ['erro']);
  }
  const f = await iniciar(t, true); f.repositorios.usuarios.buscarPerfil = async () => f.usuarios[1];
  assert.equal((await f.request('/minha-privacidade/exportacao', token(7))).status, 503);
});

test('exportação: valida contagens, estados, aceites e tamanho UTF-8 integral sem truncamento', async () => {
  const f = fixture(), u = f.usuarios[0], consulta = await consultarDadosPessoais(u, f.repositorios);
  for (const alterar of [d => { d.categorias.atividades.dados.inscricoes = -1 },
    d => { d.categorias.cadastro.dados.id = 8 }, d => { d.categorias.cadastro.dados.perfil = 'admin' },
    d => { d.categorias.portfolio.estado = 'desconhecido' }, d => { d.situacao = 'limitada' },
    d => { d.categorias.aceites.dados[0].versao = 'texto livre com terceiros' },
    d => { d.categorias.aceites.dados[0].aceito_em = 'ontem' },
    d => { d.categorias.aceites.dados.push(d.categorias.aceites.dados[0]) }]) {
    const d = structuredClone(consulta); alterar(d); assert.throws(() => gerarExportacao(d, u));
  }
  assert.equal(LIMITE_BYTES, 5_000_000);
  const gerar = n => ({ ...consulta, categorias: { ...consulta.categorias, aceites: { estado: 'disponivel', dados: Array.from({ length: n }, (_, i) => ({ ...consulta.categorias.aceites.dados[0], versao: `v${i}` })) } } });
  assert.ok(Buffer.byteLength(gerarExportacao(gerar(1000), u), 'utf8') < LIMITE_BYTES);
  assert.throws(() => gerarExportacao(gerar(60000), u));
});

test('exportação: aceita exatamente 5 MB UTF-8 e recusa um byte adicional', async () => {
  const f = fixture(), u = f.usuarios[0], d = await consultarDadosPessoais(u, f.repositorios);
  const item = { documento: 'termos-uso', versao: 'v00000', aceito_em: '2030-01-01T00:00:00.000Z', fluxo: 'cadastro' };
  d.categorias.aceites.dados = [];
  const base = Buffer.byteLength(gerarExportacao(d, u), 'utf8');
  const tamanhoItem = Buffer.byteLength(JSON.stringify(item), 'utf8');
  const n = Math.floor((LIMITE_BYTES - base + 1) / (tamanhoItem + 1));
  const itens = Array.from({ length: n }, (_, i) => ({ ...item, versao: 'v' + String(i).padStart(5, '0') }));
  let sobra = LIMITE_BYTES - (base + n * tamanhoItem + n - 1);
  for (const a of itens) {
    const incremento = Math.min(sobra, 80 - a.versao.length);
    a.versao += 'x'.repeat(incremento); sobra -= incremento;
    if (!sobra) break;
  }
  d.categorias.aceites.dados = itens;
  assert.equal(Buffer.byteLength(gerarExportacao(d, u), 'utf8'), LIMITE_BYTES);
  itens.at(-1).versao += 'x';
  assert.throws(() => gerarExportacao(d, u));
});

test('exportação HTTP: documento acima de 5 MB não recebe attachment nem resposta parcial', async t => {
  const f = await iniciar(t, true);
  const original = f.repositorios.privacidade.listarPorUsuario;
  f.repositorios.privacidade.listarPorUsuario = async id => {
    const resumo = await original(id);
    resumo.aceites.dados = Array.from({ length: 60000 }, (_, i) => ({ ...resumo.aceites.dados[0], versao: `v${i}` }));
    return resumo;
  };
  const r = await f.request('/minha-privacidade/exportacao', token(7));
  assert.equal(r.status, 503); assert.equal(r.headers['content-disposition'], undefined);
  assert.deepEqual(Object.keys(r.body), ['erro']);
});
