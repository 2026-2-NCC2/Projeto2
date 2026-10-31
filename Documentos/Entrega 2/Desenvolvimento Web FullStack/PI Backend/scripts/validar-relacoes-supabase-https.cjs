"use strict";
// Cenarios GET reais; resultados pessoais ficam somente em memoria.
const assert=require('node:assert/strict');
module.exports=async function({client,report,check,pending,exact,descending,wire,last}){
  const quotes=require('../repositories/supabase/cotacoes.cjs').criarRepositorioCotacoes(client);
  const regs=require('../repositories/supabase/inscricoes.cjs').criarRepositorioInscricoes(client);
  const access=require('../repositories/supabase/solicitacoes-acesso.cjs').criarRepositorioSolicitacoesAcesso(client);
  const dateLocal=(value,text)=>{assert.ok(value instanceof Date&&Number.isFinite(+value));assert.equal(value.getHours(),0);assert.equal(`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`,text);};
  const instant=(value,text)=>{assert.ok(value instanceof Date);assert.equal(+value,Date.parse(text));};
  const get=async q=>{const {data,error}=await q;if(error)throw error;assert.ok(Array.isArray(data));return data;};
  const common=['id','evento_id','evento_nome','prazo','modalidade','observacoes','status','criada_em'];
  const allQuotes=await check('cotacoes.listarAdministrativo: projecao join datas ordem e nulos',async()=>{
    const rows=await quotes.listarAdministrativo(),raw=wire();descending(rows);assert.equal(rows.length,raw.length);
    rows.forEach((r,i)=>{exact(r,common);assert.equal(r.evento_nome,raw[i].evento.nome);dateLocal(r.prazo,raw[i].prazo);instant(r.criada_em,raw[i].criada_em);assert.equal(r.observacoes,raw[i].observacoes);assert.ok(r.observacoes===null||typeof r.observacoes==='string');});
    report.nullObservationsValidated=rows.filter(r=>r.observacoes===null).length;return rows;
  });
  const ownerFixture=await check('cotacoes: identificadores de propriedade para testes de filtro',async()=>get(client.schema('public').from('cotacoes').select('id, evento:eventos!inner(usuario_id, data, local)').order('id',{ascending:false})));
  if(allQuotes&&ownerFixture?.length){
    const owner=ownerFixture[0].evento.usuario_id,absentOwner=Math.max(...ownerFixture.map(r=>r.evento.usuario_id))+1;
    await check('cotacoes.listarPorOrganizador: filtro propriedade campos e data do evento',async()=>{
      const rows=await quotes.listarPorOrganizador(owner),raw=wire();descending(rows);assert.deepEqual(rows.map(r=>r.id),ownerFixture.filter(r=>r.evento.usuario_id===owner).map(r=>r.id));
      rows.forEach((r,i)=>{exact(r,[...common,'evento_data','evento_local']);dateLocal(r.evento_data,raw[i].evento.data);dateLocal(r.prazo,raw[i].prazo);instant(r.criada_em,raw[i].criada_em);assert.equal(r.evento_local,raw[i].evento.local);});
    });
    await check('cotacoes: organizador sem cotacoes retorna []',async()=>assert.deepEqual(await quotes.listarPorOrganizador(absentOwner),[]));
    await check('cotacoes.listarItens: filtro cotacao id ASC e decimal textual',async()=>{
      let itemsFound=false;
      for(const q of allQuotes){const rows=await quotes.listarItens(q.id),raw=wire();assert.equal(rows.length,raw.length);let prev=0;
        rows.forEach((r,i)=>{exact(r,['id','categoria','descricao','valor_estimado']);assert.ok(r.id>prev);prev=r.id;assert.match(r.valor_estimado,/^-?(?:0|[1-9]\d{0,9})\.\d{2}$/);assert.deepEqual(r,raw[i]);});
        if(rows.length){itemsFound=true;report.quoteItemDecimalsValidated=rows.length;break;}
      }
      if(!itemsFound)pending('cotacoes: valores de itens existentes','No items observed for numeric validation');
    });
    const missing=Math.max(...allQuotes.map(r=>r.id))+1;
    await check('cotacoes: itens de cotacao ausente retornam []',async()=>assert.deepEqual(await quotes.listarItens(missing),[]));
  }else pending('cotacoes: filtros com dados existentes','No quote ownership fixture validated');
  await check('cotacoes.listarDisponiveisParaFornecedor: Aberta prazo e projecao',async()=>{
    const rows=await quotes.listarDisponiveisParaFornecedor(),raw=wire();descending(rows);
    rows.forEach((r,i)=>{exact(r,[...common,'evento_data','evento_local']);assert.equal(r.status,'Aberta');dateLocal(r.prazo,raw[i].prazo);dateLocal(r.evento_data,raw[i].evento.data);instant(r.criada_em,raw[i].criada_em);});
    report.availableQuoteRowsValidated=rows.length;
    // UTC HTTP Date nao prova TimeZone da sessao SQL; evitar falso oracle na fronteira.
    const server=last()?.serverDate;if(server&&allQuotes){const day=Date.parse(new Date(server).toISOString().slice(0,10)+'T00:00:00Z');
      const values=allQuotes.filter(q=>q.status==='Aberta');
      if(values.some(q=>Math.abs(Date.UTC(q.prazo.getFullYear(),q.prazo.getMonth(),q.prazo.getDate())-day)<=86400000))pending('cotacoes: prazo junto a virada do dia','HTTP Date does not attest SQL session timezone; boundary requires controlled fixture');
      else {const expected=values.filter(q=>Date.UTC(q.prazo.getFullYear(),q.prazo.getMonth(),q.prazo.getDate())>day).map(q=>q.id);assert.deepEqual(rows.map(q=>q.id),expected);}
    }
    if(!rows.length)pending('cotacoes: fornecedor com resultado nao vazio','Current status/deadline combination returns []; populated response not demonstrated');
  });
  const registrations=await check('inscricoes: fixture somente ids e filtros',async()=>get(client.schema('public').from('inscricoes').select('id,usuario_id,evento_id').order('id',{ascending:true})));
  if(registrations?.length){
    const sample=registrations[0],missingUser=Math.max(...registrations.map(r=>r.usuario_id))+1;
    await check('inscricoes.buscarPorUsuarioEEvento: par exato e vazio',async()=>{assert.deepEqual(await regs.buscarPorUsuarioEEvento(sample.usuario_id,sample.evento_id),[{id:sample.id}]);assert.deepEqual(await regs.buscarPorUsuarioEEvento(missingUser,sample.evento_id),[]);});
    await check('inscricoes.listarPorUsuario: join projecao datas e ordem sem desempate novo',async()=>{
      const rows=await regs.listarPorUsuario(sample.usuario_id),raw=wire();assert.deepEqual(rows.map(r=>r.id).sort((a,b)=>a-b),registrations.filter(r=>r.usuario_id===sample.usuario_id).map(r=>r.id).sort((a,b)=>a-b));
      rows.forEach((r,i)=>{exact(r,['id','evento_id','status','data_inscricao','evento_nome','evento_data','evento_horario','evento_local','evento_categoria']);instant(r.data_inscricao,raw[i].data_inscricao);dateLocal(r.evento_data,raw[i].evento.data);assert.equal(r.evento_nome,raw[i].evento.nome);assert.equal(r.evento_categoria,raw[i].evento.categoria);if(i)assert.ok(+rows[i-1].data_inscricao>=+r.data_inscricao);});
    });
    await check('inscricoes: usuario sem inscricoes retorna []',async()=>assert.deepEqual(await regs.listarPorUsuario(missingUser),[]));
  }else pending('inscricoes: registros existentes','No registration fixture available');
  const eventFixtures=await check('inscricoes: fixture de status para buscarEventoAtivo',async()=>get(client.schema('public').from('eventos').select('id,status').order('id',{ascending:true})));
  if(eventFixtures){
    const active=eventFixtures.find(r=>r.status==='Ativo'),inactive=eventFixtures.find(r=>r.status!=='Ativo');
    if(active)await check('inscricoes.buscarEventoAtivo: evento ativo existente',async()=>assert.deepEqual(await regs.buscarEventoAtivo(active.id),[{id:active.id}]));else pending('inscricoes: evento ativo existente','No Ativo fixture observed');
    if(inactive)await check('inscricoes.buscarEventoAtivo: evento inativo retorna []',async()=>assert.deepEqual(await regs.buscarEventoAtivo(inactive.id),[]));
    const missing=Math.max(0,...eventFixtures.map(r=>r.id))+1;
    await check('inscricoes.buscarEventoAtivo: evento ausente retorna []',async()=>assert.deepEqual(await regs.buscarEventoAtivo(missing),[]));
  }
  const requests=await check('solicitacoes.listar: join usuario campos enum instantes e ordem',async()=>{
    const rows=await access.listar(),raw=wire();assert.equal(rows.length,raw.length);
    rows.forEach((r,i)=>{exact(r,['id','usuario_id','nome','email','perfil_solicitado','justificativa','status','criada_em']);assert.equal(r.nome,raw[i].usuario.nome);assert.equal(r.email,raw[i].usuario.email);assert.ok(['organizador','fornecedor'].includes(r.perfil_solicitado));assert.ok(['pendente','aprovado','rejeitado'].includes(r.status));instant(r.criada_em,raw[i].criada_em);if(i)assert.ok(+rows[i-1].criada_em>+r.criada_em||(+rows[i-1].criada_em===+r.criada_em&&rows[i-1].id>r.id));});return rows;
  });
  if(requests){
    const candidate=requests.find(r=>r.status==='pendente')||requests[0];
    if(candidate)await check('solicitacoes.buscarPendentesPorUsuario: usuario status e projecao id',async()=>{
      const rows=await access.buscarPendentesPorUsuario(candidate.usuario_id);rows.forEach(r=>exact(r,['id']));
      const expected=requests.filter(r=>r.usuario_id===candidate.usuario_id&&r.status==='pendente').map(r=>r.id).sort((a,b)=>a-b);assert.deepEqual(rows.map(r=>r.id).sort((a,b)=>a-b),expected);
      report.pendingAccessRowsValidated=rows.length;
      if(!expected.length)pending('solicitacoes: pendencia existente','No pending request observed; only empty filter validated');
    });
    const missingUser=Math.max(0,...requests.map(r=>r.usuario_id))+1;
    await check('solicitacoes: usuario sem pendencias retorna []',async()=>assert.deepEqual(await access.buscarPendentesPorUsuario(missingUser),[]));
  }
  if(!report.nullObservationsValidated)pending('nulos reais em cotacoes.observacoes','No NULL observation in current fixture; preservation tested with mocks only');
};
