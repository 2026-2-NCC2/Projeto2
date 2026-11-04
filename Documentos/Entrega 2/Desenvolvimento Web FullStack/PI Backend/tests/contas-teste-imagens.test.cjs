'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{readFileSync}=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto'),{Pool}=require('pg');
const {criarCicloContasTeste}=require('../imagens/contas-teste.cjs');
const {criarRepositorioImagens}=require('../imagens/repositorio.cjs');
const {novoArquivo}=require('../imagens/politica.cjs');
test('autenticação e login recusam conta marcada em encerramento, sem afetar comuns',async()=>{
  const {criarRepositorioUsuarios}=require('../repositories/supabase/usuarios.cjs');
  for(const estado of [null,'ativa','encerrando','excluida']){
    const usuario={id:22,nome:'Fixture',email:'fixture@example.invalid',perfil:'participante',senha:'hash-ficticio'};
    const chamadas=[];let tabela;
    const cliente={schema(){return this},from(t){tabela=t;chamadas.push(t);return this},select(){return this},eq(){return this},
      async maybeSingle(){return{data:tabela==='usuarios'?usuario:estado?{estado}:null,error:null}}};
    const repo=criarRepositorioUsuarios(cliente,{contasTeste:true});
    for(const r of [await repo.buscarParaLogin(usuario.email),await repo.buscarParaAutenticacao(usuario.id)]){
      assert.equal(r===undefined,['encerrando','excluida'].includes(estado));
    }
    assert.equal(chamadas.filter(t=>t==='contas_teste_imagens').length,2);
    chamadas.length=0;await criarRepositorioUsuarios(cliente).buscarParaAutenticacao(22);
    assert.deepEqual(chamadas,['usuarios']);
  }
});

