# Inventario concluido no escopo local — 31/10/2026

**Atualizacao posterior: cobertura operacional confirmada pelo proprietario.**
O TrocaTicket e exclusivamente local via VS Code, sem deploys/hospedagens
externas sob seu controle. A pendencia de declaracao externa foi encerrada.
Estado atual e roteiro: `JANELA_FINAL_CUTOVER.md` e
`evidencias/inventario-global-confirmado-20261031.json`.
As limitacoes e pendencias abaixo registram a investigacao historica anterior;
nao devem ser reapresentadas como ausencia de confirmacao do responsavel.
Evidencia consolidada: `evidencias/inventario-global-final-20261031.json`.

Esta etapa usou somente arquivos locais, configuracoes e metadados de processos.
Sem computer-use, navegador, APIs de gerenciamento ou tentativa de contornar
a interrupcao anterior. Nenhuma conexao de banco foi aberta nesta etapa.
As verificacoes SQL anteriores foram reutilizadas com seus horarios originais.

## Configuracoes e documentacao

- `.env` e `.env.example`: MySQL como padrao, porta backend 3001. O arquivo
  example e modelo; nao representa ambiente implantado. Valores privados nao
  foram copiados nem exibidos.
- Os destinos configurados sao MySQL local e o projeto Supabase PI Backend,
  incluindo JWKS e Session pooler. Nenhum outro destino foi identificado nas
  variaveis de endpoint examinadas. Destinos de banco nao identificam seus
  consumidores nem comprovam quem possui credenciais.
- `package.json` tem somente script `test`; nenhum comando de deploy/worker.
  Nenhuma definicao versionada de workflow CI, Docker/Compose, PM2, Procfile ou
  Render/Railway/Fly/Heroku/Vercel/Netlify apareceu nas buscas especificadas.
- Foram examinados sinais de endpoints/hospedagem em 23 documentos Markdown
  do backend e nas duas configuracoes Postman locais. Nenhuma URL de provedor
  de hospedagem foi identificada. Mencoes de deploy em relatorios de inventario
  nao foram consideradas evidencia de implantacao.
- CORS referencia localhost:5173; o listen principal nao restringe host.
  CORS nao deve ser usado como prova de isolamento de rede.

## Processos e conexoes locais

- MySQL XAMPP ativo, PID observado 19348, listener 3306. O bind abrange todas
  as interfaces. Isso admite possibilidade de consumidores da rede, dependendo
  do alcance efetivo; nao comprova conexao externa nem exposicao a Internet.
  Nenhuma configuracao de rede/firewall foi alterada ou sondada.
- Nenhum listener backend nas portas 3001/3107/3111. Os processos Node
  observados foram classificados como ferramentas Codex/MCP.
- Nenhuma tarefa agendada com referencia explicita ao projeto; nenhum tunel
  atribuivel encontrado. Os nomes/argumentos completos dos processos nao foram
  exportados. Conexoes estabelecidas nas portas de banco observadas: zero.
- O inventario SQL anterior confirmou READ ONLY, visibilidade PROCESS global,
  zero clientes de aplicacao, zero transacoes externas, event_scheduler OFF e
  nenhum evento SQL agendado. As cinco entradas command=Daemon eram threads
  internas InnoDB (purge/shutdown). O rotulo anterior OUTRA_ORIGEM dessas entradas
  nao significa cinco consumidores externos: HOST vazio foi classificado
  genericamente na coleta anterior. Esta consolidacao as separa de clientes.

## Supabase: evidencia anterior reaproveitada

Conforme confirmado na etapa anterior, as sessoes supabase_admin e pgbouncer
sao compativeis com infraestrutura administrativa/monitoramento e pooler.
Estavam idle, sem transacao aberta; nenhuma foi encerrada. Os consumidores
finais por tras de PostgREST/Supavisor nao sao determinados por essas conexoes
de infraestrutura. O subservico administrativo exato continua sem identificador
de aplicacao; essa ausencia nao foi tratada como evidencia de outro backend.

## Limite e bloqueios restantes

Nao ha evidencia local de outro backend, job ou deploy ativo. Entretanto,
arquivos e processos deste computador nao enumeram outros computadores,
contas cloud, CI configurado fora do repositorio, consumidores de API ou
detentores de credenciais. O usuario ja informou nao saber confirmar essa
cobertura. Nenhuma dessas ausencias foi convertida em certeza global.

1. Confirmar com o responsavel todos os hosts, contas/deploys, jobs/CI e clientes
   de API/banco fora deste computador. Podem ser necessarios registros de acesso
   ou inventarios administrativos obtidos por via autorizada fora desta etapa.
2. Registrar o controle operacional desses escritores antes de declarar o
   inventario global completo. Enquanto desconhecidos, manter o gate bloqueado.
3. Na futura janela autorizada: iniciar instancias sob supervisor, renovar
   evidencias, congelar/drenar e gerar T0/delta final. Estes snapshots locais
   nao constituem evidencia atual de drenagem nem autorizacao de cutover.

O bloqueio ECONNREFUSED esta resolvido pela inicializacao MySQL autorizada na
etapa anterior. Nao houve novos testes, startup de servicos, escrita de banco,
alteracao de credenciais/JWT, congelamento ou cutover nesta etapa.
MySQL permanece padrao; Supabase normal continua bloqueado.
