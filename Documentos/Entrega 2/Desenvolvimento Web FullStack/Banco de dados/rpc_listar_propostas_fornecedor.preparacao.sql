-- Contrato aprovado: ICU do esquema, representante de menor id, ordem por esse id.
-- Instalacao somente em ambiente autorizado. Sem ALTER/GRANT ou ativacao de rotas.
-- Nao afirma equivalencia com general_ci ou entre versoes ICU.
CREATE FUNCTION public.listar_propostas_por_fornecedor(p_fornecedor_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $funcao$
DECLARE
  v record;
  v_categoria text;
  v_bytes bytea;
  v_corte integer;
  v_ok boolean;
  v_resultado jsonb := '[]'::jsonb;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='PF403', MESSAGE='Acesso recusado.';
  END IF;
  -- Identidade fornecida pelo backend confiavel; isto nao autentica um JWT.
  IF p_fornecedor_id IS NULL OR p_fornecedor_id <= 0 OR p_fornecedor_id > 9007199254740991 THEN
    RAISE EXCEPTION USING ERRCODE='PF400', MESSAGE='Identificador invalido.';
  END IF;
  FOR v IN
    WITH propostas_filtradas AS (
      SELECT p.id,p.cotacao_id,p.valor,p.condicoes_pagamento,p.detalhes_tecnicos,
             p.status,p.criada_em,e.nome AS evento_nome
      FROM public.propostas p
      INNER JOIN public.cotacoes c ON c.id=p.cotacao_id
      INNER JOIN public.eventos e ON e.id=c.evento_id
      WHERE p.fornecedor_id=p_fornecedor_id
    ), classificadas AS (
      SELECT i.cotacao_id,i.id,i.categoria,
             row_number() OVER (PARTITION BY i.cotacao_id,
               i.categoria COLLATE public.trocaticket_general_ci ORDER BY i.id) AS posicao
      FROM public.itens_cotacao i
      INNER JOIN (SELECT DISTINCT cotacao_id FROM propostas_filtradas) c ON c.cotacao_id=i.cotacao_id
      WHERE i.categoria IS NOT NULL
    ), categorias AS (
      SELECT cotacao_id,string_agg(categoria,', ' ORDER BY id) AS categoria
      FROM classificadas WHERE posicao=1 GROUP BY cotacao_id
    )
    SELECT p.*,c.categoria FROM propostas_filtradas p
    LEFT JOIN categorias c ON c.cotacao_id=p.cotacao_id
    ORDER BY p.criada_em DESC,p.id DESC
  LOOP
    v_categoria := v.categoria;
    IF v_categoria IS NOT NULL THEN
      v_bytes := pg_catalog.convert_to(v_categoria,'UTF8');
      IF pg_catalog.octet_length(v_bytes)>1048576 THEN
        v_ok := false;
        -- UTF-8 valido precisa descartar no maximo tres bytes no fim do prefixo.
        FOR v_corte IN 0..3 LOOP
          BEGIN
            v_categoria := pg_catalog.convert_from(pg_catalog.substring(v_bytes,1,1048576-v_corte),'UTF8');
            v_ok := true;
            EXIT;
          EXCEPTION WHEN SQLSTATE '22021' THEN
            NULL; -- somente fronteira incompleta; outras falhas propagam.
          END;
        END LOOP;
        IF NOT v_ok THEN RAISE EXCEPTION 'Prefixo UTF-8 invalido'; END IF;
      END IF;
    END IF;
    v_resultado := v_resultado || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id',v.id,'cotacao_id',v.cotacao_id,'valor',v.valor::text,
      'condicoes_pagamento',v.condicoes_pagamento,'detalhes_tecnicos',v.detalhes_tecnicos,
      'status',v.status,'criada_em',pg_catalog.to_char(v.criada_em AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'evento_nome',v.evento_nome,'categoria',v_categoria));
  END LOOP;
  RETURN v_resultado;
END;
$funcao$;
