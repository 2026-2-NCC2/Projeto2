'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync, execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const sql = readFileSync(require('node:path').join(__dirname,'../../Banco de dados/contratacoes.incremental.sql'),'utf8');
test('SQL: atomicidade, snapshots, replay, locks, versão e isolamento preparados', () => {
  assert.match(sql,/^BEGIN;/m); assert.match(sql,/COMMIT;\s*$/);
  assert.match(sql,/proposta_id integer NOT NULL UNIQUE/);
  assert.match(sql,/p\.valor,p\.detalhes_tecnicos,p\.condicoes_pagamento/);
  assert.equal((sql.match(/pg_advisory_xact_lock\(84712001\)/g)||[]).length,2);
  assert.match(sql,/ORDER BY id FOR UPDATE/); assert.match(sql,/c\.versao<>p_versao/);
  assert.match(sql,/p\.status::text IS DISTINCT FROM 'Aprovada'/);
  assert.match(sql,/IF FOUND THEN[\s\S]*RETURN to_jsonb\(c\)/);
  assert.equal((sql.match(/SECURITY INVOKER SET search_path=pg_catalog/g)||[]).length,5);
  assert.equal((sql.match(/FORCE ROW LEVEL SECURITY/g)||[]).length,2);
  assert.match(sql,/p_perfil='fornecedor' AND c\.fornecedor_id=p_ator/);
  assert.doesNotMatch(sql,/SECURITY DEFINER|GRANT ALL|ON DELETE CASCADE/);
  assert.match(sql,/motivo_encerramento IS NOT NULL AND length/);
  assert.match(sql,/has_table_privilege\(papel/);
  assert.match(sql,/has_sequence_privilege\(papel/);
  assert.match(sql,/has_function_privilege\(papel/);
  assert.match(sql,/FOR SHARE/);
  assert.match(sql,/contratacoes_historico_imutavel BEFORE UPDATE OR DELETE/);
  assert.match(sql,/contratacoes_auditoria_imutavel BEFORE UPDATE OR DELETE/);
  assert.match(sql,/c\.cotacao_id<>q\.id/);
});

// Opt-in explícito. Nenhum .env, driver remoto, porta publicada ou volume existente.
// O psql roda dentro do container --network none. Somente dados sintéticos.
test('PostgreSQL 17 descartável: contratação, concorrência, rollback e ACLs', {
  skip:process.env.TROCATICKET_CONTRATACOES_SQL_LOCAL !== '1', timeout:120000,
}, async t => {
  const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',timeout:15000,...options}).trim();
  for (const nome of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']) assert.ok(!process.env[nome], 'Remova sobreposições Docker somente desta sessão antes do opt-in: '+nome);
  const contexto=JSON.parse(docker(['context','inspect']));
  assert.equal(contexto.length,1);
  assert.ok(['npipe:////./pipe/dockerDesktopLinuxEngine','npipe:////./pipe/docker_engine','unix:///var/run/docker.sock'].includes(contexto[0].Endpoints.docker.Host),'Socket Docker local obrigatório');
  assert.equal(docker(['info','--format','{{.OSType}}']),'linux');
  docker(['image','inspect','postgres:17']); // Não baixar imagem ou alterar configuração.
  const nome='tt-f8-'+randomUUID(); let criado=false;
  const query=(texto)=>docker(['exec','-i',nome,'psql','-X','-v','ON_ERROR_STOP=1','-At','-U','postgres','-d','postgres'],{input:texto,maxBuffer:2*1024*1024});
  const svc=texto=>query('SET ROLE service_role; '+texto);
  const erro=(texto,codigo)=>assert.throws(()=>query('\\set VERBOSITY verbose\nSET ROLE service_role; '+texto),e=>String(e.stderr).includes(codigo));
  try {
    docker(['run','--rm','--name',nome,'--network','none','--env','POSTGRES_HOST_AUTH_METHOD=trust','-d','postgres:17']); criado=true;
    const config=JSON.parse(docker(['inspect',nome]))[0];
    assert.equal(config.HostConfig.NetworkMode,'none');assert.equal(config.HostConfig.PortBindings,null);
    const inicio=Date.now();let pronto=false;
    while(Date.now()-inicio<30000){
      try{docker(['exec',nome,'pg_isready','-h','127.0.0.1','-U','postgres']);if(query('SELECT 1;')==='1'){pronto=true;break;}}catch{/* Bootstrap pode reiniciar; limite total explícito. */}
      await new Promise(r=>setTimeout(r,200));
    }
    assert.equal(pronto,true,'PostgreSQL não ficou pronto em 30s');
    query(`CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;
      CREATE TABLE usuarios(id integer PRIMARY KEY,nome text,perfil text NOT NULL);
      CREATE TABLE eventos(id integer PRIMARY KEY,usuario_id integer REFERENCES usuarios,nome text,status text);
      CREATE TABLE cotacoes(id integer PRIMARY KEY,evento_id integer REFERENCES eventos);
      CREATE TABLE propostas(id integer PRIMARY KEY,cotacao_id integer REFERENCES cotacoes,fornecedor_id integer REFERENCES usuarios,status text,valor numeric(12,2),detalhes_tecnicos text,condicoes_pagamento text);
      CREATE TABLE contas_teste_imagens(usuario_id integer PRIMARY KEY REFERENCES usuarios,estado text);
      INSERT INTO usuarios VALUES(1,'Organizador A','organizador'),(2,'Fornecedor A','fornecedor'),(3,'Organizador B','organizador'),(4,'Fornecedor B','fornecedor'),(5,'Admin','admin'),(6,'Participante','participante');
      INSERT INTO eventos VALUES(7,1,'Evento sintético','Ativo'); INSERT INTO cotacoes VALUES(8,7);
      INSERT INTO propostas VALUES(9,8,2,'Aprovada',1234.56,'Som','Após evento'),(10,8,2,'Recusada',1,'Teste','Teste'),(11,8,2,'Aprovada',20,'Outro','Teste');
      GRANT SELECT,UPDATE ON usuarios,eventos,cotacoes,propostas TO service_role;
      GRANT SELECT ON contas_teste_imagens TO service_role;`);
    await t.test('migração recusa privilégios públicos herdados e reverte os objetos',()=>{
      query('GRANT service_role TO authenticated;');
      try {
        assert.throws(()=>query(sql),e=>String(e.stderr).includes('Privilégios efetivos públicos'));
        assert.equal(query("SELECT to_regclass('public.contratacoes') IS NULL;"),'t');
      }finally{query('REVOKE service_role FROM authenticated;');}
    });
    query(sql);
    await t.test('perfis e propriedade revalidados',()=>{
      erro('SELECT formalizar_contratacao_v1(5,9);','CT403');erro('SELECT formalizar_contratacao_v1(3,9);','CT403');
      erro('SELECT formalizar_contratacao_v1(1,10);','CT409');
      query("UPDATE usuarios SET perfil='participante' WHERE id=2;");erro('SELECT formalizar_contratacao_v1(1,9);','CT403');
      query("UPDATE usuarios SET perfil='fornecedor' WHERE id=2; INSERT INTO contas_teste_imagens VALUES(1,'encerrando');");
      erro('SELECT formalizar_contratacao_v1(1,9);','CT403');query('DELETE FROM contas_teste_imagens;');
    });
    await t.test('criação, snapshot e replay sem duplicatas',()=>{
      const c=JSON.parse(svc('SELECT formalizar_contratacao_v1(1,9);').split('\n').at(-1));
      assert.equal(c.organizador_id,1);assert.equal(c.fornecedor_id,2);assert.equal(c.estado,'ativo');
      query("UPDATE propostas SET valor=999 WHERE id=9;");
      const replay=JSON.parse(svc('SELECT formalizar_contratacao_v1(1,9);').split('\n').at(-1));
      assert.equal(replay.id,c.id);assert.equal(replay.valor_acordado,1234.56);
      assert.equal(query('SELECT count(*) FROM contratacoes_auditoria;'),'1');
    });
    await t.test('consultas isoladas e admin somente leitura',()=>{
      assert.equal(JSON.parse(svc("SELECT listar_contratacoes_v1(4,'fornecedor',NULL);").split('\n').at(-1)).length,0);
      assert.equal(JSON.parse(svc("SELECT listar_contratacoes_v1(2,'fornecedor',NULL);").split('\n').at(-1)).length,1);
      assert.equal(JSON.parse(svc("SELECT listar_contratacoes_v1(5,'admin',NULL);").split('\n').at(-1)).length,1);
      erro("SELECT listar_contratacoes_v1(6,'admin',NULL);",'CT403');
    });
    await t.test('rollback de criação e auditoria na mesma transação',()=>{
      query("CREATE FUNCTION rejeitar_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'falha sintética'; END$$; CREATE TRIGGER rejeitar BEFORE INSERT ON contratacoes_auditoria FOR EACH ROW EXECUTE FUNCTION rejeitar_auditoria();");
      erro('SELECT formalizar_contratacao_v1(1,11);','P0001');
      assert.equal(query('SELECT count(*) FROM contratacoes WHERE proposta_id=11;'),'0');
      query('DROP TRIGGER rejeitar ON contratacoes_auditoria;');
    });
    await t.test('concorrência retorna mesmo contrato; nenhum erro é aceito como sucesso',async()=>{
      const paralelo=()=>new Promise((resolve,reject)=>{
        const p=execFile('docker',['exec','-i',nome,'psql','-X','-v','ON_ERROR_STOP=1','-At','-U','postgres'],{timeout:15000},(e,out)=>e?reject(e):resolve(out.trim().split('\n').at(-1)));
        p.stdin.end('SET ROLE service_role; SELECT formalizar_contratacao_v1(1,11);');
      });
      const [a,b]=await Promise.all([paralelo(),paralelo()]);assert.equal(JSON.parse(a).id,JSON.parse(b).id);
      assert.equal(query('SELECT count(*) FROM contratacoes WHERE proposta_id=11;'),'1');
    });
    await t.test('versão, transições terminais e preservação de registros',()=>{
      const id=query('SELECT id FROM contratacoes WHERE proposta_id=9;');
      erro(`SELECT alterar_contratacao_v1(3,${id},'concluido','Entregue',1);`,'CT403');
      svc(`SELECT alterar_contratacao_v1(1,${id},'concluido','Entregue',1);`);
      erro(`SELECT alterar_contratacao_v1(1,${id},'cancelado','Cancelado',1);`,'CT409');
      assert.equal(query('SELECT count(*) FROM propostas;'),'3');assert.equal(query('SELECT count(*) FROM eventos;'),'1');
    });
    await t.test('constraint recusa motivo NULL e FKs preservam histórico',()=>{
      const id=query('SELECT id FROM contratacoes WHERE proposta_id=11;');
      erro(`UPDATE contratacoes SET estado='cancelado',encerrado_em=now(),motivo_encerramento=NULL WHERE id=${id};`,'23514');
      for(const comando of ['DELETE FROM propostas WHERE id=9;','DELETE FROM eventos WHERE id=7;','DELETE FROM usuarios WHERE id=2;'])
        assert.throws(()=>query('\\set VERBOSITY verbose\n'+comando),e=>String(e.stderr).includes('23503'));
      assert.equal(query(`SELECT estado FROM contratacoes WHERE id=${id};`),'ativo');
    });
    await t.test('mudanças de perfil, encerramento e transferência não alteram os três históricos',()=>{
      const lista=(ator,perfil,evento='NULL')=>JSON.parse(svc(`SELECT listar_contratacoes_v1(${ator},'${perfil}',${evento});`).split('\n').at(-1));
      query("INSERT INTO propostas VALUES(12,8,2,'Aprovada',30,'Serviço cancelado','Condições originais');");
      const novo=JSON.parse(svc('SELECT formalizar_contratacao_v1(1,12);').split('\n').at(-1));
      query("INSERT INTO contas_teste_imagens VALUES(2,'encerrando');");
      erro("SELECT listar_contratacoes_v1(2,'fornecedor',NULL);",'CT403');
      // A indisponibilidade do fornecedor não retira o direito do Organizador de encerrar.
      svc(`SELECT alterar_contratacao_v1(1,${novo.id},'cancelado','Serviço cancelado',1);`);
      query('DELETE FROM contas_teste_imagens;');
      const historico=()=>query('SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM contratacoes c;');
      const auditoria=()=>query('SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM contratacoes_auditoria a;');
      const antes=historico(),auditoriaAntes=auditoria();
      assert.deepEqual(lista(2,'fornecedor').map(c=>c.estado).sort(),['ativo','cancelado','concluido']);
      try {
        for(const [ator,anterior,atual] of [[1,'organizador','participante'],[1,'organizador','fornecedor'],[2,'fornecedor','participante'],[2,'fornecedor','organizador']]){
          query(`UPDATE usuarios SET perfil='${atual}' WHERE id=${ator};`);
          erro(`SELECT listar_contratacoes_v1(${ator},'${anterior}',NULL);`,'CT403');
          if(atual!=='participante')assert.deepEqual(lista(ator,atual),[]);
          erro(`SELECT formalizar_contratacao_v1(${ator},9);`,'CT403');
          query(`UPDATE usuarios SET perfil='${anterior}' WHERE id=${ator};`);
        }
        for(const estado of ['encerrando','excluida']){
          query(`INSERT INTO contas_teste_imagens VALUES(1,'${estado}');`);
          erro("SELECT listar_contratacoes_v1(1,'organizador',NULL);",'CT403');
          erro('SELECT formalizar_contratacao_v1(1,9);','CT403');
          const id=query('SELECT id FROM contratacoes WHERE proposta_id=11;');
          erro(`SELECT alterar_contratacao_v1(1,${id},'concluido','Entregue',1);`,'CT403');
          query('DELETE FROM contas_teste_imagens;');
        }
        query('UPDATE eventos SET usuario_id=3 WHERE id=7;');
        assert.deepEqual(lista(1,'organizador'),[]);assert.deepEqual(lista(3,'organizador',7),[]);
        erro("SELECT listar_contratacoes_v1(1,'organizador',7);",'CT403');
        erro('SELECT formalizar_contratacao_v1(1,9);','CT403');erro('SELECT formalizar_contratacao_v1(3,9);','CT409');
        const ativo=query('SELECT id FROM contratacoes WHERE proposta_id=11;');
        for(const ator of [1,3])erro(`SELECT alterar_contratacao_v1(${ator},${ativo},'cancelado','Cancelado',1);`,'CT403');
        assert.equal(lista(2,'fornecedor').length,3);assert.equal(lista(5,'admin').length,3);
        assert.equal(historico(),antes);assert.equal(auditoria(),auditoriaAntes);
      } finally {
        query("UPDATE usuarios SET perfil='organizador' WHERE id=1; UPDATE usuarios SET perfil='fornecedor' WHERE id=2; UPDATE eventos SET usuario_id=1 WHERE id=7; DELETE FROM contas_teste_imagens;");
      }
    });
    await t.test('triggers preservam snapshot, autoria e auditoria mesmo com executor amplo',()=>{
      const rejeitar=comando=>assert.throws(()=>query('\\set VERBOSITY verbose\n'+comando),e=>String(e.stderr).includes('CT409'));
      for(const atribuicao of ['organizador_id=3,formalizado_por=3','fornecedor_id=4',"servico='Alterado'",'valor_acordado=0','cotacao_id=99','proposta_id=99','evento_id=99',"formalizado_em=now()+interval '1 day'"])
        rejeitar(`UPDATE contratacoes SET ${atribuicao} WHERE proposta_id=9;`);
      rejeitar('DELETE FROM contratacoes WHERE proposta_id=9;');
      rejeitar("UPDATE contratacoes_auditoria SET motivo='Alterado';");rejeitar('DELETE FROM contratacoes_auditoria;');
    });
    await t.test('RLS, RPCs, sequences, snapshots e auditoria protegidos',()=>{
      assert.equal(query("SELECT count(*) FROM pg_class WHERE relname IN('contratacoes','contratacoes_auditoria') AND relrowsecurity AND relforcerowsecurity;"),'2');
      assert.equal(query("SELECT has_function_privilege('anon','formalizar_contratacao_v1(integer,integer)','EXECUTE');"),'f');
      assert.equal(query("SELECT has_table_privilege('authenticated','contratacoes','SELECT');"),'f');
      assert.equal(query("SELECT has_sequence_privilege('service_role','contratacoes_id_seq','USAGE');"),'t');
      erro('UPDATE contratacoes SET valor_acordado=0;','42501');erro('DELETE FROM contratacoes_auditoria;','42501');
    });
  } finally {
    if(criado){docker(['stop','-t','2',nome]);assert.equal(docker(['ps','-a','--filter','name=^/'+nome+'$','--format','{{.Names}}']),'');}
  }
});
