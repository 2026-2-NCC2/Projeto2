# Ciclo de validade T1 — 02/11/2026

> Atualizacao operacional: patch aplicado e controlador atualizado admitido, sem T1. Controlador 25144 / supervisor 15788; HTTP 503. Consulte [resultado da ativacao](../RESULTADO_ATIVACAO_CICLO_T1_20261102.md). As notas e o manifesto de preparacao abaixo registram o estado anterior a essa ativacao.

**Correcao implementada e validada em copia isolada. Pronta para autorizacao de ativacao operacional controlada. Nao aplicada ao controlador vivo. Nenhuma T1 real executada.**

## Origem do bloqueio

`scripts/gate-reconciliacao-recuperacao.cjs:8` define `TTL_ATUAL=30000`: validade das observacoes atuais, recibo IPC e gate final. A reconciliacao/smoke possui limite separado de 15 minutos; esse limite nao prolonga o recibo de 30 segundos.

O controlador anterior guardava um plano em `planejado`, recusava outro `preparar-t1` e nao oferecia reemissao. O executor validava esse gate antigo antes de tentar coletar outro. Aguardar autorizacao humana depois da emissao deixava o plano vencido sem caminho seguro de renovacao.

## Correcao preparada

- O prazo continua em **30 segundos**, sem aumento de constantes. `expiraEm` e limitado pelo inicio do recibo IPC; emitir o objeto depois nao acrescenta outros 30 segundos.
- Cada emissao usa gate autentico novo, novo nonce IPC e novo `run`. Gate/nonce/run ja usados nao podem emitir novamente. Plano JSON ou adulterado nao e autentico.
- Estado privado em memoria: EMITIDO -> EXPIRADO, REVOGADO ou CONSUMIDO. Nao existe transicao de retorno. Relogios civil e monotono impedem reativacao por ajuste de horario.
- Existe somente um plano emitido por controlador/backend/boot. Nova emissao revoga o anterior. Durante consumo/execucao, outra emissao e recusada.
- `renovar-plano-t1` exige pedido novo, `autorizarReemissao:true` e o `runAnterior` correto. Revoga o anterior ANTES de aguardar IPC, leituras e gate. Falha deixa o anterior invalido; nunca restaura o plano antigo como fallback.
- A coleta refaz identidades/controle dos escritores, dados/catalogos dos oito dominios, checkpoint/backups, smoke e recibo IPC. Contagens iguais ou `T1=false` nao substituem o gate completo. Evidencias antigas continuam recusadas.
- Resposta informa `emitidoEm` e `expiraEm`, em epoch UTC. O tempo restante pode ser menor que 30 segundos devido ao tempo do proprio recibo. Nao considerar que a resposta concede uma janela nova inteira.
- Fechamento do canal, smoke novo, adulteracao, emissao tardia apos fechamento e perda de evidencia invalidam planos pendentes. Pedidos duplicados e execucao com run anterior continuam recusados.

## Consumo e duracao da execucao

Os 30 segundos limitam a **admissao da execucao**. O executor consome a capacidade de modo sincronico, dentro da janela e antes de qualquer await, lock, diario ou transporte. Uma capacidade vencida nao chega a essas etapas. Uma capacidade consumida nunca autoriza outra execucao, inclusive por outro objeto executor.

Consumo nao prorroga nem reativa o plano. Depois de consumido, o plano deixou de ser uma capacidade reutilizavel. Preflight demorado exige um gate realmente novo, com outro recibo, sob lock exclusivo. O gate novo e conferido novamente apos o snapshot e antes de criar o diario. Operacoes subsequentes conservam controle atual, escopo privado e verificacoes existentes.

Isso separa admissao de uma operacao autorizada do tempo de suas leituras/requisicoes. Nao cancela cegamente uma operacao que ja pode ter escrito. Timeout/resultado incerto continua interrompendo o fluxo sem retry ou limpeza automatica; diario/T1 persistida impedem nova emissao operacional. IDs, atomicidade e limpeza do executor existente nao foram modificados.

## Arquivos propostos

Quatro arquivos de producao: `config/comandos-controlador.cjs`, `config/gate-final-selado.cjs`, `scripts/t1-controlada.cjs`, `scripts/operacoes-controlador-selado.cjs`. Nenhuma rota ou contrato HTTP alterado.

O patch [alteracoes-ciclo-plano-t1.patch](alteracoes-ciclo-plano-t1.patch) inclui esses quatro arquivos e tres arquivos de testes. `manifest-alteracoes.json` registra hashes anteriores/novos e do patch. A verificacao `git apply --check` passou; o patch **nao foi aplicado**.

