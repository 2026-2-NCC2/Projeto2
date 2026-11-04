'use strict';
const {randomUUID,randomBytes}=require('node:crypto');
const {falha}=require('./politica.cjs');
const identificador=s=>'"'+s.replaceAll('"','""')+'"';
// Interno, sem endpoint público, .env, pool próprio ou execução ao importar.
function criarCicloContasTeste({pool,clienteStorage}){
  async function tx(acao){
    let c,descartar=false;
    try{c=await pool.connect();await c.query('BEGIN');await c.query('SET LOCAL ROLE service_role');
      await c.query("SET LOCAL statement_timeout='5s'");await c.query("SET LOCAL lock_timeout='2s'");
      const r=await acao(c);await c.query('COMMIT');return r;
    }catch(e){if(c)try{await c.query('ROLLBACK');}catch{descartar=true;}throw e;}
    finally{c?.release(descartar);}
  }
  async function travar(c,id,registro){
    if(!Number.isSafeInteger(id)||id<=0)throw falha(403,'Conta de teste não registrada.');
    const u=(await c.query('SELECT id,email,perfil FROM public.usuarios WHERE id=$1 FOR UPDATE',[id])).rows[0];
    const r=(await c.query('SELECT * FROM public.contas_teste_imagens WHERE usuario_id=$1 FOR UPDATE',[id])).rows[0];
    if(!r||r.registro!==registro)throw falha(403,'Conta de teste não registrada.');
    if(r.estado!=='excluida'&&(!u||u.email!==r.email||u.perfil!=='participante'))throw falha(409,'Identidade da conta de teste divergente.');
    return r;
  }
  async function verificarAberta(c,id){
    // Chamado depois do lock de usuarios, na mesma transação de reserva/commit.
    const r=(await c.query('SELECT estado FROM public.contas_teste_imagens WHERE usuario_id=$1 FOR UPDATE',[id])).rows[0];
    if(r&&r.estado!=='ativa')throw falha(403,'Conta de teste em encerramento.');
  }
  async function executarOperacao(id,acao){
    const registro=await tx(async c=>{
      await c.query('SELECT id FROM public.usuarios WHERE id=$1 FOR UPDATE',[id]);
      const r=(await c.query('SELECT * FROM public.contas_teste_imagens WHERE usuario_id=$1 FOR UPDATE',[id])).rows[0];
      if(!r)return null; // Usuários comuns: nenhuma marcação ou alteração.
      if(r.estado!=='ativa')throw falha(403,'Conta de teste em encerramento.');
      await c.query('UPDATE public.contas_teste_imagens SET atividades=atividades+1 WHERE registro=$1',[r.registro]);return r.registro;
    });
    if(!registro)return acao();
    let incerta=false;
    try{return await acao();}catch(e){incerta=true;throw e;}
    finally{
      // Queda ou falha de commit mantém contador/incerteza: nunca libera por tempo.
      await tx(async c=>{
        await travar(c,id,registro);
        const r=await c.query(`UPDATE public.contas_teste_imagens SET atividades=atividades-1,incerta=incerta OR $2,
          aguardar_ate=CASE WHEN estado='encerrando' THEN GREATEST(aguardar_ate,clock_timestamp()+interval '24 hours') ELSE aguardar_ate END
          WHERE registro=$1 AND atividades>0 RETURNING registro`,[registro,incerta]);
        if(r.rowCount!==1)throw falha(409,'Atividade de teste não reconciliada.');
      });
    }
  }
  return Object.freeze({
    verificarAberta,executarOperacao,
    async cadastrar({cadastrarNormal,guardarCredencial}){
      if(typeof cadastrarNormal!=='function'||typeof guardarCredencial!=='function')throw falha(400,'Fluxo normal e arquivo privado obrigatórios.');
      const registro=randomUUID(),email=`imagem-teste-${registro}@example.invalid`,nome=`Teste de imagens ${registro}`;
      const senha=randomBytes(32).toString('base64url');
      // Gravar somente no .env privado ANTES da única tentativa HTTP, sem logs.
      await guardarCredencial({registro,email,senha});
      const resposta=await cadastrarNormal({nome,email,senha,perfil:'participante'});
      if(resposta?.status!==201||!Number.isSafeInteger(resposta.usuario?.id)||resposta.usuario.id<=0||resposta.usuario.email!==email||resposta.usuario.nome!==nome||resposta.usuario.perfil!=='participante')throw falha(503,'Cadastro não confirmado. Não repetir; reconciliar pelo e-mail privado.');
      const id=resposta.usuario.id;
      await tx(async c=>{
        const u=(await c.query('SELECT id,nome,email,perfil FROM public.usuarios WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!u||u.email!==email||u.nome!==nome||u.perfil!=='participante')throw falha(409,'Cadastro não corresponde à identidade gerada.');
        await c.query('INSERT INTO public.contas_teste_imagens(registro,usuario_id,email) VALUES($1,$2,$3)',[registro,id,email]);
      });
      return {registro,id}; // Nunca retorna senha, token ou hash.
    },
    async encerrar(id,registro){
      return tx(async c=>{
        const r=await travar(c,id,registro);if(r.estado!=='ativa')return{estado:r.estado};
        // A marca e a retirada de slots são atômicas; novas reservas/commits recusam.
        await c.query('DELETE FROM public.perfil_imagens WHERE usuario_id=$1',[id]);
        await c.query(`UPDATE public.perfil_imagens_objetos SET estado='limpeza',limpeza_apos=clock_timestamp()+interval '24 hours',
          atualizado_em=clock_timestamp(),lease_ate=NULL WHERE usuario_id=$1 AND estado IN ('reservado','atual')`,[id]);
        await c.query(`UPDATE public.contas_teste_imagens SET estado='encerrando',encerrado_em=clock_timestamp(),
          aguardar_ate=GREATEST(clock_timestamp()+interval '24 hours',
            COALESCE((SELECT max(reserva_ate)+interval '24 hours' FROM public.perfil_imagens_objetos WHERE usuario_id=$2),clock_timestamp()))
          WHERE registro=$1`,[registro,id]);
        return{estado:'encerrando'};
      });
    },
    async concluir(id,registro){
      return tx(async c=>{
        const r=await travar(c,id,registro);if(r.estado==='excluida')return{estado:'excluida'};
        const prazo=(await c.query('SELECT aguardar_ate<=clock_timestamp() AS venceu FROM public.contas_teste_imagens WHERE registro=$1',[registro])).rows[0];
        if(r.estado!=='encerrando'||r.atividades!==0||r.incerta||!prazo?.venceu)throw falha(409,'Quarentena ou operações de teste pendentes.');
        const objetos=(await c.query('SELECT * FROM public.perfil_imagens_objetos WHERE usuario_id=$1 ORDER BY operacao FOR UPDATE',[id])).rows;
        if(objetos.some(o=>o.estado!=='removido'||o.lease_ate!==null))throw falha(409,'Limpeza de imagens pendente.');
        const adicionais=(await c.query(`SELECT EXISTS(SELECT 1 FROM pg_constraint
          WHERE contype='f' AND confrelid='public.perfil_imagens_objetos'::regclass
          AND conrelid<>'public.perfil_imagens'::regclass) OR EXISTS(SELECT 1 FROM pg_trigger
          WHERE NOT tgisinternal AND tgenabled<>'D' AND tgrelid IN
          ('public.usuarios'::regclass,'public.perfil_imagens_objetos'::regclass)) AS risco`)).rows[0];
        if(adicionais?.risco!==false)throw falha(409,'Dependência ou trigger de exclusão não revisado.');
        // Listagem falha/ambígua nunca significa ausência. Sem remoção por prefixo.
        for(const bucket of ['perfil-fotos','perfil-capas']){
          const s=await clienteStorage.storage.from(bucket).list(String(id),{limit:1,offset:0});
          if(s.error||!Array.isArray(s.data)||s.data.length)throw falha(409,'Storage não confirmou ausência de objetos.');
        }
        const storage=(await c.query("SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id IN ('perfil-fotos','perfil-capas') AND name LIKE $1) AS existe",[id+'/%'])).rows[0];
        if(storage?.existe!==false)throw falha(409,'Objetos Storage pendentes.');
        // Examinar TODAS as FKs a usuarios: recusar filhos até para ON DELETE CASCADE.
        const fks=(await c.query(`SELECT n.nspname,c.relname,a.attname,
          array_length(k.conkey,1)=1 AND array_length(k.confkey,1)=1 AND alvo.attname='id' AS simples
          FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
          JOIN pg_attribute alvo ON alvo.attrelid=k.confrelid AND alvo.attnum=k.confkey[1]
          WHERE k.contype='f' AND k.confrelid='public.usuarios'::regclass`)).rows;
        for(const fk of fks){
          if(!fk.simples)throw falha(409,'Dependência de usuário não revisada.');
          if(fk.nspname==='public'&&fk.relname==='perfil_imagens_objetos')continue;
          const filhos=await c.query(`SELECT 1 FROM ${identificador(fk.nspname)}.${identificador(fk.relname)} WHERE ${identificador(fk.attname)}=$1 LIMIT 1`,[id]);
          if(filhos.rows.length)throw falha(409,'Conta de teste possui registros associados.');
        }
        // Arquivo durável substitui o diário ligado por RESTRICT antes do purge.
        await c.query('UPDATE public.contas_teste_imagens SET manifesto=$2::jsonb WHERE registro=$1',[registro,JSON.stringify(objetos)]);
        await c.query('DELETE FROM public.perfil_imagens_objetos WHERE usuario_id=$1',[id]);
        const apagado=await c.query('DELETE FROM public.usuarios WHERE id=$1 AND email=$2 RETURNING id',[id,r.email]);
        if(apagado.rowCount!==1)throw falha(409,'Exclusão de conta não confirmada.');
        await c.query("UPDATE public.contas_teste_imagens SET estado='excluida',excluido_em=clock_timestamp() WHERE registro=$1",[registro]);
        return{estado:'excluida',objetosArquivados:objetos.length};
      });
    },
  });
}
module.exports={criarCicloContasTeste};
