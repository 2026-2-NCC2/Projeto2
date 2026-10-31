# Homologacao somente leitura — 31/10/2026

Estado: homologacao de leitura aprovada no escopo autorizado dos quatro perfis:
admin, participante, organizador e fornecedor. Processos encerrados.
Nenhuma escrita de dados executada. Supabase nao ativado no servidor normal.

## Causa e correcao do STARTUP_TIMEOUT

O monitor temporario era transmitido ao Node pelo pipeline do PowerShell com
`$OutputEncoding` igual a `us-ascii`. Os acentos do literal usado para reconhecer
o banner viravam `?`; o stdout do servidor permanecia UTF-8. A comparacao nunca
confirmava a prontidao, mesmo com o servidor iniciado. O timeout era do monitor.
Os logs brutos da primeira tentativa nao foram preservados; a causa foi
reproduzida sem servidor e confirmada pela nova execucao real.

O monitor reutilizavel `scripts/monitor-prontidao-homologacao.cjs` usa escapes
ASCII para o sinal e StringDecoder UTF-8 para fragmentos de stdout. Mantem o
prazo de 12 segundos e distingue timeout, erro e saida prematura; remove seus
listeners e timer. Nenhuma alteracao no inicializador, contratos HTTP, TLS,
autenticacao, selecao do banco ou permissoes da aplicacao neste incremento.

Somente `tests/monitor-prontidao-homologacao.test.cjs` foi executado:
**4 aprovados, zero falhas, zero SKIPs**. Inclui regressao ASCII, fragmentacao
UTF-8, recusa de host/porta divergentes e encerramento prematuro/erro.

## Evidencias reais

- Banner reconhecido; unico listener do processo em `127.0.0.1:3111`, conferido
  pelo diagnostico do processo e pela tabela TCP do Windows.
- Um registro de stdout (prontidao), nenhum registro de stderr.
- `GET /` retornou 200; `GET /perfil` sem JWT retornou 401.
- `POST /login` sem campos retornou 400; credenciais aleatorias e ficticias
  retornaram 401 atraves do backend real e de uma consulta Supabase real.
- JWT assinado pelo segredo principal, JWT expirado e token malformado
  retornaram 401 antes de qualquer consulta ao banco.
- Dezesseis combinacoes de metodo/rota proibidas retornaram 405. Nenhuma
  consulta de persistencia ocorreu durante esses testes. Foram usadas rotas
  com ID invalido quando aplicavel, sem payloads de escrita.
- O observador registrou somente um GET externo, exclusivamente na origem do
  projeto PI Backend, ref `gnwybroqfvwosiqzsfla`, confirmada pelo header
  `sb-project-ref`. Zero violacoes do transporte.
- Zero tentativas de importar mysql2, nenhum modulo mysql2/db.js carregado e
  nenhuma variavel DB_/PG herdada no processo de homologacao. A verificacao TCP
  pontual nao encontrou conexoes desse processo nas portas 3306/3307.
- Encerramento gracioso via SIGTERM interno, codigo de saida 0, sem terminacao
  forcada. Processo ausente e porta 3111 livre apos encerrar.
- MySQL permanece padrao; startup normal Supabase continua bloqueado. Nenhum
  segredo, token, email, hash ou dado de usuario exibido ou salvo neste relato.

## Continuacao com as duas contas fornecidas

As credenciais recebidas foram usadas somente em memoria, sem gravar senhas,
tokens ou emails em arquivos do roteiro ou neste relato. Os dois perfis reais
corresponderam aos informados: organizador e fornecedor.

Uma checagem inicial do roteiro exigia incorretamente o campo `perfil` em
`GET /perfil`. A resposta real foi 200. A fonte confirmou o contrato historico
`id, nome, email`; o processo foi encerrado e somente a expectativa do roteiro
foi corrigida. Nenhum campo foi acrescentado a API.

A execucao seguinte concluiu:

- Login 200 de ambas as contas; contrato `mensagem, token, usuario` preservado.
  Usuario de login limitado a `id, nome, email, perfil`, sem senha/hash.
- JWT HS256 emitido pelo login, identidade/perfil coerentes e expiracao de 1h.
- `GET /perfil` e `GET /eventos` retornaram 200 para ambas as contas; formato
  historico do perfil e listas JSON preservados.
