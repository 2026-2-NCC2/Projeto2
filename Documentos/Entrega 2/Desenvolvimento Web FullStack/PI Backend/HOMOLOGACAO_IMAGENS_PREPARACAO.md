# Preparação da homologação de imagens — 04/11/2026

Atualização: inicializador, validação de destinos, query_timeout e entrada React
isolada agora estão implementados. Instruções atuais em
[HOMOLOGACAO_IMAGENS_LOCAL.md](HOMOLOGACAO_IMAGENS_LOCAL.md).
O levantamento abaixo preserva o histórico dos bloqueios originais; não é mais
uma indicação de que esses arquivos locais estão ausentes. Testes remotos e
uploads continuam sem autorização/ativação.

Status: **testes reais ainda não liberados**. Revisão integral de
`Banco de dados/perfil_imagens.integracao.md`, código JWT/HTTP/PG/Storage/React
e testes locais. Nenhuma conexão remota, SQL remoto, upload, criação de projeto
ou bucket, mudança de credenciais ou ativação foi executada.

## Evidências locais e bloqueios

- O .env principal possui URL Supabase e configuração PG que referenciam o
  projeto de produção. A revisão só exibiu presença/igualdade, nunca valores
  privados. Não reutilizar esses parâmetros como homologação de imagens.
- Os inicializadores antigos `homologacao.cjs` / `homologacao-escrita.cjs`
  pertencem à migração. Seu projeto fixado é hoje produção; o modo de escrita
  também proíbe PG e não permite os novos caminhos de Storage. Não executar,
  adaptar flags nem remover suas travas para esta homologação.
- `criarClienteStorage` valida origem HTTPS e limita requests à origem passada;
  não sabe se ela é produção. A secret key moderna é opaca: seu formato não
  comprova o projeto de origem.
- `criarPoolPostgres` recebe PGHOST/PGUSER independentemente do cliente Storage.
  `prepararIntegracaoImagens` não compara os dois destinos. Portanto, **o código
  atual não comprova automaticamente que SQL e Storage pertencem ao mesmo
  projeto**. current_database() normalmente ser postgres tampouco comprova isso.
- A fábrica PG verifica TLS e timeouts de conexão/ociosidade, mas não configura
  query_timeout. A integração documentada exige 10 segundos de timeout de
  resposta: falta preparar essa opção no pool do inicializador candidato.
  statement_timeout de 5 segundos e lock_timeout de 2 segundos já existem nas
  transações; não substituem timeout de rede do cliente.
- Falta inicializador específico que valide os destinos, não carregue variáveis
  principais, reutilize autenticação real com repositório de homologação e
  restrinja IDs de contas autorizadas. Não basta importar server.js: ele prepara
  persistência/startup principal. Não existe comando operacional seguro pronto.
- React normal usa localhost:3001. A API tem modo isolado /api, mas falta a
  configuração/entrada Vite exclusiva que selecione esse modo, faça proxy para
  o candidato e habilite somente sua UI. Não modificar o bundle principal.
- Imagens normais continuam desabilitadas no React; as rotas usadas por
  server.js continuam exigindo JWT e retornando 503. Nada na configuração
  atual libera uploads por variável de ambiente.
- Dependências sharp, pg, express, jsonwebtoken e Supabase SDK disponíveis.
  Resta homologar permissões reais, rede/TLS, vínculo dos projetos e Storage.

## Configuração a preparar manualmente

1. Identificar um projeto Supabase de homologação, **diferente de produção**,
   autorizado pelo responsável e exclusivo para dados descartáveis desses
   testes. Registrar project ref e origem HTTPS. Se não existir, isso bloqueia
   os testes: criação/provisionamento exige outra autorização, não foi feito.
   Não copiar a base de produção com dados pessoais.
2. Nesse projeto, o responsável precisa confirmar a existência de usuarios,
   estruturas compatíveis de imagens e dos dois buckets privados, com WebP e
   limites de 5/10 MiB, RLS/grants e políticas revisados. Infraestrutura existente
   em produção não serve como prova para homologação. Esta preparação não
   executa ou autoriza scripts remotos nem criação de buckets.
