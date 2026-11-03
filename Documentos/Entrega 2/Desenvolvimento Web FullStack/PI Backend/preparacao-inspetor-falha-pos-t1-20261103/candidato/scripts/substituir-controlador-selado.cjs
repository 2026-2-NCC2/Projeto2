'use strict';
// CLI futura: manter stdin/stdout herdados na sessao; nao destacar este processo.
let etapaDiagnostica='ARGUMENTOS';
function diagnosticoSeguro(err){
  const permitidos=new Set(['IMPLANTACAO_STATUS_ORIGEM_EXPIRADO','IMPLANTACAO_POS_T1_ESTADO_RECUSADO','IMPLANTACAO_POS_T1_NAO_AUTORIZADA','IMPLANTACAO_NAO_AUTORIZADA','IMPLANTACAO_PLANO_EXPIRADO_OU_CONSUMIDO','IMPLANTACAO_ESTADO_ALTERADO','SUBSTITUICAO_INTERROMPIDA','SUBSTITUICAO_PLANO_NAO_AUTENTICO','SUBSTITUICAO_NAO_AUTORIZADA','FALHA_ISOLADA_CATALOGOS']);
  const code=permitidos.has(err?.message)?err.message:err?.code==='ERR_ASSERTION'?'ASSERTIVA_RECUSADA':'ERRO_INTERNO_NAO_EXPOSTO';
  const local=String(err?.stack||'').match(/(?:[\\/])([a-z0-9-]+\.cjs):(\d+):\d+/i);
  return {status:'SUBSTITUICAO_INTERROMPIDA',normalOperationReleased:false,diagnostico:{etapa:etapaDiagnostica,code,local:local?{arquivo:local[1],linha:Number(local[2])}:null}};
}
async function main(args=process.argv.slice(2)){
  if(args[0]==='--implantar-correcao-pos-t1-selada')return mainImplantacao(args);
  const assert=require('node:assert/strict');assert.ok(['--executar-substituicao-selada','--recuperar-substituicao-selada'].includes(args[0]));assert.ok(args.includes('--aceitar-legado-sem-ipc'),'ACEITE_LEGADO_OBRIGATORIO');const index=args.indexOf('--autorizacao');assert.ok(index>=0&&args[index+1]?.length>=8,'REFERENCIA_AUTORIZACAO_OBRIGATORIA');
  const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),estado=require('../config/estado-supervisor.cjs').criarEstadoPrivado(),ambiente=require('dotenv').parse(fs.readFileSync(path.join(root,'.env'))),aceite={legadoSemIpc:true,riscoResidualAceito:true,historicoNaoComprovado:true,referencia:args[index+1]},ref=args.indexOf('--relatorio'),report=ref>=0?path.resolve(args[ref+1]):path.join(root,'evidencias/recuperacao-smoke-selado-d669e2e4-3cb3-42e2-8636-5da0d8926db9.json');
  const runtime=require('./runtime-substituicao-selada.cjs').criarRuntimeSubstituicao({estado,ambiente,aceite,relatorioFile:report});runtime.instalarCanal();const protocol=require('./substituicao-controlador-selada.cjs').criarSubstituicaoSelada(runtime),retomada=args[0]==='--recuperar-substituicao-selada';if(retomada)await runtime.prepararRetomada();const p=retomada?await protocol.planejarRecuperacao():await protocol.planejar();const result=await protocol.executar(p,{autorizar:true,autorizarRecuperacao:retomada});process.stdout.write(JSON.stringify(result)+'\n');
}
async function mainImplantacao(args){
  const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'..');
  assert.ok(args.includes('--autorizar-implantacao-pos-t1'),'IMPLANTACAO_NAO_AUTORIZADA');
  function arg(name){const i=args.indexOf(name);assert.ok(i>=0&&args[i+1]);return args[i+1];}
  const referencia=arg('--autorizacao');assert.ok(referencia.trim().length>=8);const pacoteFile=path.resolve(arg('--pacote')),pacoteSha256=arg('--pacote-sha256');assert.match(pacoteSha256,/^[a-f0-9]{64}$/);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(pacoteFile)).digest('hex'),pacoteSha256);
  const estado=require('../config/estado-supervisor.cjs').criarEstadoPrivado(),ambiente=require('dotenv').parse(fs.readFileSync(path.join(root,'.env')));
  const runtime=require('./runtime-substituicao-selada.cjs').criarRuntimeSubstituicao({estado,ambiente,implantacao:{pacoteFile,pacoteSha256,statusOrigemFile:path.resolve(arg('--status-origem')),referencia}});runtime.instalarCanal();
  const originalInspecionar=runtime.inspecionar;let inspecoes=0;
  runtime.inspecionar=async function(...args){const n=++inspecoes;etapaDiagnostica='INSPECAO_'+n;const result=await originalInspecionar.apply(runtime,args);etapaDiagnostica='VALIDACAO_PREFLIGHT_'+n;return result;};
  etapaDiagnostica='PLANEJAMENTO';
  const protocol=require('./substituicao-controlador-selada.cjs').criarSubstituicaoSelada(runtime),p=await protocol.planejarImplantacaoPosT1();
  etapaDiagnostica='EXECUCAO';process.stdout.write(JSON.stringify(await protocol.executar(p,{autorizar:true,autorizarImplantacaoPosT1:true}))+'\n');
}
if(require.main===module)main().catch(err=>{process.stdout.write(JSON.stringify(diagnosticoSeguro(err))+'\n');process.exitCode=1;process.stdin.pause();});
module.exports={main,mainImplantacao,diagnosticoSeguro};
