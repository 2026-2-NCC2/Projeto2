-- TrocaTicket: auditoria estrutural, Etapa 4 / parte 1.
-- Referencias: trocaticket_supabase.sql e PI Backend/CONTRATOS.md.
-- Executar MANUALMENTE no SQL Editor do projeto Supabase correto, por blocos.
-- Este arquivo nao foi executado contra nenhum banco. Apenas SELECT/WITH.
-- Nao consulta linhas das tabelas da aplicacao, dados pessoais ou autenticacao.
-- Nomes de colunas sensiveis abaixo sao somente metadados, nunca seus valores.
-- Se faltarem objetos/permissoes, registrar a pendencia; nao corrigir neste arquivo.
-- Resultados vazios podem significar ausencia ou visibilidade insuficiente.
-- O SQL Editor pode usar papel privilegiado: sucesso ali nao comprova acesso da API.
-- Alvo de compatibilidade dos catalogos: PostgreSQL 15 a 18; conferir bloco 01.
-- Nenhuma funcao que avance/redefina sequencias e chamada.
--
-- CONFRONTO ESTATICO COM OS CONTRATOS:
-- usuarios: id, nome(100), email(150) unico, senha(100), perfil enum.
--   Padrao organizador difere do cadastro HTTP, que exige participante explicito.
-- eventos: id, nome(100), data, horario, local(200), categoria(100), publico,
--   descricao, status e usuario_id; categoria/status/descricao permitem nulo.
-- cotacoes: id, evento_id, prazo, modalidade(50), observacoes, status(30), criada_em.
-- custos_evento: id, evento_id, categoria(100), descricao(255), valor_estimado.
-- inscricoes: id, usuario_id, evento_id, data_inscricao, status(30);
--   unicidade do par usuario/evento preserva a protecao contra corrida.
-- itens_cotacao: id, cotacao_id, categoria(100), descricao(255), valor_estimado.
-- propostas: id, cotacao_id, fornecedor_id, valor, condicoes_pagamento,
--   detalhes_tecnicos, status(30), criada_em; sem unicidade fornecedor/cotacao.
-- solicitacoes_acesso: id, usuario_id, perfil_solicitado enum, justificativa,
--   status enum, criada_em; sem unicidade de pendencia por usuario.
-- As oito PKs sao id integer; existem nove FKs e oito indices explicitos.
-- PKs e duas restricoes unicas acrescentam dez indices implicitos no PostgreSQL.
-- CASCADE: evento -> cotacoes/custos; cotacao -> itens; usuario -> solicitacoes.
-- Demais FKs usam NO ACTION, sem diferimento declarado.
-- Enums de perfil solicitante/usuario sao TIPOS DISTINTOS e case-sensitive.
-- Campos monetarios usam numeric(12,2), mas nao ha CHECK de sinal/valor finito.
-- Numeric com escala pode arredondar entrada; validacao estrita deve permanecer.
-- NaN tambem exige cuidado. Propostas hoje aceitam mais de duas casas no handler.
-- Datas/horas exigem conferencia de serializacao; timestamptz(0) usa fuso da sessao.
-- O dump importa timestamps sem offset com sessao UTC; origem precisa ser confirmada.
-- A collation ICU nao deterministica nao equivale perfeitamente a MySQL general_ci.
-- Conferir ICU, ordenacao, igualdade, unicidade e suporte a padroes na versao real.
-- O dump nao define RLS, politicas nem permissoes: estado real permanece PENDENTE.
-- Secret key/service_role pode ignorar RLS; filtros de propriedade continuam essenciais.
-- JWT proprio do TrocaTicket nao cria automaticamente uma sessao Supabase Auth.
-- Operacoes atomicas/locks exigem implementacao futura; chamadas HTTP separadas
-- nao substituem as transacoes atuais de custos, publicacao e analise de acesso.
-- Sintaxe, agregacoes, retornos de gravacao e codigos de erro MySQL nao sao portaveis.
-- Esta auditoria nao testa dados, coercoes, concorrencia, API ou autenticacao real.
--
-- Referencias tecnicas:
-- https://www.postgresql.org/docs/current/datatype-enum.html
-- https://www.postgresql.org/docs/current/datatype-numeric.html
-- https://www.postgresql.org/docs/current/view-pg-sequences.html
-- https://supabase.com/docs/guides/database/postgres/row-level-security

