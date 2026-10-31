# Restabelecimento selado preparado — 31/10/2026

**Preparacao concluida; nenhuma admissao ou recuperacao real executada.**
HTTP real permanece 503. Os hashes do estado privado, .env, checkpoint e
todos os artefatos de backup foram comparados antes/depois: nenhum mudou.
Nao houve conexao aos bancos, escrita de dados, rotacao JWT ou commit nesta etapa.

## Causa e admissao original

Na janela original, o pai conhecido encerrou o Express MySQL drenado, iniciou
um filho Supabase PAUSADO e persistiu PREPARADA com PID, boot, ticket de uso
unico, janela, checkpoint e fingerprint privado da configuracao. O bootstrap
`iniciar-instancia-planejada.cjs` consumiu essa capacidade por IPC, instalou
contexto em WeakSet no processo e somente depois importou server.js.

A falha de assercao do smoke marcou INCERTA e conservou selagem/congelamento.
O Windows reiniciou as 18:55:29.500 UTC (15:55:29.500 BRT), encerrando os
processos temporarios e seus contextos/IPC. O ticket antigo ja havia sido
consumido; nao serve para reiniciar. Startup normal em INCERTA deve continuar
recusado. O respondedor isolado criado depois devolve 503, mas nao possui
contexto de admissao do backend e nao deve ser promovido por nome ou PID.

## Lane nova, sempre selada

`config/startup-controlado.cjs` agora prepara `consumirRestabelecimento`.
Ela exige capacidade especifica em `transicao.restabelecimento`, ticket novo
de uso unico, PID/boot novos e mesmos janela/checkpoint/configuracao/JWT.
O novo contexto nao e reutilizavel em outro processo nem falsificavel com
objeto JSON. Um boot normal sem contexto continua recusado.

O registro original de transicao permanece intacto, inclusive fase INCERTA,
PID/boot historicos, checkpoint e configuracao. A identidade ATIVA nova fica
no registro separado de restabelecimento e em instancias; os PIDs historicos
nao sao apresentados como processos vivos. O ticket IPC novo nao e JWT nem
credencial de banco.

O novo bootstrap importa a aplicacao selada SEM escutar. O supervisor continua
com incerteza de transicao=1; incertezas operacionais do novo processo devem
ser zero. Essa separacao nao apaga a incerteza historica: GET, login, escritas,
leituras de background e tentativas de liberacao continuam bloqueados.

## Procedimento reservado a autorizacao real

1. Manter janela exclusiva, suspender SQL/REST/scripts e inspecionar os processos
   atuais, bancos e listener. Exigir ausencia do processo original, identidade
   atual do respondedor, zero consumidores adicionais/transacoes/jobs/fila.
   Nenhuma sessao administrativa deve ser encerrada.
2. Gerar PRE-v2 recente por leitura, reutilizando apenas o respondedor VALIDADO
   por PID/criacao/pai/entrada/porta. O modo preparado e:

   `node scripts/evidencia-operacional-v2.cjs --usar-manutencao-existente <recibo-do-respondedor>`

   O recibo anterior e somente localizador; todos os fatos operacionais e dados
   sao recolhidos novamente. Nao reinicia o respondedor para fabricar prova.
   Novas evidencias usam arquivo UUID; checkpoint/backups/JWT nao sao recriados.
3. Construir `criarAdaptersRestabelecimento` com estado/ambiente privados,
   caminho e SHA da PRE-v2, janela exclusiva confirmada, risco residual aceito
   e referencia da autorizacao. Construir `criarRestabelecimento(adapters)`.
   Os construtores sao inertes. `planejar()` faz leituras, valida conteudo
   integral contra o checkpoint e produz plano, sem alterar o supervisor.
4. Somente depois de autorizacao explicita, chamar
   `executar(plano, { autorizarAdmissao: true })`. O procedimento usa a MESMA
   trava exclusiva privada da recuperacao; trava abandonada nao e apagada
   automaticamente. Reconfere evidencia, estado e dados antes de agir.
5. Persistir registro separado de restabelecimento mantendo INCERTA/selado/
   congelado. Lancar o candidato pausado; armar PID/boot/ticket novos e admitir
   por IPC privado. O bootstrap real instala contexto, importa o Express e
   comprova supervisor selado, sem requests/persistencia/escritas pendentes.
   O respondedor antigo ainda e o unico dono da porta 3001 neste ponto.
