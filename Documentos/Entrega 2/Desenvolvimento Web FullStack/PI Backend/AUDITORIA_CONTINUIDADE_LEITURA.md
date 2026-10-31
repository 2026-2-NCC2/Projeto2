# Auditoria de continuidade — 31/10/2026

**Ausencia historica de escritas NAO comprovada. Recuperacao nao executada.**
O estado atual dos oito dominios coincide com o checkpoint aprovado. Essa
igualdade pontual nao prova que nunca houve operacoes posteriormente revertidas,
escritas seguidas de exclusao, tentativas ou atividades fora desses dominios.

## Referencia temporal

Checkpoint: `349d6df4-7c15-4960-b739-dfd91fd53c8d`.
Captura MySQL: 15:42:53.099–15:42:53.116 UTC.
Captura Supabase: 15:42:53.116–15:42:57.034 UTC.
Horario local dessas capturas: 12:42:53–12:42:57, America/Sao_Paulo.
O arquivo privado foi gravado as 15:42:57.453 UTC.

O fluxo revalidou o delta antes da transicao preparada as 15:43:29.922 UTC
(12:43:29.922 local). Nao persistiu um timestamp individual dessa ultima
revalidacao. Portanto, nao se atribui a ela um horario exato inventado.
Para cobrir a incerteza temporal, a auditoria tomou 15:42:53.099 UTC como inicio
conservador do periodo investigado.

## Comparacao pontual autorizada

Executada entre 16:30:40.249 e 16:30:46.985 UTC, usando transacoes REPEATABLE
READ READ ONLY e TLS validado no PostgreSQL. As capturas das duas bases sao
independentes; nao constituem um snapshot atomico distribuido.

| Dominio | MySQL | Supabase | Diferencas contra cada checkpoint |
|---|---:|---:|---|
| usuarios | 9 | 10 | zero |
| eventos | 5 | 6 | zero |
| custos_evento | 3 | 5 | zero |
| cotacoes | 3 | 4 | zero |
| itens_cotacao | 13 | 15 | zero |
| propostas | 2 | 3 | zero |
| inscricoes | 2 | 3 | zero |
| solicitacoes_acesso | 5 | 6 | zero |
| Total | 42 | 52 | zero |

IDs, todos os campos persistidos, identidades, perfis e hashes de senha foram
comparados em memoria, sem exportar valores privados. Datas UTC e decimais
receberam a normalizacao ja validada. Integridade referencial e unicidade de
emails foram verificadas. Os dez registros adicionais coincidem com suas linhas
no checkpoint; nenhum foi removido ou alterado por esta operacao.
Os catalogos MySQL/Supabase tambem coincidiram com os catalogos do checkpoint,
incluindo schema, RPCs, permissoes e metadados de sequencias presentes na captura.
Isso nao abrange historico de todos os schemas internos do servico Supabase.

Nao foram executados os orquestradores executarDeltaFinal/prepararT0Delta,
novos checkpoints, backups ou etapas de cutover. A leitura comparativa foi a
comparacao pontual solicitada no item 4, sem promover aprovacao do gate final.

## Logs e possiveis escritores

MySQL: log_bin=OFF, general_log=OFF, slow_query_log=OFF; nenhum plugin de
auditoria listado. Nao havia cliente externo ou transacao de aplicacao ativa.
event_scheduler=OFF e nenhum evento do schema. Esses valores sao atuais;
nao demonstram que a configuracao foi igual durante todo o periodo anterior.
Arquivos de log nao foram encontrados nos caminhos configurados consultados;
a consulta de existencia nao resolveu caminhos relativos nem constitui prova
de inexistencia de arquivos historicos/exportados em outros locais.

Supabase: log_statement=ddl, pgaudit.log=none, duracao de statements desabilitada
e track_commit_timestamp=off. CSVs de log foram listados. A leitura de
postgresql.csv e auth-failures.csv foi recusada pelo PostgreSQL com SQLSTATE
42501; nao se alteraram roles/permissoes nem se tentou contornar a restricao.
Logo, conteudo desses logs NAO foi auditado. Mesmo disponiveis, a configuracao
atual nao garante captura completa de DML nem prova configuracao historica.

A unica tabela de auditoria localizada foi auth.audit_log_entries, com zero
registros desde o inicio conservador. Ela cobre Supabase Auth; o TrocaTicket
usa JWT proprio, portanto nao comprova ausencia de SQL ou REST da aplicacao.
Os contadores cumulativos de DML existem desde o reset de 02/10/2026, mas nao
ha baseline correspondente no checkpoint para atribuir suas operacoes ao periodo.
Historico completo do gateway REST nao esta disponivel por esta conexao SQL.

Sessoes observadas: supabase_admin, pgbouncer e authenticator, todas idle e sem
transacao aberta. Nenhuma tabela cron.job, cron.job_run_details ou fila pg_net
configurada foi encontrada. Isso descreve o estado atual, nao a atividade passada.

Local: MySQL, ferramentas Codex/MCP, supervisor pai PID 35344 e filho Supabase
PID 25552 reconhecidos; nenhum consumidor adicional atribuido, tarefa do projeto
ou conexao MySQL de aplicacao observado. Porta 3001 corresponde ao filho conhecido.
A ausencia atual de outros processos nao exclui processos ja encerrados.
O log Windows Security nao disponibilizou metadados nesta consulta; o log
TaskScheduler/Operational esta desabilitado. Nenhuma configuracao foi alterada.

## Decisao e proposta

Comprovado: equivalencia atual das oito tabelas e catalogos aos checkpoints,
dez adicionais preservados e manutencao HTTP 503. Estado privado, .env e
checkpoint permaneceram inalterados. Nao houve conexao de escrita, recuperacao,
rotacao JWT, rollback de migracao ou commit. As transacoes de leitura terminaram;
ROLLBACK TO SAVEPOINT apenas tratou a leitura recusada de logs, sem dados escritos.

NAO comprovado: ausencia integral de escritas SQL/REST/jobs desde o delta.
Nao foram encontradas divergencias persistidas; isso e diferente de provar
ausencia historica de escritas. O criterio estrito de continuidade continua
sem satisfacao; nao se recomenda autorizar a recuperacao sob esse criterio.

Antes da recuperacao, propor uma decisao explicitamente autorizada:

1. Manter 503 e reservar janela exclusiva, suspendendo SQL/REST/scripts/jobs.
2. Se a exigencia for historica, obter exportacoes completas e correlacionadas
   de logs SQL/REST/processos desde 15:42:53.099 UTC. Onde nao houve logging,
   nao e possivel reconstruir uma prova negativa retroativa habilitando-o agora.
3. Se essas trilhas nao existirem, autorizar uma reconciliacao formal somente
   leitura sob controle atual dos escritores, confrontando oito dominios,
   identidades, relacoes, catalogos e dez adicionais com o checkpoint imutavel.
   Parar diante de diferencas; nao sincronizar, excluir ou corrigir dados.
4. Registrar evidencia nova separada, sem sobrescrever checkpoint/backups/JWT.
   Aceitar explicitamente equivalencia atual como criterio de recuperacao,
   com a lacuna historica documentada. Isso exige revisar o gate preparado;
   nao preencher confirmarContinuidadeSemEscritas=true por inferencia.
5. Somente apos essa decisao, recuperar o processo selado e executar smoke
   controlado. A liberacao normal permanece sujeita a autorizacao posterior.

Nenhuma reconciliacao formal adicional foi disparada nesta auditoria.
Evidencias: `evidencias/auditoria-continuidade-leitura-20261031.json` e
`evidencias/auditoria-logs-locais-continuidade-20261031.json`.
