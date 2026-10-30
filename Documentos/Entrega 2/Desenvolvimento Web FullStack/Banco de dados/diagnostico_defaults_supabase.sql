-- TrocaTicket: diagnostico conservador dos defaults, Etapa 4 ainda PENDENTE.
-- Preserva auditoria_supabase.sql; matriz de 51 colunas copiada daquele arquivo.
-- No SQL Editor do projeto correto, executar TODO este arquivo como uma consulta.
-- Esperadas 51 linhas; conferir total_colunas e colunas_pendentes na saida.
-- Nenhuma tabela de negocio e lida. Nao avalia as expressoes de default.
-- Nao consome IDs, chama funcoes de default ou executa SQL dinamico.
-- Expressoes de usuarios.nome/email/senha sao ocultadas caso haja default inesperado.
--
-- A classificacao original CONFERIR PADRAO era o ELSE fixo do CASE estrutural:
-- nao indicava uma comparacao de defaults nem comprovava divergencia.
-- Esta consulta aceita somente equivalencias demonstraveis por formas conhecidas:
--  * ausencia de default e NULL tipado/nao tipado;
--  * literais iguais com casts conhecidos sem modificador de tamanho/precisao;
--  * parenteses externos balanceados em torno dessas formas atomicas;
--  * CURRENT_TIMESTAMP, now() e transaction_timestamp() de pg_catalog;
--  * CURRENT_TIMESTAMP(0), pois os timestamps esperados possuem precisao zero;
--  * identidade BY DEFAULT mesmo sem expressao em pg_attrdef.
-- Nao ignora maiusculas, acentos, espacos internos, string vazia ou texto 'NULL'.
-- Nao remove casts arbitrarios: casts com tamanho/precisao podem mudar o valor.
-- clock_timestamp() e statement_timestamp() nao equivalem ao inicio da transacao.
-- Expressoes compostas, E-strings, casts adicionais ou funcoes proprias ficam
-- como INVESTIGAR, sem serem declaradas iguais ou diferentes automaticamente.
-- Nenhuma funcao de negocio e executada para resolver uma equivalencia.
--
-- Interpretacao:
-- EQUIVALENTE_*: default correspondente dentro das regras acima.
-- DIVERGENCIA_*: diferenca reconhecida de valor, geracao de ID ou estrutura.
-- INVESTIGAR_*: equivalencia nao comprovada; revisar manualmente sem executar default.
-- A ausencia de pendencias neste diagnostico NAO encerra a Etapa 4:
-- ainda conferir FKs, indices, sequencias, permissoes, RLS e demais blocos originais.
-- Validacao de sintaxe/comportamento real permanece para execucao manual.
-- Referencias:
-- https://www.postgresql.org/docs/current/ddl-default.html
-- https://www.postgresql.org/docs/current/functions-datetime.html