-- 01. Identidade da sessao e versao; sem enderecos, senhas ou parametros privados.
SELECT pg_catalog.current_database() AS banco,
       current_user AS papel_da_sessao,
       pg_catalog.current_setting('server_version') AS versao,
       pg_catalog.current_setting('server_version_num') AS versao_numerica,
       pg_catalog.current_setting('TimeZone') AS fuso,
       pg_catalog.current_setting('server_encoding') AS codificacao,
       pg_catalog.current_setting('search_path') AS caminho_de_esquemas;

-- 02. Presenca das oito tabelas. Conferir presente=true e tipo='r' ou 'p'.
WITH esperadas(tabela) AS (
  VALUES ('usuarios'), ('eventos'), ('cotacoes'), ('custos_evento'),
         ('inscricoes'), ('itens_cotacao'), ('propostas'), ('solicitacoes_acesso')
)
SELECT e.tabela, c.oid IS NOT NULL AS presente, c.relkind AS tipo,
       pg_catalog.pg_get_userbyid(c.relowner) AS proprietario,
       c.relrowsecurity AS rls_habilitada, c.relforcerowsecurity AS rls_forcada
FROM esperadas e
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = e.tabela
ORDER BY e.tabela;

-- 03. Todas as colunas: tipo, nulabilidade, identidade, collation e padrao.
-- Matriz extraida apenas do DDL; padroes devem ser comparados semanticamente,
-- pois o catalogo inclui casts. DEFAULT NULL equivale a omissao em coluna anulavel.
-- identidade 'd' = BY DEFAULT. Padrao nulo no catalogo nao elimina a identidade.
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
         a.attnotnull AS obrigatoria,
         pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS padrao,
         a.attidentity::text AS identidade,
         CASE WHEN co.oid IS NOT NULL THEN nc.nspname || '.' || co.collname END AS colacao
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
  JOIN pg_catalog.pg_namespace nt ON nt.oid = t.typnamespace
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
  LEFT JOIN pg_catalog.pg_collation co ON co.oid = a.attcollation
  LEFT JOIN pg_catalog.pg_namespace nc ON nc.oid = co.collnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND c.relname IN ('usuarios','eventos','cotacoes','custos_evento',
                     'inscricoes','itens_cotacao','propostas','solicitacoes_acesso')
)
SELECT COALESCE(e.tabela, r.tabela) AS tabela, COALESCE(e.coluna, r.coluna) AS coluna,
       e.tipo AS tipo_esperado, r.tipo AS tipo_real,
       e.obrigatoria AS obrigatoria_esperada, r.obrigatoria AS obrigatoria_real,
       e.padrao AS padrao_esperado, r.padrao AS padrao_real,
       e.identidade AS identidade_esperada, r.identidade AS identidade_real,
       e.colacao AS collation_esperada, r.colacao AS collation_real,
       CASE WHEN e.coluna IS NULL THEN 'COLUNA EXTRA'
            WHEN r.coluna IS NULL THEN 'COLUNA AUSENTE'
            WHEN e.tipo IS DISTINCT FROM r.tipo
              OR e.obrigatoria IS DISTINCT FROM r.obrigatoria
              OR e.identidade IS DISTINCT FROM r.identidade
              OR e.colacao IS DISTINCT FROM r.colacao THEN 'DIVERGENCIA ESTRUTURAL'
            ELSE 'CONFERIR PADRAO' END AS resultado
FROM esperadas e FULL JOIN reais r ON r.tabela = e.tabela AND r.coluna = e.coluna
ORDER BY COALESCE(e.tabela, r.tabela), COALESCE(e.ordem, r.ordem);

