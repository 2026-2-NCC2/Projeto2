# Homologacao HTTP somente leitura — quatro perfis aprovados, encerrada

Resultado atual em `RESULTADO_HOMOLOGACAO_LEITURA.md`. Monitor corrigido;
startup, logins, JWTs, os quatro perfis, consultas GET e barreiras
reais conferidos. Processo encerrado; servidor normal permanece no MySQL.

O inicializador separado e `scripts/iniciar-homologacao-leitura.cjs`.
Usa exclusivamente 127.0.0.1:3111 e o projeto PI Backend,
project ref `gnwybroqfvwosiqzsfla`. Porta ocupada causa falha, sem alternativa.
Nao iniciar a conexao real sem nova autorizacao do usuario.

## Configuracao privada necessaria

Usa exclusivamente `PI Backend/.env`, com variaveis separadas das principais:

```dotenv
HOMOLOG_SUPABASE_URL=https://gnwybroqfvwosiqzsfla.supabase.co
HOMOLOG_SUPABASE_SECRET_KEY=
HOMOLOG_JWT_SECRET=
```

Para testar login real, adicionar tambem `HOMOLOG_TEST_EMAIL` e
`HOMOLOG_TEST_PASSWORD`, com uma conta existente do PI Backend. Sao entradas
do roteiro de validacao, nao credenciais de banco nem flags de startup.
Nao enviar esses valores pelo chat ou registra-los em logs.

Para contas dedicadas de administrador e participante, o roteiro de conclusao
usa `HOMOLOG_ADMIN_EMAIL`, `HOMOLOG_ADMIN_PASSWORD`,
`HOMOLOG_PARTICIPANTE_EMAIL` e `HOMOLOG_PARTICIPANTE_PASSWORD` do mesmo `.env`.
Essas variaveis nao ativam o servidor nem modificam a selecao normal do banco.

As duas entradas vazias devem ser preenchidas manualmente. A secret key deve
pertencer ao projeto PI Backend. Gerar JWT criptograficamente aleatorio,
exclusivo e nunca reutilizado, sem coloca-lo no Git/chat/log. Nao alterar
`DB_PROVIDER`, `DB_*`, `SUPABASE_*` ou `JWT_SECRET` existentes para homologar.
MySQL permanece o padrao, e `DB_PROVIDER=supabase` continua bloqueado no startup
normal. As variaveis `HOMOLOG_` nao ativam o contexto privado por si mesmas.

O inicializador nao recebe argumentos e nao consulta arquivos JSON externos.
A pasta TrocaTicketPrivado nao e mais utilizada; o modelo vazio anteriormente
criado la nao foi removido nem lido nesta adaptacao.

Requisitos exatos:

- `.env` regular, legivel, de ate 32768 bytes, sem redirecionamento por link.
  Mantenha-o ignorado pelo Git e protegido pelas permissoes Windows.
- `HOMOLOG_SUPABASE_URL` deve coincidir literalmente com a origem apresentada.
  Projeto, host `127.0.0.1` e porta `3111` permanecem fixos no codigo.
- `HOMOLOG_SUPABASE_SECRET_KEY` aceita `sb_secret_` seguido de letras ASCII,
  numeros, `_` ou `-`. Chaves anon/publishable e JWT service_role legado nao
  atendem ao validador. A chave deve pertencer ao projeto fixado.
- `HOMOLOG_JWT_SECRET` exige 64 a 256 caracteres ASCII alfanumericos, `_` ou `-`,
  incluindo pelo menos 20 caracteres distintos. Nao aceita padding `=`.
  Deve diferir tambem da chave Supabase. Formato nao comprova aleatoriedade.
- ACLs sao pre-condicao operacional: o inicializador nao as verifica.

