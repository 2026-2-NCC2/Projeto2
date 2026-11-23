# Render - preparacao H4

Preparacao local em 23/11/2026. Nenhum deploy, servidor principal, banco remoto,
migracao, seed ou limpeza foi executado. Este guia nao aprova uso com dados reais.
A informacao de que os dados existentes sao ficticios foi fornecida pelo operador;
nao foi confirmada consultando o banco.

## Modo de demonstracao sem manutencao automatica

Definir `TROCATICKET_DEMONSTRACAO=true` explicitamente no Render.
O startup continua validando o manifesto Supabase, o projeto permitido, JWT,
estado local do supervisor e a evidencia versionada de ativacao de imagens.
Nao modificar nem excluir esses manifestos/evidencias para superar erros.

Neste modo, o subsistema de imagens NAO e inicializado: nao ha preflight remoto,
pool PostgreSQL, acesso a Storage, dry-run de limpeza, timers ou exclusoes.
A preparacao de imagens tambem e recusada por `app.locals` e pelo inicializador.
Rotas de imagens permanecem autenticadas, com capacidades indisponiveis ou 503.
Fotos, capas, galerias e uploads nao estao operacionais nessa demonstracao.
Imagens ja entregues pelo navegador nao constituem validacao dessas rotas.

Login, consultas e operacoes existentes dos portais continuam usando os repositorios
Supabase e suas permissoes. Isso NAO e modo somente leitura: acoes manuais ainda
podem gravar dados ficticios. Nao ha migrador/seed automatico no comando de start.
O modo nao concede autoridade para migracoes, recuperacao ou desbloqueio do supervisor.
Fora dele, o comportamento original de preflight e limpeza permanece inalterado.
Em NODE_ENV=production, a variavel deve estar explicitamente definida: ausencia
recusa o startup. O valor false escolhe o comportamento original, inclusive as
rotinas de imagens configuradas; nao utiliza-lo na demonstracao. Em desenvolvimento,
a ausencia da variavel preserva o comportamento local anterior.

## Configuracao Render

Criar Web Service Node, sem pre-deploy command, cron ou script de migracao.
Se utilizar a raiz Git Projeto2, Root Directory:
`Documentos/Entrega 2/Desenvolvimento Web FullStack/PI Backend`.
Se futuramente preparar repositorio exclusivo do backend, usar `.`.

- Node: `NODE_VERSION=24.21.0` (Node 24.x).
- Build Command: `npm ci`.
- Start Command: `npm start` (`node --use-system-ca server.js`).
- Health Check Path: `/`.
- `PORT`: fornecido pelo Render; nao fixar em 3001. O listener usa essa variavel
  e nao esta limitado a loopback no modo principal.
- Nao configurar Docker, MySQL, Redis ou PostgreSQL Render para este modo.
- Nao copiar `.env`, credenciais locais, dumps SQL, backups ou diretorios privados
  para o repositorio ou filesystem de deploy. Usar variaveis privadas do Render.
- Preservar arquivos versionados que as guardas de startup leem.

Variaveis obrigatorias:

| Nome | Configuracao |
| --- | --- |
| NODE_VERSION | 24.21.0 |
| NODE_ENV | production |
| TROCATICKET_DEMONSTRACAO | true |
| CORS_ORIGIN | https://trocaticket-ebon.vercel.app (sem barra final) |
| DB_PROVIDER | supabase |
| SUPABASE_URL | Origem HTTPS do projeto existente aprovado pelo manifesto |
| SUPABASE_SECRET_KEY | Secret key privada do backend no projeto existente |
| JWT_SECRET | Segredo exclusivo e seguro, pelo menos 32 caracteres, diferente de homologacao |

Nao e necessario configurar PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD,
PGSSLROOTCERT, DB_HOST, DB_USER ou DB_PASSWORD para o modo demonstracao descrito.
A secret key e diferente de senha PostgreSQL e de publishable key.
Nao usar `NODE_TLS_REJECT_UNAUTHORIZED=0` nem trocar o projeto para contornar as guardas.
Nao definir TROCATICKET_HOMOLOGACAO, TROCATICKET_AMBIENTE=isolado ou variaveis
HOMOLOG_* como alternativa ao startup normal.
Preservar configuracoes opcionais existentes de perfil/portfolio sem ativa-las
apenas para a apresentacao. A7, A10 e F8 permanecem inalterados/desativados.

