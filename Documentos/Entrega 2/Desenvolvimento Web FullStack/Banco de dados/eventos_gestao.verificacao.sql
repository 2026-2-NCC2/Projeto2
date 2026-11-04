-- SOMENTE LEITURA. Executar como postgres, no projeto confirmado no Dashboard,
-- antes E depois da migração, com os escritores parados. Salvar os dois JSONs.
-- Uma consulta/snapshot; não chama RPCs de escrita nem mostra linhas de usuários.
WITH tabelas(nome) AS (VALUES ('eventos'),('inscricoes'),('custos_evento'),('cotacoes'),('itens_cotacao'),('propostas')),
documentos(tabela,doc) AS (
  SELECT 'eventos',to_jsonb(e)-ARRAY['versao','criacao_chave','criacao_payload','publicado_em','cancelado_em','encerrado_em'] FROM public.eventos e
  UNION ALL SELECT 'inscricoes',to_jsonb(i)||jsonb_build_object('data_inscricao',extract(epoch FROM i.data_inscricao)) FROM public.inscricoes i
  UNION ALL SELECT 'custos_evento',to_jsonb(c) FROM public.custos_evento c
  UNION ALL SELECT 'cotacoes',to_jsonb(c)||jsonb_build_object('criada_em',extract(epoch FROM c.criada_em)) FROM public.cotacoes c
  UNION ALL SELECT 'itens_cotacao',to_jsonb(i) FROM public.itens_cotacao i
  UNION ALL SELECT 'propostas',to_jsonb(p)||jsonb_build_object('criada_em',extract(epoch FROM p.criada_em)) FROM public.propostas p
), inventario AS (
  SELECT t.nome,count(d.doc) AS quantidade,
    md5(COALESCE(jsonb_agg(d.doc ORDER BY d.doc::text COLLATE pg_catalog."C") FILTER(WHERE d.doc IS NOT NULL),'[]'::jsonb)::text) AS hash
  FROM tabelas t LEFT JOIN documentos d ON d.tabela=t.nome GROUP BY t.nome
)
SELECT jsonb_build_object(
  'contexto',jsonb_build_object('banco',current_database(),'usuario',current_user,'versao',current_setting('server_version_num')),
  'integridade', (SELECT jsonb_object_agg(nome,jsonb_build_object('quantidade',quantidade,'md5',hash)) FROM inventario),
  'estados', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.status COLLATE pg_catalog."C"),'[]'::jsonb)
    FROM (SELECT status,count(*) AS quantidade FROM public.eventos GROUP BY status) s),
  'legados_com_metadados_iniciais', (SELECT count(*) FROM public.eventos e WHERE to_jsonb(e)->>'versao'='1'
    AND to_jsonb(e)->>'criacao_chave' IS NULL AND to_jsonb(e)->>'criacao_payload' IS NULL
    AND to_jsonb(e)->>'publicado_em' IS NULL AND to_jsonb(e)->>'cancelado_em' IS NULL AND to_jsonb(e)->>'encerrado_em' IS NULL),
  'colunas_gestao',(SELECT COALESCE(jsonb_agg(jsonb_build_object('coluna',column_name,'tipo',data_type,'nula',is_nullable,'padrao',column_default) ORDER BY ordinal_position),'[]'::jsonb)
    FROM information_schema.columns WHERE table_schema='public' AND table_name='eventos'
    AND column_name IN ('versao','criacao_chave','criacao_payload','publicado_em','cancelado_em','encerrado_em')),
  'sequencias',(SELECT jsonb_agg(jsonb_build_object('tabela',t.nome,'sequencia',pg_get_serial_sequence('public.'||t.nome,'id'),
    'service_role_usage',has_sequence_privilege('service_role',pg_get_serial_sequence('public.'||t.nome,'id'),'USAGE')) ORDER BY t.nome)
    FROM (VALUES ('eventos'),('inscricoes')) t(nome)),
  'seguranca_tabelas',(SELECT jsonb_agg(jsonb_build_object('tabela',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
    'acl',c.relacl::text,'politicas',(SELECT count(*) FROM pg_policy WHERE polrelid=c.oid)) ORDER BY c.relname)
    FROM pg_class c WHERE c.oid IN ('public.eventos'::regclass,'public.inscricoes'::regclass)),
  'chaves_estrangeiras',(SELECT jsonb_agg(jsonb_build_object('tabela',conrelid::regclass::text,'nome',conname,
    'definicao',pg_get_constraintdef(oid),'validada',convalidated) ORDER BY conrelid::regclass::text,conname)
    FROM pg_constraint WHERE contype='f' AND conrelid IN ('public.eventos'::regclass,'public.inscricoes'::regclass,
      'public.custos_evento'::regclass,'public.cotacoes'::regclass,'public.itens_cotacao'::regclass,'public.propostas'::regclass)),
  'funcoes',(SELECT COALESCE(jsonb_agg(jsonb_build_object('funcao',p.oid::regprocedure::text,'security_definer',p.prosecdef,
    'configuracao',p.proconfig,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'),
    'service_role_grant_option',has_function_privilege('service_role',p.oid,'EXECUTE WITH GRANT OPTION')) ORDER BY p.proname),'[]'::jsonb)
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
      ('eventos_guardar_v1','gerir_evento_v1','inscricoes_guardar_evento_v1','inscrever_evento_v1','eventos_capacidades_v1')),
  'triggers',(SELECT COALESCE(jsonb_agg(jsonb_build_object('tabela',tgrelid::regclass::text,'nome',tgname,'habilitado',tgenabled,
    'definicao',pg_get_triggerdef(oid)) ORDER BY tgname),'[]'::jsonb) FROM pg_trigger
    WHERE NOT tgisinternal AND tgrelid IN ('public.eventos'::regclass,'public.inscricoes'::regclass)),
  'restricao_estados',(SELECT COALESCE(jsonb_agg(jsonb_build_object('nome',conname,'validada',convalidated,'definicao',pg_get_constraintdef(oid))),'[]'::jsonb)
    FROM pg_constraint WHERE conrelid='public.eventos'::regclass AND conname='eventos_ciclo_v1'),
  'indice_idempotencia',(SELECT COALESCE(jsonb_agg(jsonb_build_object('valido',indisvalid,'pronto',indisready,'unico',indisunique,
    'definicao',pg_get_indexdef(indexrelid))),'[]'::jsonb) FROM pg_index WHERE indexrelid=to_regclass('public.eventos_criacao_unica_v1'))
) AS verificacao;
