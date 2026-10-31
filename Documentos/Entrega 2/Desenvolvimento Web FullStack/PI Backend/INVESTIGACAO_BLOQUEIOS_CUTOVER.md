# Investigacao dos bloqueios — 31/10/2026

Atualizacao posterior: `INVENTARIO_GLOBAL_CUTOVER.md`. MySQL foi iniciado com
autorizacao e conexao READ ONLY confirmada; o bloqueio de disponibilidade abaixo
e historico. Permanece a limitacao de cobertura dos consumidores externos.

Somente leitura de processos, configuracoes e metadados. Nenhum teste anterior
foi repetido. Nenhuma conexao desconhecida foi encerrada. Sem congelamento,
cutover, alteracao de dados, JWT, credenciais ou codigo de execucao.

## MySQL: ECONNREFUSED explicado; disponibilidade ainda pendente

- `.env` e my.ini concordam: destino local e porta 3306. Nenhuma credencial
  foi exibida ou alterada. Nao ha evidencia de erro de autenticacao.
- Nenhum mysqld/mariadbd, listener MySQL, servico Windows registrado ou referencia
  de inicializacao automatica foi encontrado. O painel XAMPP nao esta rodando.
- Windows iniciou em 31/10 as 13:44:35 UTC (10:44:35 America/Sao_Paulo).
  O ultimo log MySQL e de 30/10 as 19:21:55 UTC (16:21:55 local), anterior ao boot.
- Causa imediata comprovada: nao existe servidor ouvindo na porta configurada.
  A cronologia e compativel com MySQL nao retomado depois do reinicio Windows;
  nao se deve corrigir senha ou trocar porta para resolver essa ausencia.
- As ultimas 45 linhas nao contem entradas [ERROR]. Ha recuperacao no startup
  historico. Eventos de crash em 29/10 antecedem o ultimo startup registrado;
  nao comprovam uma falha nova nem justificam reparo ou alteracao dos arquivos.

MySQL nao foi iniciado. Restabelecer a disponibilidade exige iniciar a instancia
XAMPP correta; isso nao foi feito nesta investigacao somente leitura. Depois,
inventariar sessoes/transacoes sem alterar usuarios ou repetir homologacoes.

Evidencia: `evidencias/investigacao-mysql-local-20261031.json`.

## Duas sessoes Supabase sem nome: atribuicao obtida

Projeto fixo PI Backend; TLS do cliente verificado, transacoes READ ONLY.
Foram consultados PID, role, aplicacao, origem local/loopback e estado.
Nao foram consultados SQL anterior das sessoes, senhas ou payloads.

| PID observado | Role | Origem | Resultado |
|---|---|---|---|
| 50029 | supabase_admin | Loopback do servidor, IPv6 | Conta administrativa da plataforma; application_name vazio. Subservico exato nao e exposto por esses metadados |
| 183195 | pgbouncer | Loopback do servidor, IPv6 | Conta de infraestrutura do pooler; schema pgbouncer.get_auth existente e EXECUTE concedido a essa role. A funcao NAO foi executada |

Ambas estavam idle e sem transacao aberta. As mesmas identidades/PIDs e datas
de inicio foram correlacionadas entre as coletas. A primeira consulta verificou
loopback IPv4 OU IPv6; a segunda confirmou que nao era IPv4.

As roles e a origem identificam a camada de infraestrutura; a atribuicao do
subservico administrativo e uma inferencia compativel com a documentacao,
nao identificacao do executavel/processo remoto. A documentacao oficial associa
supabase_admin a configuracao/monitoramento da plataforma:
https://supabase.com/docs/guides/database/connection-management
https://supabase.com/kb/troubleshooting/how-to-interpret-and-explore-the-postgres-logs-OuCIOj

Foram identificados separadamente PostgREST, postgres_exporter e conexao auxiliar
de autenticacao do pooler com application_name contendo Supavisor, criada no
periodo da propria inspecao. Isso evita chamar cada conexao auxiliar de cliente
desconhecido. Nenhuma dessas sessoes foi cancelada ou encerrada pelo agente.
Somente as conexoes proprias de diagnostico foram fechadas normalmente.

Loopback nao identifica o cliente final por tras de um proxy. Nao prova ausencia
de consumidores externos de PostgREST/Supavisor. A documentacao explicita essa
limitacao de origem e observacao:
https://supabase.com/docs/guides/database/postgres/postgres-log-config
https://supabase.com/docs/guides/platform/performance

Evidencias: `investigacao-clientes-supabase-20261031.json` e
`atribuicao-clientes-supabase-20261031.json`, em `evidencias/`.

## Processos e possiveis ambientes externos

- Processos Node observados pertencem a ferramentas Codex/MCP; nenhum backend
  atribuivel ou listener 3001/3107/3111 observado.
- Nenhuma tarefa agendada com referencia ao projeto. Nenhum servico MySQL,
  backend ou tunel correspondente encontrado. ssh-agent esta parado/desabilitado.
- Nenhum processo ssh/plink/ngrok/cloudflared/PM2 observado. wslservice existe,
  mas a listagem nao apresentou distribuicoes WSL em execucao. Docker nao
  apresentou containers existentes. Nenhum ambiente foi iniciado/parado.
- Nenhuma definicao versionada de workflow/deploy, Docker/Compose, PM2,
  Render/Railway/Fly/Heroku/Vercel/Netlify localizada nas buscas especificadas.
  `.github/workflows` e `.vscode` nao existem nos locais consultados.
- CLIs pm2, heroku, fly, railway, vercel, supabase e gh nao estao no PATH.
  Isso nao prova ausencia de deploy feito por navegador/outro computador.
- Nao foram examinados cofres de credenciais, perfis pessoais ou arquivos de
  outros projetos. Nao houve acesso a outros projetos Supabase ou contas cloud.

Nao foi encontrada evidencia local de outro ambiente ativo, mas NAO foi possivel
comprovar ausencia de ambientes externos ou listar todos os detentores de
credenciais. O usuario ja informou nao saber confirmar essa cobertura.

## Bloqueios remanescentes

1. Iniciar/disponibilizar MySQL corretamente, depois concluir inventario de
   sessoes/transacoes. Causa de ECONNREFUSED identificada; servico segue parado.
2. Confirmar subservico administrativo do PID 50029 com logs da plataforma ou
   suporte Supabase, se a atribuicao por role/origem nao bastar operacionalmente.
3. Confirmar contas/deploys/consumidores externos com o responsavel pelo projeto:
   logs de conexao/acesso, relatorios de clientes do pooler, hosts e jobs/CI.
   Acesso administrativo a essas fontes nao esta disponivel nesta investigacao.

Inventario global continua nao confirmado; gate de cutover permanece bloqueado.
Nao matar sessoes de infraestrutura como substituto dessa confirmacao.
