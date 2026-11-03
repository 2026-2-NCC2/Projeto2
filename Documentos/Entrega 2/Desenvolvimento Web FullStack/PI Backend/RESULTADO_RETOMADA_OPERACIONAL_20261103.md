# Retomada operacional: interrompida antes da admissao

**Implantacao ainda incompleta. A publicacao atomica funcionou em ambiente real, mas o lancador recusou a admissao. HTTP 503 mantido. Nenhuma nova tentativa foi executada.**

## Controles aprovados

Modo Verificar retornou APLICADO_AGUARDANDO_ADMISSAO, 27 hashes finais confirmados e patchApplyRequired=false. Nao houve reaplicacao do patch nem modificacao de codigo. Controlador 25144/supervisor 15788 mantiveram entradas, criacoes, parentesco e listener unico 127.0.0.1:3001. O canal privado original confirmou IPC/status e drenagem com pedidos novos.

Antes da retomada, outra reconciliacao exclusivamente READ ONLY aprovou os oito dominios completos: identidades, perfis, todos os campos, relacionamentos e catalogos, normalizando somente os avancos de sequencias previstos pela T1. Foram 42 registros MySQL / 52 Supabase; os dez adicionais permaneceram intactos. Evento 16/custo 13 da T1 ausentes, diario concluido e limpeza validados. Nenhum reset de sequencia, delta orquestrado, backup novo ou rotacao JWT.

Inventarios antes/depois e consultas READ ONLY confirmaram ausencia de escritores/clientes/jobs concorrentes nao autorizados, scheduler MySQL OFF, cron/fila Supabase vazios, sessoes administrativas conhecidas idle e TLS verificado. Integridade dos backups existentes conferida. Evidencia: evidencias/precheck-retomada-pos-t1-1793676380264.json.

A lacuna historica permanece explicitamente reconhecida. Essas observacoes atuais nao comprovam ausencia historica de escritas paralelas e nao constituem lock global dos bancos.

## Execucao e interrupcao

O unico coordenador corrigido foi iniciado uma vez, com autorizacao explicita e pacote SHA-256 43ba0c318f92caee38d3ec38b41ff33057ec10525052935960324fde85074a33. Ele publicou o status, confirmou bytes/ACL/hash/estado e revalidou antes de invocar o CLI oficial. O recibo STATUS_VERIFICADO_ANTES_DO_LANCADOR confirmou SHA-256 03e1180d185f5ce97009afa4d1b82838ec8ff7ec0f67566a64849939b2504e58. A correcao NullString funcionou; nao ocorreu a falha File.Replace anterior.

Durante o preflight, foi coletada outra resposta real do IPC antigo e o publicador atomico confirmou atualizacao com ok=true/exit_code=0 e SHA-256 d6803a5bba0184a26aa12ff21b25ac47edc67618bee683453402ac9c18a6a5b7.

Depois desse sucesso houve erro na checagem adicional criada pela orquestracao: o script PowerShell foi chamado por `& publicar-status.ps1` dentro do mesmo processo, mas em seguida tentou-se consultar $LASTEXITCODE como se tivesse sido um programa nativo. Em sucesso essa variavel ainda nao estava definida; StrictMode provocou falha e exit_code=1. O publicador havia confirmado a gravacao, mas o comando externo como um todo falhou. Nao se ignorou esse erro nem se iniciou outro candidato.

O coordenador principal retornou SUBSTITUICAO_INTERROMPIDA e RETOMADA_LANCADOR_RECUSADO, exit_code=1. O retorno publico nao identificou a assertiva interna da recusa; nao se atribuiu uma causa interna sem essa evidencia.

As duas observacoes reais tinham verificadoEm=1793676472828 e 1793676522872: intervalo de **50,044 segundos**, superior a validade de 30 segundos. A coleta manual nao sustentou uma observacao continuamente recente durante as leituras. Isso deixou uma lacuna temporal compativel com recusa por expiracao, mas nao substitui o diagnostico interno do CLI.

A operacao foi interrompida. Nao houve retry de admissao, edicao de horarios/nonces, ticket reutilizado, rollback, T1 ou escrita de dados. As gravacoes realizadas foram somente os metadados privados de observacao/status previstos no procedimento.

## Estado depois da interrupcao

As 00:31:28 BRT de 03/11/2026, controlador 25144 e supervisor 15788 continuavam com identidades originais. O candidato recusado nao permaneceu ativo. Listener exclusivo e HTTP 503 confirmados. Fase INICIADA, controle ATIVO, congelado/selado. Lock oficial e reserva do coordenador foram liberados normalmente.

Estado privado permaneceu byte a byte igual: SHA-256 083542b81235f5b68e6e98c140cef38abee5a1c4a63117f61283eb7865535d45. Diario T1, .env/JWT e checkpoint conservaram seus hashes. T1 continua CONCLUIDA, cleanupVerified=true. Os 27 hashes aplicados permanecem corretos. Nenhum processo antigo foi substituido e nenhum candidato recebeu autoridade selada.

A integridade dos oito dominios/dez adicionais foi comprovada no precheck acima. Nao houve reconciliacao final posterior a admissao, pois a admissao nao aconteceu. O smoke novo nos quatro perfis e o gate final nao foram executados; continuam pendentes.

## Bloqueios restantes

- Tratar corretamente o resultado do publicador no processo escolhido: nao consultar $LASTEXITCODE indefinido apos invocar um script PowerShell diretamente. Preservar a exigencia de resultado positivo e o bloqueio diante de qualquer falha.
- Sustentar a coleta/publicacao real do IPC dentro da janela de 30 segundos, sem pausas longas entre observacoes. Nao prolongar TTL nem fabricar horarios.
- Identificar a condicao interna que produziu a recusa do CLI antes de nova admissao. O estado atual nao pode ser forcado ou reiniciado para contornar o gate.
- Depois de nova autorizacao e admissao legitima, executar smoke isolado, reconciliacao atual e gate final. Manter a mesma sessao privada do par antigo aberta ate uma substituicao legitimamente concluida.

Os 72 testes anteriores nao foram repetidos; nesta tentativa foram executados os controles operacionais e as duas publicacoes atomicas reais descritas. Nenhum commit foi criado.

**Nao esta pronto para liberacao definitiva. Manutencao mantida; diario, JWT, checkpoint, backups e dados existentes preservados.**
