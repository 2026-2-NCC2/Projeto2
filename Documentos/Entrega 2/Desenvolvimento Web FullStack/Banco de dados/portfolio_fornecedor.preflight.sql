-- MANUAL / SOMENTE LEITURA. Executar no projeto correto, antes da aplicação.
-- Não confirma o project ref; conferir a identidade do projeto no Dashboard.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT current_user AS executor, current_setting('server_version') AS versao,
       has_schema_privilege(current_user,'public','CREATE') AS pode_criar,
       to_regclass('public.portfolio_itens') AS tabela_deve_ser_null;
SELECT column_name,data_type,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='usuarios' AND column_name='id';
SELECT conname,pg_get_constraintdef(oid) AS definicao
FROM pg_constraint WHERE conrelid=to_regclass('public.usuarios') AND contype IN ('p','u');
SELECT rolname,rolsuper,rolbypassrls,rolinherit
FROM pg_roles WHERE rolname IN ('service_role','anon','authenticated',current_user);
-- Defaults globais e de public: a migração revoga os grants diretos nas novas
-- tabelas; privilégios herdados ou terceiros inesperados provocam erro.
SELECT d.defaclrole::regrole AS proprietario,
       d.defaclnamespace AS esquema_oid,n.nspname AS esquema,
       d.defaclobjtype,d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE d.defaclobjtype='r' AND (d.defaclnamespace=0 OR n.nspname='public');
SELECT r.rolname AS papel,m.rolname AS papel_do_qual_e_membro,m.rolsuper,m.rolbypassrls
FROM pg_roles r CROSS JOIN pg_roles mVamos concluir a Etapa 1 de Eventos e Ingressos do TrocaTicket.

Autorizo a aplicação controlada da migração eventos_gestao.incremental.sql no Supabase de produção, exclusivamente no projeto gnwybroqfvwosiqzsfla.

A parada controlada do backend foi concluída:
- PID 32076 encerrado normalmente.
- Porta 3001 livre.
- Nenhum reinício automático identificado.
- Preflight aprovado: 6 eventos, sendo 4 Ativo e 2 Em planejamento.
- Integridade, permissões e ausência dos novos objetos confirmadas.

Procedimento:

1. Reconfirme que a porta 3001 permanece livre e que não existem outros escritores ativos.
2. Confirme novamente o Project Reference do Supabase.
3. Siga o roteiro eventos_gestao.etapa1.md.
4. Execute a migração eventos_gestao.incremental.sql integralmente, uma única vez, em transação.
5. Se houver erro, interrompa e verifique o rollback. Não tente corrigir dados de produção automaticamente.
6. Execute eventos_gestao.verificacao.sql após a migração e compare os resultados com o preflight.
7. Confirme a preservação dos seis eventos, seus estados e relacionamentos.
8. Verifique as seis colunas, cinco funções, dois triggers, restrição e índice previstos.
9. Execute a prova somente leitura da função eventos_capacidades_v1() usando service_role.
10. Se todas as verificações passarem, inicie o backend atualizado, preservando o encerramento gracioso.
11. Valide o endpoint autenticado /eventos/capacidades.
12. Confirme que a interface React está compatível com o backend atualizado.

Restrições:
- Não altere eventos ou inscrições reais durante os testes.
- Não execute outras migrações.
- Não altere credenciais ou políticas de segurança.
- Preserve a limpeza agendada das imagens.
- Não faça commit nem push.

Se não conseguir acessar o SQL Editor com segurança, interrompa e forneça as instruções para execução manual.

Ao finalizar, informe se a migração foi aplicada, se o backend voltou a funcionar e se a Etapa 1 de gerenciamento de eventos está liberada.
WHERE r.rolname IN ('anon','authenticated','service_role') AND r.oid<>m.oid
  AND pg_has_role(r.oid,m.oid,'MEMBER')
ORDER BY r.rolname,m.rolname;
ROLLBACK;
