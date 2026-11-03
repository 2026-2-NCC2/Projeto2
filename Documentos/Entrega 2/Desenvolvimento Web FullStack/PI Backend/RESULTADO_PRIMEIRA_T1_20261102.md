# Primeira T1 real — 02/11/2026

**T1 aprovada. Limpeza concluida. Zero residuos desta T1. HTTP 503 preservado; funcionamento normal nao liberado.**

## Execucao autorizada

Controlador 25144, supervisor 15788 e MySQL 4492 revalidados nativamente: criacao, parentesco, entradas e listener unico 127.0.0.1:3001. Status pelo stdin do controlador confirmou IPC exclusivo e drenagem. Estado INICIADA/ATIVO, congelado/selado, nenhuma T1 ou diario anterior e nenhum lock remanescente antes da operacao.

Codigo admitido, patch, configuracao, checkpoint e backups conferidos. Escritores READ ONLY observados antes da execucao: sem clientes/transacoes/jobs adicionais, scheduler MySQL OFF, cron/fila Supabase vazios, apenas roles administrativas conhecidas idle, TLS verificado.

O smoke anterior estava vencido; foi renovado antes de emitir o plano: 26 requisicoes nos quatro perfis, aprovado, sem escrita ou retirada de manutencao. Nao se reutilizou evidencia vencida.

Plano novo: **00fd0398-74a4-4bd7-a763-bdac24b78237**. Emissao 17:12:02.017 UTC, expiracao 17:12:30.000 UTC. Comando executar-t1 enviado uma unica vez com aproximadamente 19,4 segundos restantes. O controlador validou e consumiu a capacidade dentro da janela, antes de await/lock/diario; revalidou outro gate autentico e o snapshot antes do diario. Nao houve prorrogacao ou reativacao de plano expirado.

O usuario ja havia autorizado esta T1 antes da emissao. Nenhum pedido adicional de permissao interrompeu a janela valida. Nenhum retry de escrita, nova rotacao JWT, backup ou delta orquestrado foi executado.

## Registros criados e removidos

| Operacao | Resultado | Registro descartavel |
| --- | --- | --- |
| POST /eventos | HTTP 201 | Evento **16**, organizador de teste 4 |
| PUT /eventos/16/custos | HTTP 200 | Custo **13**, R$ 0,10, vinculado ao evento 16 |
| Limpeza SQL delimitada | COMMIT confirmado | Somente custo 13 e evento 16 removidos |

Nome/descricao usaram exclusivamente o marcador TT-T1-00fd0398-74a4-4bd7-a763-bdac24b78237. IDs registrados no diario privado antes da limpeza. Nenhum usuario, evento ou custo preexistente foi excluido ou alterado.

Limpeza em transacao SERIALIZABLE, com lock do evento pai, identidade/marker/valor dos filhos verificados, conteudo integral dos oito dominios comparado antes/depois e DELETE limitado aos IDs registrados. Custos removidos antes do evento; os dois DELETE retornaram exatamente um ID cada. Nao houve rollback de migracao ou compensacao automatica.

Diario concluido, hash correspondente ao registro persistido, tres operacoes/tres verificacoes, retryCount=0, unknownResult=false, cleanupVerified=true. A resposta autentica do controlador confirmou CONCLUIDA. O diario privado foi preservado como evidencia; nao contem credenciais de login.

## Auditoria final independente, somente leitura

As 17:19:43 UTC (14:19:43 BRT), outra leitura dos oito dominios confirmou **42 registros MySQL / 52 Supabase**, todos os campos, identidades, perfis e relacionamentos equivalentes ao checkpoint. Nao se usou apenas igualdade de contagens.

Evento 16 e custo 13 ausentes. Zero linhas com o marcador desta T1. Hashes anteriores/posteriores dos dados iguais; tres verificacoes do diario correspondem a mesma baseline. Nenhum resquicio foi encontrado em outros dominios.

Os dez adicionais preexistentes permanecem integralmente preservados: usuarios 10; eventos 12; custos 7/8; cotacoes 6; itens 22/23; propostas 3; inscricoes 3; solicitacoes 6. A limpeza nao inclui esses registros antigos.

Catalogos equivalentes, exceto os dois avancos de sequencias previstos para os IDs consumidos pela T1. Sequencias nao foram resetadas. Arquivo do checkpoint e artefatos de backup permaneceram inalterados.

Hash de .env/JWT preservado, manifesto executavel igual ao admitido, nenhuma mudanca de codigo ou contrato HTTP. Estado continua INICIADA/ATIVO, congelado/selado, sem lock. Estado e diario ficaram estaveis durante a auditoria. Probe publico antes, durante e depois retornou HTTP 503. Nenhum liberar-selado foi enviado.

Escritores observados antes/depois da auditoria final: zero clientes/transacoes/jobs MySQL concorrentes; nenhuma cron/fila HTTP Supabase; somente roles administrativas conhecidas idle, sem transacao aberta. A lacuna historica continua reconhecida e nao foi convertida em comprovacao positiva de ausencia historica de escritas.

## Criterios para retirar manutencao

**Dados, limpeza, diario e controle operacional passaram nas verificacoes.** Nao foi identificada divergencia remanescente. Nenhum dado descartavel desta T1 resta nos bancos; as evidencias e os dez adicionais preexistentes devem permanecer.

O gate composto de LIBERACAO **nao foi executado**: a interface atual oferece liberar-selado, que avalia o gate e depois retira a manutencao. Esse comando nao foi invocado, respeitando a instrucao de manter HTTP 503.

Portanto, as verificacoes tecnicas observadas foram atendidas, mas a retirada ainda depende de autorizacao explicita e da avaliacao atomica/fresca desse gate no controlador atual. Nao apresentar esta auditoria como capacidade permanente de liberacao.

O smoke desta operacao iniciou as 17:10:44.913 UTC e seu limite temporal atual e **17:25:44.913 UTC (14:25:44.913 BRT)**. Os recibos/observacoes atuais possuem prazo proprio de 30 segundos e deverao ser recolhidos novamente na liberacao. Se evidencias vencerem ou controles mudarem, interromper; nao repetir T1, editar horarios/estado ou contornar o gate.

O par atual precisa permanecer ativo e acessivel pela mesma sessao privada. Nao reiniciar o controlador nem alterar codigo durante a decisao de liberacao.

## Evidencias

- Smoke renovado: evidencias/smoke-pos-substituicao-26e5cc54-80b3-4feb-924f-13ffe0ac38a8.json.
- T1, resposta do controlador e auditoria completa: evidencias/primeira-t1-real-20261102-1793640866374.json.
- Diario privado: t1-00fd0398-74a4-4bd7-a763-bdac24b78237.privado.json, no diretorio privado do supervisor, fora do Git.

**T1 e limpeza aprovadas. Manutencao mantida. Autorizacao de retirada e gate final de LIBERACAO permanecem pendentes. Nenhum commit criado.**
