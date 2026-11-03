# Restabelecimento selado apos reinicio — 02/11/2026

Autorizacao atual: preparar e executar readmissao inicial dos servicos. Nao autoriza substituicao entre controladores, smoke de aplicacao, T1 ou retirada da manutencao.

## Compatibilidade da admissao

O procedimento antigo de restabelecimento exige INCERTA e ausencia de recuperacao concluida. O estado atual e INICIADA/PRONTA_SMOKE. Essa lane antiga e seus gates nao foram relaxados. A fase nao sera editada para reutiliza-la.

`scripts/admissao-apos-reinicio.cjs` prepara uma admissao inicial distinta, usando as capacidades seladas de controlador e supervisor ja validadas. Exige reinicio Windows posterior ao smoke aprovado, ausencia NATIVA atual dos dois PIDs historicos, nenhum controleSelado existente, nenhuma T1 e configuracao/checkpoint identicos. Os PIDs antigos sao somente localizadores para comprovar ausencia; nao representam identidade ativa.

O controlador atual instala entrada privada retomavel antes da admissao. A ausencia de escritores, os oito dominios completos e os dez adicionais sao reconferidos antes da capacidade. Conteudo, perfis, relacionamentos e catalogos precisam corresponder ao checkpoint; contagens iguais nao bastam. Backups existentes sao conferidos por tamanho/hash. A lacuna historica permanece explicitamente nao comprovada.

Registro novo `controleSelado.modo=RESTABELECIMENTO_POS_REINICIO` conserva o estado original em estadoBase e o checkpoint por hash. Gera tickets aleatorios novos de 256 bits, vinculados a dono/PID/pai/boot, com validade de 30 segundos e consumo unico. Registra somente hashes dos tickets. Mantem INICIADA e o historico da recuperacao; atualiza identidades ativas e invalida o smoke antigo para o novo processo.

Nao ha chamada para encerrar controlador ou supervisor anterior: ambos precisam estar ausentes. O unico processo encerravel e a ponte 503 criada por esta propria admissao, identificada nativamente, depois do backend novo admitido sem porta. Reconfere porta livre e vincula somente em 127.0.0.1:3001. Um listener desconhecido impede continuacao. A ponte pura foi ajustada para aceitar INICIADA selada/PRONTA_SMOKE sem T1; continua respondendo exclusivamente 503 e nao carrega bancos, JWT ou Express.

O gate correspondente e o gate de RESTABELECIMENTO, nao o gate final T1. Exige recibo IPC genuino em memoria, identidade nativa atual antes/depois, autoridade exclusiva, tickets consumidos/inutilizados, nova leitura completa, escritores sob controle e preservacao do historico/checkpoint. JSON copiado nao substitui recibo. Smoke novo e gate final T1 permanecem pendentes.

## Execucao autorizada

MySQL XAMPP usa `C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini --standalone`, sem alterar configuracao. Foi necessaria sessao persistente: a tentativa destacada nao conservou o processo. Nao houve reparo de tabelas, alteracao de credenciais ou consultas de escrita.

O controlador tambem exige sessao persistente, sem pipeline fechado ou Start-Process destacado:

```powershell
$entry=(Resolve-Path '.\scripts\restabelecer-controlador-apos-reinicio.cjs').Path
node $entry --restabelecer-selado --aceitar-lacuna-historica --autorizacao "REFERENCIA_NAO_SECRETA"
```

Conservar a sessao e seu stdin. Apos RESTABELECIMENTO_SELADO_GATE_APROVADO, enviar somente `status`, com UUID novo, para comprovar continuidade. Nenhum comando de smoke, executar-t1 ou liberar-selado faz parte desta autorizacao.

Falhas mantem o bloqueio, inutilizam tickets e registram FALHA no controle novo, sem mudar a fase da migracao. A limpeza operacional encerra apenas o proprio candidato. Nao encerra listener desconhecido, nao reexecuta admissao automaticamente e nao apaga lock remanescente. Perda de canal revoga a autoridade; resultados T1 incertos nunca recebem limpeza automatica.

## Testes afetados

74 cenarios distintos aprovados, zero falhas finais: 29 validacoes novas de admissao/ponte/CLI; oito testes de runtime integrado (tres novos); dez de capacidades/bootstrap; oito de comandos/continuidade; 19 casos nativos integralmente simulados. Total: 32 novos e 42 regressoes afetadas. Os 129 cenarios anteriores nao foram repetidos integralmente.

Incluem reboot ausente, PIDs historicos vivos/reutilizados, candidatos desconhecidos, evidencia vencida, TLS, cliente/job concorrente, alteracao de dados com contagens iguais, adicional modificado, checkpoint/relatorio adulterados, falta de aceite, T1 existente, plano JSON, troca valida sem parar controlador, ACK incorreto, recibo IPC fabricado e bloqueios da ponte. A fixture VM normaliza objetos entre contextos sem fabricar recibos. Sintaxe conferida em quatro JavaScript e dois PowerShell. O grafo estava desatualizado; a revisao utilizou o codigo-fonte e testes.

O resultado operacional e registrado separadamente em `evidencias/restabelecimento-pos-reinicio-<UUID>.json`. Nenhum resultado simulado deve ser apresentado como admissao real.
