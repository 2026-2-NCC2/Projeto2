# Gate de recuperacao por reconciliacao atual — 31/10/2026

Implementado e testado. Nenhuma recuperacao real executada.
Nao houve acesso aos bancos nesta etapa, nova reconciliacao, backups, rotacao
JWT, alteracao de checkpoint, dados, credenciais, rollback ou commits.

## Criterio admitido

O gate agora admite `RECONCILIACAO_ATUAL` sem exigir que o operador declare
continuidade historica inexistente. O modo antigo de continuidade DECLARADA
mantem seus requisitos; declaracao tambem nao e registrada como prova historica.
Selecionar reconciliacao invalida nunca permite fallback para o modo antigo.

A aceitacao deve ser explicita, vinculada ao SHA256 do arquivo da evidencia,
checkpoint/sha, janela, configuracao e referencia da autorizacao. Exige:
`criterio=EQUIVALENCIA_ATUAL`, reconhecimento da lacuna, aceitacao do risco
residual e do controle operacional sem revogacao global de SQL/REST.

O plano registra `continuidadeHistoricaComprovada=false`, lacuna reconhecida,
risco aceito, hash da evidencia e referencia da autorizacao. Somente uma futura
recuperacao autorizada persistira essa decisao no estado privado do supervisor.
Nesta implementacao/testes, esse registro ocorreu apenas em memoria ficticia.

## Evidencias obrigatorias

1. Relatorio formal schemaVersion=2, aprovado e integro, sem efeitos de escrita,
   com vinculo ao run, janela, configuracao, estado privado e checkpoint.
2. Conteudo completo dos oito dominios e catalogos comparado ao checkpoint,
   por hashes recalculados de todas as linhas normalizadas. IDs/emails unicos,
   relacionamentos, campos comuns e dez adicionais exatos sao conferidos.
   Contagens e T1=false, isoladamente, nao satisfazem o gate.
3. Capturas ordenadas e controle de escritores antes/depois: processo/boot/pai/
   criacao/porta conhecidos, manutencao 503, nenhum processo/tarefa/cliente
   adicional, nenhuma transacao aberta ou job/fila ativo. Sessoes administrativas
   conhecidas continuam preservadas.
4. Nova verificacao READ ONLY imediatamente antes de usar o plano, com TLS,
   linhas/catalogos atuais e observacoes de escritores antes/depois. Mudanca
   de qualquer campo, incluindo alteracao com contagem igual, impede aprovar.
5. Prazo maximo de 15 minutos desde o inicio da reconciliacao; verificacoes
   atuais e inventarios com no maximo 30 segundos. Horarios futuros, incoerentes
   ou fora da janela das capturas sao recusados. Aceite deve ser posterior ao
   termino do relatorio e nao pode estar no futuro.

O produtor futuro `reconciliacao-formal-leitura.cjs` foi adaptado para emitir
schemaVersion=2 com os vinculos e hashes exigidos, em arquivo UUID separado.
Nao foi executado nesta tarefa. A evidencia real anterior, schemaVersion=1,
permaneceu intacta e NAO e convertida/promovida automaticamente. A execucao
futura exigira uma evidencia v2 recente; nao novos backups ou novo checkpoint.

Os adapters de verificacao abrem somente transacoes READ ONLY. Nao executam
o orquestrador de delta. Linhas, senhas e hashes de senha ficam em memoria.
O gate puro nao abre conexoes, altera arquivos nem inicia processos.

## Demais controles preservados

Permanecem obrigatorios: fase INCERTA selada/congelada, causa conhecida do
smoke, ausencia de T1 no roteiro, resultados HTTP concluidos, diario correspondente,
mesmo projeto/configuracao/JWT/checkpoint, processo conhecido, autorizacao
explicita para recuperar, trava exclusiva, ticket de uso unico, readiness e
drenagem sem pendencias/incertezas. Nao ha liberacao automatica de escritas.

O plano e vinculado por hash ao registro da recuperacao. Reutilizacao idempotente
e abertura do smoke reconferem a evidencia formal e os dados atuais. Divergencia
posterior ao planejamento ou ao novo boot conserva manutencao, sem repetir
encerramento/inicio ou executar rollback automaticamente.

O controle segue OPERACIONAL e observado em instantes delimitados. Nao representa
um lock universal dos bancos nem prova negativa de escritas historicas ou de
mudancas transitorias revertidas entre observacoes. A lacuna permanece registrada.

## Testes executados

53 cenarios distintos aprovados, zero falhas pendentes:

- 49 casos da suite de recuperacao: 10 controles existentes e 39 casos novos
  de aceitacao/rejeicao, adulteracao/expiracao, conteudo, referencias, sessao/job,
  identidade, risco nao aceito, T1, idempotencia e mudancas posteriores.
- Integracao do adapter em VM com arquivos, banco, HTTP e IPC ficticios;
  nenhuma conexao de banco ou processo real foi criado pelos testes.
- Quatro regressões filtradas do cutover: JWT/T0 reprovados, ticket unico
  vinculado a PID/projeto/configuracao, smoke reprovado e delta reprovado.

A suite principal passou 47/47; os dois casos adicionados do adapter passaram
em execucoes filtradas. A fixture VM precisou normalizar objetos entre contextos
e fornecer structuredClone; essas falhas de fixture foram corrigidas e o caso
afetado passou. Nao foram repetidas suites completas ou homologacoes reais.

## Estado operacional observado ao finalizar

Estado privado ainda INCERTA/congelado/selado, sem registro de recuperacao;
configuracao corresponde ao fingerprint existente e checkpoint corresponde
ao SHA da reconciliacao anterior. Nenhum destes arquivos foi escrito.

O GET local de verificacao retornou ECONNREFUSED mesmo fora do sandbox.
Inspecao somente leitura confirmou que PIDs 25552/35344 e listener 3001 estao
ausentes. Nao foi iniciada nova instancia, encerrado processo ou retirada a
manutencao. A causa/horario de saida desses processos nao foi determinada
nessa tarefa de adaptacao do gate.

Gate TECNICAMENTE preparado para autorizacao. Recuperacao real NAO esta
operacionalmente aprovada: requer tratar a ausencia do processo conhecido
e produzir evidencia v2 recente sob os controles exigidos. O procedimento
atual recusa encerrar/adotar PID ausente ou desconhecido; nao foi contornado.
