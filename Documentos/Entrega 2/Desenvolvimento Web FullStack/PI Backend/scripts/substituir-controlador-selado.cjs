'use strict';
// CLI futura: manter stdin/stdout herdados na sessao; nao destacar este processo.
async function main(args=process.argv.slice(2)){
  const assert=require('node:assert/strict');assert.ok(['--executar-substituicao-selada','--recuperar-substituicao-selada'].includes(args[0]));assert.ok(args.includes('--aceitar-legado-sem-ipc'),'ACEITE_LEGADO_OBRIGATORIO');const index=args.indexOf('--autorizacao');assert.ok(index>=0&&args[index+1]?.length>=8,'REFERENCIA_AUTORIZACAO_OBRIGATORIA');
  const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),estado=require('../config/estado-supervisor.cjs').criarEstadoPrivado(),ambiente=require('dotenv').parse(fs.readFileSync(path.join(root,'.env'))),aceite={legadoSemIpc:true,riscoResidualAceito:true,historicoNaoComprovado:true,referencia:args[index+1]},ref=args.indexOf('--relatorio'),report=ref>=0?path.resolve(args[ref+1]):path.join(root,'evidencias/recuperacao-smoke-selado-d669e2e4-3cb3-42e2-8636-5da0d8926db9.json');
  const runtime=require('./runtime-substituicao-selada.cjs').criarRuntimeSubstituicao({estado,ambiente,aceite,relatorioFile:report});runtime.instalarCanal();const protocol=require('./substituicao-controlador-selada.cjs').criarSubstituicaoSelada(runtime),retomada=args[0]==='--recuperar-substituicao-selada';if(retomada)await runtime.prepararRetomada();const p=retomada?await protocol.planejarRecuperacao():await protocol.planejar();const result=await protocol.executar(p,{autorizar:true,autorizarRecuperacao:retomada});process.stdout.write(JSON.stringify(result)+'\n');
}
if(require.main===module)main().catch(()=>{process.stdout.write(JSON.stringify({status:'SUBSTITUICAO_INTERROMPIDA',normalOperationReleased:false})+'\n');process.exitCode=1;process.stdin.pause();});
module.exports={main};
