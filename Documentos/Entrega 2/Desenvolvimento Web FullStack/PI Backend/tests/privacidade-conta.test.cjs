'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const http = require('node:http'), express = require('express'), jwt = require('jsonwebtoken');
const { criarRepositorioPrivacidade } = require('../repositories/supabase/privacidade-conta.cjs');
const { consultarDadosPessoais, instalarPrivacidadeConta } = require('../privacidade-conta.cjs');
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

async function iniciar(t) {
  const f = fixture(), app = express(); app.use(express.json());
  // Executa o middleware EXISTENTE, com JWT real e somente repositório sintético.
  const fonte = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const inicio = fonte.indexOf('async function autenticar('), fim = fonte.indexOf("require('./portfolio.cjs')", inicio);
  const autenticar = vm.runInNewContext(fonte.slice(inicio, fim) + ';autenticar', {
    jwt, process: { env: { JWT_SECRET: segredo } }, usuariosRepository: f.repositorios.usuarios,
    console: { error() { throw Error('Log inesperado'); } },
  });
  instalarPrivacidadeConta(app, { autenticar, repositorios: f.repositorios });
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
