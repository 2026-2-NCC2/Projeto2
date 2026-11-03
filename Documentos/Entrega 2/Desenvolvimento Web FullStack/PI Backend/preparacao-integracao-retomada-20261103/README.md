# Integracao preparada; implantacao nao executada

22 testes afetados aprovados. Zero falhas ou SKIPs. Os 55 anteriores foram reutilizados, sem repetir a suite: CLI diagnostico, executor e publicador atomico continuam byte a byte iguais aos componentes ja testados.

## Causa e evidencia real

A falha externa esta identificada. Um script PowerShell foi chamado no mesmo processo. Depois consultaram `$LASTEXITCODE` ainda indefinido. StrictMode recusou essa consulta. A publicacao atomica ja havia funcionado.

Foram relidas as duas observacoes privadas reais. Intervalo confirmado: **50.044 ms**. O destino atual coincide com o recibo de publicacao confirmado. O relatorio anterior conserva provider Supabase, ausencia de modulos MySQL e manutencao. Nenhum arquivo log/err/out foi encontrado na pasta privada examinada.

O CLI antigo descartava a excecao. O registro real contem somente a recusa generica e exit 1. **A causa interna historica continua indeterminada.** Atraso superior a 30 segundos nao comprova que expiracao causou aquela recusa. Nao foi executada nova admissao para investigar. Nao se afirma ausencia de logs em ambientes nao examinados.

Evidencia saneada: [auditoria-recusa.json](auditoria-recusa.json). Nao contem respostas completas, nonces, senhas ou JWT. A lacuna historica de escritas continua explicitamente registrada nos documentos anteriores; esta preparacao nao produz prova positiva de continuidade historica.

## Integracao realizada

`retomar-operacional.ps1` chama o publicador pelo executor `Invoke-VerifiedHelper`. Exige `Process.ExitCode=0` e recibo JSON positivo. Somente depois valida bytes/ACL/estado, revalida snapshot e verifica novamente a validade. Falha encerra a sequencia antes do CLI. Nao ha retry automatico.

`publicar-verificado.ps1` usa o mesmo executor para atualizacoes posteriores. Ambos verificam o selo deste pacote. A validacao externa de ferramenta deve continuar usando `validarResultadoFerramenta`, fornecida em `continuidade-observacao.cjs`. Exit 1 permanece falha mesmo depois de recibo positivo.

Os usos restantes de `$LASTEXITCODE` correspondem a chamadas **nativas Node**, nao ao publicador chamado no mesmo PowerShell. Foram preservados: capturar stdin/stdout do controlador persistente ou aplicar timeout de helper a ele encerraria sua continuidade indevidamente.

O CLI candidato registra etapa, codigo permitido e arquivo/linha da recusa. Identifica primeira/segunda inspecao. Nao imprime valores das assertivas, mensagens arbitrarias, stack completo ou credenciais. Continua terminando com exit 1. Os gates e tickets nao foram alterados.

## Pacote selado

- Selo do coordenador: `manifest-correcao.json`.
- SHA-256: `2802961c64bf07cf7c8167f8e376f750d68fb71914214ac9b1126091c869e999`.
- Pacote cumulativo: `manifest-alteracoes.json`.
- SHA-256: `79dbdba60a38ef83fa9013ec429cc3f916eda0ef3b7b32d8ccee2ae3ab648179`.
- Delta de implantacao: `diagnostico.patch`, **um unico CLI**.
- Base em disco: `a699e60951e69877cac754318eb06dd8eab884b460fbf6a092fec538643d4702`.
- Alvo futuro: `cc81e1b48a48c1ac9c4a01994bb63dec37c664e53afe06144276dbd6f0676e64`.

O manifesto admitido antigo continua preservado no pacote cumulativo. Nao foi substituido pelo manifesto atualmente em disco. O plano de implantacao distingue explicitamente essas duas referencias. Mantem os 26 arquivos sem diferencas e propoe somente o CLI instrumentado. O arquivo ativo tambem permanece intacto nesta etapa: **27/27 hashes existentes preservados**.

