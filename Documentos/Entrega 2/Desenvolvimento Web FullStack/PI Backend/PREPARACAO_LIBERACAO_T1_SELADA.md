# Gate final, continuidade e T1 — 01/11/2026

**Preparacao implementada e testada. T1 real nao executada. HTTP principal permanece 503.**

## Resultado das tres condicoes

| Condicao | Resultado |
|---|---|
| Reconhecer smoke isolado selado | Gate novo implementado; lane LEITURA existente preservada. Aceita INICIADA/selada com prova completa e separa autorizacao T1 de liberacao normal. |
| Continuidade do controlador | Identidade nativa atual confirmada: controlador 29120, filho 30276, listener exclusivo. Continuidade IPC retomavel ainda NAO comprovada no processo existente. |
| Primeira escrita T1 | Fixture, escopo privado, diario duravel, verificacoes e limpeza transacional por IDs preparados; somente simulacoes executadas. |

## Gate final selado

`config/gate-final-selado.cjs` verifica estado/boot/PID/janela/configuracao, checkpoint por SHA, integridade dos backups existentes, aceite residual persistido e smoke integral dos quatro perfis. O resultado bruto precisa corresponder ao hash registrado pelo supervisor; exige os 26 resultados HTTP, contratos, JWT antigos recusados, permissoes e seis bloqueios de escrita. Evidencia ausente, adulterada, expirada, de outro processo ou apenas contagens nao aprova.

Exige tambem uma verificacao READ ONLY recente dos oito dominios e catalogos: todas as linhas/campos, identidades, vinculos e dez adicionais, com controle dos escritores antes/depois, TLS e ausencia de clientes/jobs/transacoes nao controlados. Prazos mantidos: smoke ate 15 minutos; verificacoes atuais e continuidade ate 30 segundos. Nao se altera checkpoint para acomodar divergencias.

Um recibo de continuidade so pode ser emitido em memoria pelo processo pai real, por ida/volta no IPC herdado e provas nativas antes/depois. Nao pode ser reconstruido de JSON, adotado por outro PID, adulterado ou usado depois da desconexao. O gate reconfere sua vigencia antes de agir.

`liberarSeladoPlanejado` foi preparado, sem chamada real. Exige autorizacao explicita, T1 concluida/limpa, diario completo por SHA, dados atuais equivalentes, drenagem e controle valido. Somente entao usa a transicao protegida LIBERAR; nao abre GET/login para contornar a manutencao.

## Continuidade operacional: bloqueio real restante

Evidencia atual: `evidencias/preparacao-t1-readonly-1fbda03b-bc66-4b46-9aa7-e6d29c5ea89a.json`.

O processo 29120 continua pai nativo do 30276; entrada, criacao, relacionamento e listener foram reconferidos. A consulta externa nao comprova ida/volta IPC. O controlador em execucao foi iniciado sem entrada retomavel de comandos, e o codigo novo nao foi carregado nos processos vivos.

Foram preparados `config/continuidade-controlador.cjs` e `config/comandos-controlador.cjs`. Um futuro controlador legitimo deve instalar a entrada herdada antes de admitir seu filho, manter o canal vivo e aceitar pedidos identificados, sem replay. Preparar T1 nao a executa; executar exige autorizacao e run corretos. Liberar manutencao exige outra autorizacao, T1 limpa e gate final completo. Perda de entrada/saida ou do filho revoga a continuidade.

**Nao instalar por injecao, debugger, adocao de IPC ou edicao manual de fase.** A proxima etapa operacional precisa de um handoff legitimamente admitido, explicitamente autorizado e validado, preservando a manutencao. A admissao/handoff real nao foi executada nesta preparacao. O procedimento operacional dessa troca precisa ser concretizado antes de executar T1; os modulos preparados nao representam uma instalacao no controlador atual.

A troca de processo/codigo exigira smoke isolado e evidencias recentes do novo dono do IPC. Isso nao exige repetir migracao, backups T0, rotacao JWT ou recriar o checkpoint. Evidencia antiga nao recebe horario novo artificialmente.

## T1 proposta

`scripts/t1-controlada.cjs` e os adapters preparados limitam o ensaio a:

