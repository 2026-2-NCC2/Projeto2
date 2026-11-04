"use strict";
const { randomUUID } = require('node:crypto');
const { processarImagem } = require('./imagens/processar.cjs');
const { falha } = require('./imagens/politica.cjs');
const { TTL_SEGUNDOS } = require('./imagens/storage.cjs');
const BUCKET = 'eventos-imagens';
function validarId(id) { if (!Number.isSafeInteger(id) || id <= 0) throw falha(400, 'Evento inválido.'); }
function validarPosicao(posicao) {
  if (!Number.isInteger(posicao) || posicao < 0 || posicao > 8) throw falha(400, 'Use capa ou uma das oito posições da galeria.');
}
function validarDono(usuario) {
  if (!usuario || !Number.isSafeInteger(usuario.id) || usuario.id <= 0) throw falha(401, 'Faça login novamente.');
  if (usuario.perfil !== 'organizador') throw falha(403, 'Somente o organizador responsável pode modificar as imagens.');
}
function conferirObjeto(eventoId, ref) {
  validarId(eventoId);
  if (!ref || ref.evento_origem !== eventoId || ref.bucket !== BUCKET ||
      !new RegExp(`^${eventoId}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.webp$`).test(ref.caminho)) {
    throw falha(403, 'Referência de imagem não autorizada.');
  }
}

