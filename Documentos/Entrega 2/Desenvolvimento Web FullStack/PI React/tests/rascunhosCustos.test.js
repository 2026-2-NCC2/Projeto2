import test from 'node:test'
import assert from 'node:assert/strict'
import {
  criarRascunhoCustos, rascunhoCustosTemAlteracoes, iniciarRequisicaoCustos,
  concluirGetCustos, concluirPutCustos, falharRequisicaoCustos, usarBasePersistida,
} from '../src/utils/rascunhosCustos.js'

const item = (valor = 0.1, id = 'local-1') => ({ id, categoria: 'Som', descricao: 'Sonorização', valor })
const pedido = (metodo, id = 1, revisaoInicial = 0, geracaoSessao = 0) => ({ metodo, id, revisaoInicial, geracaoSessao })
const iniciar = (rascunho, req) => iniciarRequisicaoCustos(rascunho, req)

test('base desconhecida nao vira lista persistida vazia sem resposta', () => {
  const r = criarRascunhoCustos(0)
  assert.equal(r.basePersistida, null)
  assert.equal(rascunhoCustosTemAlteracoes(r), false)
  const req = pedido('GET')
  const erro = falharRequisicaoCustos(iniciar(r, req), req, new Error('Falhou'))
  assert.equal(erro.basePersistida, null)
  const carregado = concluirGetCustos(iniciar(r, req), req, [])
  assert.deepEqual(carregado.basePersistida, [])
  assert.equal(carregado.get.estado, 'carregado')
})

test('GET inicial carrega lista e confirma a base em reais', () => {
  const req = pedido('GET')
  const r = concluirGetCustos(iniciar(criarRascunhoCustos(0), req), req, [item(0.2, 7)])
  assert.equal(r.itens[0].valor, 0.2)
  assert.deepEqual(r.itens, r.basePersistida)
  assert.equal(rascunhoCustosTemAlteracoes(r), false)
})

test('edicao durante GET preserva itens, revisao e identifica conflito remoto', () => {
  const req = pedido('GET')
  const r = { ...iniciar(criarRascunhoCustos(0), req), itens: [item()], revisaoLocal: 1 }
  const proximo = concluirGetCustos(r, req, [item(0.2, 7)])
  assert.equal(proximo.itens, r.itens)
  assert.equal(proximo.revisaoLocal, 1)
  assert.equal(proximo.basePersistida[0].valor, 0.2)
  assert.equal(proximo.conflitoRemoto, true)
})

test('rascunho anterior ao GET e campos pendentes tambem sao preservados', () => {
  for (const revisao of [0, 3]) {
    const req = pedido('GET', 1, revisao)
    const r = iniciar({ ...criarRascunhoCustos(0), itens: [item()], revisaoLocal: revisao }, req)
    const carregado = concluirGetCustos(r, req, [item(0.2, 7)], true)
    assert.equal(carregado.itens, r.itens)
    assert.equal(carregado.conflitoRemoto, true)
  }
})

test('migracao de novo evento mantem custos locais e GET vazio permite salvar depois', () => {
  const req = pedido('GET', 1, 2)
  const r = iniciar({ ...criarRascunhoCustos(0), itens: [item()], revisaoLocal: 2 }, req)
  const carregado = concluirGetCustos(r, req, [])
  assert.equal(carregado.itens, r.itens)
  assert.deepEqual(carregado.basePersistida, [])
  assert.equal(carregado.conflitoRemoto, false)
  assert.equal(rascunhoCustosTemAlteracoes(carregado), true)
})

test('excluir o ultimo item durante GET continua sendo alteracao nao salva', () => {
  const req = pedido('GET')
  const r = iniciar({ ...criarRascunhoCustos(0), itens: [item()], basePersistida: [item()] }, req)
  const editado = { ...r, itens: [], revisaoLocal: 1 }
  const carregado = concluirGetCustos(editado, req, [item(0.1, 7)])
  assert.deepEqual(carregado.itens, [])
  assert.equal(rascunhoCustosTemAlteracoes(carregado), true)
  assert.equal(carregado.conflitoRemoto, false)
})

test('PUT bem sucedido atualiza base sem trocar IDs locais usados pelo formulario', () => {
  const req = pedido('PUT', 1, 2)
  const r = iniciar({ ...criarRascunhoCustos(0), itens: [item()], basePersistida: [], revisaoLocal: 2 }, req)
  const salvo = concluirPutCustos(r, req, [item(0.1, 99)])
  assert.equal(salvo.itens[0].id, 'local-1')
  assert.equal(salvo.basePersistida[0].id, 99)
  assert.equal(salvo.revisaoLocal, 2)
  assert.equal(rascunhoCustosTemAlteracoes(salvo), false)
  assert.match(salvo.put.mensagem, /salvos no banco/u)
})