-- 04. Enums: valores e ordem reais. Esperados tres tipos, nove rotulos no total.
-- usuarios: organizador, fornecedor, participante, admin.
-- perfil_solicitado: organizador, fornecedor. status: pendente, aprovado, rejeitado.
SELECT n.nspname AS esquema, t.typname AS tipo, en.enumsortorder AS ordem, en.enumlabel AS valor
FROM pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
JOIN pg_catalog.pg_enum en ON en.enumtypid = t.oid
WHERE n.nspname = 'public' AND t.typname IN ('usuarios_perfil_enum',
  'solicitacoes_acesso_perfil_solicitado_enum','solicitacoes_acesso_status_enum')
ORDER BY t.typname, en.enumsortorder;

-- 05. PKs, unicidades, FKs e CHECKs, incluindo dependencias externas que apontem
-- para as oito tabelas. Esperados 8 PKs, 2 unicas, 9 FKs e nenhum CHECK no dump.
WITH alvo AS (
  SELECT c.oid FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('usuarios','eventos','cotacoes','custos_evento',
    'inscricoes','itens_cotacao','propostas','solicitacoes_acesso')
)
SELECT con.conrelid::regclass AS tabela, con.conname AS restricao, con.contype AS tipo,
       pg_catalog.pg_get_constraintdef(con.oid, true) AS definicao,
       con.convalidated AS validada, con.condeferrable AS diferivel,
       con.condeferred AS inicialmente_diferida
FROM pg_catalog.pg_constraint con
WHERE con.conrelid IN (SELECT oid FROM alvo) OR con.confrelid IN (SELECT oid FROM alvo)
ORDER BY con.conrelid::regclass::text, con.contype, con.conname;

-- 06. Indices reais, inclusive os implicitos de PK/UNIQUE. Esperados 18 no dump.
-- Ausencia de indice extra para status/prazo/ordenacao nao muda o contrato;
-- desempenho deve ser medido posteriormente, sem criar indices nesta auditoria.
SELECT c.relname AS tabela, ix.relname AS indice, am.amname AS metodo,
       i.indisprimary AS primario, i.indisunique AS unico,
       i.indisvalid AS valido, i.indisready AS pronto,
       pg_catalog.pg_get_indexdef(i.indexrelid) AS definicao
FROM pg_catalog.pg_index i
JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_class ix ON ix.oid = i.indexrelid
JOIN pg_catalog.pg_am am ON am.oid = ix.relam
WHERE n.nspname = 'public' AND c.relname IN ('usuarios','eventos','cotacoes','custos_evento',
  'inscricoes','itens_cotacao','propostas','solicitacoes_acesso')
ORDER BY c.relname, ix.relname;

-- 07. Indice com as colunas da FK como prefixo, sem predicado parcial.
-- PostgreSQL nao cria automaticamente os indices do lado referenciador.
SELECT fk.conrelid::regclass AS tabela, fk.conname AS chave_estrangeira,
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class ix ON ix.oid = i.indexrelid
         JOIN pg_catalog.pg_am am ON am.oid = ix.relam
         WHERE i.indrelid = fk.conrelid AND i.indisvalid AND i.indisready
           AND i.indpred IS NULL AND am.amname = 'btree'
           AND ARRAY(SELECT x.coluna FROM unnest(i.indkey) WITH ORDINALITY x(coluna, posicao)
                     WHERE x.posicao <= cardinality(fk.conkey) ORDER BY x.posicao) = fk.conkey
       ) AS possui_indice_de_prefixo
FROM pg_catalog.pg_constraint fk
JOIN pg_catalog.pg_class c ON c.oid = fk.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE fk.contype = 'f' AND n.nspname = 'public'
  AND c.relname IN ('usuarios','eventos','cotacoes','custos_evento',
    'inscricoes','itens_cotacao','propostas','solicitacoes_acesso')
ORDER BY c.relname, fk.conname;

