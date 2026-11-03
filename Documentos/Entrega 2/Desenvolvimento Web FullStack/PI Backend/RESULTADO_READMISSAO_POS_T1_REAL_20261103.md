# Interrompida na preparacao da manutencao

Uma unica tentativa; nenhum retry. Candidato PID **31996** encerrou com exit 1 em PREPARAR_MANUTENCAO, antes de ponte, plano, fence ou tickets. Nao houve admissao do controlador ou supervisor.

MySQL permanece PID **10080**, conexao READ ONLY aprovada. Controlador e supervisor: ausentes. Porta 3001: sem listener. **HTTP 503 e IPC nao foram restabelecidos.** O registro ATIVO com PIDs 25144/15788 permanece historico; nao foi apresentado como autoridade viva.

## Publicacao e preservacao

Selo da preparacao e 27 hashes anteriores aprovados antes da publicacao. Aplicados somente os cinco arquivos autorizados, com core.autocrlf=false restrito ao comando. Verificacao posterior confirmou todos os 30 hashes-alvo e manifesto completo, sem divergencia de bytes. Fixtures e testes nao foram implantados; nenhum manifesto foi recalculado para aceitar alteracoes.

Estado pos-T1, JWT/ambiente, checkpoint e diario conservaram exatamente os hashes anteriores a tentativa. T1 continua CONCLUIDA, cleanupVerified=true. O diario coincide integralmente com o registro preservado. Backups existentes reconferidos por integridade. Nao houve T1 nova, escrita de dados, rotacao JWT, backup novo, rollback, liberacao ou commit. A trava exclusiva foi liberada normalmente.

## Falha e diagnostico

O registro operacional aponta READMISSAO_RECUSADA em backup-mysql-isolado.cjs:27. Essa funcao e tambem o invocador compartilhado dos helpers PowerShell: o nome do arquivo nao significa que um backup tenha sido executado. Um helper retornou codigo diferente de zero; seu stderr original foi descartado pelo invocador. Nao existe comprovacao preservada de qual helper interno produziu aquela excecao.

A invocacao desta tentativa usou caminho absoluto com barras `/`. O inspetor nativo Test-Entry exige a representacao canonica Windows com `\`. Foi extraida somente essa funcao pura do arquivo aprovado e reproduzida a comparacao: entrada com `/` recusada; entrada canonica aceita. Isso demonstra uma incompatibilidade deterministica na invocacao utilizada, sem fabricar identidade de processo ativo. A autoria dessa escolha de formato foi da execucao do agente, nao de alteracao do pacote pelo usuario.

A consulta READ ONLY de reboot/ausencia dos PIDs passou diretamente e pelo proprio invocador Node existente em diagnosticos separados. Essas consultas nao repetiram a admissao. Ainda assim, sem stderr original, nao se atribuiu retrospectivamente uma assertiva exata ao helper que falhou. O formato de entrada precisa ser corrigido antes de qualquer nova tentativa.

## Pendencias

Manter a operacao interrompida. Nenhum script ou gate foi alterado para aceitar caminhos alternativos. Nenhuma outra tentativa foi executada.

Para futura autorizacao, resolver a entrada oficial com `(Resolve-Path -LiteralPath '<PI_BACKEND>\scripts\restabelecer-controlador-apos-reinicio.cjs').Path` e o pacote com Resolve-Path, passando os valores resultantes diretamente ao Node em sessao persistente. Nao reutilizar a representacao com barras `/`. Revalidar processos, MySQL, estado, pacote e evidencias antes da tentativa. Nao remover manutencao, forcar admissao ou iniciar servidor normal.

As 50 simulacoes anteriormente aprovadas nao foram repetidas. Nesta operacao foram executados prechecks de MySQL READ ONLY, diario/checkpoint/backups, integridade de pacote, publicacao unica, verificacao dos hashes-alvo, inventario depois da falha e diagnosticos de leitura/formato.

Evidencias: [precheck](evidencias/precheck-admissao-pos-t1-1793728208316.json), [relatorio original](evidencias/restabelecimento-pos-t1-5c36d7e3-2b92-42a2-baed-9c5a16c5b776.json), [resultado consolidado](evidencias/resultado-readmissao-pos-t1-real-20261103.json).