3. Separar a configuração privada por namespace, sem alterar SUPABASE_*, PG*,
   DB_* ou JWT_SECRET principais. Pode permanecer no .env privado ignorado do
   backend, mas o futuro inicializador deve copiar **somente a allowlist** abaixo
   para um objeto novo. Não espalhar process.env nem carregar dotenv principal
   no processo filho. Estes nomes são contrato proposto; ainda não há loader:

   | Nome proposto | Valor a fornecer pelo responsável |
   | --- | --- |
   | IMAGENS_HOMOLOG_PROJECT_REF | Ref exato do projeto de homologação |
   | IMAGENS_HOMOLOG_SUPABASE_URL | Origem HTTPS desse ref |
   | IMAGENS_HOMOLOG_SUPABASE_SECRET_KEY | Chave exclusiva desse projeto, somente backend |
   | IMAGENS_HOMOLOG_JWT_SECRET | Segredo forte exclusivo, distinto do principal e da migração |
   | IMAGENS_HOMOLOG_PGHOST | Host direto ou Session pooler do mesmo projeto |
   | IMAGENS_HOMOLOG_PGPORT | Porta exibida na conexão escolhida |
   | IMAGENS_HOMOLOG_PGDATABASE | Database indicado no painel |
   | IMAGENS_HOMOLOG_PGUSER | Usuário indicado; no Session pooler, conferir o sufixo do ref |
   | IMAGENS_HOMOLOG_PGPASSWORD | Credencial desse projeto, fornecida somente em arquivo privado |
   | IMAGENS_HOMOLOG_PGSSLROOTCERT | CA confiável, se necessária; não desabilitar TLS |

   Não colocar chaves/senhas em VITE_*, CLI, documentação, logs ou chat. Não
   gerar/rotacionar credenciais de produção para este trabalho.
4. Autorizar quatro contas fictícias do projeto de homologação, uma por perfil,
   e registrar seus IDs reais após consulta autorizada. Não reutilizar os IDs
   numéricos dos testes locais nem presumir equivalência com produção. Usar login
   próprio do Express (bcrypt/JWT), não Supabase Auth. Preparar credenciais dos
   testes em área privada; não versioná-las. O candidato deve recusar outros IDs.
5. Fixar portas independentes em loopback, por exemplo backend 127.0.0.1:3131
   e frontend 127.0.0.1:5273; abortar se ocupadas. São valores planejados, não
   serviços iniciados. Usar origem do frontend separada de localhost:5173 para
   não compartilhar sessionStorage/JWT com a aplicação normal. Proxy /api
   exclusivo para o backend candidato, sem fallback para 3001.

## Travas necessárias antes de conectar

O inicializador candidato ainda precisa ser preparado/testado localmente:

- Recusar o ref conhecido de produção em URL, PGHOST e PGUSER. Exigir ref de
  homologação explícito e URL exatamente https://<ref>.supabase.co. Recusar
  configuração ausente, inconsistente ou host não reconhecido, sem fallback.
- Para host direto, exigir db.<ref>.supabase.co. Para Session pooler, conferir
  host e usuário completo contra conexão aprovada no painel; host compartilhado
  do pooler não identifica o projeto. Não interpretar database postgres como ref.
- Construir clientes somente da configuração validada, com TLS verificado e
  timeout PG de resposta. Não herdar PG*, SUPABASE_* ou JWT principais.
- Antes da futura escrita, executar somente prechecks de leitura autorizados:
  conferir origem/ref nas respostas Supabase disponíveis, credencial do projeto,
  atributos/membership da sessão PG, estruturas e as mesmas contas autorizadas
  em REST e PG. Nunca testar vínculo por upload ou INSERT. Se o vínculo não puder
  ser demonstrado, interromper. Nenhum desses prechecks remotos ocorreu aqui.
- A autenticação deve consultar usuarios no mesmo projeto; não autenticar em
  produção e persistir imagens em outro projeto por coincidência de IDs.
- Reutilizar JWT real, HS256/expiração e perfil atual do banco; exigir IDs de
  teste permitidos depois de autenticar, inclusive para admin. JWT principal
  deve falhar na instância candidata. Não alterar o middleware principal.
- Montar o router somente no candidato, após barreiras existentes e antes de
  express.json; o parser binário continua depois de autenticar. Fornecer o
  supervisor existente à integração quando aplicável, sem reutilizar ou alterar
  estado/checkpoint de produção. Não conectar o candidato ao controlador real.

