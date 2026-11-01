# Substituicao selada do controlador

Preparacao validada em 01/11/2026. **Execucao real ainda nao autorizada nesta etapa.** Nenhum handoff, T1, desbloqueio HTTP ou commit foi executado.

## Causa e mecanismo

O controlador legado conserva seu filho por IPC herdado, mas nao instala entrada retomavel. Alterar arquivos no disco nao modifica esse processo. O protocolo novo substitui o **par controlador/supervisor**, sem adotar IPC alheio, editar a fase ou repetir a recuperacao da migracao.

A fase atual permanece `INICIADA`. Checkpoint, janela, configuracao/JWT e backups permanecem iguais. Somente metadados autorizados de admissao, identidades, tickets consumidos e evidencias sao registrados em `controleSelado`, dentro do estado privado existente.

O candidato instala seu canal privado antes da admissao. Enquanto aguarda, nao possui autoridade. O supervisor anterior e encerrado antes do controlador anterior. Ambos precisam estar ausentes antes da nova admissao. Uma ponte independente atende exclusivamente HTTP 503 durante a preparacao do novo backend. Existe breve intervalo de fechamento/vinculacao dos sockets; pode ocorrer recusa TCP, nunca abertura planejada de trafego normal.

## Controles obrigatorios

- Referencia explicita de autorizacao e aceite do legado sem IPC. A falta de prova IPC anterior permanece registrada. A lacuna historica de escritas tambem permanece reconhecida; equivalencia atual nao comprova continuidade historica.
- Configuracao exata do PI Backend; checkpoint autenticado por SHA-256, artefatos T0 existentes integros e ausencia de T1.
- Inventario nativo atual antes/depois das leituras: PIDs, pais, criacao, entrada conhecida, listener unico `127.0.0.1:3001`, HTTP 503, ausencia de processos/clientes/jobs desconhecidos. PIDs antigos isolados nao servem como evidencia.
- Reconciliacao READ ONLY completa dos oito dominios, campos, identidades, relacionamentos, catalogos e dez adicionais, antes e depois da parada. Igualdade de contagens isolada nao basta. Divergencias impedem admissao.
- Exclusao mutua pelo lock privado `recuperacao-exclusiva.lock`, criado com `wx`. Nunca remover lock encontrado para forcar continuacao.
- Identidade nativa novamente conferida antes de encerrar qualquer processo. O helper abre o handle nativo e revalida criacao, pai e comando. Entradas incidentais em argumentos nao autorizam encerramento.
- Tickets aleatorios de 256 bits, separados por papel, vinculados a PID, pai, boot, identidade da substituicao e geracao. Expiram em 30 segundos. Somente hashes sao persistidos; consumo unico e hashes inutilizados atravessam geracoes.
- Contextos genuinos em memoria para controlador e startup do supervisor. JSON copiado, ticket consumido, PID reutilizado, geracao anterior ou candidato divergente nao conferem autoridade.
- Manifesto SHA-256 do codigo executavel conferido na admissao e nas operacoes. Mudancas posteriores bloqueiam continuidade operacional. Nenhum hot reload ou injecao de IPC.
- Supervisor novo admitido inicialmente sem listener. Ponte conhecida encerrada somente depois da admissao/drenagem; porta livre comprovada antes de vincular o novo backend.
- Nova ida/volta IPC real e identidade nativa antes/depois, no proprio processo controlador. Recibos do gate continuam privados, temporarios e nao serializaveis como prova autentica.
- Smoke antigo preservado como historico, mas invalidado para o novo processo. Exigem-se novo smoke isolado e evidencias recentes para o gate final. Os demais controles do gate e da T1 permanecem obrigatorios.

## Sequencia operacional futura

Executar somente depois de autorizacao especifica. Usar uma sessao persistente com stdin/stdout herdados e acessiveis. **Nao usar `Start-Process`, pipeline encerrado ou processo destacado para o controlador.** Guardar o identificador da sessao para enviar comandos posteriormente.

No diretorio `PI Backend`, resolver a entrada absoluta:

```powershell
$entry=(Resolve-Path '.\scripts\substituir-controlador-selado.cjs').Path
node $entry --executar-substituicao-selada --aceitar-legado-sem-ipc --autorizacao "REFERENCIA_NAO_SECRETA_DA_AUTORIZACAO"
```

Esse comando futuro efetua parada/admissao reais; nao e uma validacao inerte. Le o `.env` existente sem altera-lo. O helper usa `RemoteSigned` somente no processo PowerShell filho; politicas globais e de grupo permanecem intactas.

Esperar `CONTROLE_SELADO_ATIVO`, novo PID/boot, prova IPC e HTTP 503. Confirmar fase `INICIADA`, congelado/selado, configuracao/checkpoint preservados e nenhuma T1. Nenhum processo antigo pode permanecer com autoridade ativa.

