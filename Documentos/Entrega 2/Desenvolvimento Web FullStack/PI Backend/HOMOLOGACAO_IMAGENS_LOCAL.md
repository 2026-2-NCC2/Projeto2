# Homologação de imagens — inicializador local protegido

Implementado em 04/11/2026. **Nenhum teste remoto foi executado. Uploads continuam
bloqueados no servidor normal, no candidato e nas duas interfaces React.**
Não há opção de CLI/ambiente para habilitar rotas de imagens nesta etapa.

## Configuração privada necessária

Não alterar SUPABASE_*, PG*, DB_* ou JWT_SECRET principais. O loader pode ler
um arquivo privado explícito, inclusive o .env existente do PI Backend, mas usa
somente as chaves IMAGENS_HOMOLOG_* para os destinos. `dotenv.parse` não modifica
process.env. Campos principais são lidos apenas para recusar reutilização de
segredos; nenhum deles é fallback. Nenhum arquivo privado foi alterado/criado.

Preencher manualmente, após identificar o novo projeto e suas contas:

| Variável | Conteúdo exigido |
| --- | --- |
| IMAGENS_HOMOLOG_PROJECT_REF | Ref de 20 letras, diferente de produção |
| IMAGENS_HOMOLOG_SUPABASE_URL | https://REF.supabase.co, exatamente |
| IMAGENS_HOMOLOG_SUPABASE_SECRET_KEY | Secret key exclusiva desse projeto, somente servidor |
| IMAGENS_HOMOLOG_JWT_SECRET | Segredo aleatório exclusivo, 64–256 caracteres A–Z/a–z/0–9/_/- |
| IMAGENS_HOMOLOG_PGHOST | db.REF.supabase.co ou Session pooler oficial aws-N-REGIAO.pooler.supabase.com |
| IMAGENS_HOMOLOG_PGPORT | 5432; Transaction pooler 6543 é recusado |
| IMAGENS_HOMOLOG_PGDATABASE | postgres |
| IMAGENS_HOMOLOG_PGUSER | postgres no direto; postgres.REF no Session pooler |
| IMAGENS_HOMOLOG_PGPASSWORD | Senha exclusiva do projeto, sem reutilizar a principal |
| IMAGENS_HOMOLOG_PGSSLROOTCERT | Opcional: caminho para CA confiável; não desabilitar TLS |
| IMAGENS_HOMOLOG_CONTAS | JSON com quatro contas autorizadas: id, email e perfil |

CONTAS deve conter uma conta existente por perfil: participante, organizador,
fornecedor e admin. IDs inteiros positivos e e-mails únicos em minúsculas.
Exemplo estrutural de um elemento: `{"id":ID_REAL,"email":"EMAIL_DE_TESTE","perfil":"participante"}`.
Usar um array JSON válido com os quatro elementos reais de homologação; não
copiar IDs, senhas ou dados pessoais de produção. Senhas dessas contas são
digitadas no formulário; não fazem parte do JSON de allowlist.

O projeto precisa ter usuarios com hashes bcrypt válidos, schema de imagens
compatível, RLS forçado, grants revisados e buckets privados perfil-fotos e
perfil-capas com MIME image/webp e limites de 5242880/10485760 bytes. Não basta
isso existir em produção. Projeto, schema, contas e buckets precisam ser
provisionados pelo responsável em etapa autorizada: este inicializador não cria
nada nem executa migrações. Exige diário de imagens vazio na primeira admissão.

## Proteções implementadas

- Recusa explícita do ref de produção em ref/URL/PGHOST/PGUSER e recusa de
  configurações ausentes, hosts arbitrários, usuário de outro projeto e portas
  não aprovadas. Sem fallback para ambiente principal ou arquivo não informado.
- Configuração imutável; somente objetos validados são aceitos pelos leitores.
- O pool é comparado à configuração aprovada **antes** de conectar: host,
  usuário, database, porta, TLS, tamanho e query_timeout. Limites exclusivos:
  max=2, connectionTimeoutMillis=5000, idleTimeoutMillis=10000,
  query_timeout=10000. A fábrica PG ganhou uma opção explícita, preservando
  seus padrões para os consumidores antigos.
- Verificação remota futura: somente GET em usuarios REST e metadados dos dois
  buckets; origem exata, redirects recusados, timeout de 10 segundos, resposta
  limitada a 1 MiB e header sb-project-ref obrigatório. Ausência/divergência do
  header bloqueia; não adotar fallback ou remover o teste para fazer funcionar.
