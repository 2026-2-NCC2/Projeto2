# Liberacao controlada: interrompida antes da abertura

Verificacao em 03/11/2026 01:16:56 UTC (02/11/2026 22:16:56 BRT). Funcionamento normal nao liberado. HTTP 503 confirmado. Nenhuma escrita de dados executada nesta tentativa.

## Controles observados

- Controlador PID 25144: pai 25928, criacao 02/11/2026 16:17:24.788012 UTC, entrada substituir-controlador-selado.cjs.
- Supervisor PID 15788: pai 25144, criacao 02/11/2026 16:18:29.845405 UTC, entrada iniciar-supervisor-substituido.cjs.
- Listener unico 127.0.0.1:3001 pertencente ao supervisor. GET /perfil publico retornou HTTP 503.
- Status pelo canal privado persistente confirmou controlador/supervisor, continuidade IPC e drenagem. Pedido 098924bb-c67a-4442-a3af-ff19d3423c51; resposta ok=true, verificadoEm=1793668587598. Nao houve nova admissao ou handoff.
- Estado persistido INICIADA/ATIVO, congelado e selado. T1 00fd0398-74a4-4bd7-a763-bdac24b78237 permanece CONCLUIDA, cleanupVerified=true, unknownResult=false. Diario coincide integralmente com o registro persistido e seu SHA-256. Leitura nao alterou o estado.
- MySQL local PID 4492 permanece existente; sua existencia nao significa uso pela aplicacao. Nao foi iniciada nova conexao aos bancos nesta tentativa.

## Bloqueio de validade

O relatorio realmente referenciado pelo controlador e smoke-pos-substituicao-26e5cc54-80b3-4feb-924f-13ffe0ac38a8.json, SHA-256 bc95ac884a837bf6a51dd72588bb774c587c9e3a790fa6ca67526946b494afae. Inicio 02/11/2026 17:10:44.913 UTC, termino 17:11:26.691 UTC. O limite de 15 minutos desde o inicio venceu em 17:25:44.913 UTC (14:25:44.913 BRT).

Comparacao do relatorio atual com Date.now() e TTL_RECONCILIACAO do codigo confirmou a reprovacao da pre-condicao GATE_SELADO_SMOKE_EXPIRADO. Nao se modificaram horarios, TTL, relatorio ou checkpoint.

O gate composto completo NAO foi invocado. A interface liberar-selado combina avaliacao e retirada de manutencao; alem disso, consome o estado em memoria da conclusao T1 antes de avaliar e pode marcar INCERTA em caso de falha. Nao se enviou deliberadamente esse comando com uma pre-condicao comprovadamente vencida. A aprovacao anterior nao foi tratada como evidencia atual.

O callback smoke() em scripts/operacoes-controlador-selado.cjs exige ausencia de transicao.t1. Portanto, o procedimento atual nao oferece renovacao do smoke depois da T1 concluida. Nao se enviou smoke-isolado para provocar essa falha previsivel, nao se apagou a T1 e nao se alterou o codigo operacional.

## Alcance e proxima condicao

A integridade dos oito dominios, a preservacao dos dez adicionais e a ausencia de residuos foram aprovadas na auditoria anterior, conforme RESULTADO_PRIMEIRA_T1_20261102.md. Nesta tentativa nao foram novamente comprovadas por leitura dos bancos: houve interrupcao no controle temporal antes de coletar a reconciliacao atual e o inventario completo de escritores. Nao afirmar controle global exclusivo ou ausencia atual de alteracoes somente com o status IPC.

A lacuna historica reconhecida continua registrada; ausencia de evidencias historicas nao comprova ausencia de escritas.

Para prosseguir, e necessario preparar e validar um procedimento de renovacao do smoke selado apos T1, preservando diario, limpeza, autoridade exclusiva e manutencao. Depois, coletar evidencias recentes dos escritores e dos oito dominios, verificar isolamento MySQL e executar o gate final oficial. Nao repetir T1, delta, backups ou rotacao JWT. Nao contornar a validade nem reiniciar o controlador para apagar controles em memoria.

Nenhuma liberacao, rollback, exclusao de registros, alteracao de JWT/backups/checkpoint ou commit. A migracao ainda nao foi declarada concluida.
