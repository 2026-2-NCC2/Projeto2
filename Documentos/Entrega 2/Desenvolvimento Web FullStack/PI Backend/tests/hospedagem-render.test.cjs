"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { configurarHospedagem } = require('../config/hospedagem.cjs');
const origem = 'https://trocaticket-ebon.vercel.app';
const demo = { NODE_ENV: 'production', TROCATICKET_DEMONSTRACAO: 'true', CORS_ORIGIN: origem };
const ambiente = extra => ({ DB_PROVIDER: 'supabase', SUPABASE_URL: 'https://gnwybroqfvwosiqzsfla.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_ficticia_render_sem_rede', JWT_SECRET: 'segredo-ficticio-render-'.repeat(3), ...extra });
const estado = () => ({ versao: 1, congelado: false, selado: false, instancias: [] });

test('desenvolvimento conserva localhost; demonstracao e producao exigem origem explicita', () => {
  assert.deepEqual(configurarHospedagem({}), { demonstracao: false, origemCors: 'http://localhost:5173' });
  assert.deepEqual(configurarHospedagem(demo), { demonstracao: true, origemCors: origem });
  assert.equal(Object.isFrozen(configurarHospedagem(demo)), true);
  assert.throws(() => configurarHospedagem({ NODE_ENV: 'production', CORS_ORIGIN: origem }), /MODO_EXPLICITO_OBRIGATORIO/);
  assert.equal(configurarHospedagem({ ...demo, TROCATICKET_DEMONSTRACAO: 'false' }).demonstracao, false);
  assert.throws(() => configurarHospedagem({ NODE_ENV: 'production' }), /CORS_ORIGIN_INVALIDA/);
  assert.throws(() => configurarHospedagem({ TROCATICKET_DEMONSTRACAO: 'true' }), /CORS_ORIGIN_INVALIDA/);
});
for (const CORS_ORIGIN of ['', '*', 'null', 'https://*.vercel.app', origem + '/', origem + '/pagina', origem + '?a=1',
  origem + '#frag', 'https://usuario:senha@exemplo.com', origem + ',https://outro.invalid', ' ' + origem,
  'http://trocaticket-ebon.vercel.app', 'https://localhost', 'http://localhost:5173', 'https://127.0.0.1',
  'https://[::1]', 'https://vercel.app\n']) test('origem CORS invalida e recusada: ' + JSON.stringify(CORS_ORIGIN), () => {
  assert.throws(() => configurarHospedagem({ ...demo, CORS_ORIGIN }), /CORS_ORIGIN_INVALIDA/);
});
test('modo explicito recusa valores ambiguos e sobreposicao de ambientes', () => {
  for (const valor of ['', 'TRUE', '1', true, false, null]) assert.throws(() => configurarHospedagem({ ...demo, TROCATICKET_DEMONSTRACAO: valor }), /DEMONSTRACAO_INVALIDA/);
  assert.throws(() => configurarHospedagem({ ...demo, TROCATICKET_HOMOLOGACAO: 'leitura' }), /MODOS_INCOMPATIVEIS/);
  assert.throws(() => configurarHospedagem({ ...demo, TROCATICKET_AMBIENTE: 'isolado' }), /MODOS_INCOMPATIVEIS/);
});

async function iniciar(extra = {}, { falharImagens = false, estadoLocal = estado() } = {}) {
  const chamadas = [], registros = [], saidas = [], env = ambiente(extra), mod = { exports: {} };
  const app = { locals: {}, use() {} }; for (const verbo of ['get','post','put','patch','delete']) app[verbo] = () => {};
  app.listen = (porta, callback) => { chamadas.push(['listen', porta]); callback(); return { close() {} }; };
  const processo = { env, on() {}, exit: code => saidas.push(code), exitCode: undefined };
  const req = nome => {
    if (nome === 'express') return Object.assign(() => app, { json: () => () => {} });
    if (nome === 'cors') return opcoes => { registros.push(opcoes); return () => {}; };
    if (nome === 'bcryptjs' || nome === 'jsonwebtoken') return {};
    if (nome === 'dotenv') return { config() {} };
    if (nome === './isolamento.cjs') return { modoExecucao: () => 'principal' };
    if (nome === './config/startup-controlado.cjs') return { validarEntrada(e,m) {
      chamadas.push('startup'); return require('../config/startup-controlado.cjs').validarEntrada(e,m,{estado:{ler:()=>estadoLocal}});
    } };
    if (nome === './repositories/index.cjs') return { criarPersistencia() { chamadas.push('repositorios'); return { repositorios: {}, servicos: {}, provider: 'supabase' }; } };
    if (nome === './config/ativacao-imagens.json') return { versao: 1, ativo: true, projeto: 'gnwybroqfvwosiqzsfla', evidencia: 'evidencias/imagens-descartaveis-11111111-1111-4111-8111-111111111111.json' };
    if (nome === './evidencias/imagens-descartaveis-11111111-1111-4111-8111-111111111111.json') return { aprovado: true, projeto: 'gnwybroqfvwosiqzsfla' };
    if (nome === './imagens/inicializacao.cjs') return { async prepararImagens() { chamadas.push('preflight-imagens'); if (falharImagens) throw Error('preflight recusado'); return { integracao: { servico: {} }, async iniciarLimpeza() { chamadas.push('limpeza'); }, async fechar() {} }; } };
    if (nome === './imagens/http.cjs') return { criarRouterImagens: () => () => {} };
    const pura = require('./helpers/persistencia.cjs').dependenciaPura(nome); if (pura) return pura;
    if (nome === './config/banco.cjs') return require('../config/banco.cjs');
    if (nome === './services/suporte-transacoes.cjs') return require('../services/suporte-transacoes.cjs');
    throw Error('IMPORTACAO_INESPERADA: ' + nome);
  };
  req.main = mod;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server.js'),'utf8'), {
    require: req, module: mod, process: processo, Buffer, console: { log() {}, error() {} },
    setInterval() { throw Error('Timer automatico proibido neste teste'); },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { app, chamadas, registros, processo, saidas };
}