## CORS, sessao e proxy

CORS_ORIGIN aceita uma unica origem, sem path, barra final, query, fragmento,
credenciais, espacos, lista ou wildcard. Em producao/demonstracao deve ser HTTPS.
Sem configuracao em desenvolvimento, permanece http://localhost:5173.
Nao adicionar automaticamente todos os dominios de preview da Vercel.
CORS nao substitui autenticacao: JWT/bcrypt/autorizacao continuam no backend.
Nao foram habilitados cookies ou trust proxy. Os limitadores atuais sao locais
ao processo e usam req.ip; validar sua operacao atras do proxy, sem confiar
indiscriminadamente em X-Forwarded-For. Reinicios podem zerar essas janelas.

Depois de obter a URL HTTPS definitiva do Render, adicionar como PRIMEIRO rewrite
no vercel.json do repositorio limpo do frontend, substituindo o marcador:

```json
{ "source": "/api/:path*", "destination": "https://<HOST-RENDER-CONFIRMADO>/:path*" }
```

Nao publicar o marcador literalmente nem duplicar /api no destino. Preservar os
rewrites de privacidade/termos do H2. Nenhum segredo vai na Vercel ou em VITE_*.
O frontend deve chegar em /api/login e o Render receber /login.
Nenhuma dessas configuracoes externas foi executada pelo H4.

## Conferencia apos autorizacao de publicacao

1. Instalar as variaveis, conferir manifests e manter os recursos protegidos bloqueados.
2. Publicar somente por acao autorizada; conferir logs sem compartilhar segredos.
3. Conferir GET / e ausencia de logs/agendamentos de limpeza. O health check
   comprova HTTP, nao conectividade, schema, permissoes ou dados do Supabase.
4. Com contas ficticias autorizadas, testar login e leituras dos quatro perfis,
   recusas 401/403, F5 e retorno/avanco na origem definitiva da Vercel.
5. Conferir que imagens estao claramente indisponiveis e nenhuma rotina de
   manutencao foi iniciada. Nao executar escritas como parte desta validacao H4.
6. Se houver divergencia de projeto, guardas ou inicializacao, parar; nao apagar
   estado privado, desabilitar TLS ou habilitar flags para superar o bloqueio.

## Limites

Nao foi comprovada a conectividade real com Supabase, nem realizado ensaio online.
A chave de servico permite operacoes sensiveis: manter o backend protegido e
usar somente contas/dados autorizados. O Render gratuito pode ter cold start e
disco efemero; o modo nao depende de arquivos exportados ou banco local, mas o
estado privado local do supervisor nao deve ser tratado como coordenacao distribuida.
Disponibilizar imagens completas com guardas e PG requer avaliacao separada.


## Validacao local H4

- Node 24.21.0; verificacao sintatica dos arquivos JavaScript alterados aprovada.
- 25 testes novos em hospedagem-render.test.cjs, incluidos nos totais abaixo.
- Rodada direcionada: 112 aprovados, zero falhas/skips.
- Suite sem Docker/SQL (105 arquivos): 1.727 aprovados, zero falhas, 8 skips;
  1.735 testes no total. Nao e execucao completa incluindo integracoes SQL.
- 14 arquivos com referencias Docker/SQL foram excluidos da rodada; nao foram
  contados como aprovados ou skips. Nenhum container, migracao ou seed foi executado.
- Os 14 arquivos excluidos: admin-eventos-sql, admin-perfis-sql,
  backup-postgres-integracao-local, backup-postgres-offline, contas-teste-imagens,
  contratacoes-sql, ensaio-integrado-sql, eventos-capacidade-sql, eventos-gestao,
  eventos-imagens, perfil-imagens-sql, perfil-imagens-transacoes, portfolio-sql
  e termos-postgres (todos com sufixo .test.cjs).
- git diff --check aprovado. Frontend e configuracoes de ativacao nao alterados
  pelo H4. O servidor principal nao foi iniciado; os listeners HTTP de teste
  foram locais e efemeros, com persistencia exclusivamente simulada.
