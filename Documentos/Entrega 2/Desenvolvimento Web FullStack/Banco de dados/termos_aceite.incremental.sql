-- PROPOSTA MANUAL. Não executar sem autorização específica.
-- Uma aplicação transacional. Nenhum aceite retroativo; minuta INATIVA.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog;
-- A função auxiliar de bloqueio será propriedade do executor postgres.
DO $$ BEGIN
 IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
 RAISE EXCEPTION 'Executar como postgres com bypass RLS, após preflight autorizado.';
 END IF;
 IF current_setting('server_version_num')::integer NOT BETWEEN 150000 AND 189999 THEN
 RAISE EXCEPTION 'Versão PostgreSQL não revisada.';
 END IF;
 IF to_regclass('public.termos_documentos') IS NOT NULL OR to_regclass('public.termos_aceites') IS NOT NULL OR
 to_regprocedure('public.cadastrar_usuario_termos_v1(text,text,text,text,text,text)') IS NOT NULL OR
 to_regprocedure('public.termos_publicacao_bloquear_v1(text,text,text)') IS NOT NULL THEN
 RAISE EXCEPTION 'Objetos preexistentes; não reaplicar nem substituir automaticamente.';
 END IF;
END $$;
CREATE TABLE public.termos_documentos (
 documento_id text NOT NULL CHECK(documento_id='termos-uso'),
 versao text NOT NULL CHECK(length(versao) BETWEEN 1 AND 80),
 hash text NOT NULL CHECK(hash ~ '^[0-9a-f]{64}$'),
 conteudo text NOT NULL CHECK(octet_length(conteudo)<=100000),
 ativo boolean NOT NULL DEFAULT false,
 aprovado_em timestamptz,
 aprovacao_referencia text,
 PRIMARY KEY(documento_id,versao),
 UNIQUE(documento_id,versao,hash),
 CHECK(hash=encode(sha256(convert_to(conteudo,'UTF8')),'hex')),
 CHECK(NOT ativo OR (aprovado_em IS NOT NULL AND length(trim(aprovacao_referencia))>0
   AND (conteudo::jsonb)->>'estado'='aprovado' AND length(trim((conteudo::jsonb)->>'aprovacao'))>0) IS TRUE),
 CHECK(((conteudo::jsonb)->>'id'=documento_id AND (conteudo::jsonb)->>'versao'=versao) IS TRUE)
);
CREATE UNIQUE INDEX termos_documento_vigente_unico ON public.termos_documentos(ativo) WHERE ativo;
CREATE TABLE public.termos_aceites (
 usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
 documento_id text NOT NULL,
 versao text NOT NULL,
 hash text NOT NULL,
 aceito_em timestamptz NOT NULL DEFAULT clock_timestamp(),
 fluxo text NOT NULL CHECK(fluxo='cadastro'),
 PRIMARY KEY(usuario_id,documento_id,versao),
 FOREIGN KEY(documento_id,versao,hash) REFERENCES public.termos_documentos(documento_id,versao,hash) ON DELETE RESTRICT
);
-- PK começa por usuario_id: atende a consulta de aceites do próprio titular.
ALTER TABLE public.termos_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.termos_documentos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.termos_aceites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.termos_aceites FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.termos_documentos,public.termos_aceites FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.termos_documentos TO service_role;
GRANT SELECT,INSERT ON public.termos_aceites TO service_role;
-- FOR SHARE exige UPDATE; não conceder edição do documento à service_role.
-- Auxiliar restrita: somente leitura/bloqueio, sem SQL dinâmico nem escrita.
CREATE FUNCTION public.termos_publicacao_bloquear_v1(p_documento text,p_versao text,p_hash text)
RETURNS public.termos_documentos LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $lock$
DECLARE doc public.termos_documentos%ROWTYPE;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
 RAISE EXCEPTION 'Acesso recusado.' USING ERRCODE='42501'; END IF;
 SELECT * INTO doc FROM public.termos_documentos WHERE documento_id=p_documento AND versao=p_versao AND hash=p_hash AND ativo FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Versão dos Termos indisponível.' USING ERRCODE='PT409'; END IF;
 RETURN doc;