O JWT da homologacao deve diferir tanto de JWT_SECRET herdado do processo quanto
do JWT_SECRET principal em `PI Backend/.env`, quando presentes. A ausencia de
referencia valida impede a inicializacao. O inicializador usa dotenv.parse(),
sem dotenv.config(): seleciona somente as tres variaveis `HOMOLOG_` e usa
`JWT_SECRET` principal apenas como referencia de exclusividade. Nao reutiliza
as credenciais de banco principais nem aceita fallback das variaveis herdadas
para preencher a homologacao. Confirmar que a
referencia corresponde ao segredo efetivamente usado pelo backend principal.
Nao ha aceitacao simultanea do segredo antigo nos middlewares da homologacao.

Na implementacao atual, `PI Backend/.env` precisa existir e ser legivel, mesmo
quando existe JWT_SECRET herdado: sua leitura e incondicional. Cada referencia
presente (.env e ambiente) precisa ser string de pelo menos 32 caracteres;
uma referencia invalida recusa a inicializacao mesmo se a outra for valida.
As credenciais existentes nao foram exibidas nem sobrescritas nesta adaptacao.

## Execucao futura, somente apos autorizacao

Em processo novo, dentro de `PI Backend`:

```powershell
node scripts/iniciar-homologacao-leitura.cjs
```

O processo carrega somente a configuracao privada de Supabase. Remove do seu
ambiente as configuracoes DB_/PG/SUPABASE_/JWT_/HOMOLOG_ herdadas e monta apenas
as credenciais selecionadas, sem alterar o .env ou outros processos.
Nao carrega db.js, pools MySQL ou repositorios MySQL. Uma tentativa de iniciar
com server.js, uma flag de ambiente isolada ou um processo ja carregado com
MySQL/server.js nao autoriza a homologacao.

`config/banco.cjs` permanece inalterado: o startup normal com DB_PROVIDER=supabase
continua recusado. Apenas o contexto privado estabelecido pelo inicializador
separado permite preparar o app Supabase. A inicializacao normal MySQL e a
instancia isolada MariaDB conservam seus caminhos existentes.

## Barreira de escrita

Um app externo filtra os metodos ANTES de montar o app original, seu parser JSON,
autenticacao e handlers. Permite GET e POST exatamente em `/login`; demais metodos
retornam 405 com mensagem fixa. HEAD e OPTIONS externos tambem sao bloqueados.
JWT, bcrypt, validacoes, perfis, filtros e contratos das rotas permitidas sao os
mesmos do backend. GET ainda exige a autorizacao especifica de cada rota.

Defesa adicional no transporte SDK: somente GET/HEAD das oito tabelas publicas
e POST da RPC STABLE `listar_propostas_por_fornecedor`, ja validada como leitura.
Esse POST e interno ao SDK para atender GET /fornecedor/propostas; nao e uma
excecao para publicacao. `publicar_cotacao`, `substituir_custos_evento`,
`avaliar_proposta` e `decidir_solicitacao_acesso` nao passam pelo transporte.
Tambem nao passam POST/PATCH/PUT/DELETE de tabelas ou endpoints de Auth.

Toda requisicao exige a origem privada fixada, headers da chave de servidor,
schema public, ausencia de redirects e project ref correspondente na resposta.
JWTs dos usuarios nunca sao usados para autenticar o SDK. Ha timeout de 15s e
abort das consultas pendentes no encerramento. O transporte permanece limitado
ao processo separado; nao modifica o cliente usado pelo backend principal.

Ctrl+C/SIGTERM encerra somente o listener e recursos desse processo, removendo
seus listeners e restaurando seu ambiente/fetch. Nao reinicia nem encerra os
servicos principais. Cada execucao requer processo novo.

Cancelamento apos headers corrigido: respostas com corpo mantem o controle
registrado ate aborto do chamador, encerramento ou timeout de 15s. Isso preserva
a Response nativa, inclusive streaming, metadados e clone, sem consumir ou
reescrever o corpo. Controles de respostas ja consumidas podem permanecer
registrados ate esse prazo; nao ha retencao alem dele. Respostas sem corpo e
falhas de fetch liberam o registro imediatamente. Nenhuma barreira de escrita
ou regra de autenticacao foi alterada.

## Limites e proximos passos

- O service_role continua tendo privilegios de escrita no banco; nenhuma ACL
  foi alterada. A protecao implementada e no HTTP e no transporte do processo.
