import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { carregarAdmin, hooksAdmin, nodes, text } from './helpers/adminRuntime.js'
import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'

const tick = () => new Promise(r => setTimeout(r, 0))
const pessoa = { id: 7, nome: 'Pessoa sintética', email: 'pessoa@example.invalid', edicao_disponivel: true }
function componente(file, nome, props = {}, env = {}) {
  const h = hooksAdmin({ ...primitivasFixture, jsx: jsxPrimitivas, AbortController,
    setTimeout: () => 1, clearTimeout() {},
    sessionStorage: { getItem: () => 'token-sintetico' }, Icone: 'svg', ImagensPerfil: 'imagens',
    PerfilProfissional: 'profissional', ConsultaPortfolios: 'consulta',
    useFocoModal: () => ({ current: null }), window: { confirm: () => false }, ...env })
  const fn = carregarAdmin(file, [nome], h.env)[nome]
  return { render: () => h.render(fn, props), close: h.close }
}
const botao = (v, label) => nodes(v).find(n => n.type === 'button' && text(n).includes(label))
const classes = (v, classe) => nodes(v).filter(n => n.props.className?.split(' ').includes(classe))
const pessoal = (nome, props, env) => componente('components/perfil/PerfilPessoal.jsx', nome, props, env)
const portfolio = (env, editar = true) => componente('components/portfolio/Portfolio.jsx', 'Portfolio', { donoId: 7, editar }, env)

test('perfil distingue skeleton de erro persistente e permite repetir a consulta', () => {
  let estado = { perfil: null, erro: '', recarregar: () => chamadas++ }, chamadas = 0
  const r = pessoal('PerfilPessoal', {}, { usePerfil: () => estado })
  assert.equal(classes(r.render(), 'ttSkeleton--card').length, 1)
  assert.match(text(r.render()), /Carregando perfil/)
  estado = { ...estado, erro: 'Consulta não confirmada' }
  const v = r.render()
  assert.equal(classes(v, 'ttSkeleton').length, 0)
  assert.ok(nodes(v).some(n => n.props.role === 'alert' && text(n).includes(estado.erro)))
  botao(v, 'Tentar novamente').props.onClick(); assert.equal(chamadas, 1)
})

test('campos pessoais associam labels, limites, autocomplete e email somente leitura', () => {
  const r = pessoal('FormularioPerfil', { perfil: pessoa, token: 'token-sintetico' })
  botao(r.render(), 'Editar dados').props.onClick()
  const v = r.render(), controles = nodes(v).filter(n => ['input', 'textarea'].includes(n.type))
  for (const c of controles) assert.ok(nodes(v).some(n => n.type === 'label' && n.props.htmlFor === c.props.id))
  assert.equal(controles[0].props.required, true); assert.equal(controles[0].props.maxLength, 100)
  assert.equal(controles[1].props.readOnly, true); assert.equal(controles[1].props.autoComplete, 'email')
  assert.equal(controles[2].props.maxLength, 30); assert.equal(controles[3].props.maxLength, 1000)
})

test('salvar perfil mantém estado ocupado acessível e erro persistente sem perder rascunho', async () => {
  let rejeitar, chamadas = 0
  const r = pessoal('FormularioPerfil', { perfil: pessoa, token: 'token-sintetico' }, {
    salvarPerfil: () => { chamadas++; return new Promise((_, reject) => { rejeitar = reject }) },
  })
  botao(r.render(), 'Editar dados').props.onClick()
  nodes(r.render()).find(n => n.type === 'input').props.onChange({ target: { value: 'Rascunho sintético' } })
  const pendente = r.render().props.onSubmit({ preventDefault() {} })
  await r.render().props.onSubmit({ preventDefault() {} })
  assert.equal(chamadas, 1); assert.equal(botao(r.render(), 'Salvando').props['aria-busy'], true)
  rejeitar(Error('Resultado incerto: consulte novamente')); await pendente
  assert.equal(nodes(r.render()).find(n => n.type === 'input').props.value, 'Rascunho sintético')
  assert.ok(classes(r.render(), 'ttTom--erro').length)
  assert.doesNotMatch(text(r.render()), /Perfil atualizado/)
})

test('perfil profissional distingue carregamento de funcionalidade indisponível', async () => {
  const r = componente('components/perfil/PerfilProfissional.jsx', 'PerfilProfissional', { token: 'token-sintetico', id: 7 }, {
    acessarProfissional: async () => { throw Object.assign(Error('Preparação pendente'), { indisponivel: true }) },
  })
  assert.ok(classes(r.render(), 'ttSkeleton--card').length); await tick()
  const v = r.render()
  assert.match(text(v), /Consulta indisponível/); assert.equal(classes(v, 'ttSkeleton').length, 0)
  assert.ok(classes(v, 'ttTom--informacao').length); r.close()
})

test('seção profissional vazia é explícita e campos opcionais preservam limites e tipos', () => {
  const r = componente('components/perfil/PerfilProfissional.jsx', 'SecaoProfissional', {
    titulo: 'Informações', campos: [['site', 'Site', 'url', 2048], ['descricao', 'Descrição', 'textarea', 2000]], secao: null,
  })
  assert.ok(classes(r.render(), 'ttVazio').length)
  botao(r.render(), 'Editar').props.onClick()
  const v = r.render(), campos = nodes(v).filter(n => ['input', 'textarea'].includes(n.type))
  assert.equal(campos[0].props.type, 'url'); assert.equal(campos[0].props.maxLength, 2048)
  assert.equal(campos[1].props.rows, 4); assert.equal(campos[1].props.maxLength, 2000)
  assert.ok(campos.every(n => !n.props.required))
})