-- 08. Sequencias associadas a id e seus parametros, sem consumir IDs.
-- inicio esperado: cotacoes=6, custos=7, eventos=11, inscricoes=3,
-- itens=22, propostas=3, solicitacoes=6, usuarios=10.
-- last_value pode ser NULL por falta de privilegio ou sequencia nunca usada.
-- Cache pode fazer last_value superar o ultimo ID entregue. Nao prova o proximo ID.
-- Alinhamento com registros apos importacao fica pendente; nenhum dado e lido aqui.
WITH esperadas(tabela, inicio) AS (
  VALUES ('usuarios',10), ('eventos',11), ('cotacoes',6), ('custos_evento',7),
         ('inscricoes',3), ('itens_cotacao',22), ('propostas',3), ('solicitacoes_acesso',6)
), associadas AS (
  SELECT e.*, c.oid AS tabela_oid,
         CASE WHEN a.attnum IS NOT NULL THEN
           pg_catalog.pg_get_serial_sequence(pg_catalog.format('%I.%I', n.nspname, c.relname), 'id')
         END AS sequencia
  FROM esperadas e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = e.tabela AND c.relkind IN ('r','p')
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped
)
SELECT a.tabela, a.inicio AS inicio_no_dump, a.sequencia,
       s.data_type, s.start_value, s.min_value, s.max_value,
       s.increment_by, s.cycle, s.cache_size, s.last_value,
       CASE WHEN a.tabela_oid IS NULL THEN 'TABELA AUSENTE'
            WHEN a.sequencia IS NULL THEN 'SEQUENCIA AUSENTE'
            WHEN s.start_value IS DISTINCT FROM a.inicio OR s.increment_by <> 1 OR s.cycle
              THEN 'DIVERGENCIA DE PARAMETROS' ELSE 'CONFERIR ESTADO/PRIVILEGIOS' END AS resultado
FROM associadas a
LEFT JOIN pg_catalog.pg_sequences s ON pg_catalog.to_regclass(pg_catalog.format('%I.%I',s.schemaname,s.sequencename))
                                    = pg_catalog.to_regclass(a.sequencia)
ORDER BY a.tabela;

-- 09. Collation ICU do dump. JSON de catalogo evita depender da renomeacao
-- colliculocale/colllocale entre versoes. Nao consulta textos da aplicacao.
SELECT co.collname, co.collprovider, co.collisdeterministic,
       COALESCE(pg_catalog.to_jsonb(co)->>'colllocale',
                pg_catalog.to_jsonb(co)->>'colliculocale', co.collcollate) AS locale,
       co.collversion AS versao_registrada,
       pg_catalog.pg_collation_actual_version(co.oid) AS versao_efetiva
FROM pg_catalog.pg_collation co
JOIN pg_catalog.pg_namespace n ON n.oid = co.collnamespace
WHERE n.nspname = 'public' AND co.collname = 'trocaticket_general_ci';

-- 10. RLS e politicas. Resumo nao demonstra adequacao das expressoes.
-- Nao imprime literais potencialmente privados presentes em expressoes de politica.
-- Politicas baseadas em auth.uid() nao reconhecem automaticamente o JWT proprio.
SELECT p.tablename AS tabela, p.policyname AS politica, p.permissive,
       p.roles AS papeis, p.cmd AS comando,
       p.qual IS NOT NULL AS tem_condicao_de_visibilidade,
       p.with_check IS NOT NULL AS tem_condicao_de_validacao,
       (COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,'')) LIKE '%auth.uid()%'
         AS menciona_auth_uid
FROM pg_catalog.pg_policies p
WHERE p.schemaname = 'public' AND p.tablename IN ('usuarios','eventos','cotacoes','custos_evento',
  'inscricoes','itens_cotacao','propostas','solicitacoes_acesso')
ORDER BY p.tablename, p.policyname;

-- 11. Papeis de infraestrutura, sem colunas de autenticacao.
-- BYPASSRLS/superusuario e propriedade da tabela afetam a aplicacao das politicas.
SELECT r.rolname AS papel, r.rolsuper AS superusuario, r.rolbypassrls AS ignora_rls,
       r.rolinherit AS herda_permissoes, r.rolcanlogin AS permite_login
FROM pg_catalog.pg_roles r
WHERE r.rolname IN ('anon','authenticated','service_role','authenticator','postgres')
ORDER BY r.rolname;

