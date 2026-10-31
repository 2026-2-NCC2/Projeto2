# Evidencia operacional v2 — 31/10/2026

**Reconciliacao atual aprovada; evidencia NAO aprovada pelo gate de recuperacao.**
HTTP 503 restabelecido por respondedor isolado. Supervisor real nao recuperado.

## Processos e causa da indisponibilidade

A inspecao inicial nao encontrou MySQL, Express nem listener 3001.
O ultimo boot do Windows foi 18:55:29.500 UTC (15:55:29.500 BRT), posterior
as instancias temporarias da janela anterior. Nao ha servico Windows MySQL
instalado. Isso explica a perda dos processos temporarios e a ausencia de
reinicio automatico. ECONNREFUSED decorria da ausencia de listener; nao houve
evidencia de erro HTTP/autenticacao em servidor ativo nessa porta.

Foram restabelecidos somente:

- MySQL XAMPP PID **27252**, criado as 19:23:10.292 UTC, com executavel e
  configuracao originais, sem instalar servico ou mudar configuracoes.
- Respondedor dedicado de manutencao PID **22780**, criado as 19:24:59.171 UTC,
  listener exclusivo **127.0.0.1:3001** e boot
  `f461f5bf-74d5-4f69-8796-308f4adc025c`.

O respondedor SEMPRE devolve 503, inclusive GET, login e mutacoes. Nao carrega
.env, Express, repositorios ou drivers, nao possui operacao de liberacao e nao
modifica o estado privado. Ele nao e o backend/supervisor Supabase e NAO pode
ser adotado como tal para satisfazer o gate. Seus PID, criacao e listener foram
conferidos por leitura do Windows; nenhum PID antigo foi reutilizado como prova.

## Evidencia e dados atuais

Arquivo separado:
`evidencias/operacional-v2-92548331-a78e-44ef-af03-8fcaf037f51a.json`.
schemaVersion=2; scopeType=PRE_RECUPERACAO_SEM_SUPERVISOR.
Janela da coleta: 19:24:57.108–19:25:18.506 UTC
(16:24:57.108–16:25:18.506 BRT), 31/10/2026.
Checkpoint preservado: `349d6df4-7c15-4960-b739-dfd91fd53c8d`.

Duas capturas READ ONLY coincidiram com o checkpoint e entre si. Todos os oito
dominios/catalogos conferidos, PostgreSQL com TLS no projeto PI Backend.
MySQL: **42 registros**. Supabase: **52 registros**. Os 42 comuns sao identicos;
identidades, perfis, hashes bcrypt, unicidade e relacionamentos foram verificados
em memoria. Os dez adicionais estao integralmente preservados, sem exclusoes.
Valores privados, credenciais e linhas brutas nao foram exportados.

Escritores antes/depois: nenhum processo local adicional nao autorizado ou
tarefa do projeto observado. MySQL sem outros clientes/transacoes/eventos
habilitados, scheduler OFF. Supabase com supabase_admin, authenticator e
pgbouncer reconhecidos, idle e sem transacoes abertas; cron/fila HTTP zero.
Nenhuma sessao administrativa foi encerrada. Controle e operacional por
observacao antes/depois; nao e lock universal nem prova historica de SQL/REST.

Estado do supervisor, .env/JWT e checkpoint permaneceram identicos. Artefatos
dos backups existentes tiveram hashes conferidos, sem gerar/restaurar backups.
Nenhum dado de aplicacao foi escrito; nenhuma recuperacao, rollback de migracao
ou commit executado. O estado persiste INCERTA, congelado e selado, sem registro
de recuperacao. A lacuna historica permanece expressamente NAO comprovada.

## Validacao e bloqueio do gate

Dois testes novos do respondedor passaram: 503 em todos os metodos/rotas
testados e ausencia de imports da aplicacao/credenciais/persistencia. Sintaxe
dos scripts validada. Nenhuma bateria anterior foi repetida.

O gate puro foi chamado somente como verificacao negativa, sem operacao de
recuperacao. Rejeitou o status preparatorio da evidencia (ERR_ASSERTION),
sem alcancar o caminho de aprovacao. Nao houve assinatura/aceite que autorizasse
uma recuperacao real, nem se transformou a lacuna em prova positiva.

O bloqueio operacional e concreto: nao existe supervisor principal vivo com
PID/boot admitidos pelo estado privado. O campo knownBackend esta explicitamente
null; knownMaintenanceResponder identifica somente o novo respondedor 503.
Restabelecer o backend real nessa fase exigiria ticket, nova identidade e
transicao do estado privado: seria a recuperacao/readmissao real que esta
tarefa expressamente proibe. Nao foram editados guards nem falsificados vinculos.

## Pendencias

1. Preparar/autorizar readmissao planejada do supervisor apos a perda do
   processo original, mantendo selagem e preservando JWT/checkpoint/dados.
   O procedimento atual baseado em substituir filho vivo nao atende esse caso.
2. Encerrar o respondedor apenas numa futura transicao autorizada, validando
   sua identidade atual; nao trata-lo como PID do supervisor antigo.
3. Recolher evidencia vinculada ao supervisor realmente admitido e verificar
   o gate completo. A evidencia atual e datada (TTL do gate: 15 minutos);
   nao pode ser reutilizada indefinidamente nem promovida por mudanca de status.

O objetivo de manter 503 e conferir os dados foi atendido. A condicao de
identidade/admissao do supervisor ainda impede aprovar a recuperacao.
