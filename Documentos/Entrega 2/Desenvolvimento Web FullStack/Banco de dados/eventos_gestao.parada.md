# Parada do backend para a Etapa 1

## Diagnóstico em 04/11/2026

O PID 32076 escuta na porta 3001 e executa Node com `--use-system-ca server.js`.
Corresponde ao backend iniciado anteriormente neste atendimento; seus logs de
ativação de imagens e porta coincidem. Não havia conexões HTTP abertas nas duas
observações. O processo pai 30700 já não apareceu no inventário consultado.
Isso não comprova ausência de outros mecanismos de reinício.

Projeto `gnwybroqfvwosiqzsfla` confirmado pela resposta REST e configuração PG
vinculada; conexão PostgreSQL com certificado TLS validado. Diagnóstico em
transação READ ONLY, encerrada com ROLLBACK, às 20:12:04 UTC:

- Seis sessões cliente ociosas, nenhuma transação aberta e nenhuma espera por lock.
- Cinco objetos de imagens em `limpeza`, nenhum com limpeza vencida ou lease vigente.
- Não existem `cron.job`, `cron.job_run_details` ou `net.http_request_queue`.

São observações pontuais. Não identificam tarefas em memória, chamadas REST/Storage
em trânsito ou trabalhos do sistema operacional. O backend agenda limpeza a cada
60 segundos; parar entre duas consultas não prova drenagem. Nenhuma limpeza foi
disparada manualmente e os registros e prazos de quarentena não foram alterados.

## Correção local, para uma próxima instância

O encerramento agora recusa novas admissões, fecha o listener sem destruir
conexões, suspende novos ciclos de limpeza, aguarda o ciclo já iniciado e as
requisições HTTP. Aguarda também os contadores existentes do supervisor antes
de fechar o pool PostgreSQL. Resultados incertos ou drenagem acima de 30 segundos
recusam a conclusão e preservam o processo para diagnóstico, sem saída forçada.
Sinais repetidos reutilizam a mesma tentativa de encerramento.

Não há endpoint administrativo novo, alteração de RLS, arquivo de congelamento
ou modificação do mecanismo de quarentena de 24 horas. O worker não agenda
outro ciclo durante a parada e não fecha seu pool antes de concluir o ciclo atual.
Testes usam dependências sintéticas; não iniciam a aplicação de produção.

Essa correção no disco não atualiza o código já carregado pelo PID 32076.
No Windows, `Stop-Process`, `taskkill` e `process.kill(SIGTERM)` não são substitutos
de um sinal cooperativo. Não usá-los como prova de encerramento gracioso.

## Alternativa para a primeira troca

A instância antiga foi iniciada oculta, sem canal IPC herdado. No diagnóstico
inicial não havia sido localizado seu console. Não havia comando acessível para interromper
seu timer e consultar seus contadores. Não é possível comprovar sua drenagem
apenas com porta ociosa, logs e `pg_stat_activity`.

Se for indispensável substituir essa instância, será necessária uma parada
excepcional em janela de quiescência, decidida separadamente e reconhecida como
parada sem comprovação integral de drenagem. Antes dela: suspender o uso por todos
os clientes, confirmar a identidade do PID, ausência de reiniciadores, conexões,
transações e operações/leases de imagens; não prosseguir com resultados incertos.
Não há autorização técnica implícita para matar sessões PostgreSQL ou corrigir dados.
A ausência de atividade reduz o risco, mas não equivale à prova cooperativa exigida.
Até aquele diagnóstico, nenhuma parada excepcional havia sido executada.

Após essa primeira troca, iniciar a versão corrigida sob console acessível
(`npm start`, sem alterar as guardas de startup existentes), para que Ctrl+C
solicite o encerramento gracioso. Evitar inicialização oculta sem canal de controle.
Um console acessível é suficiente; não é preciso criar infraestrutura de manutenção.

Antes do preflight formal, comprovar término do processo, porta 3001 livre e
ausência de reinício durante a observação. Só então executar integralmente
`eventos_gestao.verificacao.sql` em transação somente leitura, salvar o resultado
e conferir os seis eventos e objetos/permissões esperados. Não aplicar a migração
nesta etapa. A observação de ausência de reinício tem duração limitada; não é
garantia de que não exista um agendamento futuro desconhecido.

## Resultado desta etapa

Após autorização específica, a investigação Win32 localizou um console oculto
associado ao PID 32076. `AttachConsole` e `GetConsoleProcessList` confirmaram que
ele continha somente o backend e o auxiliar de inspeção. O diagnóstico inicial
de ausência de console acessível foi, portanto, superado por essa verificação.

Antes do sinal, em 04/11/2026 às 20:18:18 UTC: identidade HTTP TrocaTicket
confirmada, zero clientes PostgreSQL ativos/com transação, zero locks de outras
sessões nas tabelas envolvidas, zero leases/objetos em limpeza em andamento,
zero limpezas vencidas e cinco registros no diário. Consultas em READ ONLY com
ROLLBACK. A porta foi novamente conferida sem conexões em andamento antes do sinal.
Não foram observados outros escritores ativos; isso não prova inexistência de
escritores externos que possam iniciar trabalho futuramente.

Solicitado Ctrl+C normal por `GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0)` somente
após reconfirmar identidade, data de criação e exclusividade desse console. O
auxiliar ignorou o próprio Ctrl+C e se desanexou. Não foi usado `Stop-Process`,
`taskkill`, `TerminateProcess`, SIGTERM simulado ou injeção de código. Saída do
backend confirmada às 20:18:43 UTC, sem alcançar o limite de espera de 20 segundos.
O handler antigo foi acionado; isso não equivale a implantar a correção local nem
a obter retroativamente telemetria completa de drenagem de tarefas em memória.

PID ausente e porta 3001 livre nas observações de 20:18:59, 20:19:10 e 20:19:20 UTC.
Nenhum reinício automático observado nessa janela. Backend mantido desligado.

Executado integralmente `eventos_gestao.verificacao.sql`, como postgres, via
conexão TLS verificada no projeto confirmado `gnwybroqfvwosiqzsfla`, dentro de
REPEATABLE READ READ ONLY, encerrada com ROLLBACK. Preflight aprovado:

- PostgreSQL 17.11; seis eventos: quatro Ativo e dois Em planejamento.
- Cinco inscrições, dois custos, seis cotações, 17 itens e seis propostas.
- FKs validadas; USAGE da service_role nas duas sequences confirmado.
- RLS ativo, FORCE RLS inativo, zero políticas nas duas tabelas, ACL restrita a
  postgres/service_role, conforme o schema existente; nenhuma permissão alterada.
- Colunas, cinco funções, triggers, restrição e índice novos ainda ausentes.
- Contagens, hashes e metadados completos salvos para comparação após migração.

Evidência: `PI Backend/evidencias/eventos-preflight-parada-60cd5ee1-624a-4f5b-b3a0-702d7595c02f.json`.
Nenhuma migração aplicada, escrita de negócio, limpeza manual, alteração de
credenciais/políticas ou reinicialização do backend. Quarentena de 24 horas intacta.
Antes de uma aplicação futura, reconfirmar a manutenção e ausência de novos escritores.
