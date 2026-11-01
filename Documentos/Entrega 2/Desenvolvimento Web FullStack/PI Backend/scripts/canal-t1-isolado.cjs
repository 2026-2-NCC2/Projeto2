'use strict';
function anexarT1Isolado(app,canal=process){
  if(!canal.connected||typeof canal.send!=='function')throw Error('T1_IPC_AUSENTE');let ocupado=false;const tokens=new Map();
  const receber=async m=>{
    if(m?.tipo!=='cutover-t1-isolado'||typeof m.id!=='string')return;
    if(ocupado){canal.send({tipo:'cutover-t1-resposta',id:m.id,ok:false,code:'T1_OCUPADA'});return;}ocupado=true;let transporte;
    try{if(process.env.DB_PROVIDER!=='supabase')throw Error('T1_PROVIDER_RECUSADO');
      if(!tokens.has(m.run)){
        if(typeof m.credenciais?.email!=='string'||typeof m.credenciais?.senha!=='string')throw Error('T1_LOGIN_AUSENTE');
        transporte=await require('../config/smoke-isolado.cjs').criarCanalSmokeIsolado({app,supervisor:app.locals.supervisorCutover,janela:m.janela,recuperacaoId:m.recuperacaoId});
        const login=await transporte.requisitar({method:'POST',route:'/login',body:m.credenciais});if(login.status!==200)throw Error('T1_LOGIN_RECUSADO');const claims=require('jsonwebtoken').verify(login.body.token,process.env.JWT_SECRET,{algorithms:['HS256']});if(claims.id!==m.organizadorId||claims.perfil!=='organizador')throw Error('T1_IDENTIDADE_RECUSADA');tokens.clear();tokens.set(m.run,login.body.token);await transporte.fechar();transporte=undefined;
      }
      transporte=await require('../config/smoke-isolado.cjs').criarCanalT1Isolado({app,supervisor:app.locals.supervisorCutover,janela:m.janela,run:m.run,organizadorId:m.organizadorId});const r=await transporte.requisitar({method:m.method,route:m.route,body:m.body,token:tokens.get(m.run)});await transporte.fechar();transporte=undefined;canal.send({tipo:'cutover-t1-resposta',id:m.id,ok:true,result:r});}
    catch{tokens.delete(m.run);await transporte?.fechar();canal.send({tipo:'cutover-t1-resposta',id:m.id,ok:false,code:'T1_PRIVADA_RECUSADA'});}finally{ocupado=false;}
  };canal.on('message',receber);return ()=>canal.removeListener('message',receber);
}
module.exports={anexarT1Isolado};
