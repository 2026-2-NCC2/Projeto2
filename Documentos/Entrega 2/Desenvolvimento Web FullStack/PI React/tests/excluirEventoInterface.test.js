import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// A exclusão física da interface foi substituída por transições com histórico.
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const inicio = app.indexOf('const aoMudarEstadoEvento = async (evento,acao) => {')
const fim = app.indexOf('  const aoFinalizarESalvar', inicio)
assert.ok(inicio >= 0 && fim > inicio)

async function executar(resposta,confirmar=true) {
  const alerts = [], chamadas = []
  let consultas=0
  const handler = vm.runInNewContext(app.slice(inicio, fim) + '\naoMudarEstadoEvento', {
    envioEventoRef:{current:false},
    window: { confirm: () => confirmar }, sessionStorage: { getItem: () => 'token-ficticio' },
    alert: mensagem => alerts.push(mensagem),
    mudarEstadoEvento: async (evento,acao,token) => {
      assert.equal(evento.id, 1);assert.equal(evento.versao,2);assert.equal(acao,'cancelar')
      assert.equal(token, 'token-ficticio')
      chamadas.push(acao)
      if (resposta instanceof Error) throw resposta
      return resposta
    },
    setTentativaEventos:()=>{consultas++},
  })
  await handler({id:1,versao:2,status:'Ativo'},'cancelar')
  return {alerts,chamadas,consultas}
}

test('interface não mantém handler de exclusão física; cancelar pede nova consulta após confirmação',async()=>{
  assert.ok(!app.includes('const aoExcluirEvento'))
  const r=await executar({ok:true,json:async()=>({mensagem:'Histórico preservado.'})})
  assert.deepEqual(r.chamadas,['cancelar']);assert.equal(r.consultas,1);assert.deepEqual(r.alerts,['Histórico preservado.'])
})

test('desistir da confirmação não envia escrita',async()=>{
  const r=await executar(null,false);assert.equal(r.chamadas.length,0);assert.equal(r.consultas,0)
})

for(const status of [403,404,409,503])test(`transição recusada (${status}) preserva histórico e informa conflito sem retry`,async()=>{
  const r=await executar({ok:false,status,json:async()=>({erro:'Consulte novamente.'})})
  assert.equal(r.consultas,0);assert.deepEqual(r.chamadas,['cancelar']);assert.deepEqual(r.alerts,['Consulte novamente.'])
})

test('falha de conexão mantém aviso único e não repete transição', async () => {
  const r = await executar(new Error('Rede indisponível'))
  assert.deepEqual(r.alerts,['Rede indisponível']);assert.deepEqual(r.chamadas,['cancelar']);assert.equal(r.consultas,0)
})