## Permissões que precisam ser confirmadas em homologação

CRUD em perfil_imagens e perfil_imagens_objetos é necessário, mas não basta:

- PGUSER precisa de CONNECT e poder executar SET LOCAL ROLE service_role.
- service_role precisa de USAGE em public, BYPASSRLS e SELECT/UPDATE em usuarios
  para o SELECT ... FOR UPDATE, além de CRUD nas duas tabelas de imagens.
- Não são necessários TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ou grant options
  no uso normal; confirmar a ausência conforme o bloco de segurança aprovado.
- O cliente Storage usa a chave privilegiada de servidor, não o JWT Express.
  Confirmar buckets privados, limites/MIME e ausência de políticas amplas que
  concedam acesso direto a anon/authenticated. Não acrescentar políticas usando
  auth.uid() para representar IDs inteiros de usuarios.
- Essas condições foram testadas localmente, mas ainda não foram verificadas
  em um projeto remoto de homologação identificado.

## Plano dos primeiros testes reais — após nova autorização

1. Registrar ref/destinos, identidades dos processos, IDs de contas autorizadas
   e baseline das tabelas/objetos **somente de homologação**, sem dados privados.
   Exigir diário vazio ou inteiramente descartável: a limpeza atual atua sobre
   todo o diário do projeto, sem allowlist de run/usuários. Projeto compartilhado
   com dados não autorizados bloqueia a execução do worker.
2. Iniciar apenas o candidato isolado com configuração aprovada, após prechecks
   de leitura. Login nos quatro perfis, recusa de token principal/expirado e de
   contas não autorizadas. GET de foto/capa deve retornar ausência sem escrever.
3. Com autorização de escrita explícita, enviar uma imagem sintética pequena
   por tipo/perfil. Registrar operação UUID, usuário, bucket/caminho e hash do
   arquivo esperado, sem guardar JWT ou URL assinada no relatório. Verificar
   WebP sem metadados, dimensões, slot atual e reserva confirmada.
4. Consultar, substituir e remover. Revalidar apenas o próprio usuário e testar
   tentativas de indicar outro proprietário, inclusive admin. DELETE deve
   desvincular imediatamente, mantendo o diário para limpeza; não prometer
   exclusão física imediata ou revogação de URL já entregue antes de 120 segundos.
5. Exercitar MIME falso, animação, dimensões/bytes, rate limit, PUT/PUT,
   PUT/DELETE, interrupções e respostas incertas. Não repetir PUT/commit após
   timeout; consultar estado e operação. Não provocar falhas em produção.
6. Limpeza começa em dry-run; execução limitada e autorizada somente sobre
   dados descartáveis. Respeitar reserva de 15 minutos, quarentena de 24 horas
   e lease de 5 minutos. Não encurtar prazos de produção para testar: cenários
   rápidos de expiração já usam PostgreSQL descartável local. A comprovação
   remota da limpeza física completa precisa aguardar a quarentena real.
7. Verificar URLs em memória, renovação/expiração, logout/troca de conta,
   navegação por teclado e larguras 1920/1366/768/390/360. Conferir que o React
   candidato nunca chama localhost:3001 e que o principal continua bloqueado.
8. Encerrar apenas processos candidatos; limpar apenas objetos registrados,
   respeitando a fila e dependências. Preservar tombstones e evidências. Não
   excluir contas/registros preexistentes nem arquivos sem diário por prefixo.

## Critério de liberação

Primeiros testes reais só podem ser autorizados após: projeto distinto
identificado e provisionado pelo responsável, configuração privada independente,
vínculo PG/REST/Storage demonstrável, permissões confirmadas por leitura,
inicializador e entrada React isolados testados contra destino incorreto,
contas/escopo descartável aprovados e ausência de acesso ao principal.

Uploads e limpeza remotos ainda exigem autorização específica. Aprovação local
não libera produção. A liberação definitiva dependerá também da homologação
real de falhas/concorrência, limpeza após quarentena e inspeção visual.

Validação desta preparação: 28 testes backend e 8 React aprovados, zero falhas,
com transportes falsos e imagens sintéticas locais. Nenhum SQL remoto ou upload
real; lint/build não repetidos porque não houve alteração de código nesta revisão.
