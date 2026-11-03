# Diagnostico e sequenciamento da retomada

55 testes aprovados; zero falhas. Correcao preparada em pasta isolada. Nenhuma admissao real foi executada. A retomada operacional permanece bloqueada.

## Diagnostico comprovado

O publicador confirmou a substituicao atomica. A checagem posterior falhou separadamente. Foi chamado `& publicar-status.ps1`, dentro do mesmo PowerShell. Isso nao garante `$LASTEXITCODE` definido. StrictMode rejeitou sua consulta posterior. Nao houve falha atomicamente comprovada nessa segunda publicacao.

O CLI descartou a excecao interna. Seu catch ignorava o erro recebido. Restou somente `SUBSTITUICAO_INTERROMPIDA`, com exit 1. O coordenador registrou `RETOMADA_LANCADOR_RECUSADO`. Esses registros nao identificam a assertiva. Nao ha stack/etapa preservada nesses artefatos. Nao e possivel recuperar retrospectivamente essa causa exata a partir deles. Nenhuma admissao foi repetida para investigar.

O relatorio privado anterior foi conferido seletivamente. Provider Supabase e ausencia de modulos MySQL constam corretamente. PIDs e campos requeridos tambem correspondem. Isso elimina essa incompatibilidade especifica; nao comprova os demais gates historicos.

As observacoes distam **50.044 ms**. Sua validade original era **30.000 ms**. Houve portanto 20.044 ms sem cobertura continuamente recente. Isso permite reproduzir uma recusa por status vencido. Nao prova que essa foi a recusa historica. Simulacoes tambem rejeitam identidade incorreta e dados divergentes, antes de qualquer fence.

## Prazos preservados

| Evidencia/capacidade | Prazo existente |
| --- | --- |
| Status IPC original | 30 segundos desde verificadoEm |
| Inventarios e capturas | Janela maxima de 30 segundos |
| Plano de implantacao | Menor timestamp entre emissao/status/inventarios iniciais, mais 30 segundos |
| Consumo do plano | Relogios civil e monotono; uso unico |
| Tickets de admissao | 30 segundos, emitidos nas respectivas etapas |

O plano pode ter poucos segundos restantes. Atualizar status nao renova esse plano. Nenhum prazo original foi aumentado. Nenhum ticket foi emitido nesta preparacao. A publicacao anterior nao demonstra consumo de tickets. O estado continuou anterior ao fence.

## Correcoes preparadas

`processo-verificado.ps1` inicia um PowerShell nativo separado. Usa RemoteSigned somente nesse processo. Le `Process.ExitCode` do handle criado. Exige simultaneamente exit zero e recibo JSON positivo. Recusa stderr, ruido, arrays e recibos ausentes. Nao consulta `$LASTEXITCODE`. Timeout encerra somente seu proprio helper curto. Nao usar esse executor para controladores persistentes.

`publicar-verificado.ps1` fixa o publicador anterior. Primeiro confere seu pacote selado original. Exige autorizacao explicita para publicar. Encaminha observacao verdadeira e CAS esperado. Falhas encerram imediatamente com exit 1. Nenhum resultado bruto de erro e exibido. Nao publica automaticamente outra vez.

`validarResultadoFerramenta` verifica o resultado externo. Exige `exit_code=0` e JSON positivo. Recusa processo ainda executando como sucesso. Um recibo positivo seguido por exit 1 continua sendo falha. Isso cobre exatamente a falha de orquestracao registrada.

`continuidade-observacao.cjs` prepara pulsos seriais. O adaptador recebe respostas IPC verdadeiras. Nao fabrica pedido, nonce ou timestamp. Recusa replay, identidades erradas e concorrencia. Encadeia hashes CAS confirmados. Exige coleta em menos de dez segundos. Confirma publicacao antes de quinze segundos. Revalida antes e depois de consultar o candidato. O intervalo proposto entre pulsos e cinco segundos. Pausas longas interrompem a sequencia. Falhas nao geram retry automatico.

O acompanhamento nao inicia candidatos. Nao adota nem substitui IPC. Reserva, lancamento e admissao continuam oficiais. O adaptador operacional precisa consumir a sessao privada original e resultados reais das ferramentas. Sua integracao operacional permanece pendente. Nao basta fornecer `fenceVerificado=true`: exige conferir estado e identidade reais. Depois do fence confirmado, cessam publicacoes da origem antiga. Falha incerta exige preservar manutencao; nao matar processos legitimados automaticamente.