test('edicoes posteriores ao inicio do PUT permanecem nao salvas', () => {
  const req = pedido('PUT', 1, 2)
  const r = iniciar({ ...criarRascunhoCustos(0), itens: [item()], basePersistida: [], revisaoLocal: 2 }, req)
  const salvo = concluirPutCustos({ ...r, itens: [item(0.2)], revisaoLocal: 3 }, req, [item(0.1, 99)])
  assert.equal(salvo.itens[0].valor, 0.2)
  assert.equal(salvo.basePersistida[0].valor, 0.1)
  assert.equal(salvo.revisaoLocal, 3)
  assert.equal(rascunhoCustosTemAlteracoes(salvo), true)
  assert.match(salvo.put.mensagem, /alterações locais posteriores/u)
})

test('PUT vazio confirma exclusao do ultimo item somente no sucesso', () => {
  const req = pedido('PUT', 1, 1)
  const r = iniciar({ ...criarRascunhoCustos(0), basePersistida: [item()], revisaoLocal: 1 }, req)
  assert.equal(rascunhoCustosTemAlteracoes(r), true)
  const salvo = concluirPutCustos(r, req, [])
  assert.deepEqual(salvo.itens, [])
  assert.deepEqual(salvo.basePersistida, [])
  assert.equal(rascunhoCustosTemAlteracoes(salvo), false)
})

test('erro ou timeout PUT mantem base e rascunho; consulta posterior resolve incerteza', () => {
  const put = pedido('PUT')
  const r = iniciar({ ...criarRascunhoCustos(0), itens: [item()], basePersistida: [], revisaoLocal: 1 }, put)
  const incerto = falharRequisicaoCustos(r, put, Object.assign(new Error('Resultado incerto'), { resultadoIncerto: true }))
  assert.equal(incerto.itens, r.itens)
  assert.equal(incerto.basePersistida, r.basePersistida)
  assert.equal(incerto.put.estado, 'resultadoIncerto')
  assert.equal(usarBasePersistida(incerto), incerto)
  const get = pedido('GET', 2, 1)
  const consultado = concluirGetCustos(iniciar(incerto, get), get, [item(0.1, 99)])
  assert.equal(consultado.put.estado, 'ocioso')
  assert.equal(consultado.put.idRequisicao, null)
  assert.equal(consultado.put.confirmarReenvio, true)
  assert.match(consultado.put.mensagem, /pode ainda terminar/u)
  assert.equal(rascunhoCustosTemAlteracoes(consultado), false)
  assert.equal(concluirPutCustos(consultado, put, []), consultado)
})

test('salvamento em andamento ou incerto exige aviso mesmo com listas iguais', () => {
  const req = pedido('PUT')
  const r = iniciar({ ...criarRascunhoCustos(0), basePersistida: [] }, req)
  assert.equal(rascunhoCustosTemAlteracoes(r), true)
  const incerto = falharRequisicaoCustos(r, req, Object.assign(new Error('Incerto'), { resultadoIncerto: true }))
  assert.equal(rascunhoCustosTemAlteracoes(incerto), true)
})

test('respostas antigas, outra sessao e metadados reiniciados na migracao sao ignorados', () => {
  const antigo = pedido('GET', 1)
  const atual = iniciar(criarRascunhoCustos(0), pedido('GET', 2))
  assert.equal(concluirGetCustos(atual, antigo, [item()]), atual)
  assert.equal(falharRequisicaoCustos(atual, antigo, new Error('Antigo')), atual)
  const logout = iniciar(criarRascunhoCustos(1), pedido('GET', 1, 0, 1))
  assert.equal(concluirGetCustos(logout, antigo, [item()]), logout)
  const migrado = criarRascunhoCustos(0)
  assert.equal(concluirGetCustos(migrado, antigo, [item()]), migrado)
})

test('adotar lista remota aumenta revisao e GET equivalente preserva IDs da edicao', () => {
  const r = { ...criarRascunhoCustos(0), itens: [item()], basePersistida: [item(0.2, 7)],
    revisaoLocal: 3, conflitoRemoto: true, get: { estado: 'carregado' }, put: { estado: 'ocioso' } }
  const adotado = usarBasePersistida(r)
  assert.equal(adotado.revisaoLocal, 4)
  assert.equal(adotado.itens, r.basePersistida)
  assert.equal(adotado.conflitoRemoto, false)
  const req = pedido('GET', 1, 4)
  const consultado = concluirGetCustos(iniciar(adotado, req), req, [item(0.2, 99)])
  assert.equal(consultado.itens[0].id, 7)
})
