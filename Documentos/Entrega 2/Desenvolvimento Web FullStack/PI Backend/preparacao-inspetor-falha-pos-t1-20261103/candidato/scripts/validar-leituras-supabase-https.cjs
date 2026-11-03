"use strict";
// Executar somente com autorizacao de leitura do projeto configurado.
// Nao inicia servidor, importa db.js, autentica usuarios ou le hashes de senha.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
async function main({relacoes=false,propostas=false,fornecedor=false}={}){
  assert.ok([relacoes,propostas,fornecedor].filter(Boolean).length<=1,'Choose one batch');
  const report={timestamp:new Date().toISOString(),scope:fornecedor?['RPC fornecedor instalada']:propostas?['propostas']:relacoes?['cotacoes','inscricoes','solicitacoes_acesso']:['usuarios','eventos','custos'],checks:[],http:[],writes:0,mainRoutesChanged:false,limitations:['No JWT or route authorization exercised.','MySQL contracts checked by source/projection and injected executor, not a live MySQL comparison.','Independent HTTP requests do not share a snapshot.']};
  const dir=path.resolve(__dirname,'../evidencias');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'supabase-leituras-https-'+crypto.randomUUID()+'.json');
  const originalFetch=globalThis.fetch;let raw=[],currentCheck='setup';const started=Date.now();
  const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2));
  const safeCode=e=>typeof e?.code==='string'&&/^(?:SUPABASE_[A-Z_]+|PGRST\d+|\d{5}|ERR_ASSERTION)$/.test(e.code)?e.code:'DIAGNOSTIC_OR_TRANSPORT_FAILURE';
  async function check(name,fn){currentCheck=name;try{const result=await fn();report.checks.push({name,status:'PASS'});save();return result;}catch(e){report.checks.push({name,status:'FAIL',code:safeCode(e)});save();return undefined;}}
  function pending(name,reason){report.checks.push({name,status:'PENDING',reason});save();}
  const exact=(r,keys)=>assert.deepEqual(Object.keys(r).sort(),[...keys].sort());
  const descending=rs=>rs.forEach((r,i)=>{assert.ok(Number.isSafeInteger(r.id)&&r.id>0);if(i)assert.ok(rs[i-1].id>r.id);});
  const eventFields=['id','nome','data','horario','local','categoria','publico','descricao','status','usuario_id'];
  function eventShape(e,fields=eventFields){exact(e,fields);assert.ok(e.data instanceof Date&&Number.isFinite(+e.data));assert.equal(e.data.getHours(),0);assert.equal(e.data.getMinutes(),0);assert.equal(typeof e.horario,'string');}
  try{
    const parsed=require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../.env')));
    for(const k of ['SUPABASE_URL','SUPABASE_SECRET_KEY'])if(process.env[k]!==undefined&&process.env[k]!==parsed[k])throw Error('Conflicting environment');
    const env={...process.env,...parsed,DB_PROVIDER:'supabase'};
    const config=require('../config/banco.cjs').lerConfiguracaoBanco(env,'principal');
    const origin=new URL(config.url);assert.match(origin.hostname,/^[a-z0-9]+\.supabase\.co$/);const ref=origin.hostname.split('.')[0];
    globalThis.fetch=async(input,options)=>{
      assert.ok(Date.now()-started<120000&&report.http.length<80,'Diagnostic budget');
      const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
      const method=String(options?.method||input?.method||'GET').toUpperCase();
      const allowed=(propostas||fornecedor)?['propostas','cotacoes','itens_cotacao','rpc/listar_propostas_por_fornecedor']:relacoes?['cotacoes','itens_cotacao','inscricoes','solicitacoes_acesso','eventos']:['usuarios','eventos','custos_evento'];
      if(method==='POST'&&fornecedor){
        assert.equal(url.pathname,'/rest/v1/rpc/listar_propostas_por_fornecedor');
        const body=JSON.parse(options.body);assert.deepEqual(Object.keys(body),['p_fornecedor_id']);assert.ok(Number.isSafeInteger(body.p_fornecedor_id)&&body.p_fornecedor_id>0);
      }else assert.equal(method,'GET');
      assert.equal(url.origin,origin.origin);assert.ok(allowed.map(t=>'/rest/v1/'+t).includes(url.pathname));
      const fields=url.searchParams.get('select')||'';assert.ok(!/senha/i.test(fields));
      const signal=options?.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
      const response=await originalFetch(input,{...options,signal,redirect:'error'});
      assert.equal(new URL(response.url).origin,origin.origin);
      const header=response.headers.get('sb-project-ref');if(header!==null)assert.equal(header,ref);
      const request={check:currentCheck,table:url.pathname.split('/').at(-1),method,status:response.status,projectOriginMatches:true,projectHeaderMatches:header===null?null:true};
      report.http.push(request);
      // Dados transitam apenas em memoria para comparar a conversao; nunca no JSON.
      let body;try{body=await response.clone().json();}catch{}
      raw.push({check:currentCheck,body,serverDate:response.headers.get('date')});return response;
    };
    const client=require('../db-supabase.cjs').criarClienteSupabase(env);
    if(fornecedor){
      await require('./validar-fornecedor-instalado-https.cjs')({client,report,check,pending,exact});
      report.status=report.checks.some(r=>r.status==='FAIL')?'FAIL':report.checks.some(r=>r.status==='PENDING')?'PARTIAL':'PASS';return;
    }
    if(propostas){
      await require('./validar-propostas-supabase-https.cjs')({client,report,check,pending,exact,wire:()=>raw.filter(r=>r.check===currentCheck).flatMap(r=>r.body)});
      report.status=report.checks.some(r=>r.status==='FAIL')?'FAIL':report.checks.some(r=>r.status==='PENDING')?'PARTIAL':'PASS';return;
    }
    if(relacoes){
      await require('./validar-relacoes-supabase-https.cjs')({client,report,check,pending,exact,descending,wire:()=>raw.filter(r=>r.check===currentCheck).flatMap(r=>r.body),last:()=>raw.at(-1)});
      report.status=report.checks.some(r=>r.status==='FAIL')?'FAIL':report.checks.some(r=>r.status==='PENDING')?'PARTIAL':'PASS';return;
    }
    const usersRepo=require('../repositories/supabase/usuarios.cjs').criarRepositorioUsuarios(client);
    const eventsRepo=require('../repositories/supabase/eventos.cjs').criarRepositorioEventos(client);
    const costsRepo=require('../repositories/supabase/custos.cjs').criarRepositorioCustos(client);
    const users=await check('usuarios.listar: campos sem senha e id DESC',async()=>{
      const rows=await usersRepo.listar();descending(rows);for(const r of rows){exact(r,['id','nome','email','perfil']);assert.equal(typeof r.nome,'string');assert.equal(typeof r.email,'string');assert.ok(['organizador','fornecedor','participante','admin'].includes(r.perfil));}
      const expected=await require('../repositories/mysql/usuarios.cjs').criarRepositorioUsuarios({async execute(){return [raw.filter(r=>r.check===currentCheck).flatMap(r=>r.body)];}}).listar();assert.deepEqual(rows,expected);return rows;
    });
    if(users?.length){
      const u=users[0],missing=Math.max(...users.map(r=>r.id))+1;assert.ok(missing<=2147483647);
      await check('usuarios.buscarPerfil: filtro id e projecao',async()=>{const r=await usersRepo.buscarPerfil(u.id);assert.deepEqual(r,{id:u.id,nome:u.nome,email:u.email});});
      await check('usuarios.buscarParaAutenticacao: perfil atual sem JWT',async()=>{assert.deepEqual(await usersRepo.buscarParaAutenticacao(u.id),u);});
      await check('usuarios.buscarIdPorEmail: filtro exato e projecao',async()=>{assert.deepEqual(await usersRepo.buscarIdPorEmail(u.email),{id:u.id});});
      await check('usuarios: ausencia por id retorna undefined',async()=>{assert.equal(await usersRepo.buscarPerfil(missing),undefined);assert.equal(await usersRepo.buscarParaAutenticacao(missing),undefined);});
    }else pending('usuarios: filtros com registro existente','No nonempty user list validated');
    const events=await check('eventos.listarAdministrativo: join campos datas e id DESC',async()=>{
      const rows=await eventsRepo.listarAdministrativo();descending(rows);for(const r of rows){eventShape(r,[...eventFields,'organizador_nome']);assert.equal(typeof r.organizador_nome,'string');}
      const wire=raw.filter(r=>r.check===currentCheck).flatMap(r=>r.body);
      assert.equal(wire.length,rows.length);for(let i=0;i<rows.length;i++){const iso=wire[i].data;assert.equal(`${rows[i].data.getFullYear()}-${String(rows[i].data.getMonth()+1).padStart(2,'0')}-${String(rows[i].data.getDate()).padStart(2,'0')}`,iso);assert.equal(rows[i].horario,wire[i].horario);}
      return rows;
    });
    if(events?.length){
      const e=events[0],missing=Math.max(...events.map(r=>r.id))+1;
      const missingUser=Math.max(e.usuario_id,...(users||[]).map(r=>r.id),...events.map(r=>r.usuario_id))+1;
      assert.ok(missing<=2147483647&&missingUser<=2147483647);
      await check('eventos.listarPorUsuario: propriedade projecao e ordem',async()=>{const rows=await eventsRepo.listarPorUsuario(e.usuario_id);descending(rows);rows.forEach(r=>eventShape(r));const expected=events.filter(r=>r.usuario_id===e.usuario_id).map(({organizador_nome,...r})=>r);assert.deepEqual(rows,expected);});
      await check('eventos.buscarPorIdDoUsuario: detalhes pertencentes ao usuario',async()=>{const {organizador_nome,...expected}=e;assert.deepEqual(await eventsRepo.buscarPorIdDoUsuario(e.id,e.usuario_id),expected);});
      await check('eventos: outro proprietario e evento ausente retornam undefined',async()=>{assert.equal(await eventsRepo.buscarPorIdDoUsuario(e.id,missingUser),undefined);assert.equal(await eventsRepo.buscarPorIdDoUsuario(missing,e.usuario_id),undefined);});
      await check('eventos: listagem vazia por usuario ausente',async()=>{assert.deepEqual(await eventsRepo.listarPorUsuario(missingUser),[]);});
      await check('eventos.listarAtivosParaParticipante: status e data ASC id ASC',async()=>{
        const rows=await eventsRepo.listarAtivosParaParticipante();rows.forEach(r=>{eventShape(r,eventFields.filter(f=>f!=='usuario_id'));assert.equal(r.status,'Ativo');});
        const expected=events.filter(r=>r.status==='Ativo').sort((a,b)=>+a.data-+b.data||a.id-b.id).map(({organizador_nome,usuario_id,...r})=>r);assert.deepEqual(rows,expected);
      });
      await check('custos.buscarEventoDoUsuario: filtro propriedade e ausencia',async()=>{assert.deepEqual(await costsRepo.buscarEventoDoUsuario(e.id,e.usuario_id),[{id:e.id}]);assert.deepEqual(await costsRepo.buscarEventoDoUsuario(e.id,missingUser),[]);});
      let found=false;
      await check('custos.listarPorEvento: campos filtro id ASC decimais textuais',async()=>{
        for(const ev of events){const rows=await costsRepo.listarPorEvento(ev.id);let prev=0;for(const r of rows){exact(r,['id','evento_id','categoria','descricao','valor_estimado']);assert.equal(r.evento_id,ev.id);assert.ok(r.id>prev);prev=r.id;assert.equal(typeof r.categoria,'string');assert.equal(typeof r.descricao,'string');assert.match(r.valor_estimado,/^-?(?:0|[1-9]\d{0,9})\.\d{2}$/);}
          if(rows.length){const wire=raw.filter(r=>r.check===currentCheck).at(-1).body;assert.deepEqual(rows,wire);found=true;report.decimalRowsValidated=rows.length;break;}
        }
      });
      if(!found)pending('custos: precisao com valores existentes','No cost rows available; empty lists do not prove numeric serialization');
      await check('custos: lista vazia para evento ausente',async()=>{assert.deepEqual(await costsRepo.listarPorEvento(missing),[]);});
    }else pending('eventos/custos: casos por evento','No nonempty event list validated');
    report.status=report.checks.some(r=>r.status==='FAIL')?'FAIL':report.checks.some(r=>r.status==='PENDING')?'PARTIAL':'PASS';
  }catch(e){report.status='FAILED_SETUP';report.failureCode=safeCode(e);}
  finally {globalThis.fetch=originalFetch;raw=[];report.durationMs=Date.now()-started;save();console.log(JSON.stringify({status:report.status,checks:report.checks,requests:report.http.length,decimalRowsValidated:report.decimalRowsValidated??report.quoteItemDecimalsValidated??0,evidenceFile:file}));if(report.status==='FAIL'||report.status==='FAILED_SETUP')process.exitCode=1;}
}
if(require.main===module)void main({relacoes:process.argv.includes('--relacoes'),propostas:process.argv.includes('--propostas'),fornecedor:process.argv.includes('--fornecedor-instalado')});
module.exports={main};
