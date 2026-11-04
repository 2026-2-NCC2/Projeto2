'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validarEvento,inicioFuturo}=require('../services/eventos.cjs');
const dados=()=>({nome:'Evento sintético',data:'2030-12-10',horario:'10:00',local:'Local sintético',categoria:'Social',publico:50,descricao:'Descrição'});
test('calendário real, horário, controles e limites são validados antes da escrita',()=>{
  for(const alteracao of [{data:'2030-02-30'},{data:'2027-02-29'},{horario:'24:00'},{horario:'1:00'},{nome:'x'.repeat(101)},{local:'x'.repeat(201)},
    {publico:1.5},{publico:2147483648},{descricao:'x'.repeat(10001)},{nome:'a\u0000b'},{categoria:'  '}])assert.throws(()=>validarEvento({...dados(),...alteracao}),{respostaStatus:400});
  assert.equal(validarEvento({...dados(),data:'2028-02-29'}).data,'2028-02-29');
  assert.equal(inicioFuturo('2026-11-04','10:00',new Date('2026-11-04T13:00:00Z')),false);
  assert.equal(inicioFuturo('2026-11-04','10:01',new Date('2026-11-04T13:00:00Z')),true);
});
function clienteAusente(){return{schema(){return this},rpc(){return this},retry(){return this},abortSignal:async()=>({error:{code:'PGRST202'}})}}
test('sem migração, backend bloqueia criação/edição/publicação/inscrição e nunca usa escrita legada',async()=>{
  const c=clienteAusente(),r=require('../repositories/supabase/eventos.cjs').criarRepositorioEventos(c,{gestaoSegura:true});
  assert.deepEqual(await r.capacidades(),{criar:false,editar:false,publicar:false,inscrever:false,controleVersao:false,cancelar:true,encerrar:true,excluir:false});
  for(const acao of [()=>r.criar({...dados(),usuarioId:7}),()=>r.atualizar(1,7,dados(),1),()=>r.publicar(1,7,1)])await assert.rejects(acao(),{respostaStatus:503});
  await assert.rejects(r.excluir(1,7),{respostaStatus:409});
  await assert.rejects(require('../repositories/supabase/inscricoes.cjs').criarRepositorioInscricoes(c,{gestaoSegura:true}).criar(9,1),{respostaStatus:503});
});
test('HTTP normal anuncia bloqueios e não escreve por caminhos legados sem migração',async t=>{
  const a=await require('./helpers/http-autenticacao.cjs').iniciar(t,'supabase');
  const caps=await a.request('GET','/eventos/capacidades',undefined,a.token(7));
  assert.equal(caps.status,200);assert.equal(caps.body.criar,false);assert.equal(caps.body.cancelar,true);
  for(const [metodo,rota,body] of [['POST','/eventos',dados()],['PUT','/eventos/13',{...dados(),versao:1}],['PATCH','/eventos/13/publicar',{versao:1}]]){
    assert.equal((await a.request(metodo,rota,body,a.token(7))).status,503);
  }
  assert.equal((await a.request('DELETE','/eventos/13',undefined,a.token(7))).status,409);
  for(const id of [8,9,10])assert.equal((await a.request('PATCH','/eventos/13/cancelar',{estado_esperado:'Ativo'},a.token(id))).status,403);
  assert.ok(!a.calls.some(c=>c.path==='/rest/v1/eventos'&&['POST','PATCH','DELETE'].includes(c.method)));
});
test('cancelamento sem migração compara proprietário e snapshot sem apagar filhos',async()=>{
  const chamadas=[],antes={id:1,usuario_id:7,...dados(),horario:'10:00:00',status:'Ativo'};
  const c={schema(){return this},rpc(){return{retry(){return this},abortSignal:async()=>({error:{code:'PGRST202'}})}},
    from(t){chamadas.push(['tabela',t]);return this},select(){return this},eq(k,v){chamadas.push([k,v]);return this},is(){return this},
    maybeSingle:async()=>({data:antes}),update(v){chamadas.push(['update',v]);return this},retry:async()=>({data:[{...antes,status:'Cancelado'}]})};
  const r=require('../repositories/supabase/eventos.cjs').criarRepositorioEventos(c,{gestaoSegura:true});
  const fim=await r.mudarEstado(1,7,{acao:'cancelar',estado_esperado:'Ativo'});assert.equal(fim.status,'Cancelado');
  assert.ok(chamadas.some(([k,v])=>k==='usuario_id'&&v===7));assert.ok(chamadas.some(([k,v])=>k==='status'&&v==='Ativo'));
  assert.ok(chamadas.filter(([k])=>k==='tabela').every(([,v])=>v==='eventos'));
});
test('SQL de gestão em PostgreSQL local mínimo',{skip:process.env.TROCATICKET_EVENTOS_SQL_LOCAL!=='1',timeout:60000},async t=>{
  const {execFileSync}=require('node:child_process'),{Pool}=require('pg'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
  const nome='trocaticket-gestao-'+randomUUID(),senha=randomUUID();let pool;
  execFileSync('docker',['run','--detach','--rm','--pull=never','--name',nome,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+senha,'postgres:17'],{stdio:'pipe'});
  t.after(async()=>{try{await pool?.end()}finally{execFileSync('docker',['stop','--time','1',nome],{stdio:'pipe'})}});
  for(let i=0;;i++){try{execFileSync('docker',['exec',nome,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'pipe'});break}catch(e){if(i>60)throw e;await new Promise(r=>setTimeout(r,200))}}
  const porta=Number(execFileSync('docker',['port',nome,'5432/tcp'],{encoding:'utf8'}).trim().split(':').at(-1));
  pool=new Pool({host:'127.0.0.1',port:porta,user:'postgres',password:senha,database:'postgres',max:4,query_timeout:10000});
  await pool.query(`CREATE ROLE service_role BYPASSRLS;CREATE ROLE anon;CREATE ROLE authenticated;
    CREATE COLLATION public.trocaticket_general_ci(provider=icu,locale='und-u-ks-level1',deterministic=false);
    CREATE FUNCTION public.btrim(character varying) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'ADULTERADO'::text $$;
    CREATE TABLE usuarios(id integer PRIMARY KEY,perfil text NOT NULL);INSERT INTO usuarios VALUES(7,'organizador'),(8,'organizador'),(9,'participante');
    CREATE TABLE contas_teste_imagens(usuario_id integer,estado text);
    CREATE TABLE eventos(id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,nome varchar(100) COLLATE public.trocaticket_general_ci NOT NULL,data date NOT NULL,horario time NOT NULL,
      local varchar(200) COLLATE public.trocaticket_general_ci NOT NULL,categoria varchar(100) COLLATE public.trocaticket_general_ci,publico integer NOT NULL,descricao text,status varchar(50) COLLATE public.trocaticket_general_ci DEFAULT 'Em planejamento',usuario_id integer REFERENCES usuarios(id));
    CREATE TABLE inscricoes(id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,usuario_id integer REFERENCES usuarios(id),evento_id integer REFERENCES eventos(id),data_inscricao timestamptz DEFAULT CURRENT_TIMESTAMP,status text DEFAULT 'Confirmada',UNIQUE(usuario_id,evento_id));
    CREATE TABLE custos_evento(evento_id integer REFERENCES eventos(id) ON DELETE CASCADE,valor integer);INSERT INTO eventos(nome,data,horario,local,categoria,publico,descricao,status,usuario_id)
      VALUES('Histórico','2020-01-01','10:00','Local','Social',50,'Legado','Ativo',7),
      (' Evento legado ','2030-12-10','14:30:45',' Local com espaços ',NULL,50,NULL,'Ativo',7),
      ('Planejamento 1','2030-12-10','10:00','Local','Social',50,'','Em planejamento',7),
      ('Histórico 2','2020-01-02','10:00','Local','Social',50,'','Ativo',7),
      ('Planejamento 2','2030-12-11','10:00','Local','Social',50,'','Em planejamento',7),
      ('Ativo futuro','2030-12-12','10:00','Local','Social',50,'','Ativo',7);
    INSERT INTO inscricoes(usuario_id,evento_id) VALUES(9,1);
    INSERT INTO custos_evento VALUES(1,100);
    CREATE TABLE cotacoes(id integer PRIMARY KEY,evento_id integer REFERENCES eventos(id) ON DELETE CASCADE,criada_em timestamptz DEFAULT CURRENT_TIMESTAMP);INSERT INTO cotacoes(id,evento_id) VALUES(1,1);
    CREATE TABLE itens_cotacao(id integer PRIMARY KEY,cotacao_id integer REFERENCES cotacoes(id) ON DELETE CASCADE);INSERT INTO itens_cotacao VALUES(1,1);
    CREATE TABLE propostas(id integer PRIMARY KEY,cotacao_id integer REFERENCES cotacoes(id),criada_em timestamptz DEFAULT CURRENT_TIMESTAMP);INSERT INTO propostas(id,cotacao_id) VALUES(1,1);
    GRANT SELECT,UPDATE ON usuarios TO service_role;GRANT SELECT ON contas_teste_imagens TO service_role;GRANT SELECT,INSERT,UPDATE ON eventos,inscricoes TO service_role;
    GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
    ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;ALTER TABLE inscricoes ENABLE ROW LEVEL SECURITY;`);
  const sql=fs.readFileSync(path.join(__dirname,'../../Banco de dados/eventos_gestao.incremental.sql'),'utf8');
  const inventario=async()=>{
    const tabelas=['eventos','inscricoes','custos_evento','cotacoes','itens_cotacao','propostas'];const r={};
    for(const tabela of tabelas)r[tabela]=(await pool.query(tabela==='eventos'
      ?'SELECT id,nome,data::text,horario::text,local,categoria,publico,descricao,status,usuario_id FROM eventos ORDER BY id'
      :'SELECT * FROM '+tabela+' ORDER BY 1')).rows;
    return r;
  };
  const antes=await inventario();
  const sqlVerificacao=fs.readFileSync(path.join(__dirname,'../../Banco de dados/eventos_gestao.verificacao.sql'),'utf8');
  const verificacaoAntes=(await pool.query(sqlVerificacao)).rows[0].verificacao;
  const aplicar=async()=>{const c=await pool.connect();try{await c.query(sql);}finally{await c.query('ROLLBACK');c.release()}};
  await t.test('tabela ocupada provoca recusa imediata sem fila ou alteração parcial',async()=>{
    const bloqueador=await pool.connect();try{
      await bloqueador.query('BEGIN');await bloqueador.query('SELECT 1 FROM public.eventos LIMIT 1');
      const inicio=Date.now();await assert.rejects(aplicar(),{code:'55P03'});assert.ok(Date.now()-inicio<2000);
    }finally{await bloqueador.query('ROLLBACK');bloqueador.release()}
    assert.deepEqual(await inventario(),antes);
  });
  await t.test('permissão de sequence ausente e defaults inesperados desfazem tudo',async()=>{
    await pool.query('REVOKE USAGE ON SEQUENCE eventos_id_seq FROM service_role');
    await assert.rejects(aplicar(),/USAGE ausente/);
    await pool.query('GRANT USAGE ON SEQUENCE eventos_id_seq TO service_role');
    await pool.query('CREATE ROLE observador;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO observador');
    await assert.rejects(aplicar(),/Grant inesperado/);
    await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM observador');
    assert.equal((await pool.query("SELECT count(*)::integer AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='eventos' AND column_name='versao'")).rows[0].n,0);
    assert.equal((await pool.query("SELECT to_regprocedure('public.eventos_capacidades_v1()') IS NULL AS ausente")).rows[0].ausente,true);
    assert.deepEqual(await inventario(),antes);
  });
  await aplicar();
  const query=async(sql,p,estiloAlternativo=false)=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE service_role');if(estiloAlternativo)await c.query("SET LOCAL DateStyle='German, DMY'");const r=await c.query(sql,p);await c.query('COMMIT');return r.rows[0].r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release()}};
  const gerir=(acao,id=null,versao=null,chave=null,d=dados(),usuario=7)=>query('SELECT public.gerir_evento_v1($1,$2,$3,$4::jsonb,$5,$6::uuid) AS r',[acao,usuario,id,JSON.stringify(d),versao,chave]);
  await t.test('migração não reclassifica registros existentes e nega RPC anônima',async()=>{
    assert.equal(antes.eventos.length,6);assert.deepEqual(await inventario(),antes);
    const depois=(await pool.query(sqlVerificacao)).rows[0].verificacao;
    assert.deepEqual(depois.integridade,verificacaoAntes.integridade);assert.deepEqual(depois.estados,verificacaoAntes.estados);
    assert.deepEqual(depois.seguranca_tabelas,verificacaoAntes.seguranca_tabelas);assert.deepEqual(depois.chaves_estrangeiras,verificacaoAntes.chaves_estrangeiras);
    assert.equal(depois.legados_com_metadados_iniciais,6);assert.equal(depois.colunas_gestao.length,6);assert.equal(depois.funcoes.length,5);
    assert.ok(depois.funcoes.every(f=>!f.security_definer&&!f.anon&&!f.authenticated&&f.service_role&&!f.service_role_grant_option));
    assert.ok(depois.funcoes.every(f=>f.configuracao.includes('search_path=pg_catalog')));
    assert.equal(depois.triggers.length,2);assert.ok(depois.triggers.every(t=>t.habilitado==='O'));
    assert.equal(depois.restricao_estados[0].validada,true);assert.ok(depois.indice_idempotencia.every(i=>i.valido&&i.pronto&&i.unico));
    assert.equal((await pool.query('SELECT status FROM eventos WHERE id=1')).rows[0].status,'Ativo');
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM custos_evento')).rows[0].n,1);
    for(const tabela of ['cotacoes','itens_cotacao','propostas'])assert.equal((await pool.query('SELECT count(*)::integer AS n FROM '+tabela)).rows[0].n,1);
    for(const role of ['anon','authenticated'])for(const consulta of ["SELECT public.eventos_capacidades_v1()","SELECT public.gerir_evento_v1('criar',7)","SELECT public.inscrever_evento_v1(9,1)"]){
      const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE '+role);await assert.rejects(c.query(consulta),{code:'42501'});}finally{await c.query('ROLLBACK');c.release()}
    }
  });
  let e,chaveOriginal;
  await t.test('duas criações concorrentes com a mesma chave produzem um registro',async()=>{
    const chave=randomUUID();chaveOriginal=chave;const r=await Promise.all([gerir('criar',null,null,chave),gerir('criar',null,null,chave)]);assert.equal(r[0].id,r[1].id);e=r[0];
    await assert.rejects(gerir('criar',null,null,chave,{...dados(),nome:'Outro'}),{code:'EV409'});
  });
  await t.test('propriedade, publicação e controle de versão são transacionais',async()=>{
    await assert.rejects(gerir('editar',e.id,e.versao,null,dados(),8),{code:'EV404'});
    const concorrentes=await Promise.allSettled([
      gerir('editar',e.id,e.versao,null,{...dados(),descricao:'Revisado A'}),
      gerir('editar',e.id,e.versao,null,{...dados(),descricao:'Revisado B'}),
    ]);
    assert.equal(concorrentes.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(concorrentes.find(r=>r.status==='rejected').reason.code,'EV409');
    e=concorrentes.find(r=>r.status==='fulfilled').value;
    await assert.rejects(gerir('publicar',e.id,1),{code:'EV409'});
    e=await gerir('publicar',e.id,e.versao);
    await query('SELECT public.inscrever_evento_v1($1,$2) AS r',[9,e.id]);
    await assert.rejects(gerir('editar',e.id,e.versao,null,{...dados(),local:'Alterado'}),{code:'EV409'});
    e=await gerir('editar',e.id,e.versao,null,{...dados(),descricao:'Aviso'});
  });
  await t.test('idempotência permanece válida após edição e permite nova intenção com outra chave',async()=>{
    const repetido=await gerir('criar',null,null,chaveOriginal);assert.equal(repetido.id,e.id);assert.equal(repetido.versao,e.versao);assert.equal(repetido.descricao,'Aviso');
    const outro=await gerir('criar',null,null,randomUUID());assert.notEqual(outro.id,e.id);
  });
  await t.test('mudança de DateStyle não bloqueia replay; função pública homônima não interfere',async()=>{
    const r=await query('SELECT public.gerir_evento_v1($1,$2,$3,$4::jsonb,$5,$6::uuid) AS r',
      ['criar',7,null,JSON.stringify(dados()),null,chaveOriginal],true);
    assert.equal(r.id,e.id);assert.equal(r.versao,e.versao);
    assert.notEqual(r.nome,'ADULTERADO');
  });
  await t.test('collation insensível não permite mudar caixa/acento de evento publicado',async()=>{
    assert.equal((await pool.query("SELECT 'Evento' COLLATE public.trocaticket_general_ci='évento' AS igual")).rows[0].igual,true);
    for(const nome of [' evento legado ',' Évento legado '])await assert.rejects(query('UPDATE eventos SET nome=$1 WHERE id=2 RETURNING id AS r',[nome]),{code:'EV409'});
  });
  await t.test('descrição de publicado preserva literalmente categoria NULL, espaços e segundos legados',async()=>{
    const legado=antes.eventos.find(x=>x.id===2);
    const atualizado=await gerir('editar',2,1,null,{...dados(),nome:'Evento legado',horario:'14:30',local:'Local com espaços',categoria:'Corporativo',descricao:'Atualizado'});
    for(const campo of ['nome','data','horario','local','categoria','publico'])assert.equal(atualizado[campo],legado[campo]);
    assert.equal(atualizado.descricao,'Atualizado');assert.equal(atualizado.versao,2);
  });
  await t.test('metadados de criação e versão não podem ser adulterados; validação SQL é consistente',async()=>{
    await assert.rejects(query('UPDATE eventos SET criacao_chave=$1 WHERE id=$2 RETURNING id AS r',[randomUUID(),e.id]),{code:'EV409'});
    await assert.rejects(query('UPDATE eventos SET versao=100 WHERE id=$1 RETURNING id AS r',[e.id]),{code:'EV409'});
    for(const alteracao of [{data:'2030-02-30'},{publico:2147483648},{nome:'Nome\tinválido'},{descricao:'Descrição\u0001'}])
      await assert.rejects(gerir('criar',null,null,randomUUID(),{...dados(),...alteracao}),{code:'EV400'});
    await assert.rejects(gerir('criar',null,null,randomUUID(),dados(),9),{code:'EV403'});
    await pool.query("INSERT INTO contas_teste_imagens VALUES(7,'encerrando')");
    await assert.rejects(gerir('editar',e.id,e.versao),{code:'EV403'});
    await pool.query('DELETE FROM contas_teste_imagens WHERE usuario_id=7');
  });
  await t.test('cancelamento preserva inscrição; evento cancelado não admite novas',async()=>{
    e=await gerir('cancelar',e.id,e.versao);assert.equal(e.status,'Cancelado');
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM inscricoes WHERE evento_id=$1',[e.id])).rows[0].n,1);
    await assert.rejects(query('SELECT public.inscrever_evento_v1($1,$2) AS r',[9,e.id]),{code:'EV409'});
    await assert.rejects(gerir('editar',e.id,e.versao),{code:'EV409'});
  });
  await t.test('evento passado bloqueia inscrição e aceita encerramento sem apagar custos',async()=>{
    await assert.rejects(query('SELECT public.inscrever_evento_v1($1,$2) AS r',[9,1]),{code:'EV409'});
    const fim=await gerir('encerrar',1,1);assert.equal(fim.status,'Encerrado');assert.ok(fim.encerrado_em);
    assert.equal((await pool.query('SELECT count(*)::integer AS n FROM custos_evento')).rows[0].n,1);
    const novo=await gerir('criar',null,null,randomUUID());const ativo=await gerir('publicar',novo.id,novo.versao);
    await assert.rejects(gerir('encerrar',ativo.id,ativo.versao),{code:'EV409'});
  });
  await t.test('inscrição disputa o mesmo lock de evento que o cancelamento',async()=>{
    const novo=await gerir('criar',null,null,randomUUID()),ativo=await gerir('publicar',novo.id,novo.versao);
    await Promise.allSettled([gerir('cancelar',ativo.id,ativo.versao),query('SELECT public.inscrever_evento_v1($1,$2) AS r',[9,ativo.id])]);
    assert.equal((await pool.query('SELECT status FROM eventos WHERE id=$1',[ativo.id])).rows[0].status,'Cancelado');
    await assert.rejects(query('SELECT public.inscrever_evento_v1($1,$2) AS r',[9,ativo.id]),{code:'EV409'});
  });
  await t.test('segunda aplicação é recusada sem modificar dados ou objetos instalados',async()=>{
    const fim=await inventario();await assert.rejects(aplicar());assert.deepEqual(await inventario(),fim);
    assert.equal(await query('SELECT public.eventos_capacidades_v1() AS r'),1);
  });
});
