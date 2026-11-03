# Caminho corrigido; readmissao interrompida

Entrada e pacote foram resolvidos com Resolve-Path, passando ao Node caminhos absolutos Windows com barras invertidas. Nenhum arquivo selado foi alterado nesta tentativa. Os 30 hashes-alvo e o manifesto completo passaram antes/depois. MySQL, diario T1, checkpoint e backups existentes passaram nos prechecks. Nenhuma suite anterior foi repetida.

Uma unica tentativa nesta autorizacao, sem retry. O caminho passou pela identidade inicial e o fluxo avancou. Controlador candidato **7260** e supervisor candidato **14360** chegaram a consumir suas capacidades, mas a continuidade final foi recusada. O protocolo revogou suas autoridades, encerrou somente os candidatos proprios e criou respondedor de protecao.

## Estado atual confirmado

- MySQL ativo: PID **10080**.
- Respondedor de manutencao conhecido: PID **27672**, pai historico 7260, criado em 03/11/2026 as 17:56:50,285 UTC. Identidade nativa e listener unico 127.0.0.1:3001 confirmados.
- HTTP **503** confirmado.
- Controlador/supervisor ativos: ausentes. Os PIDs 7260/14360 no registro sao os candidatos revogados, nao autoridade viva.
- Fase INICIADA; controle FALHA; tickets pendentes nulos e hashes consumidos unicos. IPC exclusivo de um controlador legitimo nao foi aprovado.

## Bloqueio identificado

O registro original informa READMISSAO_RECUSADA na funcao compartilhada backup-mysql-isolado.cjs:27, durante READMISSAO_SELADA_POS_T1. Essa funcao tambem invoca helpers PowerShell; nao houve execucao de backup. O stderr original do helper nao foi preservado.

Foi encontrada uma incompatibilidade objetiva no inspetor final `scripts/inspecionar-controlador-persistente.ps1`: para a entrada `restabelecer-controlador-apos-reinicio.cjs`, ele exige modo RESTABELECIMENTO_POS_REINICIO. O procedimento pos-T1 preparado reutiliza legitimamente as capacidades/procedencia de modo **IMPLANTACAO_POS_T1**, com motivoOperacao **RESTABELECIMENTO_POS_T1**. O predicado nativo rejeita essa combinacao mesmo com o caminho canonico e os PIDs corretos.

Isso explica um bloqueio deterministico na verificacao final de continuidade. Nao foi alegada existencia de stderr ou assertiva originalmente registrada que o invocador descartou. A simulacao anterior do helper nativo nao cobriu essa exigencia de modo; por isso os ensaios isolados nao detectaram a incompatibilidade.

Nenhum inspetor, manifesto ou outro arquivo selado foi modificado para contornar a recusa. A tentativa parou conforme autorizado.

## Preservacao e pendencias

Ambiente/JWT, checkpoint, diario e registro T1 permaneceram identicos. Os bytes completos do estado anterior estao preservados no registro de procedencia e seu hash coincide com o precheck. O estado de controle mudou pelo fence/readmissao parcial e revogacao, conforme o protocolo; nao foi falsamente declarado intacto.

As reconciliacoes READ ONLY do fluxo conferiram os dados antes do fence e depois dele. Seus hashes permanecem iguais aos aprovados. T1 permanece CONCLUIDA, cleanupVerified=true e unknownResult=false. Os backups existentes conservaram integridade. Nao houve nova T1, limpeza repetida, escrita de dados, rotacao JWT, backup novo, rollback, liberacao ou commit.

Pendencias: compatibilizar e testar o inspetor nativo para o modo pos-T1, preservando as recusas antigas; preparar retomada idempotente do estado **FALHA**, sem reutilizar tickets, apagar procedencia ou executar rollback. Nao basta repetir esta mesma invocacao. A manutencao 503 deve permanecer com o respondedor conhecido ate nova operacao autorizada.

Evidencias: [precheck](evidencias/precheck-admissao-pos-t1-1793728524903.json), [relatorio original](evidencias/restabelecimento-pos-t1-9d7409c3-bdb6-490b-8d27-aeafc60d0884.json), [resultado consolidado](evidencias/resultado-readmissao-canonica-20261103.json).