6. Revalidar e encerrar SOMENTE o respondedor identificado, usando handle
   nativo e reconferencia de PID/criacao/pai/entrada contra o plano privado.
   Esperar sua saida e confirmar que NAO existe listener 3001. Nunca encerrar
   um concorrente desconhecido nem fazer bind compartilhado para contorna-lo.
7. Autorizar o candidato a escutar em 127.0.0.1:3001 e aguardar readiness IPC.
   Registrar ADMITIDA_SELADA apenas com PID/boot corretos e status consistente.
   Durante a troca pode existir breve recusa TCP entre os listeners; nao ha
   abertura de trafego normal, compartilhamento de porta ou resposta 200.
8. Gerar uma nova evidencia v2 READ ONLY, agora vinculada ao supervisor
   legitimamente admitido. O produtor e os adapters usam `identidadeSupervisor`
   e o inspetor Windows verifica o bootstrap especifico e o registro privado.
   Verificar linhas/catalogos completos, identidades, relacionamentos, dez
   adicionais e controle dos escritores antes/depois. Executar somente a
   avaliacao do gate; NAO executar recuperacao, smoke ou retirada de manutencao.

O pai deve permanecer ativo para conservar IPC. O retorno informa evidencia
e ADMITIDA_SELADA, mas a fase principal continua INCERTA. Autorizar esse
restabelecimento nao significa autorizar a recuperacao final ou HTTP normal.

## Falhas, idempotencia e identidade

Ordem de handoff testada: candidato pausado -> admitido sem porta -> respondedor
encerrado -> porta livre -> supervisor ouvindo -> evidencia nova. Nunca se
inicia o listener novo enquanto o antigo nao saiu. Se outro processo ocupar a
porta, parar sem encerra-lo; bind/readiness recusados conservam o bloqueio.

Falha persiste FALHA no registro separado, ticket inutilizado, INCERTA/selagem
preservados e recusa retry automatico. O adapter encerra apenas seu proprio
candidato conhecido. Mantem o respondedor existente ou inicia outro 503 se
a porta estiver livre; porta ocupada por desconhecido permanece intocada e
exige decisao. Essa protecao de manutencao nao restaura nem altera bancos.

Repeticao bem-sucedida no mesmo controlador verifica hash do plano, identidade
e selagem e devolve o resultado existente, sem novo processo/encerramento.
Perda posterior do pai/IPC, novo reboot ou registro incompleto nao autoriza
adotar PIDs, reaproveitar ticket ou apagar estado; requer avaliacao nova.

Uma futura recuperacao autorizada podera usar a identidade ativa nova como
origem. O registro historico original continua sendo referencia do diario,
sem alegar que o processo antigo existe. A fase INCERTA nao e removida aqui.

## Testes e verificacoes desta preparacao

84 cenarios distintos aprovados, zero falhas pendentes:

- 31 novos: planejamento inerte, autorizacao, handoff sem concorrencia,
  idempotencia, preservacao INCERTA/JWT/checkpoint, ticket unico, PID/projeto/
  configuracao invalidos, falsificacao de contexto, jobs/sessoes/dados/evidencia
  divergentes, incerteza operacional, bootstrap sem bind antecipado e v2
  legitimamente vinculada aceita pelo gate, sem reutilizar PIDs historicos.
- 49 regressões afetadas da recuperacao/gate e quatro casos filtrados do cutover
  (JWT/T0, ticket/PID/projeto, smoke e delta reprovados).

Tudo em memoria/VM, com processos, sockets, banco e IPC simulados. Nenhum
servidor real foi iniciado, admitido ou encerrado pelos testes. Os helpers
PowerShell novos/alterados passaram em analise sintatica; -Encerrar nao foi
executado. Uma fixture VM precisou reconhecer o novo modulo de identidade;
o caso foi corrigido e passou em execucao filtrada.

Checagem final real: HTTP 503, estado/.env/checkpoint/backups identicos aos
hashes iniciais. Nao foram repetidos backups, delta ou homologacao real.
O grafo consultado estava desatualizado; a analise foi confirmada no codigo.

## Decisao

Procedimento tecnicamente preparado para autorizar restabelecimento SELADO.
A autorizacao deve abranger a PRE-v2 recente, capacidade/boot novos, parada
exclusiva do respondedor validado, handoff de porta e v2 posterior, preservando
INCERTA e 503. Os prazos do gate continuam 15 minutos para reconciliacao e
30 segundos para observacoes atuais. Evidencias antigas nao sao promovidas.

Lacuna historica permanece nao comprovada e risco residual deve ser aceito
explicitamente. Nenhuma admissao real foi executada nesta preparacao.