`verificar-pacote.cjs` e somente leitura. Verifica selo, arquivos, patch, manifestos e 27 hashes. Retorna PREPARADO_NAO_IMPLANTADO antes da aplicacao. Para alvo completo simulado, retorna APLICADO_NAO_REAPLICAR. Recusa estado parcial ou qualquer divergencia. Nao modifica arquivos, estado ou processos.

`git apply --check` passou na raiz correta, com `--directory="Documentos/Entrega 2/Desenvolvimento Web FullStack"`. `git apply --stat` confirmou um arquivo. Nenhuma aplicacao foi executada. Nao executar novamente o montador para consumir o selo aprovado: ele remonta metadados e mudaria o selo.

## Proxima operacao, mediante autorizacao

1. Conferir selo e plano. Revalidar identidades atuais, IPC exclusivo, escritores e HTTP 503. Os PIDs dos documentos nao constituem prova atual.
2. Autorizar separadamente a implantacao do **unico delta**. Conferir todos os hashes de base e aplicar somente o CLI. Nao reaplicar o pacote antigo de 27 arquivos, editar estado ou atualizar hashes admitidos manualmente.
3. Conferir alvo completo e os 27 hashes propostos. `retomar-operacional.ps1 -Modo Verificar` refere-se ao alvo futuro e deve recusar o CLI ainda nao implantado. Isso e esperado nesta preparacao.
4. Somente com autorizacao de admissao, usar o coordenador integrado com seu novo CorrecaoSha256. Coletar respostas IPC verdadeiras pelo canal original. A atualizacao usa `publicar-verificado.ps1 -AutorizarPublicacao -CorrecaoSha256 <SELO> -ObservacaoFile <OBSERVACAO_REAL> -StatusFile <DESTINO_PRIVADO> -ExpectedDestinationHash <ULTIMO_HASH_CONFIRMADO>`. Preservar ACL privada e UTF8 sem BOM.
5. Sustentar atualizacoes dentro dos prazos existentes. Os pulsos preparados usam cinco segundos; nao dependem de pausas manuais longas. Nao alterar timestamps, ampliar TTL ou reutilizar tickets. Status fresco nao valida inventarios/capturas vencidos. Interromper imediatamente diante de qualquer falha. Nao fechar a sessao original nem adotar seu IPC.
6. Registrar a futura recusa objetiva, caso ocorra. Nao inferir a causa retrospectiva. Nenhum resultado desta preparacao autoriza smoke, T1, rollback ou retirada do 503.

## Testes desta integracao

10 cenarios PowerShell reutilizam a entrada/coordenador real com IO falso: sucesso, falha do processo, recibo recusado, exit_code invalido, verificacao recusada, estado alterado, expiracao antes do lancamento, CLI recusado, admissao ja concluida e selo invalido. Todos verificam interrupcao e liberacao da propria reserva, sem processos reais.

12 cenarios Node verificam pacote, adulteracao, estado parcial, retomada idempotente, preservacao e identidade dos componentes anteriores. O preload existente bloqueia bancos, rede e subprocessos.

```powershell
powershell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File preparacao-integracao-retomada-20261103/tests/integracao.test.ps1
node --require ./preparacao-retomada-status-20261102/tests/isolamento-sem-efeitos.cjs --test --test-isolation=none preparacao-integracao-retomada-20261103/tests/pacote.test.cjs
```

Executar desde PI Backend. Nao foram repetidos smoke, T1, reconciliacao, backups ou rotacao. Estado, JWT/ambiente, diario e checkpoint conservaram hashes. Sem acesso aos bancos, publicacao privada, mudanca da manutencao ou commits.

**Pacote preparado e integracao testada. Pendem autorizacao de implantacao e controles operacionais recentes. A causa interna historica nao foi comprovada; a futura instrumentacao remove essa lacuna de diagnostico.**