- A RPC de leitura permitida deve permanecer STABLE e sem efeitos de escrita.
  Nao alterar sua definicao durante a homologacao.
- Porta local nao substitui JWT/perfis nem protecao do arquivo privado.
- A exclusividade operacional depende da geracao de um segredo novo e da
  referencia principal atualizada; nao existe inventario de todos os segredos
  historicos do backend.
- Os testes locais usam clientes/filesystem/listen simulados e HTTP efemero
  com persistencia falsa. Nao comprovam a futura configuracao privada, ACLs,
  disponibilidade da porta 3111 ou execucao contra Supabase real.
- Falta preencher as duas variaveis secretas, conferir protecao do `.env`
  e obter autorizacao para iniciar.
  Depois, homologar somente login, perfil, permissoes e consultas reais.
  Escritas reais e ativacao geral permanecem fora desta autorizacao.

## Revisao estatica de retomada — 31/10/2026

Escopo: CLI, controlador de homologacao, encaixe no startup, configuracao pura,
fabrica/cliente Supabase e testes locais relacionados. O grafo estava
desatualizado e nao indexava o inicializador; conclusoes verificadas na fonte.
Sem repeticao de auditorias SQL, conexoes, listeners, testes HTTP ou operacoes
reais. Somente esta documentacao foi alterada nesta retomada.

O filtro precede os handlers; o transporte restringe metodos/destinos e a
entrada privada nao libera o startup normal. Nenhum bloqueante de escrita ou
ativacao indevida foi identificado nesse escopo estatico. O limite de
cancelamento identificado foi corrigido no incremento seguinte. ACLs e valores privados nao foram
verificados; o arquivo privado nao foi criado.

Base informada pelo usuario: **896 aprovados, zero falhas e oito SKIPs**.
Esse resultado anterior nao foi reexecutado nem certificado nesta retomada.
Homologacao real permanece nao iniciada. Nenhum commit criado.

## Correcao de cancelamento apos headers — 31/10/2026

Alteracao exclusiva no ciclo de cancelamento do transporte. Cinco testes novos
cobrem shutdown durante leitura e antes do consumo do corpo, streaming/clone
normais, aborto do chamador e timeout simulado de 15s. Nenhum teste depende de
Supabase ou de bancos reais.

Executados somente `tests/homologacao-leitura.test.cjs` e
`tests/homologacao-http.test.cjs`: **18 aprovados, zero falhas, zero SKIPs**.
Os testes HTTP usam loopback efemero e persistencia simulada. O sandbox bloqueou
o subprocesso Node (EPERM); a execucao autorizada desses testes concluiu.
Permanecem pendentes o arquivo privado, suas ACLs e autorizacao para homologacao
real. Startup normal Supabase continua bloqueado; nenhum commit criado.

## Adaptacao para o .env existente — 31/10/2026

Esta secao e as instrucoes iniciais substituem a configuracao JSON dos
incrementos anteriores. Foram acrescentadas ao `.env` apenas as tres variaveis
`HOMOLOG_` ausentes: URL fixa e duas entradas secretas vazias. Todos os bytes
preexistentes foram preservados. `.env` continua ignorado e nao versionado.
Nenhuma credencial foi gerada, copiada, sobrescrita ou exibida.

CLI agora sem `--config`; somente o inicializador separado pode montar o
contexto. Testes conferem ausencia de fallback, parse sem mutacao do ambiente,
restauracao das variaveis herdadas, recusa dos JWT antigos, MySQL padrao e
bloqueio do startup Supabase normal. Barreiras de escrita e cancelamento HTTP
permanecem preservados.

Executados apenas `tests/homologacao-leitura.test.cjs` e
`tests/banco-provider.test.cjs`: **45 aprovados, zero falhas, zero SKIPs**.
Filesystem privado, clientes e listen sao simulados. Nenhum servidor iniciado
ou banco acessado. Sem commits. Preencher manualmente as duas entradas secretas
e obter autorizacao separada antes da homologacao real.
