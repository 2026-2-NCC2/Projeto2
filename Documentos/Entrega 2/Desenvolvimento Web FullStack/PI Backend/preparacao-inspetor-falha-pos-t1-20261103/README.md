# Inspetor pos-T1 e recuperacao de FALHA preparados

**59 testes aprovados: 39 Node novos, 16 PowerShell nativos simulados e quatro regressoes selecionadas. Zero falhas/SKIPs finais. Nenhuma readmissao ou recuperacao real executada.**

## Condicao exata da rejeicao

Em `scripts/inspecionar-controlador-persistente.ps1`, quando a entrada e `restabelecer-controlador-apos-reinicio.cjs`, a condicao original impunha:

```powershell
$isNew=$isNew -and $e.controleSelado.modo -eq 'RESTABELECIMENTO_POS_REINICIO'
```

O estado pos-T1 utiliza IMPLANTACAO_POS_T1 com motivoOperacao RESTABELECIMENTO_POS_T1. Portanto o predicado ficava falso, culminando em CONTROLE_IDENTIDADE_RECUSADA. O stderr da tentativa anterior nao foi preservado; a incompatibilidade foi demonstrada pelo codigo e estado, sem inventar um log perdido.

## Correcao isolada do inspetor

A copia reconhece essa combinacao especifica de modo/motivo. Nao basta encontrar T1 ou trocar uma string: exige fase/selagem, etapas VINCULANDO/ATIVO, tickets nulos, identidades nativas atuais e parentesco correto. Invoca um validador Node exclusivamente READ ONLY para conferir conclusao/limpeza, diario por hash e conteudo integral, checkpoint, fingerprint e procedencia.

Compara o hash dos bytes do estado antes/depois da validacao. Reconfere os dois processos, criacoes e linhas de comando; exige entrada canonica, listener unico local e porta 3001. O recibo nativo continua ipcConsultado=false. Somente o mecanismo IPC/WeakMap existente pode comprovar continuidade. FALHA nunca e aceita pelo inspetor como autoridade ativa.

A lane legada sem T1 continua aceita. Modo legado com T1 nao e usado como alternativa para dispensar a nova prova. A correcao nao amplia o startup normal nem muda contratos HTTP.

## Estado FALHA e recuperacao preparada

O estado real conserva T1 CONCLUIDA/limpa, procedencia original, dois candidatos revogados e respondedor de protecao conhecido. Os tickets foram consumidos/invalidados; repetir a readmissao antiga, apagar controleSelado, mudar FALHA para ATIVO ou restaurar o estado anterior descartaria historico e nao foi feito.

Nova lane: `--recuperar-falha-pos-t1-selada`, com autorizacao especifica distinta da readmissao. O validador puro dessa lane aceitou o estado real atual, sem alteracao. A execucao real permanece proibida nesta preparacao.

O plano exige ausencia nativa recente dos dois candidatos falhos e dos processos originais, ponte existente validada por PID/pai/criacao/entrada/listener, escritores sob controle, reconciliacao completa dos oito dominios e dez adicionais, diario/limpeza, checkpoint e pacote aprovado. Nao finge um novo reboot nem fabrica IPC de processos mortos.

Para validar o registro T1 original usa os bytes autenticos do estado historico preservado, somente como prova de dados. Nao edita a fase atual nem promove essa autoridade historica. A copia completa dos bytes de FALHA e guardada separadamente, com SHA-256. O estado original anterior a primeira readmissao tambem permanece intacto.

O novo controle recebe id novo, epoch incrementado e tickets novos, independentes, de uso unico e ate 30 segundos. Conserva todos os hashes de tickets anteriores. A procedencia existente e preservada; uma extensao vincula o estado FALHA, o novo codigo e as provas de ausencia. Contextos antigos nao sao reutilizados.

A ponte 503 existente permanece ate o supervisor novo estar legitimamente admitido sem porta. Somente essa ponte identificada pode ser encerrada para a troca. O listener novo continua 503. Como no procedimento existente, pode haver breve ausencia de socket durante a troca; nao existe abertura de trafego normal. Um listener desconhecido impede continuacao.

Plano copiado/expirado, concorrencia, divergencia, processo anterior presente, ticket reutilizado, ACK incorreto ou perda de canal impedem a aprovacao. Falhas revogam apenas os candidatos proprios, preservam T1 e mantem a protecao. Nao ha retry automatico nem rollback. Nova falha desta recuperacao encadeada exige analise especifica; nao e promovida automaticamente por esta lane.

O gate final desta operacao exige novo IPC genuino, ausencia atual dos anteriores e dados recentes. Mantem newSmokeRequired=true e finalReleaseGateApproved=false. Nao repete T1, limpeza, backups, delta ou JWT; leituras de reconciliacao continuam obrigatorias. A lacuna historica continua reconhecida e nao se transforma em prova positiva de ausencia de escritas passadas.

O invocador reaproveitado passa agora um caminho de stderr privado unico ao helper existente. Em erro futuro o relatorio identifica o helper e o arquivo privado, sem publicar seu conteudo. Nenhum log privado novo foi criado durante esta preparacao; os testes usam efeitos falsos.