- PG usa BEGIN READ ONLY, SET LOCAL ROLE service_role e ROLLBACK; verifica
  BYPASSRLS, USAGE public, SELECT/UPDATE usuarios, CRUD de imagens, RLS forçado,
  ausência de privilégios públicos/extras, ausência de políticas Storage e
  diário vazio. Não escreve schema/dados. PostgreSQL 15–18 revisado.
- As quatro identidades id/email/perfil devem coincidir em configuração, REST
  e PG. O vínculo usa também host direto ou usuário de pooler contendo o ref,
  com TLS validado: current_database() não é tratado como identidade do projeto.
  Secret keys são opacas; seu formato sozinho não comprova projeto.
- A aplicação exclusiva só expõe login, perfil, identificação do candidato e
  as rotas de imagens bloqueadas. Autenticação bcrypt/JWT HS256/1h, consulta de
  perfil atual e allowlist de contas. Não importa server.js, MySQL, cutover ou
  worker; não lê/edita checkpoints e não usa JWT principal. Não monta serviços
  transacionais de escrita nem cria cliente de upload.
- Backend 127.0.0.1:3131 e frontend 127.0.0.1:5273 fixos; porta ocupada aborta.
  O frontend usa exclusivamente /api → 127.0.0.1:3131, sem fallback para 3001,
  entrada HTML própria e sem carregamento dos .env/VITE_* principais. Primeiro
  confere /__homologacao; sem identificação válida, impede envio de credenciais.
  Login mantém foto/capa desabilitadas. O bundle principal permanece inalterado.
- NODE_TLS_REJECT_UNAUTHORIZED=0 é recusado. Nenhum segredo é impresso, exposto
  ao frontend ou registrado em mensagens de erro.

## Comandos — executar somente na etapa autorizada

Validação offline, a partir de PI Backend (não conecta, não inicia servidor):

```powershell
node scripts/homologar-imagens.cjs --validar --config .env
```

Se optar por arquivo privado separado, passar seu caminho entre aspas em vez
de .env. Não informar segredos na linha de comando. Ausência de qualquer chave
obrigatória termina com código de erro IH_*, sem carregar valores principais.
A validação offline confere estrutura/destinos; não comprova senha, certificado,
permissões remotas ou disponibilidade da rede.

**Após autorização específica para prechecks remotos de leitura**, no PI Backend:

```powershell
node --use-system-ca scripts/homologar-imagens.cjs --iniciar --config .env
```

Esse comando faz consultas PG/REST/metadados Storage somente de leitura antes
de abrir a porta. Não executá-lo durante uma etapa limitada a testes locais.
Se qualquer verificação falhar, encerra o pool e não inicia o servidor. Se tudo
passar, mantém imagens bloqueadas em HTTP 503; JWT ausente/inválido recebe 401.
Não há retry de escrita, porque nenhuma escrita é exposta nesse candidato.

Em outro terminal, a partir de PI React, após autorização de inicialização:

```powershell
npm.cmd exec -- vite --config vite.imagens-homolog.config.js --mode isolado
```

Abrir exclusivamente http://127.0.0.1:5273. Conferir o project ref apresentado,
testar login com as contas aprovadas e manter os terminais abertos. Encerrar
somente esses processos com Ctrl+C; o backend fecha o servidor e o pool.
Não iniciar npm run dev normal para esta homologação: ele usa a porta 3001.

Build isolado, sem executar APIs:

```powershell
npm.cmd exec -- vite build --config vite.imagens-homolog.config.js --mode isolado
```

Saída em dist-imagens-homolog, ignorada pelo Git e lint. Não publicar esse
bundle como aplicação principal. A configuração principal e seu dist continuam
independentes.

## Limites desta preparação

Nenhum comando remoto acima foi executado. Os testes usam credenciais
sintéticas, respostas falsas e portas locais efêmeras. Ainda faltam ref,
credenciais e identidades autorizadas do projeto separado e os prechecks reais.
A ausência do header de projeto, políticas Storage ou diário não vazio exige
análise; não corrigir apagando registros ou relaxando as verificações.

Este inicializador não ativa o router de upload, o worker nem a UI candidata
habilitada. Essa montagem e os primeiros uploads/limpezas dependem de nova
autorização e homologação dos vínculos. Não reutilizar os inicializadores antigos
da migração, que apontam para o projeto hoje usado em produção.