1. Gerar run UUID e marcador `TT-T1-<run>`. Usar organizador de teste existente, conferido no checkpoint e por login real. Nunca criar/alterar usuarios para esse ensaio.
2. Persistir diario privado exclusivo fora do Git, no diretorio protegido do supervisor, antes de qualquer tentativa. Vincular run, autorizacao, gate, PID/boot/configuracao/checkpoint e hashes iniciais. Criacao duplicada ou diario interrompido bloqueiam retry.
3. POST /eventos, corpo fixo descartavel: marcador no nome/descricao, local ficticio, data 20/12/2026, horario 14:00, publico 10. Registrar imediatamente o ID devolvido; recusar qualquer ID do checkpoint.
4. Releitura independente completa. Conferir dono, marcador, vinculos e ausencia de alteracoes nas linhas existentes.
5. PUT /eventos/<ID>/custos, um custo Som de R$ 0,10 com o mesmo marcador. Releitura independente confirma persistencia e registra o ID real do custo.
6. Limpar os dois IDs registrados em uma transacao SERIALIZABLE, com bloqueio FOR UPDATE no evento pai e custos. Conferir dono, marcador, IDs, todos os vinculos/linhas e catalogos antes dos DELETEs. Filho desconhecido, referencia extra ou divergencia interrompem antes de excluir. DELETEs usam IDs e predicados exatos; custo antes do evento. Conferir equivalencia completa antes do COMMIT e novamente por leitura independente depois.

O transporte T1 usa capacidade efemera por IPC e o mesmo Express Supabase. Somente duas operacoes HTTP sao admitidas, com JWT organizador e corpo/rota vinculados ao diario. Requests comuns continuam 503. O mesmo ID de operacao nao pode ser repetido, mesmo com outro transporte; leituras/escritas tardias fora do contexto continuam bloqueadas.

A limpeza nao usa substituicao ampla de custos nem DELETE HTTP com cascata para tentar remover dados desconhecidos. `limpeza-t1-transacional.cjs` prepara uma conexao PostgreSQL TLS ao projeto PI Backend, sem fallback MySQL. Sua fabrica e inerte. Abortos locais de transacao em simulacao nao sao rollback de migracao; nenhuma transacao de limpeza ou rollback real foi executada nesta tarefa.

Em timeout, resposta incerta, erro RPC/COMMIT, perda de controle ou divergencia: registrar INTERROMPIDA/incerteza, manter 503 e parar. Nenhum retry de escrita, compensacao ou limpeza no catch. IDs desconhecidos exigem investigacao READ ONLY e decisao posterior.

Somente o avanco comprovado de uma unidade nas sequencias de eventos e custos sera aceito, associado aos dois IDs criados; demais catalogos/sequencias precisam permanecer iguais. Nao se executa setval, reset ou reutilizacao dos IDs removidos. Ownership, incremento e cache das duas sequencias foram conferidos com o schema/catalogo PI Backend. O checkpoint permanece imutavel.

## Verificacao real somente leitura

Na coleta desta preparacao: 42 registros MySQL e 52 Supabase, 42 comuns identicos, dez adicionais preservados em todos os campos. Catalogos equivalentes ao checkpoint; nenhum escritor adicional, transacao, job ou fila nao controlados identificado antes/depois. MySQL nao recebeu conexao do backend. HTTP 503 confirmado; T1 ausente. Estado privado, .env/JWT, checkpoint e backups existentes preservados.

Os dez adicionais continuam: usuario 10; evento 12; custos 7/8; cotacao 6; itens 22/23; proposta 3; inscricao 3; solicitacao 6. Nenhum registro foi criado ou excluido nesta tarefa.

A lacuna historica continua explicitamente NAO comprovada, com o aceite residual anterior preservado. Equivalencia atual e controle operacional nao se transformam em prova negativa universal de SQL/REST.

## Testes e decisao

129 cenarios distintos afetados aprovados, zero falhas: 90 novos de gate/continuidade/comandos/T1/diario/limpeza/sequencias, 34 regressões de smoke/supervisor e cinco regressões filtradas da transicao original. Testes com memoria, IPC/persistencia falsos e sockets locais de fixtures; nenhum banco real foi usado nos testes. Helper nativo passou em analise sintatica e inspecao somente leitura. As consultas reais foram exclusivamente as da verificacao READ ONLY descrita acima.

Cobertura inclui autorizacao obrigatoria, replay, PID/boot/estado adulterados, perda de IPC, expiracao, contratos/permissoes, writes privados delimitados, manutencao publica 503, timeout apos persistencia, IDs preexistentes, vinculos inesperados, limpeza parcial, COMMIT incerto, adulteracao de diario e liberacao selada exclusivamente simulada.

**Ainda nao executar T1 no processo atual.** Preparacao de software aprovada; falta validar a continuidade operacional retomavel por handoff legitimo e renovar smoke/evidencias no dono correto. Depois desses controles e da autorizacao explicita de T1/limpeza, o ensaio podera ser executado sem retirar HTTP 503. Liberacao normal continuara sendo uma decisao separada.

Nenhuma T1 real, admissao/handoff, liberacao HTTP, alteracao de JWT/checkpoint/backups, rollback de bases ou commit foi executado.
