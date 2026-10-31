# Janela final interrompida — 31/10/2026

A execucao autorizada parou no inventario inicial, antes de conexoes aos bancos.
O Windows PowerShell recusou carregar `scripts/inventario-janela-real.ps1`:
`UnauthorizedAccess`, execucao de scripts desabilitada. O helper reportou
`BACKUP_COMMAND`; nao houve tentativa de gerar backups nessa etapa.

Nenhuma politica foi alterada ou contornada. A migracao nao foi reexecutada.
A verificacao posterior somente leitura confirmou congelamento e selagem
inativos, ausencia de transicao e guard original de startup preservado.
MySQL permanece como padrao. Supabase principal continua bloqueado.

Nenhum processo Express foi iniciado. Nao houve backups T0 novos, rotacao JWT,
escritas, exclusoes, rollback ou commits. Os dez registros adicionais permanecem
preservados; nao foi realizada nova leitura das bases apos a interrupcao.

Evidencia sanitizada: `evidencias/janela-final-real-20261031.json`.

Bloqueio: preparar uma execucao permitida do inventario e dos helpers privados
PowerShell, sem alterar politicas de seguranca. Retomar a janela exige nova
autorizacao; todos os gates reais ainda precisam ser executados.

## Correcao autorizada dos helpers — 31/10/2026

Politica efetiva identificada: `Restricted`. Todos os escopos retornaram
`Undefined` (MachinePolicy, UserPolicy, Process, CurrentUser e LocalMachine),
portanto a restricao veio do padrao efetivo, sem politica de grupo configurada.

As tres chamadas dos dois helpers agora usam `scripts/helper-powershell.cjs`,
com lista fixa de scripts locais permitidos e `-ExecutionPolicy RemoteSigned`
somente no PowerShell filho. Nao se usa Unrestricted, Bypass, Set-ExecutionPolicy
ou Unblock-File. Politicas de grupo e verificacoes de origem/assinatura permanecem
aplicaveis; nenhuma politica persistente foi alterada.

Validacao especifica: tres testes aprovados, zero falhas. O inventario real
somente leitura executou; o helper de diretorio carregou e recusou destino
invalido antes de criar arquivos. As politicas antes/depois permaneceram iguais.
Sintaxe JavaScript e dos dois helpers PowerShell validada. O primeiro comando
de testes foi impedido pelo sandbox (`spawn EPERM`); a execucao autorizada fora
do sandbox passou. Nenhum teste anterior de migracao foi repetido.

Nao foram criados diretorios T0 nem testadas novamente suas ACLs. Nao houve
conexao aos bancos, congelamento, cutover ou alteracao de dados/JWT/credenciais.
O registro da janela interrompida permanece como evidencia historica.

Bloqueio de carregamento dos helpers corrigido. A janela permanece interrompida;
aguarda nova autorizacao e reexecucao dos gates operacionais completos.

## Retomada autorizada — interrompida no smoke

Execucao `fae5b97e-eab2-4ab2-878e-da9ad9c6e784`, em 31/10/2026.
Inventario de escritores, contas dos quatro perfis, congelamento, drenagem,
backups T0 e delta foram aprovados. O startup protegido foi aplicado e o JWT
principal foi rotacionado. O processo MySQL Express conhecido foi encerrado
apos drenagem; o servico MySQL foi preservado. Supabase Express iniciou pela
transicao privada, ainda com novas escritas bloqueadas.

Backups T0 completos e checkpoint privado:
`C:\Users\Lucas\BackupsTrocaTicket\t0-b89cb0d48a4e99b43ce50a26238621aa`.
Diario privado e configuracao anterior preservada:
`C:\Users\Lucas\BackupsTrocaTicket\t0-61d4109cb750808f4560297c5e7204fc`.
Nenhum segredo foi impresso nem exportado para o repositorio.

Smoke executado ate a interrupcao: dois JWT antigos recusados (401), login
administrador aprovado (200), assinatura/claims do novo JWT validadas e
GET /perfil aprovado (200). A assercao seguinte falhou por exigir `perfil`
no corpo de GET /perfil. O contrato existente retorna somente `id`, `nome`
e `email`, tanto no repositorio MySQL quanto no Supabase. A falha e do roteiro
de smoke (`assert.equal(p.perfil,a.perfil)`), identificada por leitura do codigo.
O contrato da aplicacao nao deve ser ampliado para satisfazer esse teste.

A operacao foi interrompida, sem corrigir/repetir o smoke automaticamente.
Nao houve primeira escrita T1, fixture criada, exclusao ou rollback. Os dez
registros adicionais permanecem preservados. Os demais smoke tests, isolamento
MySQL no novo processo e liberacao normal nao foram aprovados nesta janela.

Estado privado apos falha: `congelado=true`, `selado=true`, fase `INCERTA`.
DB_PROVIDER esta `supabase` e o JWT novo permanece configurado. O processo
Supabase PID 25552 foi preservado em manutencao; o PID Express anterior 35808
encerrou. Nao reverter credenciais nem editar/apagar o estado privado para
contornar o supervisor. Nenhum commit foi criado.

Bloqueios: corrigir exclusivamente a expectativa do smoke e preparar retomada
controlada do estado interrompido, com gates atuais e autorizacao, antes de
executar os testes restantes ou liberar o funcionamento normal.
Evidencia desta retomada: `evidencias/janela-final-real-20261031.json`.
A interrupcao anterior por PowerShell foi arquivada em
`evidencias/janela-final-interrupcao-powershell-20261031.json`.

