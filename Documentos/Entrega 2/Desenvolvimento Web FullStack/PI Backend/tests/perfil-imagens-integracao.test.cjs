"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {criarClienteStorage}=require('../imagens/cliente-storage.cjs');
const {criarStorageImagens}=require('../imagens/storage.cjs');
const {prepararIntegracaoImagens}=require('../imagens/integracao.cjs');
const {novoArquivo}=require('../imagens/politica.cjs');
const contasTeste={verificarAberta:async()=>{},executarOperacao:(_id,acao)=>acao()};
const config={url:'https://sintetico.supabase.co',secretKey:'sb_secret_ficticia_exclusiva_testes_imagens'};
test('SDK dedicado usa origem validada, limite temporal e não repete upload',async()=>{
  const calls=[];
  const cliente=criarClienteStorage(config,async(url,options)=>{
    calls.push({url,options});return new Response(JSON.stringify({Id:'id-ficticio',Key:'perfil-fotos/caminho'}),{status:200,headers:{'Content-Type':'application/json'}});
  });
  const r=await cliente.storage.from('perfil-fotos').upload('caminho',Buffer.from('sintetico'),{contentType:'image/webp',upsert:false});
  assert.equal(r.error,null);assert.equal(calls.length,1);
  assert.ok(calls[0].url.startsWith(config.url+'/storage/v1/object/'));
  assert.equal(calls[0].options.redirect,'error');assert.ok(calls[0].options.signal);
  assert.throws(()=>criarClienteStorage({...config,url:'http://inseguro.invalid'}));
});
test('Storage rejeita URL assinada fora da origem/caminho e não expõe SDK',async()=>{
  const u={id:7,perfil:'admin'},ref={usuario_id:7,tipo:'foto',...novoArquivo(u,'foto')};
  for(const signedUrl of ['https://outro.invalid/arquivo',config.url+'/storage/v1/object/sign/perfil-fotos/8/outro.webp']) {
    const storage=criarStorageImagens({storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl}})})}},{origem:config.url});
    await assert.rejects(storage.assinar(u,'foto',ref),{status:503});
  }
});
test('integração inerte: dry-run lista pendências, não envia/remove objetos',async()=>{
  let conexoes=0,storage=0;const operacoes=[];
  const pool={connect:async()=>{conexoes++;return{query:async sql=>({rows:sql.startsWith('SELECT estado')?[{estado:'limpeza',total:2}]:[]}),release(){}};}};
  const integracao=prepararIntegracaoImagens({pool,contasTeste,origemStorage:config.url,clienteStorage:{storage:{from(){storage++;throw Error('não chamar');}}},
    supervisor:{executarPersistencia(acao,escrita){operacoes.push(escrita);return acao();}}});
  assert.equal(conexoes,0);
  const r=await integracao.limpar();assert.equal(r.executado,false);assert.equal(r.pendencias[0].total,2);
  assert.equal(storage,0);
  assert.deepEqual(operacoes,[false]);
});
test('integração respeita recusa do supervisor antes de acessar PG ou Storage',async()=>{
  let conexoes=0;
  const integracao=prepararIntegracaoImagens({contasTeste,pool:{connect(){conexoes++;}},clienteStorage:{},origemStorage:config.url,
    supervisor:{executarPersistencia(){throw Error('FREEZE_NOVA_ESCRITA_BLOQUEADA');}}});
  await assert.rejects(integracao.limpar({executar:true}),/FREEZE/);
  assert.throws(()=>integracao.servico.remover({id:7,perfil:'admin'},'foto'),/FREEZE/);
  assert.equal(conexoes,0);
});
test('integração recusa guardas ausentes e barra mutação antes de PG/Storage',async()=>{
  const opcoes={pool:{connect(){throw Error('Não acessar PG');}},clienteStorage:{},origemStorage:config.url};
  for(const guarda of [undefined,null,{}, {verificarAberta(){}}])assert.throws(()=>prepararIntegracaoImagens({...opcoes,contasTeste:guarda}),/obrigatória/);
  let chamadas=0;
  const i=prepararIntegracaoImagens({...opcoes,contasTeste:{verificarAberta:async()=>{},executarOperacao:async id=>{assert.equal(id,7);chamadas++;throw Object.assign(Error('Encerrada'),{status:403});}}});
  await assert.rejects(i.servico.substituir({id:7,perfil:'participante'},'foto',Buffer.alloc(1)),{status:403});
  await assert.rejects(i.servico.remover({id:7,perfil:'participante'},'capa'),{status:403});
  assert.equal(chamadas,2);
});