Na mesma sessao, enviar linhas JSON privadas. Substituir cada marcador por UUID novo; nao repetir pedidos:

```json
{"acao":"status","pedido":"<UUID_INEDITO>"}
{"acao":"smoke-isolado","pedido":"<OUTRO_UUID_INEDITO>","autorizarSmoke":true}
{"acao":"preparar-t1","pedido":"<OUTRO_UUID_INEDITO>"}
```

O smoke usa Express real por transporte privado selado. Verifica 26 requisicoes, quatro perfis, JWTs antigos, contrato real de `/perfil`, permissoes, consultas e bloqueios de escrita. A porta publica continua integralmente 503. Credenciais e tokens seguem apenas pelo IPC herdado e nao aparecem na saida.

O comando `preparar-t1` revalida dados, escritores, backups, smoke e recibo IPC pelo gate final existente; devolve apenas identificadores do plano. **Nao executa T1.** A resposta positiva nao autoriza escrita automaticamente. Executar T1 e retirar manutencao exigem comandos/autorizacoes separados. Nao envia-los nesta etapa.

## Falhas e retomada

Falha de identidade, timeout, divergencia, codigo alterado, ticket vencido ou perda de canal revoga a autoridade e inutiliza tickets pendentes. A fase da migracao nao e reiniciada. A falha fica em `controleSelado.etapa=FALHA`; congelado/selado permanecem verdadeiros.

A limpeza automatica do protocolo limita-se ao proprio candidato criado pelo processo. Listener desconhecido nunca e encerrado. Quando possivel, conserva/restaura ponte 503 conhecida. Porta desconhecida ou impossibilidade de comprovar identidade interrompem a operacao. Nao ha retry automatico, rollback de dados ou reemissao automatica de tickets.

Perda de canal apos admissao, sem T1, revoga o controlador, encerra seu proprio backend e prepara ponte 503. Se ja existir T1, registra resultado incerto e interrompe, sem limpeza automatica nem substituicao. Gravacao tardia do diario nao pode apagar essa incerteza.

Retomada da substituicao exige **nova autorizacao explicita**, ausencia nativa de todos os candidatos da tentativa anterior e ausencia de T1. Candidato anterior ainda vivo nao e adotado nem encerrado por conveniencia. Se restarem processos originais, somente esses remanescentes identificados podem ser encerrados, apos reconciliacao atual e com a manutencao protegida. Ponte conhecida pode permanecer durante a parada do controlador remanescente.

Depois dessas condicoes, o comando futuro abaixo cria uma nova geracao e novos tickets, preservando o checkpoint e o historico dos hashes consumidos:

```powershell
node $entry --recuperar-substituicao-selada --aceitar-legado-sem-ipc --autorizacao "NOVA_REFERENCIA_NAO_SECRETA"
```

Nao reinicia backups, delta, rotacao JWT ou recuperacao `INCERTA`. Nao recupera resultados T1 incertos. Lock remanescente, porta desconhecida ou candidatos vivos exigem investigacao antes de qualquer nova tentativa.

## Validacao desta preparacao

| Grupo afetado | Cenarios aprovados |
| --- | ---: |
| Protocolo, rejeicoes, duplicacoes, falhas e geracoes | 40 |
| Capacidades, startup e bootstrap isolado | 10 |
| Operacoes do novo dono e gate final simulado | 3 |
| Runtime integrado com processos/IPC/bancos falsos | 5 |
| Diario T1 e incerteza persistente | 4 |
| Helpers nativos integralmente simulados | 19 |
| Supervisor, smoke selado e comandos afetados | 42 |
| Transicao/startup: regressao selecionada | 5 |
| Allowlist PowerShell e escopo RemoteSigned | 1 |
| **Total** | **129** |

**Zero falhas finais.** Sao 79 cenarios novos e 50 regressoes afetadas. Entradas JSON nulas/primitivas tambem sao recusadas sem derrubar o controlador. Sintaxe aprovada em 12 arquivos JavaScript e quatro PowerShell. Encerramento nativo foi exclusivamente simulado; nenhum processo real foi substituido nos testes. O grafo estava desatualizado e nao cobriu estes arquivos; a revisao utilizou fonte e testes, sem interpretar resultado vazio como ausencia de risco.

SHA-256 do estado privado, `.env` e checkpoint permaneceu identico ao inicio da tarefa. Artefatos de backup existentes tiveram tamanho/hash conferidos, sem gerar ou restaurar novos backups. Checkpoint aprovado conserva os dez adicionais. Nao houve nova consulta aos bancos nesta implementacao; a verificacao atual completa e obrigatoria na execucao operacional. Probe HTTP local confirmou 503.

**Protocolo pronto para autorizacao operacional.** Handoff real, novo smoke e gate operacional ainda pendentes. T1 e funcionamento normal continuam bloqueados. A aprovacao simulada do gate nao equivale a aprovacao do gate no processo real.