`candidato/substituir-controlador-selado.cjs` e somente staging. Conserva os gates originais. Acrescenta etapa, codigo permitido e arquivo/linha. Diferencia primeira e segunda inspecoes. Mensagens genericas, valores de assertivas, caminhos privados e stdout/stderr nao sao expostos. Exit 1 e interrupcao permanecem. Nenhuma validacao foi substituida por diagnostico.

## Procedimento corrigido, ainda bloqueado

1. Conferir identidades, IPC e HTTP 503. Validar reserva exclusiva e escritores. Conferir checkpoint e diario T1 preservados. Classificar os arquivos ja aplicados. Nao reaplicar os 27 arquivos. Estado ja admitido impede outro lancamento.
2. Integrar e testar o adaptador real das ferramentas. Ele deve validar cada resultado externo. Nao usar pausas manuais entre observacoes. Nao encerrar a sessao privada original.
3. Preparar pacote selado sucessor para o CLI instrumentado. A copia ativa continua original. O CLI candidato altera seu hash. Portanto exige novo manifesto/pins coerentes e autorizacao de implantacao especifica. Nao editar o manifesto antigo nem reutilizar seu hash para essa copia. Esta etapa NAO foi executada.
4. Somente depois dessa preparacao, obter autorizacao operacional. Revalidar dados, catalogos e escritores recentes. Preservar os dez adicionais existentes. Manter a lacuna historica explicitamente registrada. A observacao atual nao comprova continuidade historica.
5. Capturar status verdadeiro e publica-lo pelo executor verificado. Conferir recibo e resultado externo. Iniciar uma unica coordenacao oficial. Sustentar os pulsos de observacao durante o preflight. Inventarios e capturas continuam exigidos pelo gate original; status recente nao corrige captura vencida.
6. Qualquer recusa interrompe a sequencia. Registrar etapa/codigo/local do CLI instrumentado. Nao presumir expiracao. Nao consumir outro plano automaticamente. Nao seguir para smoke ou liberacao.
7. Exigir resultado oficial e IPC exclusivo. Conferir preservacao do diario e checkpoint. Somente depois avaliar etapas posteriores separadamente. Esta preparacao nao as autoriza.

Nao usar a copia candidata diretamente: imports, identidade nativa e manifesto esperam a entrada oficial. Nao utilizar preload, debugger, troca de argv ou adocao artificial para contornar essa exigencia. Nao executar uma admissao real apenas para obter diagnostico.

## Testes executados

39 testes Node isolados; 16 PowerShell. Total: 55; zero falhas/SKIPs. Incluem expirar status/plano, concorrencia, replay, falha de transporte, exit nativo divergente, stdout ambiguo, timeout, retomada parcial/idempotente, recusa de dados/identidades e diagnostico nas duas inspecoes. Fixtures exclusivamente locais e descartaveis. Os testes anteriores nao foram repetidos.

```powershell
node --require ./preparacao-retomada-status-20261102/tests/isolamento-sem-efeitos.cjs --test --test-isolation=none preparacao-diagnostico-retomada-20261103/tests/retomada.test.cjs
powershell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File preparacao-diagnostico-retomada-20261103/tests/processo.test.ps1
```

Executar esses comandos desde PI Backend. Nenhum teste abre bancos ou servidores. O preload Node proibe efeitos reais. Testes PowerShell iniciam somente helpers ficticios. Seus arquivos sao removidos dentro da pasta de testes.

## Preservacao e bloqueios

Os 27 hashes ativos continuam iguais. O manifesto executavel inteiro permanece igual. Estado, ambiente/JWT, diario T1 e checkpoint conservaram seus hashes. Nenhum backup foi alterado. Nenhum status privado foi publicado nesta tarefa. Sem bancos, admissao, smoke, T1, rollback ou commits. A manutencao nao foi modificada.

Evidencias anteriores preservam os dez adicionais. Nao houve nova consulta aos bancos. Sua verificacao atual continua obrigatoria na retomada.

Bloqueios: causa historica interna irrecuperavel nesses registros; diagnostico apenas em staging; adaptador operacional ainda pendente; pacote selado sucessor ainda nao preparado. **Os componentes passaram isoladamente. A admissao operacional ainda nao esta pronta para autorizacao.**
