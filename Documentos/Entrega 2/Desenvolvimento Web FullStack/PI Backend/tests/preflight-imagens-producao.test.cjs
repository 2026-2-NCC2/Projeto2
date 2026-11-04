'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {configurar,executar}=require('../scripts/preflight-imagens-producao.cjs');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ref='gnwybroqfvwosiqzsfla';
const fixture=()=>({DB_PROVIDER:'supabase',SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_SECRET_KEY:'sb_secret_fixture_sem_validade',
  PGHOST:'aws-0-regiao.pooler.supabase.com',PGUSER:`postgres.${ref}`,PGDATABASE:'postgres',PGPORT:'5432',PGPASSWORD:'senha-ficticia-local'});
test('preflight de produção exige vínculo PG/REST sem fallback ou mutação',()=>{
  const env=fixture(),antes={...env};const {pg}=configurar(env);assert.equal(pg.PGPOOL_MAX,'2');assert.deepEqual(env,antes);
  for(const p of [{PGUSER:'postgres.outro'},{PGHOST:'outro.invalid'},{PGPORT:'6543'},{PGPASSWORD:''},{DB_PROVIDER:'mysql'},{SUPABASE_URL:'https://outro.supabase.co'}])assert.throws(()=>configurar({...env,...p}));
});
test('preflight usa somente GET, recusa bucket público e não chega ao PostgreSQL',async t=>{
  const chamadas=[];t.mock.method(globalThis,'fetch',async(url,opcoes)=>{
    chamadas.push(opcoes);assert.equal(opcoes.method,'GET');assert.equal(opcoes.redirect,'error');assert.ok(opcoes.signal);
    const body=url.includes('/rest/v1/')?[]:{id:'perfil-fotos',public:true,file_size_limit:5242880,allowed_mime_types:['image/webp']};
    return new Response(JSON.stringify(body),{headers:{'sb-project-ref':ref}});
  });
  const r=await executar(fixture());assert.equal(r.aprovado,false);assert.equal(r.bloqueio,'STORAGE');assert.equal(r.uploadsHabilitados,false);assert.equal(chamadas.length,3);
  assert.ok(!JSON.stringify(r).includes('senha-ficticia'));assert.ok(!JSON.stringify(r).includes('sb_secret'));
});
test('identidade REST divergente interrompe antes de Storage e banco',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('[]',{headers:{'sb-project-ref':'outro'}})});
  const r=await executar(fixture());assert.equal(r.aprovado,false);assert.equal(r.bloqueio,'REST');assert.equal(calls,1);
});

test('modo PostgreSQL não repete REST/Storage, exige TLS autorizado e encerra READ ONLY',async()=>{
  for(const autorizado of [true,false]){
    const queries=[];let liberado=false,encerrado=false;
    const cliente={connection:{stream:{authorized:autorizado}},release(){liberado=true},async query(sql){
      queries.push(sql);
      if(sql.startsWith('SHOW'))return{rows:[{server_version_num:'170000'}]};
      if(sql.includes("current_user='service_role'"))return{rows:[{ok:true,esquema:true,usuarios:true}]};
      if(sql.includes("rolname IN ('anon'"))return{rows:[{total:2}]};
      if(sql.includes('FROM pg_class'))return{rows:[{rls:true,forcado:true,crud:true,publico:false,extras:false}]};
      if(sql.includes('FROM pg_constraint'))return{rows:[{ok:true}]};
      if(sql.includes('FROM pg_index'))return{rows:[{total:3}]};
      if(sql.includes('AS inconsistente'))return{rows:[{inconsistente:false}]};
      return{rows:[{total:0}]};
    }};
    const modulo={exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/preflight-imagens-producao.cjs'),'utf8'),{
      module:modulo,process:{env:{}},URL,AbortSignal,Buffer,
      fetch(){throw Error('Não chamar REST/Storage')},
      require(n){if(n==='../config/banco.cjs')return require('../config/banco.cjs');
        if(n==='../db-postgres.js')return{criarPoolPostgres:()=>({connect:async()=>cliente,end:async()=>{encerrado=true}})};
        throw Error('Importação não autorizada');},
    });
    const r=await modulo.exports.executar(fixture(),{somentePostgres:true});
    assert.equal(r.aprovado,autorizado);assert.equal(r.escopo,'postgresql');
    assert.equal(r.restProjetoETabelas,undefined);assert.equal(r.bucketsPrivadosELimites,undefined);
    assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(queries.at(-1),'ROLLBACK');
    assert.ok(liberado&&encerrado);assert.ok(queries.every(q=>/^(BEGIN|SET LOCAL|SHOW|SELECT|ROLLBACK)/.test(q)));
  }
});
