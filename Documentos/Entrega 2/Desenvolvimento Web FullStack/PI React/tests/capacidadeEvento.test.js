import { primitivasFixture, jsxPrimitivas } from './helpers/primitivasFixture.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'rolldown/utils'
const jsx = jsxPrimitivas
const nodes=v=>v&&typeof v==='object'?[v,...(v.children||[]).flatMap(nodes)]:[]
const text=v=>v&&typeof v==='object'?(v.children||[]).map(text).join(' '):String(v??'')
function carregar(file,nome){
 const s=readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replace('export function ','function ')
 return vm.runInNewContext(transformSync(file,s,{jsx:{runtime:'classic',pragma:'jsx'}}).code+'\n'+nome,{...primitivasFixture,jsx,React:{Fragment:'fragment'},VagasEvento:'vagas',MidiaEvento:'midia'})
}
test('disponibilidade distingue saldo zero, vagas e ausência de limite',()=>{
 const View=carregar('components/eventos/VagasEvento.jsx','VagasEvento')
 assert.match(text(View({evento:{capacidade_maxima:2,inscritos_confirmados:2,vagas_restantes:0,lotado:true}})),/Lotado/)
 assert.match(text(View({evento:{capacidade_maxima:5,inscritos_confirmados:2,vagas_restantes:3,lotado:false}})),/3 vagas disponíveis/)
 assert.match(text(View({evento:{capacidade_maxima:null,inscritos_confirmados:10,vagas_restantes:null,lotado:false}})),/Sem limite/)
 assert.equal(View({evento:{publico:50}}),null)
})
test('organizador configura capacidade no publicado sem liberar campos congelados',()=>{
 const Form=carregar('pages/organizador/CriarEvento.jsx','CriarEvento')
 let valor
 const evento={id:1,status:'Ativo',nome:'Teste',publico:900,capacidade_maxima:10}
 const view=Form({evento,podeSalvar:true,controleCapacidade:true,setEvento:fn=>{valor=fn(evento)}})
 const inputs=nodes(view).filter(n=>n.type==='input')
 const cap=inputs.find(n=>n.props.id==='capacidade-evento')
 assert.equal(cap.props.value,10);assert.ok(!cap.props.disabled)
 assert.ok(inputs.filter(n=>n!==cap).every(n=>n.props.disabled))
 cap.props.onChange({target:{value:'15'}});assert.equal(valor.capacidade_maxima,15);assert.equal(valor.publico,900)
 cap.props.onChange({target:{value:''}});assert.equal(valor.capacidade_maxima,null)
 assert.ok(!nodes(Form({evento,podeSalvar:true})).some(n=>n.props.id==='capacidade-evento'))
})

test('participante bloqueia inscrição lotada na lista e nos detalhes',()=>{
 const file='pages/participante/PortalParticipante.jsx'
 const fonte=readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/^import .*\r?\n/gm,'').replace('export function ','function ')
 const lotado={id:1,nome:'Evento cheio',status:'Ativo',capacidade_maxima:1,inscritos_confirmados:1,vagas_restantes:0,lotado:true}
 const livre={...lotado,id:2,nome:'Evento livre',inscritos_confirmados:0,vagas_restantes:1,lotado:false}
 for(const aba of ['eventos','detalhes']){
   let i=0
   const estado={0:[lotado,livre],1:[],2:false,5:aba,7:true,8:lotado,9:false}
   const Portal=vm.runInNewContext(transformSync(file,fonte,{jsx:{runtime:'classic',pragma:'jsx'}}).code+'\nPortalParticipante',{
     ...primitivasFixture, jsx,React:{Fragment:'fragment'},VagasEvento:'vagas',Icone:'icone',CapaEvento:'capa',MidiaEvento:'midia',PerfilPessoal:'perfil',
     useEffect(){},useState:v=>[Object.hasOwn(estado,i)?estado[i++]:((i++),v),()=>{}],
   })
   const view=Portal({setPagina(){},aoSair(){}})
   const botoes=nodes(view).filter(n=>n.type==='button')
   assert.equal(botoes.find(n=>text(n).trim()==='Lotado').props.disabled,true)
   if(aba==='eventos')assert.equal(botoes.find(n=>text(n).trim()==='Inscrever-se').props.disabled,false)
 }
})
