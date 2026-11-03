# Ativacao do ciclo T1 concluida — 02/11/2026

**Controlador atualizado ativo. Validacoes operacionais aprovadas. Podemos autorizar a T1 controlada, emitindo outro plano depois dessa autorizacao. Nenhuma escrita T1 executada; HTTP 503 mantido.**

## Identidade e substituicao

| Papel | PID atual | Identidade nativa |
| --- | ---: | --- |
| Controlador atualizado | 25144 | Pai 25928; criado em 02/11/2026 16:17:24.788012 UTC |
| Supervisor Supabase | 15788 | Pai 25144; criado em 02/11/2026 16:18:29.845405 UTC |
| MySQL XAMPP | 4492 | Instancia local existente preservada |

Controlador 5696/supervisor 9804 tiveram identidade, criacao, parentesco, listener e IPC conferidos antes da parada. Inventario sem escritores adicionais identificados, clientes MySQL ou tarefas do projeto. Metadados READ ONLY confirmaram transacoes/jobs/fila ausentes e somente sessoes administrativas conhecidas idle. JWT, configuracao, checkpoint e backups foram autenticados antes da alteracao.

Uma sonda inerte confirmou que Ctrl-Z era entregue como dados, sem EOF, neste terminal. Nao foi fingido encerramento de stdin. A sessao TTY identificada recebeu interrupcao controlada; ambos os PIDs sairam. A fase permaneceu INICIADA, congelada/selada, sem T1. A ausencia dos atores foi conferida nativamente antes de qualquer readmissao.

Durante a parada/troca houve intervalo sem listener, conforme a limitacao do procedimento de troca de sockets; nao houve abertura de trafego normal. O helper de protecao existente criou e identificou a ponte 503 PID 10256, registrando apenas metadados operacionais. HTTP 503 foi confirmado antes da aplicacao do patch.

O patch aprovado foi primeiro aplicado em copia de simulacao: sete hashes finais exatos. Depois, sob manutencao, foi aplicado por git apply com conversao automatica de EOL desativada. Quatro arquivos de producao e tres de testes ficaram exatamente iguais aos afterSha256 aprovados. Sem commits, staging ou alteracao de frontend.

Usou-se a lane explicita --recuperar-substituicao-selada, com todos os atores anteriores ausentes, reconciliacao READ ONLY atual e lock exclusivo. Nao se apagou estado/lock nem se forcaram predicados. O registro orfao ATIVO foi revogado pelo procedimento existente, apos suas verificacoes; nao houve edicao manual para fabricar admissao.

Nova geracao 2, novo manifesto, novo boot e duas capacidades novas foram admitidos legitimamente. Os dois hashes de tickets antigos permaneceram inutilizados; total de quatro tickets consumidos distintos, slots nulos. O candidato foi admitido sem porta; somente a ponte conhecida foi encerrada, com porta livre comprovada antes do bind do supervisor. Nenhum processo desconhecido foi encerrado.

Listener final unico 127.0.0.1:3001. IPC do novo controlador confirmou ida/volta e drenagem, inclusive em consulta final pelo mesmo stdin privado. Nenhum outro controlador recebeu autoridade ativa.

## Validacoes operacionais

