# Recuperacao controlada preparada — 31/10/2026

Atualizacao: `GATE_RECUPERACAO_RECONCILIACAO.md` descreve o novo criterio de
equivalencia atual com risco aceito e historico NAO comprovado, sem executar
recuperacao. As exigencias de continuidade declarada abaixo descrevem o modo
anterior; nao devem ser preenchidas artificialmente no novo modo formal.
Ao finalizar essa adaptacao, os PIDs conhecidos/listener estavam ausentes;
a recuperacao operacional permanece bloqueada, sem reinicio automatico.

Preparacao concluida. Recuperacao REAL nao executada. HTTP permanece 503.
Nao houve novos backups, delta, rotacao JWT, alteracoes de dados ou commits.

## Causa confirmada

O smoke exigia `p.perfil` em GET /perfil, cujo contrato retorna id, nome e email.
A resposta HTTP foi 200; a assercao seguinte falhou. O wrapper `exclusivo` de
`config/transicao-controlada.cjs` trata qualquer excecao durante liberacao como
INCERTA e persiste congelado/selado, inclusive erros do teste antes de T1.
`supervisor-cutover.cjs` acrescenta uma incerteza sintetica quando essa fase esta
persistida. Portanto, esse marcador nao comprova sozinho uma escrita incerta.
A correcao do smoke nao deve apagar ou ignorar incertezas reais de persistencia.

O pai original conserva seu canal IPC; outro processo nao pode adota-lo.
O filho ja carregou o codigo antigo, e o controlador nao possui recuperacao
dessa fase. Nao usar debugger, injecao, endpoint publico ou edicao manual do
estado para contornar essas limitacoes. A proposta substitui somente o processo
Express Supabase conhecido, em manutencao, pela mesma configuracao protegida.
Nao reinicia a migracao, MySQL, bancos ou chaves.

## Estado e etapas conferidos por leitura

- Execucao: fae5b97e-eab2-4ab2-878e-da9ad9c6e784.
- Estado: INCERTA, congelado=true, selado=true, ticket anterior consumido.
- Processo conhecido: PID 25552, pai 35344; criacao UTC
  2026-10-31T15:43:29.9305440Z; entrada iniciar-instancia-planejada.cjs.
- Listener exclusivo observado: 127.0.0.1:3001, PID 25552. HTTP /perfil: 503.
- Checkpoint 349d6df4-7c15-4960-b739-dfd91fd53c8d corresponde ao estado,
  relatorio e arquivo privado. Fingerprint da configuracao atual corresponde.
- Diario privado e relatorio publico correspondem em run, etapas, PID e T1=false.
- Congelamento/drenagem, backups T0, delta e startup protegido aprovados.
  JWT ja rotacionado; tokens anteriores recusados. Nenhuma escrita T1 registrada.
- Somente quatro requisicoes antes da falha: dois GET 401 com tokens antigos,
  login administrador 200 e GET /perfil 200. Nenhum ID descartavel criado.

As verificacoes atuais nao conectaram aos bancos nem repetiram reconciliacao.
Os hashes do estado e .env permaneceram iguais antes/depois da inspecao.

## Procedimento reservado a nova autorizacao

Implementacao: `scripts/recuperacao-supervisor.cjs`, com adapters privados em
`adapters-recuperacao-local.cjs` e helper confiavel `processo-recuperacao.ps1`.
Os construtores sao inertes. Nao existe CLI que execute automaticamente.

1. Confirmar janela exclusiva e ausencia de SQL/REST/jobs/escritas paralelas
   desde o delta aprovado. Sem essa confirmacao, a continuidade NAO e presumida:
   interromper e pedir decisao, sem repetir delta por conta propria.
2. Ler evidencias/diario/checkpoint existentes, configuracao e metadados locais.
   Exigir causa conhecida, T1=false, somente GET/login completos, IDs vazios,
   mesmo checkpoint/JWT/projeto, PID/boot/entrada/horario/pai e porta conhecidos.
   Qualquer inconsistencia, timeout ou escrita nova recusa essa recuperacao.
