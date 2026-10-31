-- PREPARACAO LOCAL: NAO EXECUTADO. Sem alteracao de tabelas/dados existentes.
-- Instalar somente apos autorizacao e revisao de EXECUTE/default ACLs:
-- acesso pretendido apenas pelo backend service_role, nao anon/authenticated/PUBLIC.
-- O guard abaixo nao substitui a restricao de EXECUTE na futura instalacao.
-- p_organizador_id deve vir de req.usuario.id autenticado, nunca do corpo.
-- Nao comprova identidade administrativa/de organizador por chamada SQL direta.
-- Mesmo contrato MySQL: UPDATE condicional unico, sem transacao de varios passos.
-- Nao verifica prazo/modalidade, nao altera cotacao nem outras propostas.
CREATE FUNCTION public.avaliar_proposta(
  p_proposta_id numeric,
  p_organizador_id bigint,
  p_status text
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $funcao$
DECLARE
  v_afetadas integer;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = 'TA403', MESSAGE = 'Acesso recusado.';
  END IF;
  IF p_organizador_id IS NULL OR p_organizador_id <= 0
     OR p_organizador_id > 9007199254740991 THEN
    RAISE EXCEPTION USING ERRCODE = 'TA403', MESSAGE = 'Ator invalido.';
  END IF;
  IF p_proposta_id IS NULL OR p_proposta_id <= 0
     OR p_proposta_id::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_proposta_id <> pg_catalog.trunc(p_proposta_id)
     OR p_status IS NULL OR p_status COLLATE pg_catalog."C" NOT IN ('Aprovada', 'Recusada') THEN
    RAISE EXCEPTION USING ERRCODE = 'TA400', MESSAGE = 'Entrada invalida.';
  END IF;
  -- Handler aceita Number.isInteger, inclusive acima de safe integer.
  -- A PK INTEGER nao comporta tais IDs: ausencia retorna 0, nao overflow/500.
  IF p_proposta_id > 2147483647 THEN
    RETURN 0;
  END IF;

  UPDATE public.propostas AS p
     SET status = p_status
   WHERE p.id = p_proposta_id::integer
     AND p.status = 'Em avaliação'
     AND EXISTS (
       SELECT 1
         FROM public.cotacoes AS c
         INNER JOIN public.eventos AS e ON e.id = c.evento_id
        WHERE c.id = p.cotacao_id AND e.usuario_id = p_organizador_id
     );
  GET DIAGNOSTICS v_afetadas = ROW_COUNT;
  RETURN v_afetadas;
END;
$funcao$;
-- Erros propagam: PostgreSQL reverte a instrucao/transacao da requisicao.
-- Sem handlers que ocultem erros, retry, idempotencia ou escrita auxiliar.
-- Compilacao, concorrencia real e transporte PostgREST ainda nao validados.
