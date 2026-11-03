# Renovacao segura do smoke apos T1

**161 testes isolados aprovados, zero falhas. Implementacao preparada em copia isolada. Nenhuma renovacao real ou ativacao operacional executada.**

## Causa confirmada

O gate final exige smoke iniciado ha no maximo 15 minutos. O callback `smoke()` de `scripts/operacoes-controlador-selado.cjs` exige `!initial.transicao.t1`. Essa trava protege a emissao anterior a T1, mas tambem impedia recolher novas provas depois da conclusao e limpeza. O gate de LIBERACAO ja reconhecia o diario concluido; o bloqueio estava na renovacao do smoke.

Os prazos nao foram aumentados. Recibos IPC, capturas e inventarios atuais continuam limitados a 30 segundos; smoke continua limitado a 15 minutos desde o inicio.

## Implementacao proposta

O novo comando privado `renovar-smoke-pos-t1` exige autorizacao especifica, UUID de pedido inedito, referencia de autorizacao e o run da T1 **ja concluida**. Esse run identifica a evidencia preservada; nao e um novo plano ou ticket de escrita.

O fluxo:

1. Confere autoridade do controlador admitido, ausencia de operacao concorrente e T1 CONCLUIDA, com limpeza confirmada e sem resultado incerto. Revoga qualquer capacidade T1 pendente e invalida o selo anterior antes das operacoes assincronas.
2. Captura o hash do estado protegido e os bytes do ambiente. Mantem inalterados T1/diario, fase, identidade do supervisor, checkpoint, configuracao, aceite da lacuna historica e historico de tickets.
3. Recolhe evidencias atuais de ambos os bancos, escritores e IPC autentico. Valida integralmente os oito dominios, todos os campos, IDs, perfis, relacionamentos, catalogos, backups existentes e os dez adicionais. Confere hash/bytes do diario, tres operacoes, tres provas, cleanupVerified, retryCount=0 e ausencia dos IDs descartaveis. Contagens iguais nao bastam.
4. Executa outro smoke privado pelo IPC do mesmo supervisor: quatro perfis, 26 requisicoes, JWTs antigos recusados, /perfil pelo contrato real, permissoes, GETs e seis bloqueios de escrita. A porta publica permanece 503.
5. Recolhe novamente as evidencias e reconcilia os oito dominios. Somente os dois avancos de sequencias comprovados pela T1 sao normalizados para comparacao; nenhuma sequencia e resetada.
6. Emite arquivo de evidencia novo com criacao exclusiva, novo ID de renovacao, hash do relatorio anterior e vinculo ao mesmo run/hash do diario. Atualiza somente metadados de smoke/renovacao e o apontador do relatorio no estado operacional.
7. Faz uma **terceira coleta atual** e executa o gate completo de LIBERACAO, sem chamar a retirada da manutencao. O gate confere tambem o vinculo entre o relatorio novo, o diario e os metadados da renovacao. A resposta informa a validade efetiva do gate.

`config/evidencias-pos-t1.cjs` compartilha a validacao de T1 concluida com o gate final. A validacao anterior foi preservada e ganhou verificacao explicita do horario de conclusao e da preservacao dos dez adicionais. O modo T1 continua recusando qualquer T1 ja registrada.

O canal so recompoe a referencia em memoria a T1 concluida depois de receber a aprovacao completa. Nao chama o executor T1, nao emite plano T1, nao consome outro ticket de admissao e nao libera HTTP. `liberar-selado` continua separado, com autorizacao propria e nova avaliacao integral do gate no momento da liberacao.

## Falhas e concorrencia

O canal serializa pedidos; o callback tambem impede concorrencia com emissao/execucao T1, smoke legado, outra renovacao e liberacao. Pedidos repetidos sao recusados. Fechamento do canal revoga continuidade e impede aprovar respostas tardias.

Qualquer divergencia, evidencia velha, perda de autoridade, falha de transporte ou falha de gate interrompe o fluxo. O selo anterior nao e restaurado como fallback; a renovacao fica rejeitada e a manutencao permanece. Nao existe retry automatico. Uma tentativa futura exige pedido novo e todas as leituras/smoke novamente. Se a autoridade for perdida, o callback nao grava estado fingindo ser outro controlador.

O diario T1 nao e reescrito nem reinterpretado como permissao para repetir a escrita. A limpeza tambem nao e repetida. Tickets expirados/consumidos continuam inutilizaveis; este fluxo nao altera o protocolo de admissao ou os estados irreversiveis dos planos T1.

## Limitacao de implantacao: interromper antes da ativacao

**O mecanismo esta testado, mas ainda nao esta pronto para execucao operacional no par vivo.** Esta copia nao foi aplicada. O controlador atual nao carrega o comando novo.

A admissao vigente em `config/autoridade-selada.cjs:7` e o preflight de `scripts/substituicao-controlador-selada.cjs:19` exigem ausencia de T1. Alem disso, a substituicao existente troca o supervisor, enquanto o diario aprovado esta vinculado ao PID/instancia que executou a T1. Reiniciar ou aplicar o patch diretamente nao constitui ativacao legitima e pode revogar o controle atual.

