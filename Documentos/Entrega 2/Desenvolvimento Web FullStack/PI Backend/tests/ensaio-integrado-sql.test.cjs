'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),vm=require('node:vm'),jwt=require('jsonwebtoken');
const h=require('./helpers/ensaio-integrado-postgres.cjs');
const flags=['ADMIN_EVENTOS_CRIACAO_ATIVA','ADMIN_PERFIS_GESTAO_ATIVA','CONTRATACOES_ATIVAS'];

test('executor recusa socket remoto e opt-in ausente antes de carregar drivers',async()=>{
  for(const socket of ['tcp://127.0.0.1:2375','ssh://host','https://host','unix:///outro.sock',undefined])assert.throws(()=>h.validarSocket(socket));
  assert.equal(h.validarSocket('unix:///var/run/docker.sock'),'unix:///var/run/docker.sock');
  await assert.rejects(h.criarAmbiente({}, {versao:3,optIn:undefined}),/Opt-in/);
});
test('executor não recebe host, URL ou configuração de outro banco',async()=>{
  for(const chave of ['host','connectionString','database','password'])await assert.rejects(h.criarAmbiente({}, {versao:3,optIn:'1',[chave]:'sintetico-invalido'}),/externa não é aceita/);
});
const nonce='11111111-1111-4111-8111-111111111111',banco='tt_f84_'+nonce.replaceAll('-','');
test('identidade do banco exige nome, marcador, finalidade e PostgreSQL 17 exatos',()=>{
  const r={banco,nonce,objetivo:'F84-SINTETICO-DESCARTAVEL',versao:'170011'};
  h.validarBanco(r,{banco,nonce});
  for(const mudanca of [{banco:'postgres'},{nonce:randomUUID()},{objetivo:'producao'},{versao:'160000'}])assert.throws(()=>h.validarBanco({...r,...mudanca},{banco,nonce}));
});
test('identidade Docker exige recurso próprio, loopback e ausência de mounts existentes',()=>{
  const esperado={nome:'tt-f84-'+nonce,nonce,imagem:'sha256:sintetica'};
  const c={Name:'/'+esperado.nome,Image:esperado.imagem,Config:{Labels:{'trocaticket.ensaio':'f84','trocaticket.nonce':nonce}},
    HostConfig:{AutoRemove:true,NetworkMode:'bridge'},Mounts:[],NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'45678'}]}}};
  assert.equal(h.validarContainer(c,esperado),45678);
  for(const mudar of [c=>c.Name='/existente',c=>c.Config.Labels['trocaticket.nonce']=randomUUID(),c=>c.NetworkSettings.Ports['5432/tcp'][0].HostIp='0.0.0.0',c=>c.Mounts=[{Type:'bind',Destination:'/dados'}]]){
    const alterado=structuredClone(c);mudar(alterado);assert.throws(()=>h.validarContainer(alterado,esperado));
  }
});
test('plano usa os SQLs reais e valida cada etapa; falha interrompe antes da próxima',async()=>{
  for(const versao of [1,3]){
    const ordem=[];await h.aplicarEtapas(versao,async sql=>{assert.ok(sql.trim());ordem.push('sql');},async nome=>{ordem.push(nome);});
    assert.deepEqual(ordem.filter(n=>n!=='sql'),['base','contas','gestao-v1',...(versao===3?['capacidade-v3']:[]),'avaliacao','A7','A10','F8']);
    const feitas=[];await assert.rejects(h.aplicarEtapas(versao,async()=>{},async nome=>{feitas.push(nome);if(nome==='A10')throw Error('Divergência');}),/Divergência/);
    assert.equal(feitas.includes('F8'),false);
  }
});
test('fixture sintética guarda ambiente antes de DDL e mantém enum/unique esperados',()=>{
  const base=h.etapas(3)[0][1];assert.ok(base.indexOf('current_database()')<base.indexOf('CREATE ROLE'));
  assert.match(base,/CREATE TYPE public\.usuarios_perfil_enum/);assert.match(base,/UNIQUE\(usuario_id,evento_id\)/);
  assert.match(base,/@example\.invalid/);assert.doesNotMatch(base,/supabase\.co|PASSWORD|DROP DATABASE/);
});
test('erros de regra, lock, deadlock, timeout e inesperados não se confundem',()=>{
  for(const [code,tipo] of [['CT403','regra_negocio'],['EV409','regra_negocio'],['55P03','lock_timeout'],['40P01','deadlock'],['57014','statement_timeout'],['XX000','inesperado'],[undefined,'inesperado']])assert.equal(h.classificarErro(code),tipo);
});
test('instalação dos três handlers sem configuração ativa mantém capacidades bloqueadas',async()=>{
  const rotas=new Map(),app=Object.fromEntries(['get','post','patch'].map(m=>[m,(p,...h)=>rotas.set(m+' '+p,h)]));
  const op={autenticar(req,_res,next){req.usuario={id:10,perfil:'admin'};next();},permitirPerfis:()=>((_req,_res,next)=>next()),repositorios:{}};
  require('../admin-eventos-http.cjs').instalarCriacaoAdmin(app,op);require('../admin-perfis-http.cjs').instalarGestaoPerfis(app,op);require('../contratacoes-http.cjs').instalarContratacoes(app,op);
  for(const [rota,campo] of [['/admin/eventos/capacidades','criar'],['/admin/usuarios/perfis/capacidades','alterar'],['/contratacoes/capacidades','disponivel']]){
    const req={};
    const res={codigo:200,setHeader(){},status(c){this.codigo=c;return this;},json(b){this.body=b;return this;}};
    for(const handler of rotas.get('get '+rota)){let continuar=false;await handler(req,res,()=>{continuar=true;});if(!continuar)break;}
    assert.equal(res.codigo,200);assert.equal(res.body[campo],false);
  }
});

