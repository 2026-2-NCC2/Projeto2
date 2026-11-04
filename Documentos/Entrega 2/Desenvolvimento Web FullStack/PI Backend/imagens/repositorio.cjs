"use strict";
const { conferirReferencia, contexto, falha } = require('./politica.cjs');
const perfis = ['participante', 'organizador', 'fornecedor', 'admin'];

// Pool PostgreSQL explícito, validado pelo inicializador de homologação.
// Sem .env, criação de pool, SQL estrutural, RPC ou fallback MySQL.
function criarRepositorioImagens(pool) {
  async function transacao(id, executar) {
    let cliente, descartar = false;
    try {
      cliente = await pool.connect();
      await cliente.query('BEGIN');
      await cliente.query('SET LOCAL ROLE service_role');
      await cliente.query("SET LOCAL statement_timeout='5s'");
      await cliente.query("SET LOCAL lock_timeout='2s'");
      if (id !== null) {
        if (!Number.isSafeInteger(id) || id <= 0) throw falha(401, 'Conta inválida.');
        const u = await cliente.query('SELECT id,perfil FROM public.usuarios WHERE id=$1 FOR UPDATE', [id]);
        if (!u.rows.length || !perfis.includes(u.rows[0].perfil)) throw falha(401, 'Conta indisponível.');
      }
      const resultado = await executar(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (erro) {
      if (cliente) {
        try { await cliente.query('ROLLBACK'); } catch { descartar = true; }
      }
      if ([400, 401, 403, 409].includes(erro.status)) throw erro;
      if (['23505', '55P03', '40001', '40P01'].includes(erro.code)) throw falha(409, 'Operação concorrente. Consulte suas imagens.');
      throw falha(503, 'Não foi possível confirmar a operação de imagem. Consulte o perfil antes de tentar novamente.');
    } finally { cliente?.release(descartar); }
  }
  function validar(id, tipo) { contexto({ id, perfil: 'participante' }, tipo); }
  async function slot(c, id, tipo) {
    const r = await c.query(`SELECT o.* FROM public.perfil_imagens s
      JOIN public.perfil_imagens_objetos o ON o.operacao=s.objeto_id AND o.usuario_id=s.usuario_id AND o.tipo=s.tipo
      WHERE s.usuario_id=$1 AND s.tipo=$2 AND o.estado='atual'`, [id, tipo]);
    return r.rows[0] || null;
  }
  return Object.freeze({
    async buscar(id, tipo) {
      validar(id, tipo);
      return transacao(id, c => slot(c, id, tipo));
    },
    async reservar(ref) {
      validar(ref.usuario_id, ref.tipo);
      conferirReferencia({ id: ref.usuario_id, perfil: 'participante' }, ref.tipo, ref);
      if (ref.operacao + '.webp' !== ref.caminho.split('/')[1]) throw falha(400, 'Operação inválida.');
      return transacao(ref.usuario_id, async c => {
        // Reserva vencida jamais pode ser confirmada; preserva tombstone.
        await c.query(`UPDATE public.perfil_imagens_objetos SET estado='limpeza',
          limpeza_apos=now()+interval '24 hours', atualizado_em=now(), lease_ate=NULL
          WHERE usuario_id=$1 AND tipo=$2 AND estado='reservado' AND reserva_ate<=now()`, [ref.usuario_id, ref.tipo]);
        const aberta = await c.query(`SELECT 1 FROM public.perfil_imagens_objetos
          WHERE usuario_id=$1 AND tipo=$2 AND estado='reservado'`, [ref.usuario_id, ref.tipo]);
        if (aberta.rows.length) throw falha(409, 'Existe um envio pendente. Consulte suas imagens antes de tentar novamente.');
        await c.query(`INSERT INTO public.perfil_imagens_objetos
          (operacao,usuario_id,tipo,bucket,caminho,mime,tamanho,largura,altura)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ref.operacao, ref.usuario_id, ref.tipo, ref.bucket, ref.caminho, ref.mime, ref.tamanho, ref.largura, ref.altura]);
      });
    },
    async confirmar(id, tipo, operacao) {
      validar(id, tipo);
      return transacao(id, async c => {
        const r = await c.query(`SELECT *,reserva_ate>clock_timestamp() AS vigente FROM public.perfil_imagens_objetos
          WHERE operacao=$1 AND usuario_id=$2 AND tipo=$3 FOR UPDATE`, [operacao, id, tipo]);
        const nova = r.rows[0], atual = await slot(c, id, tipo);
        if (nova?.estado === 'atual' && atual?.operacao === operacao) return;
        if (!nova || nova.estado !== 'reservado' || !nova.vigente) throw falha(409, 'Reserva cancelada ou expirada. Consulte suas imagens.');
        // Índice parcial é imediato; FK do slot é diferida até o commit.
        await c.query(`UPDATE public.perfil_imagens_objetos SET estado='limpeza',
          limpeza_apos=now()+interval '24 hours', atualizado_em=now(), lease_ate=NULL
          WHERE usuario_id=$1 AND tipo=$2 AND estado='atual'`, [id, tipo]);
        await c.query(`UPDATE public.perfil_imagens_objetos SET estado='atual',atualizado_em=now()
          WHERE operacao=$1 AND usuario_id=$2 AND tipo=$3`, [operacao, id, tipo]);
        await c.query(`INSERT INTO public.perfil_imagens(usuario_id,tipo,objeto_id) VALUES($1,$2,$3)
          ON CONFLICT(usuario_id,tipo) DO UPDATE SET objeto_id=EXCLUDED.objeto_id,atualizado_em=now()`, [id, tipo, operacao]);
      });
    },
    async desvincular(id, tipo) {
      validar(id, tipo);
      return transacao(id, async c => {
        await c.query('DELETE FROM public.perfil_imagens WHERE usuario_id=$1 AND tipo=$2', [id, tipo]);
        await c.query(`UPDATE public.perfil_imagens_objetos SET estado='limpeza',limpeza_apos=now()+interval '24 hours',
          atualizado_em=now(),lease_ate=NULL WHERE usuario_id=$1 AND tipo=$2 AND estado IN ('reservado','atual')`, [id, tipo]);
      });
    },
    async reivindicarLimpeza() {
      // Seleção sem locks no diário, depois lock do usuário, depois diário:
      // mesma ordem das operações HTTP. SKIP LOCKED evita disputar contas.
      return transacao(null, async c => {
        const u = await c.query(`SELECT u.id FROM public.usuarios u WHERE EXISTS (
          SELECT 1 FROM public.perfil_imagens_objetos o WHERE o.usuario_id=u.id AND
          ((o.estado='reservado' AND o.reserva_ate<=now()) OR
           (o.estado IN ('limpeza','removido') AND o.limpeza_apos<=now()) OR
           (o.estado='limpando' AND o.lease_ate<=now()))) ORDER BY u.id FOR UPDATE OF u SKIP LOCKED LIMIT 1`);
        if (!u.rows.length) return null;
        const id = u.rows[0].id;
        await c.query(`UPDATE public.perfil_imagens_objetos SET estado='limpeza',
          limpeza_apos=now()+interval '24 hours',atualizado_em=now(),lease_ate=NULL
          WHERE usuario_id=$1 AND estado='reservado' AND reserva_ate<=now()`, [id]);
        const r = await c.query(`SELECT o.* FROM public.perfil_imagens_objetos o WHERE o.usuario_id=$1
          AND ((o.estado IN ('limpeza','removido') AND o.limpeza_apos<=now()) OR (o.estado='limpando' AND o.lease_ate<=now()))
          AND NOT EXISTS (SELECT 1 FROM public.perfil_imagens s WHERE s.objeto_id=o.operacao)
          ORDER BY o.criado_em FOR UPDATE OF o SKIP LOCKED LIMIT 1`, [id]);
        if (!r.rows.length) return null;
        // Usa lease_ate como token de fencing; um worker antigo não conclui
        // tarefa já reivindicada por outro. Não reutilizar caminhos/operacoes.
        const tarefa = r.rows[0];
        const marcada = await c.query(`UPDATE public.perfil_imagens_objetos SET estado='limpando',
          lease_ate=date_trunc('milliseconds',clock_timestamp())+interval '5 minutes',
          limpeza_apos=COALESCE(limpeza_apos,now()),tentativas=tentativas+1,atualizado_em=now()
          WHERE operacao=$1 RETURNING *`, [tarefa.operacao]);
        return { ...marcada.rows[0], lease: marcada.rows[0].lease_ate.toISOString() };
      });
    },
    async concluirLimpeza(operacao, lease) { return finalizar(operacao, lease, true); },
    async adiarLimpeza(operacao, lease) { return finalizar(operacao, lease, false); },
    async listarPendencias() {
      return transacao(null, async c => (await c.query(`SELECT estado,count(*)::integer AS total
        FROM public.perfil_imagens_objetos GROUP BY estado ORDER BY estado`)).rows);
    },
  });
  async function finalizar(operacao, lease, sucesso) {
    if (!lease) throw falha(409, 'Lease de limpeza ausente.');
    return transacao(null, async c => {
      // UPDATE só do diário; nunca volta a adquirir o lock do usuário.
      // Tombstones são revisitados para capturar eventual upload tardio.
      const r = await c.query(`UPDATE public.perfil_imagens_objetos SET estado=$3,lease_ate=NULL,
        limpeza_apos=now()+CASE WHEN $4 THEN interval '24 hours'
          ELSE interval '1 minute' * LEAST(1440,power(2,LEAST(tentativas,10))::integer) END,
        ultimo_erro_codigo=CASE WHEN $4 THEN NULL ELSE 'STORAGE_INDISPONIVEL' END,atualizado_em=now()
        WHERE operacao=$1 AND estado='limpando' AND lease_ate=$2
        AND NOT EXISTS (SELECT 1 FROM public.perfil_imagens s WHERE s.objeto_id=operacao)
        RETURNING operacao`, [operacao, lease, sucesso ? 'removido' : 'limpeza', sucesso]);
      if (!r.rows.length) throw falha(409, 'Lease de limpeza substituído.');
    });
  }
}
module.exports = { criarRepositorioImagens };