WITH esperadas(tabela, coluna, ordem, tipo, obrigatoria, padrao, identidade, colacao) AS (
  VALUES
  ('cotacoes', 'id', 1, 'integer', true, NULL, 'd', NULL),
  ('cotacoes', 'evento_id', 2, 'integer', true, NULL, '', NULL),
  ('cotacoes', 'prazo', 3, 'date', true, NULL, '', NULL),
  ('cotacoes', 'modalidade', 4, 'character varying(50)', true, '''Fechada''', '', 'public.trocaticket_general_ci'),
  ('cotacoes', 'observacoes', 5, 'text', false, 'NULL', '', 'public.trocaticket_general_ci'),
  ('cotacoes', 'status', 6, 'character varying(30)', true, '''Aberta''', '', 'public.trocaticket_general_ci'),
  ('cotacoes', 'criada_em', 7, 'timestamp(0) with time zone', true, 'CURRENT_TIMESTAMP', '', NULL),
  ('custos_evento', 'id', 1, 'integer', true, NULL, 'd', NULL),
  ('custos_evento', 'evento_id', 2, 'integer', true, NULL, '', NULL),
  ('custos_evento', 'categoria', 3, 'character varying(100)', true, NULL, '', 'public.trocaticket_general_ci'),
  ('custos_evento', 'descricao', 4, 'character varying(255)', true, NULL, '', 'public.trocaticket_general_ci'),
  ('custos_evento', 'valor_estimado', 5, 'numeric(12,2)', true, NULL, '', NULL),
  ('eventos', 'id', 1, 'integer', true, NULL, 'd', NULL),
  ('eventos', 'nome', 2, 'character varying(100)', true, NULL, '', 'public.trocaticket_general_ci'),
  ('eventos', 'data', 3, 'date', true, NULL, '', NULL),
  ('eventos', 'horario', 4, 'time(0) without time zone', true, NULL, '', NULL),
  ('eventos', 'local', 5, 'character varying(200)', true, NULL, '', 'public.trocaticket_general_ci'),
  ('eventos', 'categoria', 6, 'character varying(100)', false, '''Corporativo''', '', 'public.trocaticket_general_ci'),
  ('eventos', 'publico', 7, 'integer', true, NULL, '', NULL),
  ('eventos', 'descricao', 8, 'text', false, 'NULL', '', 'public.trocaticket_general_ci'),
  ('eventos', 'status', 9, 'character varying(50)', false, '''Em planejamento''', '', 'public.trocaticket_general_ci'),
  ('eventos', 'usuario_id', 10, 'integer', true, NULL, '', NULL),
  ('inscricoes', 'id', 1, 'integer', true, NULL, 'd', NULL),
  ('inscricoes', 'usuario_id', 2, 'integer', true, NULL, '', NULL),
  ('inscricoes', 'evento_id', 3, 'integer', true, NULL, '', NULL),
  ('inscricoes', 'data_inscricao', 4, 'timestamp(0) with time zone', true, 'CURRENT_TIMESTAMP', '', NULL),
  ('inscricoes', 'status', 5, 'character varying(30)', true, '''Confirmada''', '', 'public.trocaticket_general_ci'),
  ('itens_cotacao', 'id', 1, 'integer', true, NULL, 'd', NULL),
  ('itens_cotacao', 'cotacao_id', 2, 'integer', true, NULL, '', NULL),
  ('itens_cotacao', 'categoria', 3, 'character varying(100)', true, NULL, '', 'public.trocaticket_general_ci'),
  ('itens_cotacao', 'descricao', 4, 'character varying(255)', true, NULL, '', 'public.trocaticket_general_ci'),
  ('itens_cotacao', 'valor_estimado', 5, 'numeric(12,2)', true, NULL, '', NULL),
  ('propostas', 'id', 1, 'integer', true, NULL, 'd', NULL),
  ('propostas', 'cotacao_id', 2, 'integer', true, NULL, '', NULL),
  ('propostas', 'fornecedor_id', 3, 'integer', true, NULL, '', NULL),
  ('propostas', 'valor', 4, 'numeric(12,2)', true, NULL, '', NULL),
  ('propostas', 'condicoes_pagamento', 5, 'text', true, NULL, '', 'public.trocaticket_general_ci'),
  ('propostas', 'detalhes_tecnicos', 6, 'text', true, NULL, '', 'public.trocaticket_general_ci'),
  ('propostas', 'status', 7, 'character varying(30)', true, '''Em avaliação''', '', 'public.trocaticket_general_ci'),
  ('propostas', 'criada_em', 8, 'timestamp(0) with time zone', true, 'CURRENT_TIMESTAMP', '', NULL),
  ('solicitacoes_acesso', 'id', 1, 'integer', true, NULL, 'd', NULL),
  ('solicitacoes_acesso', 'usuario_id', 2, 'integer', true, NULL, '', NULL),
  ('solicitacoes_acesso', 'perfil_solicitado', 3, 'public.solicitacoes_acesso_perfil_solicitado_enum', true, NULL, '', NULL),
  ('solicitacoes_acesso', 'justificativa', 4, 'text', true, NULL, '', 'public.trocaticket_general_ci'),
  ('solicitacoes_acesso', 'status', 5, 'public.solicitacoes_acesso_status_enum', true, '''pendente''', '', NULL),
  ('solicitacoes_acesso', 'criada_em', 6, 'timestamp(0) with time zone', true, 'CURRENT_TIMESTAMP', '', NULL),
  ('usuarios', 'id', 1, 'integer', true, NULL, 'd', NULL),
  ('usuarios', 'nome', 2, 'character varying(100)', true, NULL, '', 'public.trocaticket_general_ci'),
  ('usuarios', 'email', 3, 'character varying(150)', true, NULL, '', 'public.trocaticket_general_ci'),
  ('usuarios', 'senha', 4, 'character varying(100)', true, NULL, '', 'public.trocaticket_general_ci'),
  ('usuarios', 'perfil', 5, 'public.usuarios_perfil_enum', true, '''organizador''', '', NULL)
), reais AS (
  SELECT c.relname::text AS tabela, a.attname::text AS coluna, a.attnum AS ordem,
         CASE WHEN t.typtype = 'e' THEN nt.nspname || '.' || t.typname
              ELSE pg_catalog.format_type(a.atttypid, a.atttypmod) END AS tipo,
         a.attnotnull AS obrigatoria, a.attidentity::text AS identidade,
         CASE WHEN co.oid IS NOT NULL THEN nc.nspname || '.' || co.collname END AS colacao,
         d.oid IS NOT NULL AS possui_default,
         pg_catalog.pg_get_expr(d.adbin, d.adrelid, false) AS padrao,
         ARRAY[t.typname::text, pg_catalog.quote_ident(t.typname),
               nt.nspname || '.' || t.typname, pg_catalog.format('%I.%I',nt.nspname,t.typname)]
           || CASE t.typname
                WHEN 'varchar' THEN ARRAY['character varying','text','pg_catalog.text']
                WHEN 'text' THEN ARRAY['character varying','varchar','pg_catalog.varchar']
                WHEN 'int4' THEN ARRAY['integer']
                WHEN 'numeric' THEN ARRAY['decimal']
                WHEN 'timestamptz' THEN ARRAY['timestamp with time zone']
                WHEN 'time' THEN ARRAY['time without time zone']
                ELSE ARRAY[]::text[] END AS casts_permitidos,
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_depend dep
           JOIN pg_catalog.pg_proc fn ON fn.oid = dep.refobjid
           JOIN pg_catalog.pg_namespace nf ON nf.oid = fn.pronamespace
           WHERE dep.classid = 'pg_catalog.pg_attrdef'::regclass AND dep.objid = d.oid
             AND dep.refclassid = 'pg_catalog.pg_proc'::regclass AND nf.nspname <> 'pg_catalog'
         ) AS depende_de_funcao_propria
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
  JOIN pg_catalog.pg_namespace nt ON nt.oid = t.typnamespace
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  LEFT JOIN pg_catalog.pg_collation co ON co.oid = a.attcollation
  LEFT JOIN pg_catalog.pg_namespace nc ON nc.oid = co.collnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
    AND c.relname IN ('usuarios','eventos','cotacoes','custos_evento',
      'inscricoes','itens_cotacao','propostas','solicitacoes_acesso')
), comparadas AS (
  SELECT COALESCE(e.tabela,r.tabela) AS tabela, COALESCE(e.coluna,r.coluna) AS coluna,
         COALESCE(e.ordem,r.ordem) AS ordem, e.coluna IS NOT NULL AS esperada,
         r.coluna IS NOT NULL AS presente,
         e.tipo AS tipo_esperado, r.tipo AS tipo_real,
         e.obrigatoria AS obrigatoria_esperada, r.obrigatoria AS obrigatoria_real,
         e.identidade AS identidade_esperada, r.identidade AS identidade_real,
         e.colacao AS colacao_esperada, r.colacao AS colacao_real,
         e.padrao AS padrao_esperado, r.padrao AS padrao_real,
         r.possui_default, r.casts_permitidos, r.depende_de_funcao_propria,
         CASE WHEN e.identidade = 'd' THEN 'IDENTIDADE'
              WHEN e.padrao IS NULL OR e.padrao = 'NULL' THEN 'SEM_VALOR'
              WHEN e.padrao = 'CURRENT_TIMESTAMP' THEN 'INSTANTE_TRANSACAO'
              ELSE 'LITERAL' END AS classe_esperada
  FROM esperadas e FULL JOIN reais r ON r.tabela = e.tabela AND r.coluna = e.coluna
), reconhecidas AS (
  SELECT c.*,
         pg_catalog.regexp_match(pg_catalog.btrim(padrao_real) COLLATE pg_catalog."C",
           $rx$^(\(*)[[:space:]]*('(?:[^']|'')*')[[:space:]]*(?:::[[:space:]]*([[:alnum:]_".[:space:]]+))?[[:space:]]*(\)*)$$rx$) AS literal,
         pg_catalog.regexp_match(pg_catalog.btrim(padrao_real) COLLATE pg_catalog."C",
           $rx$^(\(*)[[:space:]]*(NULL)[[:space:]]*(?:::[[:space:]]*([[:alnum:]_".[:space:]]+))?[[:space:]]*(\)*)$$rx$, 'i') AS nulo,
         pg_catalog.regexp_match(pg_catalog.btrim(padrao_real) COLLATE pg_catalog."C",
           $rx$^(\(*)[[:space:]]*(CURRENT_TIMESTAMP(?:[[:space:]]*\([[:space:]]*0[[:space:]]*\))?|(?:(?:pg_catalog|"pg_catalog")\.)?(?:now|transaction_timestamp|statement_timestamp|clock_timestamp)[[:space:]]*\([[:space:]]*\))[[:space:]]*(\)*)$$rx$, 'i') AS instante,
         pg_catalog.regexp_match(pg_catalog.btrim(padrao_real) COLLATE pg_catalog."C",
           $rx$^(\(*)[[:space:]]*([+-]?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)[[:space:]]*(?:::[[:space:]]*([[:alnum:]_".[:space:]]+))?[[:space:]]*(\)*)$$rx$) AS numero
  FROM comparadas c
), normalizadas AS (
  SELECT r.*,
         CASE WHEN NOT possui_default THEN 'SEM_VALOR'
              WHEN depende_de_funcao_propria THEN 'EXPRESSAO_DESCONHECIDA'
              WHEN nulo IS NOT NULL AND length(nulo[1]) = length(nulo[4])
                AND (nulo[3] IS NULL OR pg_catalog.btrim(nulo[3]) COLLATE pg_catalog."C" = ANY(casts_permitidos)) THEN 'SEM_VALOR'
              WHEN literal IS NOT NULL AND length(literal[1]) = length(literal[4])
                AND (literal[3] IS NULL OR pg_catalog.btrim(literal[3]) COLLATE pg_catalog."C" = ANY(casts_permitidos)) THEN 'LITERAL'
              WHEN numero IS NOT NULL AND length(numero[1]) = length(numero[4])
                AND (numero[3] IS NULL OR pg_catalog.btrim(numero[3]) COLLATE pg_catalog."C" = ANY(casts_permitidos)) THEN 'NUMERO'
              WHEN instante IS NOT NULL AND length(instante[1]) = length(instante[3]) THEN
                CASE WHEN lower(instante[2]) LIKE '%statement_timestamp%' THEN 'INSTANTE_COMANDO'
                     WHEN lower(instante[2]) LIKE '%clock_timestamp%' THEN 'INSTANTE_RELOGIO'
                     WHEN lower(instante[2]) LIKE '%current_timestamp(%'
                       AND tipo_real <> 'timestamp(0) with time zone' THEN 'EXPRESSAO_DESCONHECIDA'
                     ELSE 'INSTANTE_TRANSACAO' END
              ELSE 'EXPRESSAO_DESCONHECIDA' END AS classe_real
  FROM reconhecidas r
), classificadas AS (
  SELECT n.*,
         CASE WHEN NOT esperada THEN 'DIVERGENCIA_COLUNA_EXTRA'
              WHEN NOT presente THEN 'DIVERGENCIA_COLUNA_AUSENTE'
              WHEN tipo_esperado COLLATE pg_catalog."C" IS DISTINCT FROM tipo_real COLLATE pg_catalog."C"
                OR obrigatoria_esperada IS DISTINCT FROM obrigatoria_real
                OR colacao_esperada COLLATE pg_catalog."C" IS DISTINCT FROM colacao_real COLLATE pg_catalog."C"
                THEN 'DIVERGENCIA_ESTRUTURAL'
              WHEN identidade_esperada IS DISTINCT FROM identidade_real THEN 'DIVERGENCIA_IDENTIDADE'
              WHEN classe_esperada = 'IDENTIDADE' AND NOT possui_default THEN 'EQUIVALENTE_IDENTIDADE'
              WHEN classe_esperada = 'IDENTIDADE' THEN 'INVESTIGAR_IDENTIDADE'
              WHEN classe_real = 'EXPRESSAO_DESCONHECIDA' THEN 'INVESTIGAR_EXPRESSAO'
              WHEN classe_esperada = 'SEM_VALOR' AND classe_real = 'SEM_VALOR' THEN 'EQUIVALENTE_NULO_OU_AUSENTE'
              WHEN classe_esperada = 'INSTANTE_TRANSACAO' AND classe_real = 'INSTANTE_TRANSACAO' THEN 'EQUIVALENTE_INSTANTE_TRANSACAO'
              WHEN classe_esperada = 'LITERAL' AND classe_real = 'LITERAL'
                AND padrao_esperado COLLATE pg_catalog."C" = literal[2] COLLATE pg_catalog."C" THEN 'EQUIVALENTE_LITERAL'
              ELSE 'DIVERGENCIA_DEFAULT' END AS resultado
  FROM normalizadas n
)
SELECT tabela, coluna, padrao_esperado,
       CASE WHEN tabela = 'usuarios' AND coluna IN ('nome','email','senha') AND possui_default
              THEN '[EXPRESSAO OCULTA; REVISAR SOMENTE LOCALMENTE]'
            ELSE padrao_real END AS padrao_real,
       identidade_esperada, identidade_real, possui_default,
       classe_esperada, classe_real, depende_de_funcao_propria, resultado,
       count(*) OVER () AS total_colunas,
       count(*) FILTER (WHERE resultado NOT LIKE 'EQUIVALENTE_%') OVER () AS colunas_pendentes
FROM classificadas
ORDER BY tabela, ordem;