END $lock$;
REVOKE ALL ON FUNCTION public.termos_publicacao_bloquear_v1(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.termos_publicacao_bloquear_v1(text,text,text) TO service_role;
CREATE FUNCTION public.cadastrar_usuario_termos_v1(p_nome text,p_email text,p_senha_hash text,p_documento text,p_versao text,p_hash text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $func$
DECLARE doc public.termos_documentos%ROWTYPE; novo integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Acesso recusado.' USING ERRCODE='42501'; END IF;
 IF p_nome IS NULL OR length(trim(p_nome)) NOT BETWEEN 1 AND 100 OR
    p_email IS NULL OR length(p_email) NOT BETWEEN 3 AND 150 OR p_email<>lower(trim(p_email)) OR
    p_senha_hash IS NULL OR p_senha_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' THEN
   RAISE EXCEPTION 'Cadastro inválido.' USING ERRCODE='22023';
 END IF;
 doc := public.termos_publicacao_bloquear_v1(p_documento,p_versao,p_hash);
 INSERT INTO public.usuarios(nome,email,senha,perfil) VALUES(trim(p_nome),p_email,p_senha_hash,'participante') RETURNING id INTO novo;
 INSERT INTO public.termos_aceites(usuario_id,documento_id,versao,hash,fluxo,aceito_em)
 VALUES(novo,doc.documento_id,doc.versao,doc.hash,'cadastro',clock_timestamp());
 RETURN novo;
END $func$;
REVOKE ALL ON FUNCTION public.cadastrar_usuario_termos_v1(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cadastrar_usuario_termos_v1(text,text,text,text,text,text) TO service_role;
DO $$
DECLARE extra text:='TRUNCATE,REFERENCES,TRIGGER';
BEGIN
 IF current_setting('server_version_num')::integer>=170000 THEN extra:=extra||',MAINTAIN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) OR
 EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated') AND (rolsuper OR rolbypassrls)) OR
 NOT has_schema_privilege('service_role','public','USAGE') OR
 NOT has_table_privilege('service_role','public.usuarios','SELECT') OR
 NOT has_table_privilege('service_role','public.usuarios','INSERT') OR
 NOT has_sequence_privilege('service_role',pg_get_serial_sequence('public.usuarios','id'),'USAGE') THEN
 RAISE EXCEPTION 'Precondições de cadastro não satisfeitas. Não alterar permissões existentes automaticamente.';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles r CROSS JOIN (VALUES('public.termos_documentos'),('public.termos_aceites')) t(nome)
 WHERE r.rolname IN('anon','authenticated') AND has_table_privilege(r.oid,t.nome,'SELECT,INSERT,UPDATE,DELETE,'||extra)) OR
 has_table_privilege('service_role','public.termos_aceites','UPDATE,DELETE,'||extra) OR
 has_table_privilege('service_role','public.termos_documentos','INSERT,UPDATE,DELETE,'||extra) OR
 has_function_privilege('anon','public.cadastrar_usuario_termos_v1(text,text,text,text,text,text)','EXECUTE') OR
 has_function_privilege('authenticated','public.cadastrar_usuario_termos_v1(text,text,text,text,text,text)','EXECUTE') THEN
 RAISE EXCEPTION 'Permissões inesperadas.';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN(
 'public.cadastrar_usuario_termos_v1(text,text,text,text,text,text)'::regprocedure,
 'public.termos_publicacao_bloquear_v1(text,text,text)'::regprocedure) AND
 (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR
 has_function_privilege('service_role',p.oid,'EXECUTE WITH GRANT OPTION'))) OR
 has_table_privilege('service_role','public.termos_documentos','SELECT WITH GRANT OPTION') OR
 has_table_privilege('service_role','public.termos_aceites','SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION') THEN
 RAISE EXCEPTION 'Permissões herdadas ou grant options inesperadas.';
 END IF;
END $$;
INSERT INTO public.termos_documentos(documento_id,versao,hash,conteudo) VALUES('termos-uso','A.1','a571fc818f8bff7290c7adebf2f88f0784c207a29128ea8f0994b8ffe7ef614f',$conteudo${"id":"termos-uso","versao":"A.1","estado":"minuta","aprovacao":null,"secoes":[{"id":"apresentacao","titulo":"Apresentação e situação desta minuta","textos":["O TrocaTicket é um projeto acadêmico com funcionalidades de organização, descoberta e inscrição em eventos. A identidade do responsável pela operação e as condições jurídicas definitivas ainda dependem de aprovação. Esta minuta não constitui termos finais aprovados."]},{"id":"funcionalidades","titulo":"Funcionalidades e perfis","textos":["Participantes consultam eventos, realizam inscrições quando autorizadas e acompanham suas inscrições. Organizadores gerenciam eventos, capacidade, custos estimados, cotações e propostas conforme as regras e estados disponíveis.","Fornecedores consultam oportunidades, enviam propostas e mantêm informações profissionais e portfólio, conforme disponibilidade. O acesso aos perfis de organizador e fornecedor depende do fluxo de solicitação e análise administrativa existente.","A administração possui consultas e análise de solicitações de acesso. Recursos identificados como indisponíveis não devem ser interpretados como serviços já oferecidos."]},{"id":"contas","titulo":"Contas e credenciais","textos":["Mantenha seus dados atualizados e proteja sua senha. Não compartilhe credenciais nem utilize contas de terceiros. Use a opção de sair ao encerrar o acesso em dispositivos compartilhados.","Os mecanismos de autenticação e permissões permanecem sujeitos aos controles existentes. Esta minuta não cria novos direitos de acesso ou altera as regras de cadastro."]},{"id":"uso","titulo":"Responsabilidades e utilização","textos":["Cadastre informações verdadeiras e compatíveis com a finalidade dos campos. Respeite direitos sobre textos, imagens, marcas e dados de terceiros. Não utilize a plataforma para fraudes, acesso indevido ou tentativa de contornar permissões.","Informações de eventos, serviços e propostas são fornecidas pelos respectivos usuários. Condições de responsabilidade, moderação e resolução de conflitos precisam de revisão e aprovação; esta minuta não estabelece exonerações de responsabilidade."]},{"id":"condicoes","titulo":"Eventos, inscrições e valores","textos":["A disponibilidade de inscrição depende das regras de capacidade, estado do evento e autorização da aplicação. O histórico de inscrição e o estado do evento são apresentados separadamente.","O sistema auditado não implementa checkout, cobrança, assinaturas ou renovação automática. Custos estimados, preço sugerido e valores de propostas não comprovam venda, pagamento, contratação ou garantia de execução de serviços.","Não são estabelecidas aqui regras de reembolso, garantias comerciais ou serviços ainda não implementados. Condições futuras dependerão de definição e aprovação específicas."]},{"id":"privacidade","titulo":"Privacidade, contato e atualizações","textos":["Consulte também a minuta de Política de Privacidade. O canal institucional de contato ainda precisa ser criado e validado antes de permitir operação com usuários reais.","Esta é a minuta A.1, pendente de aprovação e sem registro de aceite nesta etapa. Atualizações dos termos deverão ser revisadas e versionadas. A política sobre menores, retenção e bases legais também permanece pendente."]}],"titulo":"Termos de Uso","descricao":"Minuta das condições de utilização das funcionalidades atualmente implementadas."}$conteudo$);
NOTIFY pgrst,'reload schema';
COMMIT;
-- Retenção e eventual anonimização dependem de decisão formal. Nenhuma limpeza automática.
