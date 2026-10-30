# Validacao descartavel da RPC de custos — proposta de execucao

Estado: SOMENTE PLANEJAMENTO. Nenhuma conexao, consulta, instalacao, permissao
ou recurso de banco criado. A execucao exige autorizacao especifica posterior.
Progresso da Etapa 5 nao muda por esta proposta.

## Ambiente observado sem conexoes

- Node e npm disponiveis. Docker, Podman, psql, postgres, initdb e pg_ctl nao
  encontrados no PATH. Tambem nao encontrados nos locais Windows padrao
  verificados: Program Files/PostgreSQL, executavel Docker Desktop, RedHat/Podman.
- Nenhum processo correspondente encontrado por Get-Process ou servico
  correspondente por Get-Service. Nenhum listener observado via netstat nas
  portas 5432/5433/54322/55432. Esses resultados sao inventario parcial, nao
  comprovacao de ausencia de qualquer instalacao fora desses locais.
- Inventario CIM de processos/servicos retornou acesso negado; foi usado o
  inventario alternativo acima, sem elevar privilegios.
- C:\Users\Lucas\PostgreSQLTest nao existe. Nenhum ambiente PostgreSQL de teste
  comprovadamente separado foi identificado. MariaDB 3307 nao executa esta RPC.
- O conector db-postgres.js e o script testar-conexao-postgres.cjs nao atestam
  um ambiente descartavel; nao foram executados. Nao ler/reutilizar .env ou
  credenciais do projeto para esta validacao.

Bloqueio atual: disponibilizar um runtime isolado. Instalar/iniciar Docker
Desktop/WSL2 ou baixar imagens NAO faz parte da autorizacao atual. Se essa
alternativa for escolhida, obter autorizacao propria e verificar recursos e
permissoes do Windows antes de provisionar. Nao instalar dependencias npm.

## A — PostgreSQL direto, primeira execucao proposta

Cluster NOVO em um unico conteiner Linux, imagem oficial PostgreSQL major 17,
sem reutilizar qualquer datadir ou banco existente. Fixar a imagem pelo ID local
e registrar seu digest/versao antes de criar o conteiner. Nao usar latest nem
fazer pull automatico se a imagem estiver ausente. A versao PostgreSQL real do
destino nao foi comprovada aqui; testar major 17 nao prova outras versoes.

Isolamento:
- Docker context explicito desktop-linux, aceito SOMENTE se o endpoint for o
  named pipe local esperado e o engine for Linux. Recusar SSH/TCP remoto,
  context alternativo, Docker Host herdado ou endpoint desconhecido. Se o
  contexto nao existir, parar; nao escolher outro por fallback.