// Importação inerte; montagem HTTP depende da integração validada no startup.
// Depende somente do diário de eventos, sem reutilizar tabelas/buckets
// de perfil. Cada mutação bloqueia e revalida o evento dentro da transação.
function criarRepositorioImagensEvento(pool, { verificarAberta } = {}) {
  async function transacao(usuario, id, acao, escrita = true) {
    validarId(id);
    if (escrita) validarDono(usuario);
    else if (!usuario || !Number.isSafeInteger(usuario.id) || usuario.id<=0) throw falha(401,'Faça login novamente.');
    let c,descartar=false;
    try {
      c=await pool.connect();await c.query(escrita?'BEGIN':'BEGIN READ ONLY');
      await c.query('SET LOCAL ROLE service_role');await c.query("SET LOCAL statement_timeout='5s'");await c.query("SET LOCAL lock_timeout='2s'");
      const u=await c.query(`SELECT perfil FROM public.usuarios WHERE id=$1${escrita?' FOR UPDATE':''}`,[usuario.id]);
      if(u.rows[0]?.perfil!==usuario.perfil)throw falha(403,'Permissão alterada. Faça login novamente.');
      if (escrita && verificarAberta) await verificarAberta(c,usuario.id);
      else {
        const conta=(await c.query(`SELECT estado FROM public.contas_teste_imagens WHERE usuario_id=$1${escrita?' FOR UPDATE':''}`,[usuario.id])).rows[0];
        if(conta && conta.estado!=='ativa')throw falha(403,'Conta em encerramento.');
      }
      let r;
      if(escrita)r=await c.query('SELECT id,status FROM public.eventos WHERE id=$1 AND usuario_id=$2 FOR UPDATE',[id,usuario.id]);
      else r=await c.query(`SELECT e.id FROM public.eventos e WHERE e.id=$1 AND (
        ($3='organizador' AND e.usuario_id=$2) OR $3='admin' OR
        ($3='participante' AND ((e.status COLLATE "C"='Ativo' AND (e.data+e.horario) AT TIME ZONE 'America/Sao_Paulo'>clock_timestamp()) OR
          (e.status COLLATE "C" IN ('Ativo','Cancelado','Encerrado') AND EXISTS(SELECT 1 FROM public.inscricoes i WHERE i.evento_id=e.id AND i.usuario_id=$2)))) OR
        ($3='fornecedor' AND EXISTS(SELECT 1 FROM public.cotacoes q WHERE q.evento_id=e.id AND
          ((e.status COLLATE "C" IN ('Ativo','Em planejamento') AND q.status COLLATE "C"='Aberta' AND q.prazo>=(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date) OR
          EXISTS(SELECT 1 FROM public.propostas p WHERE p.cotacao_id=q.id AND p.fornecedor_id=$2)))))`,[id,usuario.id,usuario.perfil]);
      if(!r.rows.length)throw falha(404,'Evento não encontrado ou sem permissão.');
      if(escrita && !['Em planejamento','Ativo'].includes(r.rows[0].status))throw falha(409,'Imagens de eventos cancelados ou encerrados são somente leitura.');
      const resultado=await acao(c);await c.query('COMMIT');return resultado;
    } catch(erro) {
      if(c)try{await c.query('ROLLBACK');}catch{descartar=true;}
      if([400,401,403,404,409].includes(erro.status))throw erro;
      if(['23505','55P03','40001','40P01'].includes(erro.code))throw falha(409,'Operação concorrente. Consulte o evento antes de repetir.');
      throw falha(503,'Não foi possível confirmar as imagens do evento. Consulte antes de repetir.');
    } finally {c?.release(descartar);}
  }
  return Object.freeze({
    async autorizarEdicao(usuario,id) {return transacao(usuario,id,async()=>undefined);},
    async listar(usuario,id) {return transacao(usuario,id,async c=>(await c.query("SELECT * FROM public.eventos_imagens WHERE evento_id=$1 AND estado='atual' ORDER BY posicao",[id])).rows,false);},
    async reservar(usuario,id,posicao,ref) {
      validarPosicao(posicao);conferirObjeto(id,ref);
      return transacao(usuario,id,async c=>{
        await c.query(`UPDATE public.eventos_imagens SET estado='limpeza',limpeza_apos=now()+interval '24 hours',atualizado_em=now()
          WHERE evento_id=$1 AND posicao=$2 AND estado='reservado' AND reserva_ate<=now()`,[id,posicao]);
        await c.query(`INSERT INTO public.eventos_imagens
          (operacao,evento_id,evento_origem,usuario_id,posicao,bucket,caminho,mime,tamanho,largura,altura)
          VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [ref.operacao,id,usuario.id,posicao,BUCKET,ref.caminho,ref.mime,ref.tamanho,ref.largura,ref.altura]);
      });
    },
    async confirmar(usuario,id,posicao,operacao) {
      validarPosicao(posicao);
      return transacao(usuario,id,async c=>{
        const r=await c.query(`SELECT estado,reserva_ate>clock_timestamp() AS vigente FROM public.eventos_imagens
          WHERE evento_id=$1 AND posicao=$2 AND operacao=$3 AND usuario_id=$4 FOR UPDATE`,[id,posicao,operacao,usuario.id]);
        if(r.rows[0]?.estado==='atual')return;
        if(r.rows[0]?.estado!=='reservado'||!r.rows[0].vigente)throw falha(409,'Reserva expirada ou cancelada.');
        await c.query(`UPDATE public.eventos_imagens SET estado='limpeza',limpeza_apos=now()+interval '24 hours',atualizado_em=now()
          WHERE evento_id=$1 AND posicao=$2 AND estado='atual'`,[id,posicao]);
        await c.query("UPDATE public.eventos_imagens SET estado='atual',atualizado_em=now() WHERE operacao=$1",[operacao]);
      });
    },
    async remover(usuario,id,posicao) {
      validarPosicao(posicao);
      return transacao(usuario,id,c=>c.query(`UPDATE public.eventos_imagens SET estado='limpeza',limpeza_apos=now()+interval '24 hours',atualizado_em=now()
        WHERE evento_id=$1 AND posicao=$2 AND estado IN ('atual','reservado')`,[id,posicao]));
    },
    async listarPendencias() { return limpezaTx(async c=>(await c.query('SELECT estado,count(*)::integer AS total FROM public.eventos_imagens GROUP BY estado ORDER BY estado')).rows); },
    async reivindicarLimpeza() {
      return limpezaTx(async c=>{
        // Ordem compartilhada com as mutações: usuário -> evento -> diário.
        const u=(await c.query(`SELECT u.id FROM public.usuarios u WHERE EXISTS(SELECT 1 FROM public.eventos_imagens o WHERE o.usuario_id=u.id AND
          ((o.evento_id IS NULL AND o.estado IN ('atual','reservado')) OR (o.estado='reservado' AND o.reserva_ate<=now()) OR
          (o.estado IN ('limpeza','removido') AND o.limpeza_apos<=now()) OR (o.estado='limpando' AND o.lease_ate<=now())))
          ORDER BY u.id FOR UPDATE OF u SKIP LOCKED LIMIT 1`)).rows[0];
        if(!u)return null;
        // Bloqueia um evento por ciclo; um órfão não depende de lock inexistente.
        const alvo=(await c.query(`SELECT evento_id FROM public.eventos_imagens WHERE usuario_id=$1 AND
          ((evento_id IS NULL AND estado IN ('atual','reservado')) OR (estado='reservado' AND reserva_ate<=now()) OR
          (estado IN ('limpeza','removido') AND limpeza_apos<=now()) OR (estado='limpando' AND lease_ate<=now()))
          ORDER BY criado_em,operacao LIMIT 1`,[u.id])).rows[0];
        if(!alvo)return null;
        if(alvo.evento_id!==null) {
          const e=await c.query('SELECT id FROM public.eventos WHERE id=$1 FOR UPDATE SKIP LOCKED',[alvo.evento_id]);
          if(!e.rows.length)return null;
        }
        await c.query(`UPDATE public.eventos_imagens SET estado='limpeza',limpeza_apos=clock_timestamp()+interval '24 hours',
          lease_ate=NULL,atualizado_em=clock_timestamp() WHERE usuario_id=$1 AND evento_id IS NOT DISTINCT FROM $2 AND
          ((evento_id IS NULL AND estado IN ('atual','reservado')) OR (estado='reservado' AND reserva_ate<=now()))`,[u.id,alvo.evento_id]);
        const tarefa=(await c.query(`SELECT * FROM public.eventos_imagens WHERE usuario_id=$1 AND evento_id IS NOT DISTINCT FROM $2 AND
          ((estado IN ('limpeza','removido') AND limpeza_apos<=now()) OR (estado='limpando' AND lease_ate<=now()))
          ORDER BY criado_em,operacao FOR UPDATE SKIP LOCKED LIMIT 1`,[u.id,alvo.evento_id])).rows[0];
        if(!tarefa)return null;
        const marcada=(await c.query(`UPDATE public.eventos_imagens SET estado='limpando',tentativas=tentativas+1,
          lease_ate=date_trunc('milliseconds',clock_timestamp())+interval '5 minutes',atualizado_em=clock_timestamp()
          WHERE operacao=$1 RETURNING *`,[tarefa.operacao])).rows[0];
        return {...marcada,lease:marcada.lease_ate.toISOString()};
      });
    },
    async concluirLimpeza(operacao,lease) {return finalizar(operacao,lease,true);},
    async adiarLimpeza(operacao,lease) {return finalizar(operacao,lease,false);},
  });
  async function limpezaTx(acao) {
    let c,descartar=false;
    try {
      c=await pool.connect();await c.query('BEGIN');await c.query('SET LOCAL ROLE service_role');
      await c.query("SET LOCAL statement_timeout='5s'");await c.query("SET LOCAL lock_timeout='2s'");
      const r=await acao(c);await c.query('COMMIT');return r;
    }catch {if(c)try{await c.query('ROLLBACK');}catch{descartar=true;}throw falha(503,'Limpeza de eventos pendente.');}
    finally{c?.release(descartar);}
  }
  async function finalizar(operacao,lease,sucesso) {
    if(!lease)throw falha(409,'Lease ausente.');
    return limpezaTx(async c=>{
      const r=await c.query(`UPDATE public.eventos_imagens SET estado=$3,lease_ate=NULL,
        limpeza_apos=clock_timestamp()+CASE WHEN $4 THEN interval '24 hours'
          ELSE interval '1 minute'*LEAST(1440,power(2,LEAST(tentativas,10))::integer) END,
        ultimo_erro_codigo=CASE WHEN $4 THEN NULL ELSE 'STORAGE_INDISPONIVEL' END,atualizado_em=clock_timestamp()
        WHERE operacao=$1 AND estado='limpando' AND lease_ate=$2 RETURNING operacao`,[operacao,lease,sucesso?'removido':'limpeza',sucesso]);
      if(r.rowCount!==1)throw falha(409,'Lease substituído.');
    });
  }
}
function criarStorageEvento(cliente,origem) {
  const base=new URL(origem);
  if(base.protocol!=='https:'||base.origin!==origem)throw falha(503,'Storage indisponível.');
  return Object.freeze({
    async remover(id,ref) {
      conferirObjeto(id,ref);
      try{const r=await cliente.storage.from(BUCKET).remove([ref.caminho]);if(r.error)throw Error();}
      catch{throw falha(503,'Limpeza de evento pendente.');}
    },
    async enviar(id,ref,dados) {
      conferirObjeto(id,ref);
      try {
        const r=await cliente.storage.from(BUCKET).upload(ref.caminho,dados,{contentType:'image/webp',upsert:false,cacheControl:'0'});
        if(r.error||r.data?.path!==ref.caminho)throw Error();
      }catch{throw falha(503,'Envio não confirmado. Consulte o evento antes de repetir.');}
    },
    async assinar(id,ref) {
      conferirObjeto(id,ref);
      try {
        const r=await cliente.storage.from(BUCKET).createSignedUrl(ref.caminho,TTL_SEGUNDOS);
        if(r.error||!r.data?.signedUrl)throw Error();const url=new URL(r.data.signedUrl);
        if(url.origin!==origem||url.username||url.password||url.hash||url.pathname!==`/storage/v1/object/sign/${BUCKET}/${ref.caminho}`)throw Error();
        return{url:url.href,expira_em_segundos:TTL_SEGUNDOS};
      }catch{throw falha(503,'Imagem do evento indisponível.');}
    },
  });
}
function criarServicoImagensEvento({repositorio,storage,processar=processarImagem}) {
  return Object.freeze({
    async listar(usuario,id) {
      validarId(id);const imagens=await repositorio.listar(usuario,id);
      return Promise.all(imagens.map(async ref=>{validarPosicao(ref.posicao);conferirObjeto(id,ref);return{posicao:ref.posicao,...await storage.assinar(id,ref)};}));
    },
    async substituir(usuario,id,posicao,entrada) {
      validarDono(usuario);validarId(id);validarPosicao(posicao);
      // Autoriza antes do codec; reservar/confirmar revalidam sob lock.
      await repositorio.autorizarEdicao(usuario,id);
      const imagem=await processar(usuario,'capa',entrada),operacao=randomUUID();
      const ref={...imagem,dados:undefined,operacao,evento_origem:id,bucket:BUCKET,caminho:`${id}/${operacao}.webp`};
      await repositorio.reservar(usuario,id,posicao,ref);
      try{await storage.enviar(id,ref,imagem.dados);await repositorio.confirmar(usuario,id,posicao,operacao);}
      catch{throw falha(503,'Imagem não confirmada. Consulte o evento antes de tentar novamente.');}
      return{operacao};
    },
    async remover(usuario,id,posicao) {validarDono(usuario);validarId(id);validarPosicao(posicao);await repositorio.remover(usuario,id,posicao);},
  });
}
function prepararIntegracaoImagensEvento({pool,clienteStorage,origemStorage,supervisor,contasTeste}) {
  if(!supervisor || !contasTeste?.verificarAberta || !contasTeste?.executarOperacao)throw Error('Guardas de imagens obrigatórias.');
  const repositorio=criarRepositorioImagensEvento(pool,{verificarAberta:contasTeste.verificarAberta});
  const storage=criarStorageEvento(clienteStorage,origemStorage);
  const servico=criarServicoImagensEvento({repositorio,storage});
  const acompanhar=(acao,escrita)=>supervisor.executarPersistencia(acao,escrita);
  return {servico:Object.freeze(Object.fromEntries(Object.entries(servico).map(([nome,acao])=>[nome,(...args)=>acompanhar(
    ()=>nome==='listar'?acao(...args):contasTeste.executarOperacao(args[0].id,()=>acao(...args)),nome!=='listar')]))),
    async limpar({executar=false,limite=10}={}) {
      if(!Number.isInteger(limite)||limite<1||limite>100)throw falha(400,'Limite de limpeza inválido.');
      return acompanhar(async()=>{
        if(!executar)return {executado:false,pendencias:await repositorio.listarPendencias()};
        let limpos=0;
        for(;limpos<limite;limpos++)if(!await require('./imagens/servico.cjs').limparObjeto({repositorio,remover:t=>storage.remover(t.evento_origem,t)}))break;
        return {executado:true,limpos};
      },executar);
    }};
}
module.exports={criarRepositorioImagensEvento,criarStorageEvento,criarServicoImagensEvento,prepararIntegracaoImagensEvento,validarPosicao,conferirObjeto,BUCKET};
