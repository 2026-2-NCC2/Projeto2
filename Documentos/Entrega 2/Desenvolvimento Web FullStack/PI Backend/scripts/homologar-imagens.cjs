"use strict";
const { carregarConfiguracao }=require('../imagens/homologacao-config.cjs');
async function executar(args) {
  if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('IH_TLS');
  if(args.length!==3 || !['--validar','--iniciar'].includes(args[0]) || args[1]!=='--config')throw Error('IH_USO');
  const config=carregarConfiguracao(args[2]);
  if(args[0]==='--validar')return {validado:true,redeUtilizada:false,imagensHabilitadas:false};
  // Executar somente quando houver autorização de leitura/preflight remoto.
  // Nenhuma credencial padrão ou process.env é passado aos clientes.
  const pool=require('../db-postgres.js').criarPoolPostgres(config.pg,{queryTimeoutMs:10000});
  const {criarLeitorRemoto,verificarVinculo}=require('../imagens/homologacao-verificacao.cjs');
  const ler=criarLeitorRemoto(config);
  let server;
  try {
    const evidencia=await verificarVinculo(config,{pool,ler});
    const cliente=require('@supabase/supabase-js').createClient(config.url,config.secretKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:ler},
    });
    const usuarios=require('../repositories/supabase/usuarios.cjs').criarRepositorioUsuarios(cliente);
    const app=require('../imagens/homologacao-app.cjs').criarAppHomologacao(config,usuarios,evidencia);
    server=await new Promise((resolve,reject)=>{const s=app.listen(config.port,config.host,()=>resolve(s));s.once('error',reject);});
    const fechar=()=>{server.closeAllConnections();server.close(()=>pool.end().then(()=>process.exit(0),()=>process.exit(1)));};
    process.once('SIGINT',fechar);process.once('SIGTERM',fechar);
    return {iniciado:true,host:config.host,porta:config.port,imagensHabilitadas:false};
  } catch (erro) {if(server){server.closeAllConnections();server.close();}await pool.end();throw Error(/^IH_[A-Z_]+$/.test(erro.code||'')?erro.code:'IH_INICIALIZACAO_RECUSADA');}
}
if(require.main===module)executar(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(erro=>{
  console.error(/^IH_[A-Z_]+$/.test(erro.code||erro.message)?(erro.code||erro.message):'IH_CONFIG_RECUSADA');process.exitCode=1;
});
module.exports={executar};