3. Gerar plano em memoria. Adquirir trava privada exclusiva por create-exclusive
   no diretorio do supervisor. Reinspecionar e comparar plano/estado; nunca
   remover automaticamente trava deixada por queda de controlador.
4. Com autorizacao, registrar ENCERRANDO mantendo INCERTA/congelado/selado.
   O helper reconfere identidade/porta, abre handle nativo e reconfere criacao
   antes de encerrar SOMENTE o PID conhecido. Esperar saida e porta livre.
   Isso so e permitido pela prova de ausencia de T1 e pela continuidade
   operacional confirmada; nao tentar reinterpretar uma escrita incerta.
5. Iniciar somente um novo filho Supabase pausado, com a configuracao atual.
   Vincular novo PID/boot e ticket de uso unico a MESMA janela, checkpoint e
   fingerprint. O guard existente consome o ticket antes de carregar server.js.
   O ticket e credencial IPC efemera; nao e JWT nem credencial de banco.
6. Exigir readiness por IPC e status do novo supervisor: congelado/selado,
   zero requests, escritas, operacoes de persistencia e incertezas.
   Registrar PRONTA_SMOKE. HTTP continua inteiramente 503 nessa etapa.
7. Somente com autorizacao de retomada do smoke, reconferir identidade/drenagem
   e abrir LEITURA pelo IPC privado. Escritas continuam bloqueadas; GET/login
   passam ao smoke corrigido. Nao ha liberacao de escritas nessa API.

O pai novo deve permanecer ativo para conservar o canal IPC. Nao executar
novamente `executar-janela-real.cjs --executar-autorizado`: esse roteiro reinicia
etapas que ja foram aprovadas. Nao recolocar JWT antigo nem trocar provedor.

Idempotencia: mesma recuperacao PRONTA_SMOKE devolve o resultado existente,
sem novo encerramento/boot. Trava impede controladores simultaneos. Queda,
timeout ou fase intermediaria interrompida conserva manutencao e recusa retry
automatico. Se perder o canal IPC apos recuperacao, parar para nova avaliacao;
nao adotar outro PID nem repetir operacoes de encerramento silenciosamente.

## Simulacoes e limites

Dez testes novos aprovados, zero falhas na execucao final. Cobertura: planejamento
inerte, autorizacao obrigatoria, preservacao JWT/checkpoint, 503 durante recuperacao,
idempotencia, concorrencia, abertura somente leitura, bloqueio de persistencia,
T1/HTTP incerto/identidade/configuracao/plano divergentes e falhas de startup/IPC.
Usam estado em memoria e supervisor/guard reais, com processos e IPC simulados.
Nenhum encerramento real foi ensaiado. O helper Windows foi analisado sintaticamente
e executado SOMENTE no modo de inspecao, confirmando PID e porta locais.

Houve inicialmente uma falha na fixture: hook de incerteza instalado depois da
construcao da API nao era capturado. A fixture foi corrigida e o caso passou.
Apos adicionar trava contra concorrencia, a suite especifica completa passou
10/10. Nao foram repetidos testes anteriores de homologacao ou backups.

## Condicoes para retomar o smoke

Autorizacao real, confirmacao de continuidade sem escritores paralelos, gates
atuais aprovados, recuperacao PRONTA_SMOKE e controlador privado novo ativo.
Entao validar login/JWT, identidade por id/nome/email, perfis nos claims e
permissoes GET dos quatro papeis, recusa de escritas e isolamento MySQL.
Nao criar fixtures enquanto escritas estiverem bloqueadas. Qualquer escrita
essencial futura exige etapa propria; nunca reutilizar tentativas com timeout.

O procedimento esta preparado para autorizacao, condicionado aos gates acima.
Isso nao aprova a recuperacao real, o smoke pendente ou funcionamento normal.