test('falha ao verificar marca não admite autenticação',async()=>{
  const usuario={id:22,nome:'Fixture',email:'fixture@example.invalid',perfil:'participante'};let tabela;
  const cliente={schema(){return this},from(t){tabela=t;return this},select(){return this},eq(){return this},
    async maybeSingle(){return tabela==='usuarios'?{data:usuario,error:null}:{data:null,error:{code:'42P01'}}}};
  await assert.rejects(require('../repositories/supabase/usuarios.cjs').criarRepositorioUsuarios(cliente,{contasTeste:true}).buscarParaAutenticacao(22),{code:'42P01'});
});
test('encerramento de contas de imagens em PostgreSQL descartável',{skip:process.env.TROCATICKET_SQL_ISOLADO!=='1',timeout:60000},async t=>{
  const nome='trocaticket-contas-'+randomUUID(),senha=randomUUID();let pool;
  execFileSync('docker',['run','--detach','--rm','--pull=never','--name',nome,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+senha,'postgres:17'],{stdio:'pipe'});
  t.after(async()=>{try{await pool?.end()}finally{execFileSync('docker',['stop','--time','1',nome],{stdio:'pipe'})}});
  for(let i=0;;i++){try{execFileSync('docker',['exec',nome,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'pipe'});break}catch(e){if(i>60)throw e;await new Promise(r=>setTimeout(r,200))}}
  const porta=Number(execFileSync('docker',['port',nome,'5432/tcp'],{encoding:'utf8'}).trim().split(':').at(-1));
  pool=new Pool({host:'127.0.0.1',port:porta,user:'postgres',password:senha,database:'postgres',max:6,query_timeout:10000});
  await pool.query(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE usuarios(id integer PRIMARY KEY,nome text NOT NULL,email text UNIQUE NOT NULL,perfil text NOT NULL);
    INSERT INTO usuarios VALUES(7,'Conta preexistente','real@example.invalid','participante');
    GRANT SELECT,INSERT,UPDATE,DELETE ON usuarios TO service_role;
    CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO service_role;
    CREATE TABLE storage.objects(bucket_id text,name text); GRANT SELECT ON storage.objects TO service_role;
    CREATE TABLE dependentes(usuario_id integer REFERENCES usuarios(id) ON DELETE CASCADE);
    GRANT SELECT ON dependentes TO service_role;`);
  await pool.query(readFileSync(path.join(__dirname,'../../Banco de dados/perfil_imagens.incremental.sql'),'utf8'));
  await pool.query(readFileSync(path.join(__dirname,'../../Banco de dados/contas_teste_imagens.preparacao.sql'),'utf8'));
  const objetosStorage=new Set();let falhaStorage=false,seq=20;
  const clienteStorage={storage:{from:bucket=>({list:async prefix=>falhaStorage?{error:{}}:{data:[...objetosStorage].filter(x=>x.startsWith(bucket+'/'+prefix+'/')).map(name=>({name}))}})}};
  const ciclo=criarCicloContasTeste({pool,clienteStorage}),repo=criarRepositorioImagens(pool,{verificarAberta:ciclo.verificarAberta});
  async function criar(){
    let guardado=false;
    return ciclo.cadastrar({guardarCredencial:async c=>{assert.ok(c.senha.length>=32);guardado=true},
      cadastrarNormal:async dados=>{assert.ok(guardado);assert.equal(dados.perfil,'participante');const id=++seq;
        await pool.query('INSERT INTO usuarios VALUES($1,$2,$3,$4)',[id,dados.nome,dados.email,dados.perfil]);return{status:201,usuario:{id,...dados}}}});
  }
  const ref=id=>({usuario_id:id,tipo:'foto',...novoArquivo({id,perfil:'participante'},'foto'),mime:'image/webp',tamanho:20,largura:32,altura:24});
  const passarTempo=id=>pool.query(`UPDATE contas_teste_imagens SET aguardar_ate=now()-interval '1 minute' WHERE usuario_id=$1;
    `,[id]); // Somente relógio da fixture local; código real nunca reduz prazo.
  const removerFixture=op=>pool.query("UPDATE perfil_imagens_objetos SET estado='removido',lease_ate=NULL WHERE operacao=$1",[op]);
  await t.test('registro nasce só após cadastro normal 201 e não revela senha',async()=>{
    const a=await criar();assert.deepEqual(Object.keys(a).sort(),['id','registro']);
    assert.equal((await pool.query('SELECT estado FROM contas_teste_imagens WHERE usuario_id=$1',[a.id])).rows[0].estado,'ativa');
    await assert.rejects(ciclo.encerrar(7,randomUUID()),{status:403});
    await assert.rejects(ciclo.concluir(7,randomUUID()),{status:403});
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM usuarios WHERE id=7')).rows[0].n,1);
  });
  await t.test('identidade existente não pode ser adotada por resposta falsa',async()=>{
    await assert.rejects(ciclo.cadastrar({guardarCredencial:async()=>{},cadastrarNormal:async dados=>({status:201,usuario:{...dados,id:7}})}),{status:409});
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM contas_teste_imagens WHERE usuario_id=7')).rows[0].n,0);
  });
  await t.test('encerramento é idempotente, cancela slots e preserva 24h e diário',async()=>{
    const a=await criar(),o=ref(a.id);await repo.reservar(o);await repo.confirmar(a.id,'foto',o.operacao);
    assert.equal((await ciclo.encerrar(a.id,a.registro)).estado,'encerrando');await ciclo.encerrar(a.id,a.registro);
    assert.equal(await repo.buscar(a.id,'foto'),null);
    const r=(await pool.query("SELECT aguardar_ate>=encerrado_em+interval '24 hours' AS espera FROM contas_teste_imagens WHERE usuario_id=$1",[a.id])).rows[0];assert.ok(r.espera);
    await assert.rejects(repo.reservar(ref(a.id)),{status:403});
    await assert.rejects(repo.confirmar(a.id,'foto',o.operacao),{status:403});
    await assert.rejects(repo.desvincular(a.id,'foto'),{status:403});
    await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM perfil_imagens_objetos WHERE usuario_id=$1',[a.id])).rows[0].n,1);
  });
  await t.test('upload em voo tem contador durável; encerramento impede novos e commit tardio',async()=>{
    const a=await criar(),o=ref(a.id);let liberar,entrou;
    const inicio=new Promise(r=>{entrou=r}),pausa=new Promise(r=>{liberar=r});
    const pendente=ciclo.executarOperacao(a.id,async()=>{await repo.reservar(o);entrou();await pausa;return repo.confirmar(a.id,'foto',o.operacao)});
    const rejeitado=assert.rejects(pendente,{status:403});await inicio;
    await ciclo.encerrar(a.id,a.registro);await passarTempo(a.id);
    await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});
    await assert.rejects(ciclo.executarOperacao(a.id,()=>{throw Error('Não executar')}),{status:403});
    liberar();await rejeitado;assert.equal(await repo.buscar(a.id,'foto'),null);
    const r=(await pool.query('SELECT atividades,incerta FROM contas_teste_imagens WHERE usuario_id=$1',[a.id])).rows[0];assert.equal(r.atividades,0);assert.ok(r.incerta);
  });
  await t.test('reservas concorrentes ao encerramento nunca podem confirmar depois',async()=>{
    const a=await criar(),o=ref(a.id);
    await Promise.allSettled([repo.reservar(o),ciclo.encerrar(a.id,a.registro)]);
    await assert.rejects(repo.confirmar(a.id,'foto',o.operacao),e=>[403,409].includes(e.status));assert.equal(await repo.buscar(a.id,'foto'),null);
  });
  await t.test('leases, falha de listagem e objetos tardios bloqueiam purge',async()=>{
    const a=await criar(),o=ref(a.id);await repo.reservar(o);await ciclo.encerrar(a.id,a.registro);await passarTempo(a.id);
    await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});
    await pool.query("UPDATE perfil_imagens_objetos SET estado='limpando',lease_ate=now()+interval '5 minutes' WHERE operacao=$1",[o.operacao]);
    await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});await removerFixture(o.operacao);
    falhaStorage=true;await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});falhaStorage=false;
    objetosStorage.add(o.bucket+'/'+o.caminho);await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});objetosStorage.clear();
    await pool.query('INSERT INTO storage.objects VALUES($1,$2)',[o.bucket,o.caminho]);
    await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});await pool.query('DELETE FROM storage.objects');
    assert.equal((await ciclo.concluir(a.id,a.registro)).estado,'excluida');
    assert.equal((await ciclo.concluir(a.id,a.registro)).estado,'excluida');
    const arquivo=(await pool.query('SELECT manifesto FROM contas_teste_imagens WHERE usuario_id=$1',[a.id])).rows[0].manifesto;
    assert.equal(arquivo[0].operacao,o.operacao);assert.equal(arquivo[0].estado,'removido');
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM usuarios WHERE id=$1',[a.id])).rows[0].n,0);
  });
  await t.test('dependência CASCADE impede excluir; duas conclusões não apagam terceiros',async()=>{
    const a=await criar();await ciclo.encerrar(a.id,a.registro);await passarTempo(a.id);
    await pool.query('INSERT INTO dependentes VALUES($1)',[a.id]);await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM dependentes WHERE usuario_id=$1',[a.id])).rows[0].n,1);
    await pool.query('DELETE FROM dependentes WHERE usuario_id=$1',[a.id]);
    const r=await Promise.all([ciclo.concluir(a.id,a.registro),ciclo.concluir(a.id,a.registro)]);assert.ok(r.every(x=>x.estado==='excluida'));
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM usuarios WHERE id=7')).rows[0].n,1);
  });
  await t.test('dependência adicional do diário e trigger desconhecido bloqueiam exclusão',async()=>{
    const a=await criar();await ciclo.encerrar(a.id,a.registro);await passarTempo(a.id);
    await pool.query('CREATE TABLE vinculo_extra(objeto uuid REFERENCES perfil_imagens_objetos(operacao) ON DELETE CASCADE)');
    await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});await pool.query('DROP TABLE vinculo_extra');
    await pool.query(`CREATE FUNCTION trigger_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$;
      CREATE TRIGGER exclusao_fixture BEFORE DELETE ON usuarios FOR EACH ROW EXECUTE FUNCTION trigger_fixture()`);
    await assert.rejects(ciclo.concluir(a.id,a.registro),{status:409});
    await pool.query('DROP TRIGGER exclusao_fixture ON usuarios');assert.equal((await ciclo.concluir(a.id,a.registro)).estado,'excluida');
  });
});