- --network none: apenas loopback interno, sem acesso de rede aos bancos reais.
  Nao publicar portas, usar host networking, montar sockets do host ou adicionar
  redes. [Documentacao Docker](https://docs.docker.com/engine/network/drivers/none/).
- PGDATA novo em tmpfs, sem volumes/datadirs existentes e sem bind de pastas do
  projeto, XAMPP, backups ou arquivos privados existentes. Montar somente UMA
  senha de bootstrap nova, exclusiva e read-only, gerada para esta execucao.
- Pasta de trabalho exclusiva fora do repositorio: C:\Users\Lucas\PostgreSQLTest\
  tt-custos-pg-<UUID>. Senha em arquivo novo com ACL Lucas/SYSTEM, nunca em
  argumentos, logs, .env ou Git. Credenciais reais nao entram no pacote.
- Nome, labels e ID imutavel do conteiner registrados num manifesto. Se o nome
  ja existir, parar. Nunca reutilizar um conteiner encontrado por nome.
- O servidor tera listen_addresses vazio, alem de network none: sem TCP sequer
  no loopback interno. A porta 5432 e apenas o identificador do socket UNIX.
- Acessar PostgreSQL apenas por docker exec no ID validado, socket UNIX interno
  /var/run/postgresql, porta interna 5432, usuario postgres e banco de teste
  explicitos. Ambiente do cliente limpo; psql -X -w, sem arquivos de cliente ou
  prompt de senha. Nenhum uso do pool/configuracao do TrocaTicket.

Limites: conexao 5s, startup 30s, lock_timeout 5s, statement_timeout 15s,
idle_in_transaction_session_timeout 30s, prazo global do ensaio 180s. Limitar
conteiner a 1 CPU, 768 MiB de RAM, tmpfs de dados 256 MiB e shm 64 MiB. Confirmar
capacidade do host/engine antes. Nao alterar configuracoes globais para caber.
tmpfs conta na memoria e perde os dados quando o conteiner para; capturar os
resultados ANTES da parada. Nao e promessa de apagamento forense de swap.
[Documentacao tmpfs](https://docs.docker.com/engine/storage/tmpfs/).

## Pacote e comandos previstos, ainda nao executados

O pacote a preparar apos autorizacao tera somente:
00-identidade.sql, 01-estrutura.sql, copia byte a byte da RPC existente,
02-casos.sql, 03-falhas.sql e um controlador Node com APIs nativas de processos/
arquivos/timers para duas sessoes psql. Nenhum desses scripts de execucao foi
criado nesta etapa. Guardar hashes dos arquivos e saidas JSON/CSV no manifesto.
Nao copiar nem restaurar trocaticket_supabase.sql ou dumps com dados reais.

Sequencia prevista em PowerShell, condicionada ao provisionamento aprovado,
senha privada e pacote revisado. Os comandos abaixo nao fazem essa preparacao:

```powershell
$run = [guid]::NewGuid().ToString('N').Substring(0, 12)
$nome = "tt-custos-pg-$run"
$banco = "tt_custos_$run"
$pastaTeste = "C:\Users\Lucas\PostgreSQLTest\$nome"

docker --context desktop-linux context inspect desktop-linux
# Conferir endpoint LOCAL antes de qualquer operacao seguinte.
$imagem = docker --context desktop-linux image inspect postgres:17 --format '{{.Id}}'
# Imagem ausente/erro/vazio: PARAR. Sem pull automatico.

$cid = docker --context desktop-linux create --name $nome `
  --label "tt.purpose=rpc-custos" --label "tt.run=$run" `
  --network none --memory 768m --cpus 1 --shm-size 64m `
  --tmpfs /var/lib/postgresql/data:rw,nosuid,size=256m `
  --mount "type=bind,source=$pastaTeste\bootstrap-password.txt,target=/run/secrets/bootstrap-password,readonly" `
  -e POSTGRES_PASSWORD_FILE=/run/secrets/bootstrap-password `
  -e POSTGRES_USER=postgres -e POSTGRES_DB=$banco -e PGDATA=/var/lib/postgresql/data `
  -e 'POSTGRES_INITDB_ARGS=--auth-local=peer --auth-host=scram-sha-256' `
  $imagem postgres -c port=5432 -c listen_addresses= `
  -c unix_socket_directories=/var/run/postgresql -c timezone=UTC `
  -c statement_timeout=15000 -c lock_timeout=5000 `
  -c idle_in_transaction_session_timeout=30000

docker --context desktop-linux inspect $cid
# Validar ID, labels, imagem, network=none, ausencia de ports/volumes extras e
# apenas a montagem privada prevista. Nao imprimir Config.Env ou segredo.
docker --context desktop-linux start $cid
docker --context desktop-linux exec $cid mkdir -p /tt-test
docker --context desktop-linux cp "$pastaTeste\pacote\." "${cid}:/tt-test"

docker --context desktop-linux exec --user postgres $cid env -i `
  PATH=/usr/local/bin:/usr/bin:/bin PGCONNECT_TIMEOUT=5 `
  psql -X -w -h /var/run/postgresql -p 5432 -U postgres -d $banco `
  -v ON_ERROR_STOP=1 -v "expected_db=$banco" -f /tt-test/00-identidade.sql
```

O controlador definitivo verificara exit codes e valores a CADA comando; nao
continuar apos falha inesperada ou resultado incerto. Erros intencionais dos
casos negativos precisam corresponder ao SQLSTATE esperado e ter seus efeitos
verificados em nova sessao do MESMO banco; nao sao autorizacao para retry.
A captura de ID/image acima nao e guard suficiente por si.
Executar 01-estrutura.sql SOMENTE apos a identidade real aprovada; depois os casos
com a mesma forma explicita de exec. A inicializacao da imagem cria o banco novo
POSTGRES_DB: ate essa criacao requer a autorizacao especifica de provisionamento.
Referencias da imagem/PGDATA: [PostgreSQL oficial](https://hub.docker.com/_/postgres).

00-identidade.sql, antes de qualquer DDL, deve confirmar current_database(),
version()/server_version_num, data_directory, port=5432, listen_addresses vazio,
unix_socket_directories previsto, inet_server_addr() NULL (socket),
session_user/current_user, pg_postmaster_start_time() e system_identifier::text
de pg_control_system() (nunca converter esse identificador int8 para Number).
Cruzar com ID/imagem/montagens/inicio do conteiner. Exigir major 17, PGDATA
previsto, banco UUID exato e ausencia de tabelas da aplicacao/papel service_role.
Registrar o identificador do cluster e conferir nas sessoes posteriores, antes
de SET ROLE. Divergencia: parar SEM executar DDL ou tentar outras conexoes.

## Estrutura minima e objetos novos

Somente dentro do cluster/banco novos, apos autorizacao:
- Enum public.usuarios_perfil_enum com os quatro rotulos ja documentados.
- public.usuarios: id INTEGER identity/PK e perfil enum obrigatorio; sem nome,
  email, senha, hash ou qualquer registro importado.
- public.eventos: id INTEGER identity/PK e usuario_id FK para usuarios.
- public.custos_evento: os cinco campos/tipos do contrato, INTEGER identity/PK,
  VARCHAR(100/255), NUMERIC(12,2), FK evento_id ON DELETE CASCADE e indice evento_id.
- public.substituir_custos_evento: SQL ORIGINAL preparado, sem alterar seu corpo;
  conferir hash antes/depois de copiar e instalar.
- Role service_role NOLOGIN/NOSUPERUSER/NOBYPASSRLS e role tt_probe sem privilegios,
  apenas deste cluster. Conceder o minimo necessario a service_role: USAGE public,
  EXECUTE da RPC, SELECT dos campos usados, UPDATE em eventos para FOR UPDATE,
  INSERT/DELETE/SELECT custos e acesso necessario a sequencia de custos.
- Criar funcao e restringir EXECUTE de PUBLIC na mesma transacao de instalacao.
  Validar privs antes do commit. Testar tt_probe sem EXECUTE e, em teste controlado
  com permissao temporaria apenas nesta funcao, guard TC403 para papel incorreto.
- Instrumentacao temporaria tt_harness: funcao/trigger AFTER INSERT para falha
  controlada e funcao de guarda de SELECT, com politicas RLS somente de teste,
  conforme abaixo. Nao alterar o SQL original para forcar um sucesso/erro.

Essas concessoes e politicas ainda NAO existem. A autorizacao de execucao deve
inclui-las exclusivamente no cluster novo. NOBYPASSRLS permite injetar falha de
releitura no ensaio; NAO reproduz BYPASSRLS real do Supabase. SET LOCAL ROLE
service_role comprova current_user/privilegios desse papel de teste, nao JWT,
origem confiavel de req.usuario.id ou autenticacao pelo gateway.

Dados sinteticos: organizadores A/B, participante C, eventos A1/A2 e B1, custos
rotulados TESTE-C01/C02, gerados apenas pelo pacote. Capturar IDs por RETURNING;
nao presumir IDs consecutivos nem reutilizar IDs de pessoas/eventos reais.

## Casos PostgreSQL diretos

Executar chamadas comuns em autocommit sob service_role, evitando que um
ROLLBACK final do teste esconda escrita parcial. Registrar SQLSTATE/JSON/estado
antes e depois, sem logs contendo credenciais. Nova sessao confirma persistencia.
Na fase A, valor_estimado da entrada RPC e string canonica. Converter entradas
HTTP numericas pertence ao adaptador; nao confundir esses contratos.

| Caso | Resultado exigido |
|---|---|
| Instalacao/compilacao e chamada valida | Corpo original compila e realmente executa; apenas cinco campos, novos IDs positivos e id ASC |
| Propriedade/perfil | TC404 para evento B1 solicitado por A ou evento ausente; TC403 para ator nao organizador; nenhum custo alterado |
| Lista/valores | TC400 para item invalido inclusive no fim da lista; validar a lista inteira antes das escritas |
| Precisao | Texto exato 0.00, 0.10, 0.20, 9999999999.99, sem arredondar; rejeitar negativos, escala extra, excesso e tipos errados |
| Unicode/trim | Categoria/descricao nos limites, espacos Unicode normalizados pelo contrato; nenhum ajuste silencioso de valores invalidos |
| Vazio | Retorno [] e zero custos apenas do evento alvo; evento/proprietario e demais eventos preservados |
| Releitura | Retorno contem IDs e valores efetivamente persistidos, igual ao SELECT de outra sessao apos commit; nenhuma segunda leitura externa para fabricar resposta |
| Rollback apos INSERT | Trigger de teste falha no segundo item valido, apos excluir anteriores e inserir primeiro. Consulta posterior recupera a lista original, inclusive IDs; sequencia pode ter lacunas |
| Rollback por releitura | Trigger marca GUC local apos ultimo INSERT. Guarda RLS de SELECT levanta erro na releitura final; verificar lista anterior intacta em nova sessao |

Falha de releitura: habilitar RLS SOMENTE na tabela efemera deste cenario,
service_role nao dono e NOBYPASSRLS. Uma politica SELECT usa a guarda; politicas
INSERT/DELETE permitem os passos anteriores. Antes de inserir, a guarda permite
leitura; AFTER INSERT do ultimo item ativa flag transaction-local e a guarda
levanta excecao ao SELECT final. Confirmar que a falha ocorreu NESSA etapa, sem
captura dentro da RPC. Se a instrumentacao nao conseguir demonstrar essa ordem,
marcar caso inconclusivo; nao declarar aprovado. Remover instrumentacao/restaurar
RLS da fixture antes dos demais casos. Nada disso comprova RLS do projeto real.

## Duas conexoes: barreiras, nao esperas arbitrarias

O controlador Node usa somente child_process/fs/timers e dois docker exec -i
psql com ambiente/ID/banco explicitos. Nao importa pool, dotenv ou SDK do projeto.
Cada sessao registra pg_backend_pid e application_name unico. Barreira READY
confirma o passo atingido; monitorar pg_blocking_pids/wait_event, como bootstrap
do teste quando necessario. Timeout ou identidade divergente encerra o ensaio.

1. PUT/PUT: A abre transacao, chama a RPC e segura o commit. B tenta substituir
   o mesmo evento. Demonstrar espera de B pelo PID de A; confirmar que nao houve
   escrita de B durante a espera. Commit A; B conclui. Estado final e a lista B
   completa, sem mistura. Nenhuma suposicao sobre continuidade da sequencia.
2. PUT -> protocolo de publicacao: A segura a substituicao nao confirmada; B
   inicia evento FOR UPDATE -> custos ORDER BY id FOR UPDATE. B espera e, apos
   commit A, captura os custos novos na ordem correta.
3. Protocolo de publicacao -> PUT: A bloqueia evento e custos e guarda snapshot;
   B tenta RPC de custos e espera. A termina sem gravar cotacao; B conclui. O
   snapshot capturado por A continua sendo o anterior; custos atuais sao os B.

Repetir as sondas com o evento A2 inicialmente sem custos: o lock do evento deve
coordenar tambem o conjunto vazio, sem depender de gap lock ou linha de custo.

Casos 2/3 sao sondas REAIS do protocolo de locks, sem tabelas/cotacoes publicadas.
NAO validam a RPC de publicacao, seu 201/409, comparacao ou seus INSERTs. Essa RPC
exige ensaio separado. Usar READ COMMITTED explicito para estes casos; registrar
isolamento. Nao inferir equivalencia para outros niveis de isolamento.

## B — PostgREST/Supabase: outra autorizacao/ambiente

Nao incluido na primeira execucao proposta. Exige stack local descartavel com
gateway/PostgREST, credenciais exclusivamente sinteticas e rede interna restrita
apenas a novos componentes, sem acesso aos projetos reais. Revisar endpoints,
imagem/configuracao e ACLs dessa stack ANTES de disponibiliza-la.

| PostgreSQL direto pode comprovar | Continua pendente de PostgREST/Supabase |
|---|---|
| Compilacao, SQLSTATE, casts, locks e rollback do corpo SQL | POST RPC read-write/VOLATILE e commit da requisicao antes da resposta HTTP |
| JSONB com valores textuais e IDs reais | Binding/serializacao via gateway e SDK real, status/envelope/erros e esquema exposto |
| SET ROLE/privilegios de papeis artificiais | Papel real da chave privada, JWT/gateway e RLS/EXECUTE efetivos da stack |
| Falhas controladas e visibilidade entre sessoes | Timeout/perda de resposta apos possivel commit, ausencia de replay do adaptador e GET independente real |

Cada requisicao PostgREST tem sua propria transacao; um sucesso em psql nao e
prova da chamada HTTP. [Referencia PostgREST](https://docs.postgrest.org/en/v12/references/transactions.html).
Mesmo a stack local nao comprova configuracao/TLS/ACLs do projeto Supabase real.
Nao alterar nem contornar a fabrica/configuracao principal para testar essa etapa.

## Limpeza restrita e criterio de encerramento

Antes de limpar, conferir novamente contexto local, ID, labels/run UUID e imagem
do manifesto. Salvar logs/resultados/hash fora do conteiner ANTES de parar.
Entao somente docker stop --time 10 <ID-validado> e docker rm <ID-validado> no
mesmo contexto. PGDATA tmpfs desaparece na parada; nao ha volume real a apagar.
Apagar somente a senha NOVA desse run por LiteralPath, verificando caminho
canonico dentro da pasta autorizada. Conservar relatorios/manifesto para revisao.
Sem prune, remocao por lista/nome parcial, exclusao recursiva do workspace,
Docker socket montado, DROP em outro banco ou encerramento de processos existentes.

Se qualquer identificacao falhar, nao tentar outro host/porta/credencial nem
limpar um recurso cuja propriedade nao foi comprovada. Registrar o impedimento.
Um teste inconclusivo nao e aprovado. Final da fase A deve relatar separadamente
provas diretas obtidas e pendencias HTTP/ambiente real; nao marcar automaticamente
as cinco operacoes como migradas nem encerrar Etapa 5.
