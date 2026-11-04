'use strict';
// Execução única e explícita. Só cria pelo POST /usuarios normal, guarda a
// credencial antes do POST e não repete cadastro/upload com resultado incerto.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
async function executar(){
  const raiz=path.join(__dirname,'..');
  const env=require('dotenv').parse(fs.readFileSync(path.join(raiz,'.env')));
  const preflight=await require('./preflight-imagens-producao.cjs').executar(env,{validarContasTeste:true});
  assert.equal(preflight.aprovado,true,'PREFLIGHT_RECUSADO');
  Object.assign(process.env,env);
  const privado=path.join(raiz,'.env.imagens-contas');
  // Não substituir evidências/credenciais de uma tentativa anterior.
  const git=require('node:child_process').execFileSync('git',['check-ignore','--',privado],{cwd:raiz,encoding:'utf8'});
  assert.ok(git.trim(),'ARQUIVO_PRIVADO_NAO_IGNORADO');
  const fd=fs.openSync(privado,'wx',0o600);
  const run=randomUUID(),evidencia={run,projeto:'gnwybroqfvwosiqzsfla',inicio:new Date().toISOString(),preflight,contas:[],testes:[],aprovado:false};
  const arquivo=path.join(raiz,'evidencias',`imagens-descartaveis-${run}.json`);
  const salvar=()=>fs.writeFileSync(arquivo,JSON.stringify(evidencia,null,2)+'\n');
  let servidor,runtime;const credenciais=[];
  try{
    const app=require('../server.js');
    runtime=await app.locals.prepararImagens();
    const nonce=randomBytes(32).toString('hex');
    servidor=require('node:http').createServer((req,res)=>{
      // A instância de validação nunca atende chamadas públicas ou outros domínios.
      if(req.headers['x-validacao-imagens']!==nonce||!['/usuarios','/login','/perfil'].includes(req.url.split('?')[0])&&!req.url.startsWith('/perfil/imagens/')){
        res.statusCode=403;return res.end();
      }
      return app(req,res);
    });
    await new Promise((resolve,reject)=>{servidor.once('error',reject);servidor.listen(0,'127.0.0.1',resolve);});
    const base=`http://127.0.0.1:${servidor.address().port}`;
    const http=async(rota,{method='GET',token,body,binario=false}={})=>{
      const r=await fetch(base+rota,{method,redirect:'error',signal:AbortSignal.timeout(45000),headers:{'x-validacao-imagens':nonce,
        ...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':binario?'image/png':'application/json'}:{})},
        ...(body?{body:binario?body:JSON.stringify(body)}:{})});
      return {status:r.status,data:await r.json()};
    };
    for(let i=0;i<2;i++){
      const conta=await runtime.contasTeste.cadastrar({
        guardarCredencial:async c=>{fs.writeSync(fd,`CONTA_${i+1}='${JSON.stringify(c)}'\n`);fs.fsyncSync(fd);credenciais.push(c);},
        cadastrarNormal:async dados=>{const r=await http('/usuarios',{method:'POST',body:dados});return{status:r.status,usuario:r.data.usuario};},
      });
      evidencia.contas.push(conta);salvar();
    }
    const usuarios=[];
    for(let i=0;i<2;i++){
      const r=await http('/login',{method:'POST',body:{email:credenciais[i].email,senha:credenciais[i].senha}});
      assert.equal(r.status,200);assert.equal(r.data.usuario.id,evidencia.contas[i].id);usuarios.push(r.data);
    }
    evidencia.testes.push('duas contas por cadastro normal, identidade confirmada e login');salvar();
    const a=usuarios[0],b=usuarios[1];
    assert.equal((await http('/perfil/imagens/foto')).status,401);
    assert.equal((await http('/perfil/imagens/foto',{token:'token-invalido'})).status,401);
    for(const u of usuarios)for(const tipo of ['foto','capa'])assert.equal((await http('/perfil/imagens/'+tipo,{token:u.token})).data.imagem,null);
    const sharp=require('sharp');
    const imagens=await Promise.all(['#2277bb','#bb7722'].map(background=>sharp({create:{width:64,height:48,channels:3,background}}).png().toBuffer()));
    for(const tipo of ['foto','capa']){
      let anterior;
      for(const imagem of imagens){
        const r=await http('/perfil/imagens/'+tipo,{method:'PUT',token:a.token,body:imagem,binario:true});assert.equal(r.status,200);
        const leitura=await http('/perfil/imagens/'+tipo,{token:a.token});assert.equal(leitura.status,200);
        assert.equal(leitura.data.imagem.expira_em_segundos,120);
        const url=new URL(leitura.data.imagem.url);assert.equal(url.origin,env.SUPABASE_URL);
        assert.ok(url.pathname.includes('/'+a.usuario.id+'/'));if(anterior)assert.notEqual(url.pathname,anterior);
        anterior=url.pathname;
        const download=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(download.status,200);
        const meta=await sharp(Buffer.from(await download.arrayBuffer())).metadata();assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);
        const publico=await fetch(env.SUPABASE_URL+url.pathname.replace('/object/sign/','/object/public/'),{redirect:'error',signal:AbortSignal.timeout(15000)});
        assert.ok([400,401,403,404].includes(publico.status),'OBJETO_PUBLICO');
        assert.equal((await http('/perfil/imagens/'+tipo,{token:b.token})).data.imagem,null);
        for(const method of ['GET','PUT','DELETE'])assert.equal((await http(`/perfil/imagens/${tipo}?usuario_id=${a.usuario.id}`,{method,token:b.token})).status,400);
        // Acesso direto por papéis de navegador não pode enxergar o objeto.
        for(const papel of ['anon','authenticated']){
          const c=await runtime.pool.connect();
          try{await c.query('BEGIN READ ONLY');await c.query('SET LOCAL ROLE '+papel);
            const rows=await c.query('SELECT name FROM storage.objects WHERE bucket_id=$1 AND name=$2',[tipo==='foto'?'perfil-fotos':'perfil-capas',url.pathname.split('/').slice(-2).join('/')]);
            assert.equal(rows.rowCount,0);
          }catch(e){if(e.code!=='42501')throw e;}finally{await c.query('ROLLBACK');c.release();}
        }
      }
      assert.equal((await http('/perfil/imagens/'+tipo,{method:'DELETE',token:a.token})).status,200);
      assert.equal((await http('/perfil/imagens/'+tipo,{token:a.token})).data.imagem,null);
      evidencia.testes.push(`${tipo}: upload, WebP sem EXIF, substituição, remoção lógica, URL assinada, privacidade e isolamento`);salvar();
    }
    // Nenhum relógio do banco é alterado. O worker deve respeitar 24 horas.
    assert.equal((await runtime.integracao.limpar({executar:true})).limpos,0);
    for(let i=0;i<2;i++){
      const conta=evidencia.contas[i];await runtime.contasTeste.encerrar(conta.id,conta.registro);
      assert.equal((await http('/login',{method:'POST',body:{email:credenciais[i].email,senha:credenciais[i].senha}})).status,401);
      for(const [rota,method] of [['/perfil','GET'],['/perfil','PATCH'],['/perfil/imagens/foto','PUT'],['/perfil/imagens/capa','DELETE']]){
        assert.equal((await http(rota,{method,token:usuarios[i].token})).status,401);
      }
      await assert.rejects(runtime.contasTeste.concluir(conta.id,conta.registro),{status:409});
    }
    const estado=await runtime.pool.query(`SELECT usuario_id,estado,atividades,incerta,
      aguardar_ate>=encerrado_em+interval '24 hours' AS quarentena
      FROM public.contas_teste_imagens WHERE usuario_id=ANY($1::integer[])`,[evidencia.contas.map(c=>c.id)]);
    assert.equal(estado.rowCount,2);assert.ok(estado.rows.every(r=>r.estado==='encerrando'&&r.atividades===0&&!r.incerta&&r.quarentena));
    evidencia.estadoFinal=estado.rows;evidencia.testes.push('encerramento bloqueia login/JWT e novas alterações; quarentena impede purge e limpeza antecipada');
    evidencia.aprovado=true;
  }catch(e){evidencia.falha={codigo:/^[A-Z0-9_]{2,64}$/.test(e.code||'')?e.code:'VALIDACAO_RECUSADA'};
    // Preservar diário e objetos; encerrar apenas identidades exatas já registradas.
    for(const c of evidencia.contas)try{await runtime.contasTeste.encerrar(c.id,c.registro);}catch{}
    throw e;
  }finally{
    fs.closeSync(fd);evidencia.fim=new Date().toISOString();salvar();
    if(servidor)await new Promise(r=>{servidor.closeAllConnections();servidor.close(r);});
    await runtime?.fechar();
    console.log(JSON.stringify({aprovado:evidencia.aprovado,evidencia:path.relative(raiz,arquivo),contas:evidencia.contas.length,testes:evidencia.testes}));
  }
}
if(require.main===module){
  if(process.argv.length!==3||process.argv[2]!=='--executar-autorizado'){console.error('Exige --executar-autorizado');process.exitCode=1;}
  else executar().catch(()=>{console.error('VALIDACAO_RECUSADA_SEM_REPETICAO');process.exitCode=1;});
}
module.exports={executar};
