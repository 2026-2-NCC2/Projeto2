import test from 'node:test'
import assert from 'node:assert/strict'
import { lerDestinoNavegacao, urlDestinoNavegacao } from '../src/hooks/useNavegacao.js'

for (const url of ['#/admin?secao=relatorios', '#/admin', '#/admin?secao=contas', '#/inicio', '#/entrar', '#/cadastro', '#/participante', '#/participante?secao=perfil',
  '#/participante?secao=detalhes&evento=7', '#/admin?secao=usuarios', '#/admin?secao=painel&evento=9',
  '#/admin?secao=cotacoes&cotacao=3', '#/fornecedor-proposta?cotacao=4', '#/fornecedor-enviadas',
  '#/custos?evento=7', '#/criar?evento=7', '#/cotacao?evento=7', '#/ticket?evento=7', '#/perfil']) {
  test('URL interna tem contrato fechado e round-trip: ' + url, () => {
    const destino = lerDestinoNavegacao(url)
    assert.ok(destino)
    assert.equal(urlDestinoNavegacao(destino), url)
    assert.doesNotMatch(url, /token|senha|nome|email|biografia/)
  })
}

test('parser rejeita destinos, parâmetros, IDs e tentativas de redirecionamento não previstos', () => {
  for (const url of ['https://externo.invalid', '#//externo.invalid', '#/constructor', '#/participante?secao=admin',
    '#/participante?secao=detalhes', '#/participante?secao=detalhes&evento=-1', '#/custos?evento=9007199254740992',
    '#/custos?evento=1&evento=2', '#/entrar?redirect=externo', '#/admin?secao=usuarios&evento=1',
    '#/admin?secao=perfil&cotacao=1', '#/perfil?evento=3', '#/fornecedor-mural?evento=7', '#/admin?secao=desconhecida',
    '#/participante?secao=perfil&token=segredo', '#/custos?evento=%31', '#/custos?evento=1=2']) assert.equal(lerDestinoNavegacao(url), null, url)
})

test('âncoras públicas existentes representam a apresentação, sem virar rotas protegidas', () => {
  for (const hash of ['#lp-inicio', '#lp-como-funciona', '#lp-beneficios', '#lp-projeto']) {
    assert.deepEqual(lerDestinoNavegacao(hash).dados, { login: false })
  }
})