## Correcao exclusiva do smoke de GET /perfil

A expectativa incorreta `p.perfil` foi substituida pelo validador
`scripts/smoke-perfil.cjs`. Ele verifica id, nome e email, conforme o contrato
existente. O papel permanece validado nos claims JWT e nas permissoes das rotas.
Nenhuma rota ou repositorio foi alterado nesta correcao.

Tres testes especificos aprovados, zero falhas: aceita resposta sem perfil,
recusa id/email divergentes e recusa corpo/nome invalidos. Sintaxe do roteiro
validada. Nenhuma bateria anterior foi repetida.

A retomada real permanece bloqueada pelo estado privado `INCERTA`, congelado
e selado. O controlador existente nao expoe recuperacao dessa fase; abrir
leitura exige `LEITURA` e resultadosIncertos zero. Um novo processo nao herda
o canal IPC do pai atual, e o startup protegido recusa novo boot nessa fase.
Modificar somente o arquivo do teste nao muda o controlador ja em execucao.

Nao foi editado/apagado o estado privado nem contornado o gate de seguranca.
Nao foram repetidos backups, delta, rotacao JWT ou escritas. Nenhum rollback,
reinicio ou commit. Os dez registros adicionais nao foram alterados.

Funcionamento normal NAO pode ser liberado. E necessaria uma etapa autorizada
de recuperacao controlada do supervisor para reabrir somente leituras, manter
escritas bloqueadas e executar o smoke corrigido antes de qualquer liberacao.
Essa mudanca excede a correcao exclusiva do teste solicitada nesta etapa.

## Recuperacao preparada, ainda nao executada

Procedimento e adapters reservados a nova autorizacao estao documentados em
`RECUPERACAO_SUPERVISOR_PREPARADA.md`. Dez testes isolados passaram; a inspecao
real somente leitura confirmou PID/porta, estado e .env inalterados e HTTP 503.
A proposta substitui apenas o processo Supabase conhecido, em manutencao,
preservando janela, checkpoint e JWT. Exige confirmacao explicita de ausencia
de escritas paralelas desde o delta; nao presume continuidade nem repete delta.
Nenhuma recuperacao, abertura de leitura ou liberacao normal foi executada.

## Recuperacao autorizada — parada no gate de continuidade

A autorizacao seguinte solicitou confirmar ausencia de escritas paralelas e
interromper diante de impossibilidade de confirmacao. Esse gate nao foi
aprovado. O diario privado e o relatorio demonstram T1=false no roteiro, mas
nao constituem historico completo de SQL/REST/jobs fora do Express. A autorizacao
para verificar esse fato nao foi interpretada como declaracao de sua ocorrencia.
Nao foi ativado o flag `confirmarContinuidadeSemEscritas` por presuncao.

Somente leituras locais e um GET de manutencao foram executados. Checkpoint,
configuracao e diario correspondem; estado, .env e checkpoint permaneceram
inalterados. HTTP 503 confirmado, fase INCERTA, congelado e selado.

Interrompido antes de criar trava, encerrar/iniciar processos ou mudar a fase.
Sem recuperacao, smoke, conexoes aos bancos, delta, backups, nova rotacao JWT,
escritas ou rollback. O funcionamento normal nao esta aprovado.

Pendencia factual: confirmacao do responsavel de que nao houve SQL/REST/jobs
ou outros consumidores escrevendo em qualquer base desde o delta aprovado.
Se isso nao puder ser confirmado, e necessaria outra evidencia de continuidade
e uma decisao sobre a restricao de nova reconciliacao; nao executar por conta
propria o delta expressamente proibido.

Evidencia sanitizada:
`evidencias/recuperacao-supervisor-interrompida-continuidade-20261031.json`.

## Auditoria posterior exclusivamente de leitura

Conforme `AUDITORIA_CONTINUIDADE_LEITURA.md`, as oito tabelas e catalogos atuais
coincidem com o checkpoint aprovado: MySQL 42 registros, Supabase 52, incluindo
os dez adicionais. Nao foi executado novamente o roteiro de delta ou backup;
a comparacao pontual somente leitura foi solicitada expressamente na auditoria.

Ausencia historica de escritas nao comprovada. Logs MySQL completos estao
desabilitados atualmente; leitura dos logs PostgreSQL recusada (42501), sem
historico REST completo acessivel. Contadores sem baseline e inventario atual
nao cobrem atividade passada. HTTP 503, JWT, checkpoint e estado preservados.
Recuperacao segue nao aprovada pelo criterio historico estrito. A proposta
documentada exige decisao sobre evidencias historicas ou reconciliacao formal
sob controle exclusivo dos escritores, sem afirmar prova negativa retroativa.

## Reconciliacao formal autorizada — parecer atual

Em 31/10/2026, 16:50:40–16:50:59 UTC, foram conferidos escritores antes/depois
e duas capturas READ ONLY dos oito dominios. Zero divergencias: 42 registros
comuns identicos e dez adicionais preservados. Identidades, relacionamentos,
catalogos e artefatos existentes verificados; HTTP 503 e estado/JWT/checkpoint
inalterados. Nenhuma recuperacao executada.

`PARECER_RECONCILIACAO_FORMAL.md` registra parecer favoravel CONDICIONADO a
recuperacao por equivalencia atual, sem comprovar ausencia historica. O gate
existente ainda exige continuidade historica; precisa de adaptacao explicita
e testes antes de executar, sem preencher esse fato como verdadeiro.
Evidencia nova separada: `evidencias/reconciliacao-formal-leitura-20261031.json`.
