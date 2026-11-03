# Encerramento administrativo minimo — preparado, nao executado

## Resultado atual

Reconciliacao real somente leitura aprovada em `evidencias/reconciliacao-administrativa-1793733829357.json`. Os oito dominios correspondem integralmente ao checkpoint: IDs, perfis, campos e relacionamentos; MySQL 42 registros, Supabase 52. Os dez adicionais permanecem iguais. T1 concluida, diario integro, evento/custo descartaveis ausentes. Catalogos conferidos, aceitando somente os avancos de sequencia documentados da T1, sem reset. Backups existentes verificados por hash, sem gera-los ou restaura-los.

Controle de escritores conferido antes/depois: processos identificados, HTTP 503, ausencia de clientes/jobs/transacoes/escritores nao autorizados. TLS PostgreSQL verificado. Nenhum dado pessoal ou credencial foi impresso ou salvo no relatorio publico.

O usuario autorizou em 03/11/2026 a preparacao administrativa pelo criterio de RECONCILIACAO ATUAL. Ausencia historica de escritas NAO comprovada; snapshot anterior independente NAO localizado. Essas lacunas ficam explicitamente registradas, nao sao convertidas em provas positivas. A execucao futura exige aceite explicito dessas condicoes. Nenhuma evidencia historica foi fabricada.

## Implementacao

Nao modifica os arquivos operacionais nem aplica os pacotes de recuperacao anteriores. Reutiliza coletores, comparacao integral, verificacao de sessoes/jobs, procedencia T1, guard de startup e persistencia atomica do estado existentes. Nao cria supervisor, ticket, selo ou checkpoint novo.

`transicao.cjs`: valida origem INCERTA congelada/selada, configuracao do projeto correto, T1 limpa, diario/checkpoint, dados atuais completos, escritores e evidencias com no maximo 30 segundos. A projecao INICIADA serve somente para conferir a procedencia existente; nao e snapshot historico nem autoridade IPC fabricada.

O encerramento exige AUTORIZACAO separada, processos antigos ausentes e porta livre. Arquiva integralmente o estado INCERTA fora do Git antes da unica publicacao administrativa. Preserva o restante do historico e o diario original. Registra criterio atual, lacunas aceitas e hashes; marca a transicao CONCLUIDA, revoga o controlador antigo e encerra a barreira. O startup protegido existente passa a aceitar Supabase e recusa MySQL. Nenhum servidor e iniciado automaticamente.

`parar-processos.ps1`: somente com flag explicita; exige relatorio recente, estado identico, identidade completa e entrada canonica dos dois processos. Abre handles e reconfirma PID/criacao/pai/entrada antes da parada. Arquiva o estado ANTES de encerrar. Encerra o pai primeiro para nao disparar nova orquestracao por EOF, depois o supervisor identificado. Nao encerra MySQL nem processos desconhecidos. Porta ainda ocupada interrompe o procedimento.

`executar.cjs`: so executa com comando e aceite explicitos. Depois da parada faz NOVA reconciliacao somente leitura, preservando a validade temporal. Confere as identidades registradas e hashes protegidos. Usa a trava privada ja existente, sem remover travas abandonadas. Confirma ausencia/porta/configuracao antes da publicacao. Erro interrompe: nao inicia backend, nao tenta novamente e nao executa rollback.

## Testes realizados

23 testes isolados de transicao aprovados; dois testes de entrada/importacao aprovados. Zero falhas. PowerShell validado pelo parser, sem executar paradas. Nenhuma bateria anterior ou smoke real foi repetido.

Cobertura: conclusao explicita e historico preservado; startup Supabase aceito/MySQL recusado; autorizacao/lacunas obrigatorias; escritor/processo/job/sessao REST; prazo vencido; divergencia com contagens iguais; adicional alterado; checkpoint/diario/catalogo/TLS; arquivo invalido; estado concorrente; trava ocupada; repeticao recusada. Tudo com fixtures, sem gravar bancos ou estado real.

## Sequencia exata — SOMENTE depois de autorizacao final

Manter MySQL disponivel ate a reconciliacao posterior a parada. Nao fechar a sessao atual por EOF e nao executar os pacotes anteriores. Os PIDs observados foram controlador 3416 e supervisor 31312; os comandos usam identidades do relatorio fresco, nunca apenas esses numeros.

No diretorio `PI Backend`, primeiro atualizar a evidencia, sem liberar:

```powershell
node .\preparacao-encerramento-administrativo\reconciliar.cjs --somente-leitura
if ($LASTEXITCODE -ne 0) { throw 'Reconciliacao recusada' }
$relatorio = (Get-ChildItem .\evidencias\reconciliacao-administrativa-*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
```

Depois da autorizacao de ENCERRAMENTO e partida normal, executar uma vez:

```powershell
$paradaRaw = & powershell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File .\preparacao-encerramento-administrativo\parar-processos.ps1 -Relatorio $relatorio -ExecutarAutorizado
if ($LASTEXITCODE -ne 0) { throw 'Parada interrompida; nao continuar' }
$parada = $paradaRaw | ConvertFrom-Json
if ($parada.status -ne 'PROCESSOS_IDENTIFICADOS_ENCERRADOS') { throw 'Resultado da parada invalido' }
node .\preparacao-encerramento-administrativo\executar.cjs --encerrar-autorizado --aceitar-reconciliacao-atual-e-lacunas --relatorio $relatorio --historico-antes-parada $parada.historyFile --referencia 'autorizacao-final-do-usuario'
if ($LASTEXITCODE -ne 0) { throw 'Encerramento interrompido; nao iniciar backend' }
node .\server.js
```

A parada abre uma indisponibilidade temporaria ate iniciar o backend. Nao e uma janela de trafego liberado antes da validacao. Se surgir um respondedor ou PID inesperado, interromper e identificar, sem encerra-lo automaticamente.

Outro terminal, em `PI React`:

```powershell
npm run dev -- --port 5173 --strictPort
```

Validar imediatamente `http://localhost:5173`: novo login, perfil, listagens por permissao e logout. Conferir chamadas para `http://localhost:3001`, CORS e JWT. Testar escritas somente se explicitamente autorizadas; nao repetir T1. O teste HTTP normal preparado em `evidencias/validar-http-normal-20261103.cjs` realiza login/GET nos quatro perfis, sem gravar dados; pode ser executado depois da partida. Conferir tambem ausencia de conexao da aplicacao a MySQL.

Se o teste normal falhar, interromper novas requisicoes/escritas e preservar os logs. Nao repetir o encerramento e nao mudar novamente a fase por edicao manual. Parar somente o backend recem-iniciado identificado se necessario para bloquear escritas, sem rollback de dados.

## Parecer

Preparacao aprovada para solicitar autorizacao final. Execucao real ainda nao realizada. HTTP 503 atual permanece. Evidencias temporarias precisam ser renovadas na execucao; qualquer divergencia impede a conclusao. O fluxo anterior de recuperacao INCERTA e seus pacotes parciais nao serao usados.