async function esperarLock(a,pid){
  const limite=Date.now()+1500;
  while(Date.now()<limite){if((await a.executar('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;
    await new Promise(r=>setTimeout(r,10));}
  assert.fail('Lock esperado não observado: concorrência não comprovada');
}
const deferir=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const resultado=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}));
async function negado(p,code){await assert.rejects(p,e=>{assert.equal(e.code,code,`Esperado ${code}, recebido ${e.code||e.name}`);return true;});}

// JWT e middleware reais; apenas a ponte de repositório usa este PostgreSQL local,
// sem SDK HTTP, PostgREST, .env ou servidor do projeto.
function autenticacaoLocal(a){
  const segredo=randomUUID()+randomUUID(),fonte=readFileSync(join(__dirname,'../server.js'),'utf8');
  const ini=fonte.indexOf('async function autenticar('),fim=fonte.indexOf("require('./portfolio.cjs').instalarPortfolio",ini);assert.ok(ini>0&&fim>ini);
  const autenticar=vm.runInNewContext('('+fonte.slice(ini,fim).trim()+')',{jwt,process:{env:{JWT_SECRET:segredo}},console:{error(){}},
    usuariosRepository:{async buscarParaAutenticacao(id){return (await a.executar(`SELECT u.id,u.nome,u.email,u.perfil FROM usuarios u
      LEFT JOIN contas_teste_imagens c ON c.usuario_id=u.id WHERE u.id=$1 AND (c.usuario_id IS NULL OR c.estado='ativa')`,[id])).rows[0];}}});
  return {token:(id,perfil)=>jwt.sign({id,perfil},segredo,{expiresIn:'10m'}),async requerer(token,perfil){
    const req={headers:{authorization:'Bearer '+token}},res={codigo:200,status(c){this.codigo=c;return this;},json(b){this.body=b;return this;}};
    let autenticado=false;await autenticar(req,res,()=>{autenticado=true;});
    if(autenticado){try{require('../services/suporte-transacoes.cjs').autorizar(req.usuario,perfil);}catch(e){res.codigo=e.respostaStatus;}}
    return res.codigo;
  }};
}

