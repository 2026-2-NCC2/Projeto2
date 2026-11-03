# Recuperacao concluida, mantendo manutencao

**RECUPERACAO_FALHA_POS_T1_APROVADA**, em uma unica tentativa autorizada. O gate especifico RESTABELECIMENTO_POS_T1_GATE_APROVADO passou. Nenhum retry ou liberacao foi executado.

## Processos e continuidade confirmados

- Controlador legitimo: **PID 3416**, pai 32428, criado em 03/11/2026 as 18:40:40,277 UTC.
- Supervisor legitimo: **PID 31312**, pai 3416, criado em 03/11/2026 as 18:41:38,255 UTC.
- MySQL local: **PID 10080**, preservado, com precheck de conexao READ ONLY aprovado.
- Listener unico: **127.0.0.1:3001**, pertencente ao supervisor 31312. HTTP **503** confirmado.
- IPC genuino confirmado pelo canal persistente, com pedido inedito `35b7df54-a4d0-49a9-9a77-2dba8edc337a` e resposta positiva dos dois PIDs atuais. O recibo nativo separado continua corretamente declarando ipcConsultado=false; nao foi promovido em prova de IPC.

Somente controlador e supervisor atuais foram identificados como processos da aplicacao. A ponte antiga 27672 foi encerrada exclusivamente pelo procedimento selado, depois da admissao do novo backend sem porta. Nenhuma sessao administrativa ou processo desconhecido foi encerrado.

**Conservar a sessao persistente 63384 e seu stdin abertos.** Encerrar a sessao, reiniciar o Windows ou perder o IPC revoga autoridade; os PIDs e provas deste relatorio nao dispensam revalidacao futura.

## Publicacao e controles

Antes da publicacao, os 30 hashes anteriores, manifestos originais, pacote, identidade da ponte, ausencia da trava, diario e checkpoint foram conferidos. Publicados somente os oito arquivos autorizados, com core.autocrlf=false restrito ao comando. Nenhum manifesto antigo foi sobrescrito ou recalculado para aceitar bytes diferentes. A verificacao posterior aprovou os 33 hashes-alvo e o manifesto completo.

O inspetor corrigido reconheceu o modo pos-T1 e validou identidades, parentesco, criacao, entradas canonicas, estado estavel, diario/procedencia e listener. O gate exigiu IPC genuino, ausencia dos anteriores e reconciliacao atual READ ONLY dos oito dominios. Totais: 42 registros MySQL e 52 Supabase; os dez adicionais permaneceram preservados. Identidades, relacionamentos, conteudo e catalogos corresponderam ao checkpoint, normalizando somente os avancos previstos das sequencias T1, sem alterar dados.

A lacuna historica de ausencia de escritas continua explicitamente nao comprovada. As evidencias atuais nao foram apresentadas como prova historica nem como lock global imposto aos bancos.

## Historico e arquivos privados preservados

Fase INICIADA e controle ATIVO. Novo id/epoch **4**, vinculado ao estado FALHA anterior por bytes completos e hash. Os bytes do estado original anterior a primeira readmissao tambem permanecem intactos. Os seis hashes de tickets anteriores foram mantidos; dois tickets novos foram consumidos, totalizando oito hashes unicos. Ambos os slots pendentes estao nulos. Nenhum ticket ou contexto antigo foi reutilizado.

Ambiente/JWT, checkpoint e diario T1 conservaram os hashes do precheck. O registro T1 permaneceu integralmente igual ao da FALHA arquivada, CONCLUIDA e com limpeza validada. Os IDs descartaveis permaneceram ausentes nas consultas do gate. Integridade dos backups existentes reconferida.

Nenhuma nova T1, limpeza repetida, escrita de dados, rotacao JWT, backup novo, rollback, liberacao ou commit. Os 59 testes isolados anteriores nao foram repetidos; foram executados os controles operacionais reais descritos.

## Pendencias

O funcionamento normal permanece bloqueado por manutencao 503. **Novo smoke isolado e gate final de liberacao ainda sao necessarios**, mediante autorizacao propria e evidencias recentes. A recuperacao atual nao equivale a autorizacao para retirar a manutencao ou repetir T1.

Evidencias: [precheck](evidencias/precheck-recuperacao-falha-1793731188890.json), [relatorio do controlador](evidencias/restabelecimento-pos-t1-05f38f77-fe15-41ad-b27f-c112cb043960.json), [confirmacao consolidada](evidencias/resultado-recuperacao-falha-real-20261103.json).
