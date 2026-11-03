# Implantacao operacional pos T1: interrompida

**Implantacao incompleta. Patch aprovado aplicado em disco; novo par nao admitido. HTTP 503 mantido pelo controlador 25144/supervisor 15788. Funcionamento normal nao pode ser liberado.**

## Controles aprovados antes da tentativa

Identidades nativas e criacao confirmadas: controlador 25144, pai 25928, criado em 02/11/2026 16:17:24.788012 UTC; supervisor 15788, pai 25144, criado em 16:18:29.845405 UTC. Listener unico 127.0.0.1:3001 e HTTP 503. O canal privado existente confirmou repetidamente status/IPC e drenagem, inclusive depois da aplicacao do patch.

Reconciliacao atual exclusivamente READ ONLY aprovada as 02:37:11 UTC de 03/11/2026 (23:37:11 BRT de 02/11): oito dominios completos, campos, IDs, perfis, relacionamentos, catalogos e os dez adicionais equivalentes ao checkpoint aprovado. Contagens 42 MySQL / 52 Supabase; igualdade de contagens nao foi usada isoladamente.

Dez adicionais preservados nessa leitura: usuarios 10; eventos 12; custos 7/8; cotacoes 6; itens 22/23; propostas 3; inscricoes 3; solicitacoes 6. Evento 16 e custo 13 da T1 ausentes; diario concluido e limpeza conferidos. Somente avancos de sequencias previstos foram normalizados para comparacao, sem reset.

Inventario local antes/depois e consultas dos escritores aprovados: nenhum processo/cliente/job concorrente nao autorizado, scheduler MySQL OFF, cron/fila Supabase vazios, somente sessoes administrativas conhecidas idle, TLS verificado. Integridade dos backups T0 existentes conferida, sem gerar outros backups. Configuracao exclusiva do projeto PI Backend confirmada.

Evidencia: evidencias/precheck-implantacao-pos-t1-1793673431715.json. A lacuna historica permanece explicitamente reconhecida: a leitura atual e o controle operacional nao comprovam ausencia historica de escritas paralelas nem constituem lock global dos bancos.

## Aplicacao e falha operacional

SHA-256 do pacote aprovado: f1bb2c679d5b040187ccdad6cecbb469cf82c897ed23fb7e985821aa83c00943. Patch: aec96b064c03873b9204e75e27250b428162a92acd53e983012ff3533a311269.

Aplicacao autorizada dos 27 arquivos executada depois do check correto na raiz Git. Todos os hashes finais coincidiram com o pacote. Nao houve commit ou rollback. Isso atualizou o codigo em disco; nao atualizou o codigo ja carregado no par antigo nem seu manifesto admitido.

O primeiro arquivo de observacao real do status foi criado fora do Git, com ACL protegida para o usuario Windows atual e SYSTEM. A renovacao atomica posterior falhou na chamada PowerShell `[IO.File]::Replace(temporario, destino, $null)`: ArgumentException, "O caminho tem um formato invalido". O arquivo original nao foi substituido e sua observacao expirou. O temporario foi preservado como evidencia privada; nao contem JWT, senha ou credenciais.

Houve um erro de sequenciamento da orquestracao: mesmo depois do exit_code=1 nessa atualizacao, o lancador foi iniciado. Ele retornou SUBSTITUICAO_INTERROMPIDA, exit_code=1, normalOperationReleased=false. A causa interna do CLI nao foi detalhada pelo retorno publico; o arquivo de status fornecido estava comprovadamente vencido. Nao se fabricou outro recibo ou alterou o horario para prosseguir.

A admissao foi bloqueada antes do fence: o estado privado permaneceu byte a byte igual ao anterior, nenhum par antigo foi encerrado e nenhum candidato recebeu autoridade. A operacao foi interrompida; nao houve segunda tentativa de admissao, escrita T1, renovacao real do smoke ou liberacao.

## Conferencia depois da interrupcao

As 02:42:49 UTC, controle INICIADA/ATIVO, congelado e selado. Controlador 25144/supervisor 15788 preservaram identidades e listener exclusivo. Nenhum outro processo com as entradas de controlador/supervisor permaneceu; o candidato recusado saiu. Nenhum lock exclusivo remanescente.

Hash do estado privado inalterado: 083542b81235f5b68e6e98c140cef38abee5a1c4a63117f61283eb7865535d45. Diario corresponde ao hash persistido; T1 continua CONCLUIDA, cleanupVerified=true. .env/JWT e checkpoint mantiveram seus hashes. Os 27 arquivos em disco ainda correspondem exatamente ao patch aprovado. HTTP 503 foi confirmado depois da recusa.

Os oito dominios/dez adicionais foram comprovados na reconciliacao previa acima. Nao foi executada outra reconciliacao final depois da falha, nem esse resultado previo foi apresentado como novo gate de liberacao. Nenhuma escrita de dados ou nova limpeza foi executada nesta operacao.

## Pendencias

1. Corrigir/testar a atualizacao atomica do arquivo de observacao no PowerShell utilizado, preservando ACL, UTF8 sem BOM e a prova real de origem. Nao editar timestamps/nonces para contornar validade.
2. Corrigir o sequenciamento operacional: qualquer exit_code diferente de zero precisa impedir o lancamento da etapa dependente.
3. Obter autorizacao de retomada e revalidar identidade, status, escritores e dados antes de nova admissao. Nao reaplicar automaticamente o patch ja aplicado: conferir hashes em disco e o manifesto antigo ainda admitido.
4. Depois da admissao legitima, executar renovacao/smoke isolado novo e gate final com evidencias recentes. Esses controles continuam pendentes.

O par antigo precisa permanecer ativo e com o canal privado aberto. Nao reiniciar servicos, fechar seu stdin ou executar operacoes mutaveis antigas: o codigo em disco ja tem o manifesto novo, enquanto o par antigo continua admitido com o anterior. Nao editar estado, diario ou manifesto para resolver essa diferenca.

Os 306 testes da preparacao nao foram repetidos nem apresentados como novos testes operacionais. Esta tentativa executou as verificacoes reais de identidade/IPC/503, reconciliacao, escritores, backups existentes e hashes descritas acima.

**Criterios de liberacao ainda nao atendidos. Manutencao mantida. Sem alteracao de JWT/checkpoint/backups, sem T1 repetida, sem rollback automatico e sem commits.**