for(const versao of [1,3])test('integração conjunta PostgreSQL 17 / gestão v'+versao,{
  skip:process.env.TROCATICKET_ENSAIO_INTEGRADO_SQL_LOCAL!=='1',timeout:240000,
},async t=>{
  const flagsAntes=flags.map(k=>process.env[k]);
  const a=await h.criarAmbiente(t,{versao,optIn:process.env.TROCATICKET_ENSAIO_INTEGRADO_SQL_LOCAL});
  const chamar=async(fn,args)=>{
    const assinaturas={criar_evento_admin_v1:'$1::integer,$2::integer,$3::jsonb,$4::uuid',alterar_perfil_admin_v1:'$1::integer,$2::integer,$3::text,$4::text,$5::text,$6::uuid',
      formalizar_contratacao_v1:'$1::integer,$2::integer',alterar_contratacao_v1:'$1::integer,$2::integer,$3::text,$4::text,$5::integer',listar_contratacoes_v1:'$1::integer,$2::text,$3::integer'};
    assert.ok(Object.hasOwn(assinaturas,fn));return (await a.como('service_role',`SELECT public.${fn}(${assinaturas[fn]}) AS r`,args)).rows[0].r;
  };
  const dados={nome:'Evento integrado sintético',data:new Date(Date.now()+10*86400000).toISOString().slice(0,10),horario:'15:00',local:'Local sintético',categoria:'Tecnologia',publico:20,descricao:'Sem dados reais',...(versao===3?{capacidade_maxima:30}:{})};
  const criar=(admin=10,org=7,d=dados,key=randomUUID())=>chamar('criar_evento_admin_v1',[admin,org,JSON.stringify(d),key]);
  const perfil=(id,anterior,novo,admin=10,key=randomUUID())=>chamar('alterar_perfil_admin_v1',[admin,id,anterior,novo,'Alteração sintética para ensaio integrado',key]);
  const formalizar=(proposta,org=7)=>chamar('formalizar_contratacao_v1',[org,proposta]);
  const listar=(ator,papel)=>chamar('listar_contratacoes_v1',[ator,papel,null]);
  const encerrar=(id,estado='concluido',org=7,ver=1)=>chamar('alterar_contratacao_v1',[org,id,estado,'Justificativa exclusivamente sintética',ver]);
  const contar=async tabela=>{assert.ok(['eventos','eventos_criacao_admin','admin_perfis_auditoria','contratacoes','contratacoes_auditoria'].includes(tabela));return Number((await a.executar('SELECT count(*) AS n FROM public.'+tabela)).rows[0].n);};
  const historico=async()=>JSON.stringify((await a.executar('SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),\'[]\'::jsonb) AS r FROM contratacoes c')).rows[0].r);
  const auth=autenticacaoLocal(a),tokens={org:auth.token(7,'organizador'),forn:auth.token(8,'fornecedor'),admin:auth.token(10,'admin')};
  let evento,cotacao,proposta,contrato;
  const novaProposta=async()=>{
    const id=(await a.como('service_role',`INSERT INTO propostas(cotacao_id,fornecedor_id,valor,condicoes_pagamento,detalhes_tecnicos)
      VALUES($1,8,1234.56,'Após evento','Áudio sintético') RETURNING id`,[cotacao])).rows[0].id;
    assert.equal((await a.como('service_role',"SELECT avaliar_proposta($1::numeric,7,'Aprovada') AS n",[id])).rows[0].n,1);return id;
  };
  await t.test('A7: perfis, proprietário, estado inicial, autoria e replay',async()=>{
    for(const ator of [7,8,9])await negado(criar(ator,11),'EV403');
    const key=randomUUID();evento=await criar(10,7,dados,key);assert.equal(evento.usuario_id,7);assert.equal(evento.admin_criador_id,10);
    assert.equal((await a.executar('SELECT status FROM eventos WHERE id=$1',[evento.id])).rows[0].status,'Em planejamento');
    assert.equal((await criar(10,7,dados,key)).id,evento.id);assert.equal(await contar('eventos_criacao_admin'),1);
    await negado(criar(10,7,{...dados,nome:'Outro conteúdo'},key),'EV409');
    if(versao===3)assert.equal((await a.executar('SELECT capacidade_maxima FROM eventos WHERE id=$1',[evento.id])).rows[0].capacidade_maxima,30);
  });
  await t.test('aprovação real de proposta e F8: propriedade, snapshot e auditoria',async()=>{
    cotacao=(await a.como('service_role',"INSERT INTO cotacoes(evento_id,prazo) VALUES($1,current_date+5) RETURNING id",[evento.id])).rows[0].id;
    proposta=await novaProposta();await negado(formalizar(proposta,11),'CT403');await negado(formalizar(proposta,10),'CT403');
    contrato=await formalizar(proposta);assert.equal(contrato.organizador_id,7);assert.equal(contrato.fornecedor_id,8);assert.equal(contrato.valor_acordado,1234.56);
    assert.equal((await formalizar(proposta)).id,contrato.id);assert.equal(await contar('contratacoes_auditoria'),1);
    assert.deepEqual(await listar(13,'fornecedor'),[]);assert.deepEqual(await listar(11,'organizador'),[]);assert.equal((await listar(10,'admin')).length,1);
  });
  await t.test('A10 revoga JWT antigo e preserva contratos ativos de ambas as partes',async()=>{
    const antes=await historico();
    await perfil(7,'organizador','participante');assert.equal(await auth.requerer(tokens.org,'organizador'),403);
    await negado(formalizar(proposta),'CT403');await negado(listar(7,'organizador'),'CT403');
    assert.equal(await historico(),antes);await perfil(7,'participante','organizador');
    await perfil(8,'fornecedor','participante');assert.equal(await auth.requerer(tokens.forn,'fornecedor'),403);await negado(listar(8,'fornecedor'),'CT403');
    assert.equal(await historico(),antes);assert.equal((await listar(7,'organizador')).length,1);await perfil(8,'participante','fornecedor');
    await perfil(10,'admin','participante',12);assert.equal(await auth.requerer(tokens.admin,'admin'),403);await negado(criar(),'EV403');
    await perfil(10,'participante','admin',12);
    await negado(perfil(10,'admin','participante'),'AP413');await perfil(12,'admin','participante');
    await negado(perfil(10,'admin','participante'),'AP412');await perfil(12,'participante','admin');
  });
  await t.test('trigger real impede transferência e preserva snapshots/autoria',async()=>{
    const antes=await historico();await negado(a.executar('UPDATE eventos SET usuario_id=11 WHERE id=$1',[evento.id]),'EV409');
    await negado(encerrar(contrato.id,'cancelado',11),'CT403');await negado(a.executar("UPDATE contratacoes SET servico='Adulterado' WHERE id=$1",[contrato.id]),'CT409');
    assert.equal(await historico(),antes);
  });
  await t.test('repetição concorrente de nova proposta produz apenas um contrato e auditoria',async()=>{
    const p=await novaProposta(),antes=await contar('contratacoes'),aud=await contar('contratacoes_auditoria');
    const [um,dois]=await Promise.all([formalizar(p),formalizar(p)]);assert.equal(um.id,dois.id);
    assert.equal(await contar('contratacoes'),antes+1);assert.equal(await contar('contratacoes_auditoria'),aud+1);
  });
  await t.test('encerramento de conta bloqueia JWT e os três módulos sem apagar histórico',async()=>{
    const antes=await historico();
    for(const id of [7,8,10]){
      const registro=randomUUID();await a.executar(`INSERT INTO contas_teste_imagens(registro,usuario_id,email,estado,encerrado_em,aguardar_ate)
        VALUES($1,$2,$3,'encerrando',now(),now()+interval '24 hours')`,[registro,id,'imagem-teste-'+registro+'@example.invalid']);
      try{
        assert.equal(await auth.requerer(tokens[id===7?'org':id===8?'forn':'admin'],id===10?'admin':id===7?'organizador':'fornecedor'),401);
        if(id===10){await negado(criar(),'EV403');await negado(perfil(9,'participante','fornecedor'),'AP403');}
        else await negado(listar(id,id===7?'organizador':'fornecedor'),'CT403');
      }finally{await a.executar('DELETE FROM contas_teste_imagens WHERE registro=$1',[registro]);}
    }
    assert.equal(await historico(),antes);
  });
  await t.test('rollback de cada módulo quando a auditoria falha',async()=>{
    await a.executar("CREATE FUNCTION tt_ensaio.falhar_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Falha sintética'; END $$;");
    const casos=[['eventos_criacao_admin',()=>criar(),async()=>JSON.stringify([await contar('eventos'),await contar('eventos_criacao_admin')])],
      ['admin_perfis_auditoria',()=>perfil(9,'participante','fornecedor'),async()=>JSON.stringify([(await a.executar('SELECT perfil FROM usuarios WHERE id=9')).rows[0].perfil,await contar('admin_perfis_auditoria')])]];
    const p=await novaProposta();casos.push(['contratacoes_auditoria',()=>formalizar(p),async()=>JSON.stringify([await historico(),await contar('contratacoes_auditoria')])]);
    for(const [tabela,operar,snapshot] of casos){
      const antes=await snapshot();await a.executar(`CREATE TRIGGER tt_falha BEFORE INSERT ON ${tabela} FOR EACH ROW EXECUTE FUNCTION tt_ensaio.falhar_auditoria();`);
      try{await negado(operar(),'ZX001');assert.equal(await snapshot(),antes);
        if(tabela==='contratacoes_auditoria'){await negado(encerrar(contrato.id),'ZX001');assert.equal(await snapshot(),antes);}
      }finally{await a.executar(`DROP TRIGGER tt_falha ON ${tabela};`);}
    }
  });
  await t.test('F8 em andamento bloqueia A10; lock timeout não passa como recusa de perfil',async()=>{
    const p=await novaProposta(),aud=await contar('admin_perfis_auditoria');
    await a.sessao(async c=>{
      await c.query('BEGIN');await c.query('SET LOCAL ROLE service_role');await c.query('SELECT formalizar_contratacao_v1(7,$1)',[p]);
      const pronto=deferir();
      const pendente=resultado(a.sessao(async w=>{await w.query('BEGIN');await w.query('SET LOCAL ROLE service_role');const pid=(await w.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;pronto.resolve(pid);
        await w.query('SELECT alterar_perfil_admin_v1(10,7,\'organizador\',\'participante\',\'Mudança sintética concorrente\',$1)',[randomUUID()]);await w.query('COMMIT');}));
      await esperarLock(a,await pronto.promise);const r=await pendente;assert.equal(r.ok,false);assert.equal(r.error.code,'55P03');assert.equal(h.classificarErro(r.error.code),'lock_timeout');
      await c.query('COMMIT');
    });
    assert.equal(await contar('admin_perfis_auditoria'),aud);assert.equal((await a.executar('SELECT perfil FROM usuarios WHERE id=7')).rows[0].perfil,'organizador');
  });
  await t.test('A7 aguarda A10 e revalida perfil após commit concorrente',async()=>{
    const antes=await contar('eventos');let pendente;
    await a.sessao(async c=>{
      await c.query('BEGIN');await c.query('SET LOCAL ROLE service_role');await c.query("SELECT alterar_perfil_admin_v1(10,7,'organizador','participante','Mudança sintética concorrente',$1)",[randomUUID()]);
      const pronto=deferir();pendente=resultado(a.sessao(async w=>{await w.query('BEGIN');await w.query('SET LOCAL ROLE service_role');pronto.resolve((await w.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
        await w.query('SELECT criar_evento_admin_v1(10,7,$1,$2)',[JSON.stringify(dados),randomUUID()]);await w.query('COMMIT');}));
      try{await esperarLock(a,await pronto.promise);}finally{await c.query('COMMIT');}
    });
    const r=await pendente;assert.equal(r.ok,false);assert.equal(r.error.code,'EV403');assert.equal(await contar('eventos'),antes);await perfil(7,'participante','organizador');
  });
  await t.test('ciclo controlado de locks A7/A10 detecta deadlock e só uma transação confirma',async()=>{
    const adminPreso=deferir(),orgPreso=deferir(),consultaA7=deferir(),liberarA10=deferir();
    const eventosAntes=await contar('eventos'),auditoriaAntes=await contar('admin_perfis_auditoria');
    const um=resultado(a.sessao(async c=>{
      await c.query('BEGIN');await c.query("SET LOCAL deadlock_timeout='100ms'");await c.query('SET LOCAL ROLE service_role');
      await c.query('SELECT id FROM usuarios WHERE id=10 FOR UPDATE');adminPreso.resolve();await orgPreso.promise;
      consultaA7.resolve((await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await c.query('SELECT criar_evento_admin_v1(10,11,$1,$2)',[JSON.stringify(dados),randomUUID()]);await c.query('COMMIT');
    }));
    const dois=resultado(a.sessao(async c=>{
      await adminPreso.promise;await c.query('BEGIN');await c.query("SET LOCAL deadlock_timeout='100ms'");await c.query('SET LOCAL ROLE service_role');
      await c.query('LOCK TABLE usuarios IN SHARE ROW EXCLUSIVE MODE');await c.query('LOCK TABLE contas_teste_imagens IN SHARE MODE');
      await c.query('SELECT id FROM usuarios WHERE id=11 FOR UPDATE');orgPreso.resolve();await liberarA10.promise;
      await c.query("SELECT alterar_perfil_admin_v1(10,11,'organizador','fornecedor','Mudança sintética em ciclo de locks',$1)",[randomUUID()]);await c.query('COMMIT');
    }));
    let resultados;
    try{await esperarLock(a,await consultaA7.promise);liberarA10.resolve();resultados=await Promise.all([um,dois]);}
    finally{adminPreso.resolve();orgPreso.resolve();liberarA10.resolve();await Promise.all([um,dois]);}
    const erros=resultados.filter(r=>!r.ok);assert.equal(erros.length,1);assert.equal(erros[0].error.code,'40P01');
    assert.equal(h.classificarErro(erros[0].error.code),'deadlock');
    assert.equal(await contar('eventos'),eventosAntes+(resultados[0].ok?1:0));
    assert.equal(await contar('admin_perfis_auditoria'),auditoriaAntes+(resultados[1].ok?1:0));
    if(resultados[1].ok)await perfil(11,'fornecedor','organizador');
  });
  await t.test('statement timeout permanece falha de infraestrutura, sem confirmação comercial',async()=>{
    const antes=await historico();await a.sessao(async c=>{await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='100ms'");
      await negado(c.query('SELECT pg_sleep(1)'),'57014');});assert.equal(await historico(),antes);
  });
  await t.test('transições, FKs e histórico de auditoria permanecem protegidos',async()=>{
    await encerrar(contrato.id);await negado(encerrar(contrato.id,'cancelado'),'CT409');
    await negado(a.executar('DELETE FROM usuarios WHERE id=7'),'23503');await negado(a.executar('DELETE FROM propostas WHERE id=$1',[proposta]),'23503');
    await negado(a.executar('DELETE FROM contratacoes_auditoria'),'CT409');
    assert.equal((await a.executar('SELECT estado,versao FROM contratacoes WHERE id=$1',[contrato.id])).rows[0].estado,'concluido');
  });
  await t.test('RLS, privilégios efetivos e sequences após aplicação conjunta',async()=>{
    for(const tabela of ['eventos_criacao_admin','admin_perfis_auditoria','contratacoes','contratacoes_auditoria']){
      const r=(await a.executar('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['public.'+tabela])).rows[0];assert.equal(r.relrowsecurity,true);assert.equal(r.relforcerowsecurity,true);
      for(const papel of ['anon','authenticated']){assert.equal((await a.executar("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') AS sim",[papel,'public.'+tabela])).rows[0].sim,false);
        await negado(a.como(papel,'SELECT * FROM public.'+tabela),'42501');}
    }
    for(const fn of ['criar_evento_admin_v1(integer,integer,jsonb,uuid)','alterar_perfil_admin_v1(integer,integer,text,text,text,uuid)','formalizar_contratacao_v1(integer,integer)','alterar_contratacao_v1(integer,integer,text,text,integer)','listar_contratacoes_v1(integer,text,integer)'])
      for(const papel of ['anon','authenticated'])assert.equal((await a.executar("SELECT has_function_privilege($1,$2,'EXECUTE') AS sim",[papel,'public.'+fn])).rows[0].sim,false);
    assert.equal((await a.executar("SELECT has_sequence_privilege('service_role','public.contratacoes_id_seq','USAGE') AS sim")).rows[0].sim,true);
    assert.deepEqual(flags.map(k=>process.env[k]),flagsAntes,'Flags funcionais não podem ser modificadas pelo ensaio');
  });
});