Esta pasta fica fora dos diretorios percorridos pelo manifesto executavel ativo. Dependencias auxiliares locais foram copiadas sem `.env`, dumps ou certificados privados; ficam ignoradas pelo Git. O codigo ativo e seu manifesto continuam identicos. Isso preserva a autoridade atual enquanto a mudanca e revisada.

## Ativacao futura, somente autorizada

O PID 5696 permanece com o codigo anterior e seu plano vencido. **Nao enviar `renovar-plano-t1` para esse codigo antigo.** Nao fazer hot reload, injecao, alteracao manual do estado ou tentativa ficticia de executar T1 para limpar o cache.

A ativacao exige autorizacao operacional especifica: verificar identidades/503, encerrar controladamente somente o par proprio conforme o procedimento selado, conservar ponte 503, aplicar o patch com hashes de origem conferidos e readmitir legitimamente o controlador com novo manifesto/tickets. Preservar INICIADA, JWT, checkpoint e backups. Nao apagar locks ou forcar admissao.

Depois, conferir exclusividade/IPC e recolher evidencias/smoke necessarios para o novo processo. A ativacao nao inclui T1 nem retirada de manutencao. Nenhuma dessas etapas operacionais foi executada nesta tarefa.

## Como executar T1 na janela valida

Somente com o codigo novo admitido e **autorizacao explicita de T1 ja recebida**:

1. Manter a mesma sessao privada de stdin, com manutencao 503 e escritores sob controle. Obter a decisao humana ANTES de emitir o plano que sera consumido; nao aguardar nova decisao depois de sua emissao.
2. Se nao houver plano pendente, enviar `preparar-t1`. Se houver um, inclusive vencido, enviar a reemissao abaixo. Cada pedido usa UUID inedito:

```json
{"acao":"renovar-plano-t1","pedido":"<UUID_INEDITO>","autorizarReemissao":true,"runAnterior":"<RUN_PENDENTE>"}
```

3. Aguardar resposta positiva com **outro run** e `expiraEm`. Somente esse run pode ser usado. Emissao/renovacao nao executa T1 nem grava diario.
4. Dentro do prazo retornado, enviar imediatamente, na mesma sessao, a execucao ja autorizada:

```json
{"acao":"executar-t1","pedido":"<OUTRO_UUID_INEDITO>","autorizarT1":true,"run":"<NOVO_RUN>","referenciaAutorizacao":"<REFERENCIA_NAO_SECRETA>"}
```

5. `T1_PLANO_EXPIRADO` antes da admissao exige emissao nova e explicita; nao aumentar TTL, alterar horario ou reutilizar o run. Falha de renovacao deixa nenhum plano anterior valido; uma nova tentativa de preparacao exige novo pedido e todas as evidencias.
6. Falha depois do consumo nao permite repetir esse plano. Se houver diario, timeout ou resultado incerto, interromper e investigar. Nao reemitir para contornar uma T1 existente. Retirar manutencao continua exigindo autorizacao separada e os gates de conclusao/limpeza.

## Testes e preservacao

**96 cenarios aprovados; zero falhas.** Sao 32 novos e 64 regressoes afetadas. Sete JavaScript passaram na verificacao sintatica. Os demais testes de homologacao aprovados nao foram repetidos.

Cobertura: origem efetiva do prazo, limite exato, relogio monotono/retrocesso civil, expiracao irreversivel, novo run/nonce/gate, JSON e fixture adulterados, evidencias antigas, renovacao autenticada, revogacao antes da coleta, IPC perdido, emissao concorrente, executores concorrentes, fechamento durante emissao, falha de lock, consumo unico e gate novo antes de qualquer diario. Regressoes preservam JWT, permissoes, dez adicionais, contratos, timeout sem retry, limpeza e bloqueio HTTP.

Comando executado nesta pasta:

```powershell
node --require ./tests/isolamento-sem-efeitos.cjs --test --test-isolation=none tests/ciclo-validade-t1.test.cjs tests/operacoes-pos-substituicao.test.cjs tests/t1-controlada.test.cjs tests/continuidade-comandos.test.cjs tests/gate-final-selado.test.cjs
```

O preload proibe sockets/listeners, subprocessos e arquivos privados. Todos os diarios e efeitos das T1 simuladas ficaram em memoria. Nenhuma conexao aos bancos foi executada nesta tarefa. O grafo estava desatualizado; fonte, diff e testes fundamentaram a revisao.

Conferencia real final: HTTP 503; IPC atual respondeu; estado privado, .env/JWT, checkpoint, artefatos de backup e manifesto do codigo ativo preservados. Controlador 5696/supervisor 9804 continuam ativos. Sem T1, novos dados, rollback ou commits.

**Pronto para autorizacao operacional de ativacao. Ainda nao ativado; T1 real continua bloqueada.**
