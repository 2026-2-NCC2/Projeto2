'use strict';
// Somente IPC herdado do controlador. Nao registra endpoint publico.
function anexarSmokeIsolado(app,canal=process){
  if(!canal.connected||typeof canal.send!=='function')throw Error('SMOKE_PRIVADO_IPC_AUSENTE');
  let ocupado=false;
  const receber=async m=>{
    if(m?.tipo!=='cutover-smoke-isolado'||typeof m.id!=='string')return;
    if(ocupado){canal.send({tipo:'cutover-smoke-resposta',id:m.id,ok:false,code:'SMOKE_PRIVADO_OCUPADO'});return;}
    ocupado=true;let transporte;
    try{
      transporte=await require('../config/smoke-isolado.cjs').criarCanalSmokeIsolado({app,supervisor:app.locals.supervisorCutover,janela:m.janela,recuperacaoId:m.recuperacaoId});
      const result=await require('./smoke-final-isolado.cjs').executarSmokeFinalIsolado({canal:transporte,contas:m.contas,jwtSecret:process.env.JWT_SECRET,tokensAntigos:m.tokensAntigos});
      await transporte.fechar();transporte=undefined;
      const path=require('node:path'),forbidden=Object.keys(require.cache).some(file=>/[\\/]node_modules[\\/]mysql2[\\/]|[\\/]repositories[\\/]mysql[\\/]/.test(file)||file===path.resolve(__dirname,'../db.js'));
      if(forbidden)throw Error('SMOKE_MYSQL_IMPORTADO');
      canal.send({tipo:'cutover-smoke-resposta',id:m.id,ok:true,result:{...result,mysqlModulesLoaded:false}});
    }catch{
      await transporte?.fechar();canal.send({tipo:'cutover-smoke-resposta',id:m.id,ok:false,code:'SMOKE_PRIVADO_RECUSADO'});
    }finally{ocupado=false;}
  };
  canal.on('message',receber);return ()=>canal.removeListener('message',receber);
}
module.exports={anexarSmokeIsolado};