-- 12. Permissoes efetivas por tabela, incluindo heranca e ACL PUBLIC.
-- Strings de privilegios sao argumentos de auditoria, nao comandos executaveis.
-- Permissao de tabela nao comprova acesso a linhas: RLS e camada adicional.
SELECT c.relname AS tabela, r.rolname AS papel,
       pg_catalog.has_schema_privilege(r.oid, n.oid, 'USAGE') AS uso_do_esquema,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT') AS leitura,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'INSERT') AS inclusao,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'UPDATE') AS edicao,
       pg_catalog.has_table_privilege(r.oid, c.oid, 'DELETE') AS exclusao
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  AND c.relname IN ('usuarios','eventos','cotacoes','custos_evento',
    'inscricoes','itens_cotacao','propostas','solicitacoes_acesso')
  AND r.rolname IN ('anon','authenticated','service_role')
ORDER BY c.relname, r.rolname;

-- 13. Permissoes de colunas sensiveis; SOMENTE nomes e booleanos, nenhum valor.
-- Verificar especialmente anon/authenticated, alem das politicas do bloco 10.
SELECT a.attname AS coluna, r.rolname AS papel,
       pg_catalog.has_column_privilege(r.oid, c.oid, a.attnum, 'SELECT') AS pode_ler_coluna
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname = 'public' AND c.relname = 'usuarios' AND a.attname IN ('nome','email','senha')
  AND r.rolname IN ('anon','authenticated','service_role')
ORDER BY a.attname, r.rolname;

-- 14. Permissoes efetivas nas sequencias das oito tabelas.
WITH sequencias AS (
  SELECT c.relname AS tabela,
         CASE WHEN a.attnum IS NOT NULL THEN
           pg_catalog.to_regclass(pg_catalog.pg_get_serial_sequence(pg_catalog.format('%I.%I',n.nspname,c.relname),'id'))
         END AS oid
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
    AND c.relname IN ('usuarios','eventos','cotacoes','custos_evento',
      'inscricoes','itens_cotacao','propostas','solicitacoes_acesso')
)
SELECT s.tabela, s.oid::regclass AS sequencia, r.rolname AS papel,
       pg_catalog.has_sequence_privilege(r.oid, s.oid, 'USAGE') AS uso,
       pg_catalog.has_sequence_privilege(r.oid, s.oid, 'SELECT') AS leitura,
       pg_catalog.has_sequence_privilege(r.oid, s.oid, 'UPDATE') AS ajuste
FROM sequencias s CROSS JOIN pg_catalog.pg_roles r
WHERE r.rolname IN ('anon','authenticated','service_role')
ORDER BY s.tabela, r.rolname;

-- 15. ACLs padrao de public/global: contexto para objetos futuros, nao para
-- os objetos ja existentes. Tambem podem existir privilegios herdados de papeis.
SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS criador,
       COALESCE(n.nspname,'GLOBAL') AS esquema, d.defaclobjtype AS tipo_objeto,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS destinatario,
       a.privilege_type AS privilegio, a.is_grantable AS pode_repassar
FROM pg_catalog.pg_default_acl d
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
WHERE d.defaclnamespace = 0 OR n.nspname = 'public'
ORDER BY criador, esquema, tipo_objeto, destinatario, privilegio;

-- 16. Triggers adicionais podem modificar o contrato mesmo sem mudanca nas colunas.
-- Nao le argumentos de triggers, corpo de funcoes ou conteudo dos registros.
SELECT c.relname AS tabela, tg.tgname AS gatilho, tg.tgenabled AS habilitacao,
       fnn.nspname AS esquema_funcao, fn.proname AS funcao,
       fn.prosecdef AS executa_com_privilegios_do_dono
FROM pg_catalog.pg_trigger tg
JOIN pg_catalog.pg_class c ON c.oid = tg.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_proc fn ON fn.oid = tg.tgfoid
JOIN pg_catalog.pg_namespace fnn ON fnn.oid = fn.pronamespace
WHERE NOT tg.tgisinternal AND n.nspname = 'public'
  AND c.relname IN ('usuarios','eventos','cotacoes','custos_evento',
    'inscricoes','itens_cotacao','propostas','solicitacoes_acesso')
ORDER BY c.relname, tg.tgname;
