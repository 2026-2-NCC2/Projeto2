-- TrocaTicket: complemento consolidado da Etapa 4. SOMENTE LEITURA.
-- Executar uma vez no SQL Editor do projeto de destino; exportar o unico
-- resultado em CSV. Nao repetir os blocos estruturais/dados ja confirmados.
-- Nao consulta registros, credenciais, corpos de funcoes ou parametros secretos.
-- Nao identifica sozinho o projeto Supabase: registrar a referencia nao secreta
-- do projeto no painel junto ao CSV. O banco costuma chamar-se postgres.
-- A configuracao de schemas pode nao estar visivel nesta sessao. NULL/vazio
-- exige conferencia do painel Data API; nao significa que a API esteja fechada.
-- O papel atual nao comprova qual papel executou consultas anteriores.
-- Nao reconcilia a importacao: isso exige identificar primeiro a fonte utilizada.

WITH contexto AS (
  SELECT current_database() AS banco,
         current_user::text AS papel,
         current_setting('server_version') AS versao,
         current_setting('server_version_num') AS versao_numerica,
         current_setting('server_encoding') AS codificacao,
         current_setting('TimeZone') AS fuso,
         current_setting('search_path') AS caminho,
         statement_timestamp()::text AS instante,
         NULLIF(btrim(current_setting('pgrst.db_schemas', true)), '') AS schemas
), resultados AS (
  SELECT '01_CONTEXTO'::text AS verificacao,
         'REGISTRAR_E_COMPARAR_COM_PROJETO'::text AS estado,
         jsonb_build_object(
           'banco', banco, 'papel', papel, 'versao', versao,
           'versao_numerica', versao_numerica, 'codificacao', codificacao,
           'fuso', fuso, 'search_path', caminho, 'instante', instante
         )::text AS evidencia,
         'Conferir projeto no painel, compatibilidade PostgreSQL e UTF8; fuso deve orientar os testes de datas, nao ser alterado automaticamente.'::text AS criterio
  FROM contexto
  UNION ALL
  SELECT '02_PAPEL_ATUAL', 'INFORMATIVO_NAO_RETROATIVO',
         jsonb_build_object('papel', c.papel,
                            'superusuario', r.rolsuper,
                            'ignora_rls', r.rolbypassrls)::text,
         'Contextualiza a sessao atual; nao aprova testes de API nem reconcilia os dados.'
  FROM contexto c
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname = c.papel
  UNION ALL
  SELECT '03_SCHEMAS_API',
         CASE WHEN schemas IS NULL THEN 'PENDENTE_PAINEL'
              ELSE 'INDICIO_CONFIRMAR_NO_PAINEL' END,
         jsonb_build_object('configuracao_visivel_na_sessao', schemas)::text,
         'Conferir schemas efetivamente expostos no painel; a sessao SQL pode divergir do processo PostgREST. Nenhuma aprovacao automatica.'
  FROM contexto
)
SELECT verificacao, estado, evidencia, criterio
FROM resultados
ORDER BY verificacao;