Essas travas foram preservadas. Nao remover T1 do estado, nao alterar PID/instancia do diario, nao forcar admissao, nao reutilizar tickets, nao atualizar manifesto manualmente e nao injetar codigo no controlador. A proxima preparacao precisa definir e testar a ativacao compativel com T1 persistida, preservando procedencia do diario e autoridade IPC exclusiva. Essa etapa nao foi implementada nem executada aqui.

## Procedimento operacional, depois da ativacao legitimamente validada

1. Obter autorizacao especifica de ativacao/renovacao e concluir o procedimento de implantacao compativel com T1. Enquanto esse procedimento nao estiver validado, **parar aqui**. Nao encerrar o par atual para tentar usar o procedimento antigo.
2. Revalidar identidades nativas atuais, listener unico, autoridade e IPC exclusivo. Manter 503 e controle operacional de todos os escritores. Confirmar fase INICIADA, estado selado/congelado, T1 concluida e diario original intacto. Nao reutilizar PIDs de documentos como prova atual.
3. Pelo mesmo canal privado autorizado, enviar uma unica solicitacao com UUID novo:

```json
{"acao":"renovar-smoke-pos-t1","pedido":"<UUID_INEDITO>","autorizarRenovacao":true,"run":"<RUN_T1_CONCLUIDA>","referenciaAutorizacao":"<REFERENCIA_NAO_SECRETA>"}
```

4. Exigir `ok:true`, `status:SMOKE_POS_T1_RENOVADO`, `requests:26`, `gateApproved:true`, `finalidade:LIBERACAO`, o mesmo run e `gateExpiraEm` futuro. Preservar o relatorio novo, o anterior e o diario. Isso nao retira 503.
5. Se falhar ou expirar, parar. Nao repetir T1/limpeza, nao editar datas e nao aumentar TTL. Uma nova renovacao exige decisao explicita e outro pedido, sem reusar o pedido anterior.
6. A retirada de manutencao exige autorizacao especifica e `liberar-selado` separado. Esse comando recolhe evidencias atuais e revalida o gate completo; a aprovacao desta renovacao nao e uma permissao permanente de abertura. Se o smoke vencer novamente, renovar legitimamente antes de tentar liberar.

Nao executar `preparar-t1`, `renovar-plano-t1` ou `executar-t1` nessa etapa. Nao repetir delta, backups, rotacao JWT ou rollback. A lacuna historica continua reconhecida e nao e convertida em comprovacao historica de ausencia de escritas.

## Testes e artefatos

**65 cenarios novos e 96 regressoes afetadas: 161 aprovados, zero falhas, zero SKIPs.** Foram utilizados somente estado/arquivos/IPC/bancos simulados em memoria. O preload recusa sockets, listeners, subprocessos e acesso aos arquivos privados. Nao houve conexao real aos bancos ou execucao de smoke real.

Cobertura: renovacao valida de smoke vencido, preservacao exata do diario e dos dez adicionais, todos os oito dominios, sequencias esperadas, nova coleta antes/depois/final, conteudo divergente com contagens iguais, relacionamentos, residuos, TLS, checkpoints/backups invalidos, escritores/REST/jobs concorrentes, evidencias expiradas, contratos/perfis/JWT incorretos, falha/interrupcao de transporte, revogacao IPC/autoridade, concorrencia, replay de pedido, fechamento do canal, finalidade incorreta e bloqueio de reexecucao T1.

Comando executado nesta pasta:

```powershell
node --require ./tests/isolamento-sem-efeitos.cjs --test --test-reporter=tap --test-isolation=none tests/renovacao-smoke-pos-t1.test.cjs tests/operacoes-pos-substituicao.test.cjs tests/continuidade-comandos.test.cjs tests/gate-final-selado.test.cjs tests/t1-controlada.test.cjs tests/ciclo-validade-t1.test.cjs
```

Saida integral: [resultado-testes.tap](resultado-testes.tap). Proposta aplicavel: [alteracoes-smoke-pos-t1.patch](alteracoes-smoke-pos-t1.patch). Hashes: [manifest-alteracoes.json](manifest-alteracoes.json). `git apply --check` aprovado sobre os arquivos corretos. Aplicacao feita somente em uma segunda copia de simulacao: os oito hashes finais coincidiram. Patch nao aplicado ao backend ativo.

Os caminhos do patch comecam em `PI Backend/`, enquanto a raiz Git e `Projeto2`. Para verificar o patch, executar Git na raiz do repositorio e usar `--directory="Documentos/Entrega 2/Desenvolvimento Web FullStack/"`, com caminho absoluto do patch. Um `git apply` iniciado no subdiretorio pode ignorar todos os hunks e retornar sucesso; isso nao comprova aplicabilidade. A simulacao usou um destino adicional exclusivamente dentro desta pasta de preparacao e conferiu todos os hashes.

Oito arquivos propostos: tres arquivos de producao alterados, um validador novo, um teste existente refatorado para compartilhar fixture e tres arquivos auxiliares/testes novos. O preload permanece inalterado. A sintaxe dos oito arquivos foi verificada. Os 177 arquivos de origem copiados permaneceram identicos no backend ativo. Nenhum arquivo .env, certificado, dump ou estado privado foi copiado. Nenhum commit criado.

Preservacao dos dez adicionais foi comprovada nas simulacoes e exigida pelo fluxo novo. A verificacao real atual dos bancos permanece pendente da operacao autorizada; nao apresentar os testes isolados como uma nova reconciliacao real.
