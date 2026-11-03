# Smoke e gate final — 02/11/2026

**Smoke aprovado: quatro perfis, 26 requisicoes, zero falhas. Gate final aprovado no momento da avaliacao. T1 nao executada. HTTP 503 preservado.**

## Controles e evidencias

Controlador 5696, supervisor 9804 (filho de 5696), MySQL XAMPP 4492. Criacao, parentesco, entradas nativas e listener unico 127.0.0.1:3001 reconfirmados. Resposta real de status pelo stdin do controlador confirmou ida/volta IPC legitima; o gate usou recibo genuino em memoria. Nenhum controlador adicional ou handoff foi executado.

Inventario sem outros escritores identificados, clientes MySQL adicionais ou tarefas do projeto. Metadados READ ONLY mostraram zero transacoes/jobs concorrentes, scheduler MySQL OFF, fila HTTP/cron Supabase vazios, apenas roles administrativas conhecidas idle e TLS verificado. Nao houve encerramento de sessoes administrativas.

Smoke real isolado no supervisor admitido validou admin, organizador, fornecedor e participante: login, JWT atual, recusa de JWTs antigos, contrato real id/nome/email de /perfil, GETs e permissoes. Seis probes de escrita retornaram 503 antes de atingir persistencia. Modulos MySQL nao foram carregados pelo backend Supabase. A porta publica permaneceu 503, inclusive no probe posterior.

O gate foi executado pelo comando privado preparar-t1. Essa operacao valida o gate e cria somente plano em memoria; nao cria diario, dados ou T1 persistida. Resposta positiva para o run d1f109dd-2369-4358-a8e1-7279d84d44da e checkpoint 349d6df4-7c15-4960-b739-dfd91fd53c8d. Nenhum executar-t1 foi enviado.

O gate recolheu novamente todos os campos dos oito dominios e catalogos por READ ONLY, com escritores antes/depois, e exigiu equivalencia integral ao checkpoint. Passaram identidades, perfis, relacionamentos e conteudo; 42 registros MySQL / 52 Supabase. Dez adicionais preservados: usuarios 10; eventos 12; custos 7/8; cotacoes 6; itens 22/23; propostas 3; inscricoes 3; solicitacoes 6. Igualdade de contagens isolada nao foi usada como aprovacao.

Hashes de .env/JWT e checkpoint identicos; artefatos existentes dos backups conferidos. Hash do estado protegido, removendo apenas o marcador de smoke e o caminho autorizado da evidencia atual, permaneceu igual. Fase INICIADA, controle ATIVO, selado/congelado, dois tickets consumidos/inutilizados, nenhum lock e nenhuma T1. Nenhum codigo executavel, contrato HTTP, backup, dado ou credencial foi alterado nesta tarefa. Nenhum rollback ou commit.

A lacuna historica continua reconhecida, sem alegacao de ausencia historica comprovada de escritas. O aceite anterior de risco residual permanece registrado.

## Bloqueio operacional encontrado

A aprovacao do gate e temporaria. TTL_ATUAL=30000 em scripts/gate-reconciliacao-recuperacao.cjs. config/gate-final-selado.cjs:38 recusa plano/recibo com mais de 30 segundos.

config/comandos-controlador.cjs:14 conserva o plano em memoria e recusa outro preparar-t1 enquanto esse plano existir. Nao existe comando para descartar/renovar plano pendente. scripts/t1-controlada.cjs:33 verifica o gate antigo antes de chamar revalidarGate na linha 34. Portanto, um plano expirado nao alcanca a revalidacao posterior.

A resposta do gate foi observada antes da verificacao final de 14:55:59.018 UTC. As 14:57:03 UTC, o plano tinha necessariamente mais de 30 segundos. **O plano atual expirou e nao possui renovacao pelo canal existente.** Essa conclusao foi comprovada pelo limite temporal e pelo codigo; nenhuma execucao T1 foi provocada para testar a recusa.

O gate nao reprovou dados, autenticacao ou permissoes. Entretanto, nao estamos prontos para executar T1 com este plano. Nao simular autorizacao T1 para esvaziar o plano, nao reiniciar controlador, nao editar estado ou ampliar TTL como contorno. O processo e a manutencao permanecem ativos.

Pendencia: preparar/testar renovacao autenticada que inutilize o plano anterior e recolha todas as evidencias atuais antes de emitir outro, conservando os prazos e demais controles. Qualquer alteracao do codigo do controlador admitido precisa de procedimento controlado; nao houve hot patch ou substituicao nesta tarefa.

## Arquivos

- Smoke real: evidencias/smoke-pos-substituicao-92bc0812-66bd-4f57-b68f-60e6f2b6bc34.json.
- Resultado e preservacao: evidencias/gate-final-smoke-20261102-1793631507309.json.

Pronto para autorizar T1: **nao**, pendente resolver a renovacao do plano expirado. Os testes de implementacao anteriores nao foram repetidos; esta tarefa executou apenas o smoke real, verificacoes de identidade/preservacao e o gate autorizado.
