import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'rolldown/utils'
const jsx=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})
const nodes=v=>v&&typeof v==='object'?[v,...(v.children||[]).flatMap(nodes)]:[]
const text=v=>v&&typeof v==='object'?(v.children||[]).map(text).join(' '):String(v??'')
function carregar(file,nome){
  const fonte=readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replace('export function ','function ')
  return vm.runInNewContext(transformSync(file,fonte,{jsx:{runtime:'classic',pragma:'jsx'}}).code+'\n'+nome,{
    jsx,VagasEvento:'vagas',Icone:'svg',MidiaEvento:'midia',CapaEvento:'capa',useState:v=>[v,()=>{}],useMemo:fn=>fn(),
  })
}
test('listagem apresenta os quatro estados e substitui exclusão por cancelamento/encerramento',()=>{
  const Eventos=carregar('pages/organizador/Eventos.jsx','Eventos'),calls=[]
  const estados=['Em planejamento','Ativo','Cancelado','Encerrado']
  const eventos=estados.map((status,id)=>({id:id+1,nome:'Fixture '+id,status,data:'2030-01-01'}))
  const view=Eventos({eventos,capacidades:{criar:false,publicar:false,cancelar:true,encerrar:true},aoMudarEstado:(e,a)=>calls.push([e.id,a])})
  const botoes=nodes(view).filter(n=>n.type==='button')
  assert.ok(!botoes.some(n=>text(n)==='Excluir'))
  assert.equal(botoes.find(n=>text(n).includes('Novo evento')).props.disabled,true)
  assert.equal(botoes.find(n=>text(n)==='Publicar').props.disabled,true)
  const cancelar=botoes.filter(n=>text(n)==='Cancelar evento');assert.equal(cancelar.length,2)
  cancelar[0].props.onClick();botoes.find(n=>text(n)==='Encerrar evento').props.onClick()
  assert.deepEqual(calls,[[1,'cancelar'],[2,'encerrar']])
  for(const estado of estados)assert.ok(text(view).includes(estado))
})
test('formulário publicado libera somente descrição; sem capacidade fica bloqueado',async()=>{
  const Form=carregar('pages/organizador/CriarEvento.jsx','CriarEvento')
  let envios=0
  const props={evento:{id:1,status:'Ativo',nome:'Fixture',data:'2030-01-01',horario:'10:00',local:'Local',publico:10,descricao:''},setEvento(){},setPagina(){},aoAvancarParaCustos:async()=>envios++}
  const view=Form({...props,podeSalvar:true})
  assert.ok(nodes(view).filter(n=>n.type==='input').every(n=>n.props.disabled===true))
  assert.equal(nodes(view).find(n=>n.type==='textarea').props.maxLength,10000)
  const bloqueado=Form({...props,podeSalvar:false})
  assert.equal(nodes(bloqueado).find(n=>n.type==='fieldset').props.disabled,true)
  await nodes(bloqueado).find(n=>n.type==='form').props.onSubmit({preventDefault(){}})
  assert.equal(envios,0)
})
test('salvamento mantém trava de envio e chave por rascunho; inscrição depende de capacidade',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
  assert.match(app,/if\(envioEventoRef\.current\)throw/)
  assert.match(app,/chavesCriacaoRef\.current\.get\(chave\)/)
  assert.match(app,/criacao\.payload!==texto/)
  const participante=readFileSync(new URL('../src/pages/participante/PortalParticipante.jsx',import.meta.url),'utf8')
  assert.match(participante,/if \(evento\.lotado \|\| !inscricoesDisponiveis/)
})
test('retorno legado com campos nulos permite uma segunda edição pelo formulário',async()=>{
  const fonte=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8')
  const inicio=fonte.indexOf('  async function persistirDadosEvento(dados){')
  const fim=fonte.indexOf('  const persistenciaCustos =',inicio)
  assert.ok(inicio>0&&fim>inicio)
  const legado={id:2,nome:'Evento legado',data:'2030-12-10T00:00:00.000Z',horario:'14:30:45',local:'Local',publico:50,categoria:null,descricao:null,status:'Ativo',versao:1}
  let envios=0
  const contexto={eventoEmEdicao:{...legado,categoria:'Corporativo',descricao:''},capacidades:{editar:true},
    envioEventoRef:{current:false},chavesCriacaoRef:{current:new Map()},selecaoEventoRef:{current:{chave:'evento:2'}},
    sessionStorage:{getItem:()=> 'token-sintetico'},setSalvandoEvento(){},
    salvarEvento:async(_id,payload)=>{assert.equal(typeof payload.categoria,'string');assert.equal(typeof payload.descricao,'string');envios++;return{ok:true,status:200,json:async()=>({})}},
    consultarEvento:async()=>({ok:true,json:async()=>legado}),
    setEventoEmEdicao:e=>{contexto.eventoEmEdicao=e},
  }
  const salvar=vm.runInNewContext(fonte.slice(inicio,fim)+'\npersistirDadosEvento',contexto)
  const primeira=await salvar({...contexto.eventoEmEdicao,descricao:'Primeiro aviso'})
  const confirmado=(await primeira.json()).evento
  assert.equal(confirmado.categoria,'Corporativo');assert.equal(confirmado.descricao,'')
  await salvar({...contexto.eventoEmEdicao,descricao:'Segundo aviso'})
  assert.equal(envios,2);assert.equal(contexto.eventoEmEdicao.horario,'14:30')
})