test('startup de demonstracao usa PORT sem preflight, pool PG, imagens ou limpeza', async () => {
  const f = await iniciar({ ...demo, PORT: '10000' });
  assert.deepEqual(f.chamadas, ['startup','repositorios',['listen','10000']]);
  assert.equal(f.registros[0].origin, origem);
  assert.equal(f.app.locals.imagensDisponiveis(), false);
  await assert.rejects(f.app.locals.prepararImagens(), /IMAGENS_INDISPONIVEIS_DEMONSTRACAO/);
  assert.deepEqual(f.chamadas, ['startup','repositorios',['listen','10000']]);
  assert.equal(f.processo.exitCode, undefined);
});
test('fora da demonstracao conserva preflight e limpeza; falha nunca abre listener', async () => {
  const f = await iniciar();
  assert.deepEqual(f.chamadas, ['startup','repositorios','preflight-imagens','limpeza',['listen',3001]]);
  assert.equal(f.registros[0].origin, 'http://localhost:5173');
  const recusado = await iniciar({}, { falharImagens: true });
  assert.equal(recusado.chamadas.some(x => Array.isArray(x) && x[0] === 'listen'), false);
  assert.equal(recusado.processo.exitCode, 1);
});
test('demonstracao nao contorna projeto, JWT ou supervisor e falha antes da persistencia', async () => {
  for (const extra of [{ ...demo, JWT_SECRET: 'curto' }, { ...demo, SUPABASE_URL: 'https://outro.supabase.co' },
    { ...demo, SUPABASE_SECRET_KEY: 'publica' }, { ...demo, CORS_ORIGIN: '*' }]) await assert.rejects(iniciar(extra));
  await assert.rejects(iniciar(demo, { estadoLocal: { ...estado(), congelado: true, selado: true } }));
});
test('inicializador de imagens recusa demonstracao antes de qualquer importacao ou preflight', async () => {
  const mod = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../imagens/inicializacao.cjs'),'utf8'), {
    module: mod, require() { throw Error('Nenhum driver ou preflight pode ser importado'); },
  });
  await assert.rejects(mod.exports.prepararImagens({ env: demo }), /IMAGENS_INDISPONIVEIS_DEMONSTRACAO/);
});


test('HTTP demonstracao preserva login real, JWT, isolamento e indisponibilidade segura de imagens', async t => {
  const f = await require('./helpers/http-autenticacao.cjs').iniciar(t, 'supabase', { demonstracao: true });
  const login = await f.login();
  assert.equal(login.status, 200);
  const token = login.body.token;
  assert.equal(require('jsonwebtoken').verify(token, f.segredo, { algorithms: ['HS256'] }).id, 7);
  assert.equal((await f.request('GET','/perfil',undefined,token)).status, 200);
  const eventos = await f.request('GET','/eventos',undefined,token);
  assert.equal(eventos.status,200); assert.deepEqual(eventos.body.map(e=>e.id),[13]);
  assert.equal((await f.request('GET','/eventos')).status,401);
  assert.equal((await f.request('GET','/solicitacoes-acesso',undefined,token)).status,403);
  assert.equal((await f.request('GET','/eventos/14',undefined,token)).status,404);
  const imagens = await f.request('GET','/eventos/imagens/capacidades',undefined,token);
  assert.equal(imagens.status,200); assert.equal(imagens.body.consultar,false); assert.equal(imagens.body.alterar,false);
  assert.equal((await f.request('GET','/perfil/imagens',undefined,token)).status,503);
  assert.equal((await f.request('GET','/perfil/imagens')).status,401);
  await assert.rejects(f.app.locals.prepararImagens(),/IMAGENS_INDISPONIVEIS_DEMONSTRACAO/);
  assert.ok(!f.imports.some(x=>/db-postgres|imagens\/inicializacao|preflight-imagens/.test(x)));
  // A RPC de capacidades e somente leitura, mas utiliza POST no transporte existente.
  assert.ok(f.calls.every(c=>c.kind==='supabase' && (c.method==='GET' ||
    (c.method==='POST' && c.path==='/rest/v1/rpc/eventos_capacidades_v1'))));
  assert.deepEqual(f.rpcCalls, []);
});

test('CORS HTTP permite somente a origem configurada sem wildcard ou reflexao de origem externa', async t => {
  const http = require('node:http'), express = require('express'), cors = require('cors');
  const app = express();
  app.use(cors({ origin: configurarHospedagem(demo).origemCors }));
  app.get('/',(_req,res)=>res.json({ok:true}));
  const server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  async function consultar(origin) {
    return new Promise((resolve,reject)=>{
      const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/',method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization',connection:'close'}},res=>{res.resume();res.on('end',()=>resolve(res.headers));});
      req.on('error',reject);req.end();
    });
  }
  const permitido=await consultar(origem);
  assert.equal(permitido['access-control-allow-origin'],origem);
  assert.match(permitido['access-control-allow-headers'],/authorization/);
  const outro=await consultar('https://origem-nao-autorizada.invalid');
  assert.notEqual(outro['access-control-allow-origin'],'https://origem-nao-autorizada.invalid');
  assert.notEqual(outro['access-control-allow-origin'],'*');
  assert.equal(outro['access-control-allow-credentials'],undefined);
});