## Pacote proposto

Oito arquivos de codigo diferem apenas na copia: inspetor PowerShell, validador READ ONLY novo, preflight de FALHA novo, procedencia, protocolo, runtime, gate de restabelecimento e CLI. Fixtures ficam somente no ensaio; nao entram no delta. Manifestos anteriores e os 30 hashes ativos permanecem intactos. O manifesto sucessor cobre 33 referencias, mantendo os testes ativos nos hashes anteriores.

- Pacote: manifest-admissao.json.
- SHA-256: `d00cf587e3127dacb9550938be530fabd87bcab5842e2d6c79dea345008ca7ec`.
- Base atual: `e8ca559e9852521be559643aa88de6ff4bb36f5b4c71920ab4e63ed21bee78da`.
- Alvo futuro: `43b4c0131ab9178329f6d02107af6fd586d4818dd16b1efa5a82c8fe189fbb82`.
- Patch: inspetor-recuperacao-falha.patch; somente --check foi executado.

Estendida a regra -text do backend aos novos caminhos/pacote. Nenhuma configuracao global foi alterada. A copia nao contem .env. Nenhum codigo foi publicado.

## Procedimento futuro, somente mediante autorizacao

1. Conferir o selo SHA-256 de manifest-preparacao.json, arquivos e plano. Revalidar estado FALHA, T1, ponte atual, MySQL, ausencias e escritores. Os PIDs dos documentos sao localizadores historicos, nao prova atual.
2. Autorizar a publicacao exata dos oito arquivos. Na raiz Projeto2, usar antes --check e depois `git -c core.autocrlf=false apply --directory="Documentos/Entrega 2/Desenvolvimento Web FullStack" <PATCH>`. Conferir todos os hashes-alvo/manifesto completo. Interromper se houver mistura ou divergencia; nao recalcular os hashes para aceita-la.
3. Depois de autorizacao operacional, abrir sessao persistente. Resolver os caminhos oficiais com Resolve-Path e passar seus valores diretamente ao Node; nunca executar a copia de candidato ou usar barras alternativas:

```powershell
$recoveryEntry=(Resolve-Path -LiteralPath '<PI_BACKEND>\scripts\restabelecer-controlador-apos-reinicio.cjs').Path
$recoveryPackage=(Resolve-Path -LiteralPath '<PREPARACAO>\manifest-admissao.json').Path
node $recoveryEntry --recuperar-falha-pos-t1-selada --autorizar-recuperacao-falha-pos-t1 --aceitar-lacuna-historica --autorizacao '<REFERENCIA_NAO_SECRETA>' --pacote $recoveryPackage --pacote-sha256 d00cf587e3127dacb9550938be530fabd87bcab5842e2d6c79dea345008ca7ec
```

4. Preservar stdin/stdout. Exigir RECUPERACAO_FALHA_POS_T1_APROVADA, gate especifico, novas identidades, status por pedido inedito, IPC exclusivo e HTTP 503. Nao reutilizar tickets ou planos. Nao interpretar apenas o codigo publicado ou contagens iguais como aprovacao operacional.
5. Se ja houver controlador ativo, nao readmitir: usar seu canal genuino para verificar continuidade. Se houver falha, interromper e preservar evidencias; nao apagar locks ou metadados. Smoke, T1 e liberacao ficam fora desta operacao.

## Testes afetados

39 novos casos Node: dados/diario/checkpoint, plano genuino/expirado, concorrencia, tickets, falhas, procedencia, preservacao byte a byte e runtime com IPC genuino simulado. Dezesseis casos executam o codigo real do inspetor PowerShell com WMI, arquivos privados, Node e rede inteiramente substituidos. Cobrem aceites pos-T1/legado, modo errado, FALHA, ticket pendente, recusa do validador, snapshot divergente, caminho, parentesco, criacao/PID reutilizado e listener.

Quatro regressoes existentes foram selecionadas; suites completas anteriores nao foram repetidas. Comandos desde candidato:

```powershell
node --require ../../preparacao-retomada-status-20261102/tests/isolamento-sem-efeitos.cjs --test --test-isolation=none tests/falha-pos-t1.test.cjs tests/inspecao-pos-t1.test.cjs tests/runtime-falha-pos-t1.test.cjs
powershell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File tests/inspetor-pos-t1.mock.ps1
node --require ../../preparacao-retomada-status-20261102/tests/isolamento-sem-efeitos.cjs --test --test-isolation=none --test-name-pattern="readmissao pos reboot preserva|runtime pos reboot inicia|INCERTA T1 ou controle existente|implantacao pos T1 preserva" tests/reinicio-pos-t1.test.cjs tests/runtime-reinicio-pos-t1.test.cjs tests/admissao-apos-reinicio.test.cjs tests/implantacao-pos-t1.test.cjs
```

**Preparacao pronta para autorizacao da publicacao e recuperacao controlada, condicionada aos controles operacionais recentes. Respondedor real 27672 manteve HTTP 503. Estado, JWT, checkpoint, diario e backups nao foram alterados. Sem banco, recuperacao real, T1, liberacao ou commits.**
