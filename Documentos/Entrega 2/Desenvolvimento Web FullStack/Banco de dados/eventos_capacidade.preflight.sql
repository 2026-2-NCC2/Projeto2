-- PREFLIGHT Etapa 3: somente leitura, executar como postgres no projeto confirmado.
-- Não mostra linhas de usuários. Salvar também eventos_capacidade.verificacao.sql.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS banco,current_user AS usuario,current_setting('server_version_num') AS versao,
 public.eventos_capacidades_v1() AS etapa_instalada,
 current_setting('default_transaction_isolation') AS isolamento_padrao;
SELECT status,count(*) AS quantidade FROM public.inscricoes GROUP BY status;
SELECT count(*) AS grupos_duplicados FROM (
 SELECT usuario_id,evento_id FROM public.inscricoes GROUP BY usuario_id,evento_id HAVING count(*)>1) d;
SELECT conname,pg_get_constraintdef(oid) AS definicao,convalidated,condeferrable
 FROM pg_constraint WHERE conrelid='public.inscricoes'::regclass AND contype IN ('u','f');
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,
 (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid) AS politicas
 FROM pg_class c WHERE c.oid IN ('public.eventos'::regclass,'public.inscricoes'::regclass);
SELECT tgname,tgenabled,pg_get_triggerdef(oid) AS definicao FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN ('public.eventos'::regclass,'public.inscricoes'::regclass);
SELECT p.oid::regprocedure::text AS funcao,pg_get_functiondef(p.oid) AS definicao,p.proacl::text
 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
 ('gerir_evento_v1','eventos_guardar_v1','inscricoes_guardar_evento_v1','inscrever_evento_v1','eventos_capacidades_v1');
SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('eventos','inscricoes') ORDER BY table_name,ordinal_position;
ROLLBACK;