- Organizador: `GET /cotacoes` e `/organizador/propostas` retornaram 200.
- Fornecedor: `GET /fornecedor/cotacoes` e `/fornecedor/propostas` retornaram
  200, incluindo a RPC de leitura permitida.
- Rotas GET de outros perfis retornaram 403 para cada conta. Tokens de teste
  com claim admin para o mesmo ID nao elevaram permissoes: `/usuarios` recusou
  com 403, consultando a identidade persistida.
- JWT legado para os IDs reais recusado com 401 antes da persistencia.
- Seis operacoes proibidas por conta, agora com JWT valido, retornaram 405,
  sem qualquer consulta ao banco durante os bloqueios.

Observador da execucao final: **44 chamadas externas**, exclusivamente ao
projeto fixado; GET e POST somente da RPC de leitura permitida. Zero violacoes,
zero tentativas de carregar mysql2, nenhum modulo mysql2/db.js carregado.
Um registro de prontidao no stdout, stderr vazio. Encerramento gracioso,
codigo 0, sem terminacao forcada; processo ausente e porta 3111 livre ao final.
Nenhum contrato ou permissao da aplicacao foi alterado, nenhum commit criado.

## Conclusao — administrador e participante

Executado somente o roteiro real necessario a esses dois perfis. Nenhuma suite
local sem alteracao foi repetida e nenhum codigo da aplicacao foi modificado.
As quatro entradas de teste ausentes foram acrescentadas ao `.env` ignorado:
`HOMOLOG_ADMIN_EMAIL`, `HOMOLOG_ADMIN_PASSWORD`, `HOMOLOG_PARTICIPANTE_EMAIL` e
`HOMOLOG_PARTICIPANTE_PASSWORD`, usando as credenciais fornecidas. Todos os bytes
preexistentes foram preservados; nenhum valor privado consta deste relato.

- Ambos os logins retornaram 200, com os perfis persistidos esperados, contratos
  historicos e ausencia de senha/hash no usuario retornado.
- JWT HS256, identidade/perfil e expiracao de 1h conferidos. JWT legado,
  expirado e malformado retornaram 401 sem acessar o banco, para ambas as contas.
- `GET /perfil` e `/eventos` retornaram 200 para ambas, preservando o contrato
  `id, nome, email` de `/perfil` e arrays de eventos.
- Administrador: `/usuarios`, `/admin/eventos`, `/admin/cotacoes`,
  `/admin/propostas` e `/solicitacoes-acesso` retornaram 200, com listas JSON
  sem campos de senha/hash.
- Participante: `/participante/eventos` e `/participante/inscricoes` retornaram
  200, com listas JSON sem campos de senha/hash.
- GETs exclusivos dos demais perfis retornaram 403 para cada conta. Alterar o
  claim de perfil no token de teste nao substituiu o perfil atual do banco:
  admin continuou autorizado a `/usuarios`, participante permaneceu com 403.
- Doze operacoes proibidas por conta retornaram 405, incluindo rotas de
  administracao e inscricao. Nenhum acesso ao banco durante os 24 bloqueios;
  testes sem payloads de escrita e com IDs invalidos quando aplicavel.

Observador: **42 chamadas externas, todas GET**, exclusivamente ao projeto
PI Backend fixado e com `sb-project-ref` correspondente. Zero violacoes,
zero tentativas de importar mysql2, nenhum modulo mysql2/db.js carregado.
MySQL padrao e bloqueio Supabase no startup normal conferidos por validadores
puros, sem iniciar o servidor normal ou abrir conexao MySQL.

Prontidao em `127.0.0.1:3111`, um registro no stdout e stderr vazio. Encerramento
gracioso, codigo 0, sem terminacao forcada; processo ausente e porta 3111 livre
apos encerrar. `.env` continua ignorado e nao versionado. Nenhum dado ou permissao
do banco alterado. Nenhum segredo exibido, nenhum commit criado.

## Pendencias

Nenhuma pendencia nos cenarios de leitura autorizados dos quatro perfis.
A aprovacao cobre os logins, JWTs, listagens GET, contratos e permissoes
efetivamente exercitados neste relato; nao certifica cenarios nao executados.
Escritas, cutover, reconciliacao de identidades e ativacao geral permanecem
fora do escopo e dependem de nova autorizacao.
