   # Backups e restauracao isolada — 31/10/2026

Estado operacional mais recente: `ETAPA_FINAL_PREPARADA.md`.

Atualizacao posterior: o ensaio dos oito dominios foi concluido em
`PREPARACAO_FINAL_CUTOVER.md`. Esse documento substitui o bloqueio historico
de cobertura do rollback descrito abaixo. Freeze e cutover continuam inativos.

Backups logicos gerados fora do repositorio:
`C:\Users\Lucas\BackupsTrocaTicket\backup-20261031-e51f28697254468aa205e99c9a1fbe15`.
Evidencia sanitizada: `evidencias/backups-isolados-20261031.json`.
Manifestos privados e checksums SHA256 acompanham os dumps nesse diretorio.

| Verificacao | Resultado |
|---|---|
| MySQL/MariaDB 10.4.32 | Banco da aplicacao completo: oito tabelas, 42 registros; schema, routines, events e triggers contemplados pelo mysqldump |
| Supabase PostgreSQL 17.11 | Database inteiro: 46 tabelas, 299 registros; oito tabelas public com 52 registros, incluindo os dez adicionais preservados |
| Roles PostgreSQL | Exportadas sem senhas; memberships e grantors restaurados |
| Integridade | SHA256 dos arquivos preservado; todas as linhas das 46 tabelas PostgreSQL e das oito tabelas MySQL comparadas aos respectivos backups/snapshot |
| Schema da aplicacao | Cinco funcoes/RPCs, definicoes, constraints, indexes, RLS, policies, permissoes e sequences comparados ao Supabase por leitura |
| Extensoes | Cinco extensoes restauradas, incluindo supabase_vault, nas mesmas versoes |
| Delta posterior | MySQL e Supabase sem alteracoes em relacao aos respectivos checkpoints, nas coletas registradas nos manifestos |
| Isolamento | Clones sem rede, portas publicadas ou volumes de bancos existentes; dados apenas em tmpfs; todos removidos |
| Testes locais afetados | Onze aprovados, zero falhas |

Conexao remota confirmada exclusivamente no PI Backend, usando Session pooler,
porta 5432 e identidade vinculada ao project ref aprovado. TLS com verificacao
de CA e hostname; nenhuma verificacao TLS foi desativada. CA publica obtida via
HTTPS, com origem confirmada no codigo oficial Supabase:
https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json
e orientacao https://supabase.com/docs/guides/platform/ssl-enforcement.
Nenhuma alteracao de .env foi necessaria para utilizar a CA no ensaio.

O dump PostgreSQL inclui todos os schemas do database, dados, funcoes,
constraints, sequences e ACLs exportaveis pelo pg_dump. Nao equivale a backup
da plataforma inteira: nao inclui API keys, senhas de roles, configuracao
gerenciada ou conteudo binario externo de Storage. A tabela storage.objects
continha zero registros. O backup MySQL contempla o banco da aplicacao, sem
exportar contas globais do servidor. Logins dos clones usam mecanismos locais
descartaveis; nenhuma credencial principal foi alterada.

## Restauracao e falhas resolvidas

O MySQL foi restaurado integralmente em clones MariaDB da mesma versao.
A prontidao agora exige mysqld como PID 1 e SELECT autenticado, evitando
confundir o servidor temporario de bootstrap com o definitivo. A comparacao
usa JSON_OBJECT por linha, compativel com MariaDB 10.4, sem JSON_ARRAYAGG.

O PostgreSQL foi restaurado integralmente na imagem oficial
`supabase/postgres:17.11.0.016`, fixada por image ID no manifesto. O cluster
isolado usa supabase_admin como role bootstrap, preservando o grantor original
das memberships PostgreSQL 17. A primeira tentativa com postgres como bootstrap
falhou na restauracao de grants; nao houve falha nem alteracao na origem.
Os manifestos preservam o historico das tentativas e remocao dos clones.

ACLs do diretorio externo e arquivos permitem somente o usuario Windows atual
e SYSTEM, necessario ao Docker Desktop. Nenhum arquivo de credenciais
temporarias permanece apos os ensaios. Dumps e logs privados ficam fora do Git;
o relatorio versionavel nao contem linhas, credenciais ou hashes de senhas.

## Rollback apos novas escritas

Ensaio entre clones PostgreSQL e MariaDB aprovado para uma identidade ficticia
e eventos ficticios: INSERT, UPDATE e DELETE apos COMMIT no PostgreSQL foram
reproduzidos em transacao no MariaDB. Uma falha deterministica antes do COMMIT
confirmou ausencia de alteracao parcial. Os registros anteriores foram
preservados. IDs descartaveis constam da evidencia; a remocao dos containers
eliminou todos esses registros, sem DELETE nas bases principais.

Esse ensaio nao implementa reversao generica dos oito dominios. Continua
bloqueado retornar diretamente ao MySQL antigo apos escritas reais Supabase:
isso perderia deltas e os dez extras atualmente existentes apenas no destino.
Antes de liberar escritas definitivas, validar o delta inverso completo,
incluindo relacionamentos, exclusoes, conflitos, IDs, sequences e fusos.
Resultado incerto exige manutencao e reconciliacao; nunca repetir escrita
automaticamente apos timeout.

## Congelamento e bloqueios restantes

Integracao preparada em `config/integrar-congelamento.cjs`, com patch revisavel
`fixtures/cutover-freeze-integracao.proposta.patch`. O patch passou em
`git apply --check` e NAO foi aplicado. Instala middleware inicialmente inativo
antes de parsers/handlers, acessivel somente ao supervisor por app.locals.
Nao existe endpoint publico de controle. Os testes confirmam passagem normal,
bloqueio simulado, drenagem e retencao de resultados incertos.

Pendencias para a janela autorizada:

1. Aplicar a integracao inerte e validar supervisor/replicas; inventariar todos
   os demais escritores externos ao Express.
2. Confirmar rollback completo apos novas escritas nos oito dominios.
3. Congelar escritas globalmente e drenar sem pendencias/incertezas; capturar
   backups T0 e revalidar delta final. As coletas atuais nao substituem T0.
4. Rotacionar JWT e liberar startup Supabase somente sob autorizacao especifica.

Nenhuma escrita nas bases principais. JWT e credenciais preservados.
MySQL continua padrao; Supabase permanece bloqueado no startup normal.
Sem cutover, alteracoes no frontend ou commits.