test('imagem bloqueada não consulta serviço e mantém formatos e referência do campo nativo', () => {
  let chamadas = 0
  const r = componente('components/perfil/ImagensPerfil.jsx', 'ImagemPerfil', { tipo: 'foto' }, { acessarImagem: () => chamadas++ })
  const v = r.render(), entrada = nodes(v).find(n => n.props.type === 'file')
  assert.equal(chamadas, 0); assert.equal(entrada.props.disabled, true)
  assert.equal(entrada.props.accept, 'image/jpeg,image/png,image/webp'); assert.ok(entrada.props.ref)
  assert.ok(classes(v, 'ttTom--informacao').length)
  assert.match(text(v), /Sem imagem disponível/)
})

test('foto e capa usam skeleton previsível e preservam fallback após consulta vazia', async () => {
  for (const tipo of ['foto', 'capa']) {
    const r = componente('components/perfil/ImagensPerfil.jsx', 'ImagemPerfil', { tipo, habilitado: true }, { acessarImagem: async () => null })
    assert.ok(classes(r.render(), tipo === 'foto' ? 'ttSkeleton--avatar' : 'ttSkeleton--card').length)
    await tick(); assert.match(text(r.render()), /Sem imagem disponível/)
    assert.equal(classes(r.render(), 'ttSkeleton').length, 0); r.close()
  }
})

test('portfólio distingue carregamento, falha e lista vazia confirmada', async () => {
  const r = portfolio({ consultarPortfolio: async () => { throw Error('Consulta indisponível') } })
  assert.ok(classes(r.render(), 'ttSkeleton--card').length); await tick()
  assert.ok(classes(r.render(), 'ttTom--erro').length)
  assert.equal(classes(r.render(), 'ttVazio').length, 0)
  assert.equal(botao(r.render(), 'Cadastrar').props.disabled, true); r.close()
  const vazio = portfolio({ consultarPortfolio: async () => ({ itens: [], pagina: 1, totalPaginas: 1, total: 0 }) })
  vazio.render(); await tick()
  assert.ok(classes(vazio.render(), 'ttVazio').length)
  assert.equal(classes(vazio.render(), 'ttTom--erro').length, 0); vazio.close()
})

test('portfólio preserva limites de campos e imagens indisponíveis', async () => {
  const r = portfolio({ consultarPortfolio: async () => ({ itens: [], pagina: 1, totalPaginas: 1, total: 0 }) })
  r.render(); await tick()
  const v = r.render(), campos = nodes(v).filter(n => n.props.className === 'ttCampoControle')
  assert.deepEqual(campos.map(c => c.props.maxLength), [120, 80, 2000])
  assert.ok(campos.every(c => c.props.required))
  for (const c of campos) assert.ok(nodes(v).some(n => n.props.htmlFor === c.props.id))
  assert.equal(nodes(v).find(n => n.props.type === 'file').props.disabled, true)
  assert.match(text(v), /cadastro textual é independente/); r.close()
})

test('badge de categoria e botão destrutivo preservam cancelamento nativo sem escrita', async () => {
  let exclusoes = 0
  const r = portfolio({ consultarPortfolio: async () => ({ itens: [{ id: 'sintetico', titulo: 'Trabalho', categoria: 'Áudio', descricao: 'Descrição' }], pagina: 1, totalPaginas: 1, total: 1 }),
    removerItemPortfolio: () => exclusoes++,
  })
  r.render(); await tick()
  const v = r.render(), remover = botao(v, 'Remover')
  assert.ok(classes(v, 'ttBadge').some(n => text(n).includes('Áudio')))
  assert.ok(remover.props.className.includes('ttBotao--destrutivo'))
  remover.props.onClick(); assert.equal(exclusoes, 0); r.close()
})

test('diretório de fornecedores diferencia skeleton, erro e ausência sem abrir portfólio', async () => {
  for (const falha of [false, true]) {
    const r = componente('components/portfolio/Portfolio.jsx', 'DiretorioPortfolio', {}, {
      listarFornecedoresPortfolio: async () => { if (falha) throw Error('Falha de consulta'); return { itens: [], pagina: 1, totalPaginas: 1 } },
    })
    assert.ok(classes(r.render(), 'ttSkeleton').length); await tick()
    assert.equal(classes(r.render(), falha ? 'ttTom--erro' : 'ttVazio').length, 1)
    assert.equal(nodes(r.render()).filter(n => n.type === 'form').length, 0); r.close()
  }
})

test('CSS local mantém grades e editor existentes e usa tokens para cores e foco', () => {
  const css = postcss.parse(readFileSync(new URL('../src/components/perfil/Perfis.css', import.meta.url), 'utf8'))
  css.walkRules(r => assert.ok(r.selector.split(',').every(s => /^\.(perfil|portfolio)/.test(s.trim()))))
  css.walkDecls(d => assert.doesNotMatch(d.value, /#[\da-f]{3,8}\b|\brgba?\(/i))
  assert.doesNotMatch(css.toString(), /grid-template|position:\s*fixed|overflow:\s*hidden/)
  assert.match(css.toString(), /:focus-visible/)
  const compartilhado = readFileSync(new URL('../src/components/ui/Primitivas.css', import.meta.url), 'utf8')
  assert.match(compartilhado, /prefers-reduced-motion/)
})