- Smoke real isolado: **26 requisicoes, quatro perfis, zero falhas**. Login/JWT, recusa dos JWTs antigos, contrato real de /perfil, GETs, permissoes e seis bloqueios de escrita aprovados. Modulos MySQL nao carregados pelo backend Supabase. API publica continuou 503.
- Primeiro gate/plano emitido: cd747f25-2772-40c6-aeea-ca7ecd6b6e87. Janela efetiva de 27.931 ms; expiracao observada antes da reemissao. Nenhum comando executar-t1 enviado.
- Reemissao selada aprovada: ae88ea2e-f8ec-47c6-bc24-f897d0bd2137. Novo gate/recibo/run; resposta confirmou runAnteriorRevogado. Janela efetiva de 27.917 ms. O prazo maximo segue 30 segundos a partir do recibo, sem acrescentar tempo ao responder.
- Referencia ao primeiro plano foi recusada como esperado em nova tentativa de renovacao. Essa rejeicao negativa era o resultado esperado do teste; nao foi uma falha inesperada de gate ou uma tentativa de escrita.
- Gates de emissao/reemissao executaram novas leituras completas dos oito dominios/catalogos e controle dos escritores. Identidades, perfis, campos persistidos e relacionamentos equivalentes ao checkpoint; **42 MySQL / 52 Supabase, nenhuma divergencia**. Nao se aprovou somente por contagens.
- Dez adicionais preservados integralmente: usuarios 10; eventos 12; custos 7/8; cotacoes 6; itens 22/23; propostas 3; inscricoes 3; solicitacoes 6.
- Hashes de .env/JWT, checkpoint, historico protegido da transicao e backups existentes preservados. Somente metadados autorizados de admissao/smoke foram atualizados no estado privado. Fase INICIADA, controle ATIVO, congelado/selado, sem T1, diario T1 ou lock remanescente.

Os 96 testes isolados ja aprovados nao foram repetidos integralmente. Aplicacao simulada, hashes exatos, readmissao e testes operacionais acima validaram a implantacao. Nenhuma escrita de dados, novo backup, delta orquestrado, rotacao JWT, rollback ou commit.

A lacuna historica de escritas paralelas continua nao comprovada. O aceite de risco residual anterior permanece registrado. Controle operacional atual nao equivale a lock global SQL/REST.

## Procedimento para a T1 autorizada futuramente

1. Obter autorizacao explicita da T1 ANTES da nova emissao. Manter o controlador atual, a sessao privada retomavel e HTTP 503. Revalidar identidade/IPC e escritores. Se o smoke estiver vencido, gerar outro smoke isolado e evidencias atuais antes do plano.
2. Nao executar nenhum dos planos usados nestes testes. Se houver plano pendente, inclusive vencido, renovar com UUID novo e o run realmente pendente. O ultimo run deste teste foi ae88ea2e-f8ec-47c6-bc24-f897d0bd2137:

```json
{"acao":"renovar-plano-t1","pedido":"<UUID_INEDITO>","autorizarReemissao":true,"runAnterior":"<RUN_PENDENTE>"}
```

3. A resposta precisa trazer outro run e expiraEm futuro. Depois da autorizacao ja recebida, consumir imediatamente esse novo run na mesma sessao; nao aguardar outra pausa humana:

```json
{"acao":"executar-t1","pedido":"<OUTRO_UUID_INEDITO>","autorizarT1":true,"run":"<NOVO_RUN>","referenciaAutorizacao":"<REFERENCIA_NAO_SECRETA>"}
```

4. A admissao deve ocorrer antes de expiraEm. Consumo e atomico/uso unico; preflight exige novo gate e nova conferencia antes do diario. Plano expirado nunca e prorrogado ou reativado. Falha de renovacao deixa nenhum plano antigo valido; nova preparacao exige pedido e evidencias novos.
5. Se houver timeout, diario existente, resultado incerto, divergencia ou perda de controle, interromper. Nao repetir escritas automaticamente, nao usar nova emissao para contornar T1 existente e nao executar rollback automatico. Retirar manutencao continua exigindo autorizacao e gate separados.

Nao foram enviados comandos executar-t1 ou liberar-selado nesta ativacao.

## Evidencias

- Patch aprovado: preparacao-ciclo-t1-20261102/alteracoes-ciclo-plano-t1.patch (SHA a21a1efe5bb95a13b7f5576d5554e9b45e28f66ed6a14674e9206e74e8b90d86).
- Smoke: evidencias/smoke-pos-substituicao-9984f904-b36b-4d54-a1f3-0ff8250db82c.json.
- Ativacao, emissoes e preservacao: evidencias/ativacao-ciclo-t1-20261102-1793637069883.json.

**Pronto para autorizar T1 controlada. Reemissao nova e obrigatoria apos a autorizacao; planos de teste nao devem ser consumidos.**
