# Homologacao de escrita — APROVADA E LIMPA, 31/10/2026

## Resultado atual

Os **12 endpoints autorizados passaram**, com **56 requisicoes HTTP** ao
Express real. Destino exclusivo PI Backend, project ref
`gnwybroqfvwosiqzsfla`; processo separado em `127.0.0.1:3111`.

Run: `f779e63e398b4da5bfb473d218ec7121`.
Manifesto completo com TODOS os IDs, tentativas, status e limpeza:
`fixtures/hw-f779e63e398b4da5bfb473d218ec7121.manifesto.json`.

| Operacao | Evidencias reais |
|---|---|
| POST /usuarios | Quatro participantes novos, 201; email duplicado 409; senha com bcrypt custo 12; nenhum hash na resposta |
| POST /solicitacoes-acesso | Quatro pedidos novos, 201; pendencia duplicada 409 |
| PATCH /solicitacoes-acesso/:id | Tres aprovacoes e uma rejeicao, 200; repetida 409; nao-admin 403; perfil/status persistidos coerentes |
| POST /eventos | Tres eventos novos, 201; token ausente 401 |
| PUT /eventos/:id | Edicao 200 persistida; dono alheio 404 sem mudanca; participante 403 |
| PUT /eventos/:id/custos | Duas substituicoes 200 e GETs identicos, decimais exatos; dono alheio 404 sem mudanca; fornecedor 403 |
| POST /cotacoes | Revisao obsoleta 409 sem cotacao; revisao atual 201 com dois itens; participante 403 |
| POST /fornecedor/propostas | Duas propostas novas, 201; participante 403 |
| PATCH /organizador/propostas/:id/status | Aprovacao e recusa em propostas distintas, 200; repetida/dono alheio 404 sem mudanca; fornecedor 403 |
| PATCH /eventos/:id/publicar | Transicao para Ativo 200; repeticao 404 |
| POST /participante/inscricoes | Evento inativo 404; inscricao 201; duplicada 409 com uma unica linha; fornecedor 403 |
| DELETE /eventos/:id | Evento descartavel sem filhos excluido, 200; repeticao 404; ausencia confirmada por GET independente |

Login usado apenas para obter tokens dos atores necessarios. JWT HS256/1h,
req.usuario e regras de propriedade mantidos. Tokens dos usuarios novos emitidos
quando ainda participantes permitiram os fluxos de organizador/fornecedor depois
da decisao, comprovando consulta ao perfil persistido a cada requisicao.
Handlers, validacoes, bcrypt, contratos e frontend nao foram modificados.

## Catalogo e atomicidade

O usuario forneceu exportacao em transacao READ ONLY, arquivada em
`fixtures/homologacao-escrita.catalogo-20261031.json`. Conferidos oito objetos,
nove FKs, nenhuma trigger customizada e quatro funcoes. Corpos PL/pgSQL
tokenizados identicos aos arquivos locais: comentarios/formatacao ignorados,
literais preservados. Todas SECURITY INVOKER, search_path vazio, EXECUTE de
service_role permitido e de anon/authenticated/PUBLIC recusado. Tabelas com
RLS e privilegios de escrita restritos ao service_role na exportacao.

As provas SQL anteriores de rollback/locks/concorrencia foram reutilizadas,
sem repetir suas baterias. A integracao nova confirmou os efeitos completos
das RPCs de custos, publicacao e acesso e ausencia de filhos no conflito de
publicacao; avaliar_proposta comprovou UPDATE condicional unico 200/404.
Nenhuma transacao foi artificialmente dividida entre chamadas REST.

Nao houve injecao nova de falhas, alteracao de DDL/ACLs/triggers ou simulacao de
perda de resposta depois do commit. Nao extrapolar esses resultados para tais
cenarios. Nenhuma escrita sofreu reenvio automatico; zero tentativas sem
resultado reconciliado ao final.

## Registros e limpeza

**21 IDs novos rastreados:** usuarios 4, eventos 3, pedidos de acesso 4, custos 4,
cotacoes 1, itens 2, propostas 2, inscricoes 1. Os quatro custos incluem os dois
substituidos pela segunda RPC; o manifesto preserva os IDs anteriores.

Ausencia dos emails exclusivos confirmada antes da primeira escrita. Cada
mutacao dependeu de permissao de uso unico, com metodo, caminho/query e payload
esperados. Hash do cadastro foi verificado em memoria contra a senha aleatoria;
hashes e senhas nunca foram gravados no manifesto.

Reconciliacao exclusivamente por chaves/vinculos da run. Todas as referencias
e marcadores conferidos antes de qualquer exclusao administrativa. Ordem:
propostas, inscricoes, itens, cotacoes, custos, solicitacoes, eventos e usuarios.
DELETEs somente por IDs registrados, sem TRUNCATE, filtro amplo ou reset de
sequencias. GETs finais comprovaram **zero residuos nas oito tabelas**.

Nenhum usuario preexistente foi removido ou atualizado. O admin existente foi
somente ator de autenticacao/decisao; seus campos de identidade/perfil foram
comparados antes/depois, sem mudanca. Sem triggers customizadas no catalogo e
sem mutacoes autorizadas para dados preexistentes. Nao foi feita varredura ou
exportacao de todos os dados existentes para afirmar igualdade global.

## Isolamento, testes e encerramento

- Nenhum modulo mysql2/db.js carregado; zero tentativas de importar MySQL.
- Startup normal Supabase continua bloqueado; configuracao principal MySQL
  preservada. O novo caminho exige a entrada especifica e contexto privado;
  uma flag isolada nao libera o servidor normal.
- Inicializador e transporte de somente leitura preservados.
- **11 testes especificos aprovados**, incluindo negacao de ID/payload errado,
  nao-reenvio apos timeout, catalogo e limpeza com referencias externas.
- Guardas afetados de banco/startup/leitura tambem passaram (45 casos).
  A primeira rodada de 52 inclui sete dos 11 especificos: nao somar recortes.
  Suites completas, auditorias e baterias SQL anteriores nao foram repetidas.
- Sintaxe dos arquivos novos e git diff --check do server aprovados.
- Processo encerrado; PID 5712 ausente e porta 3111 livre, conferidos no Windows.
- Nenhuma alteracao no .env nesta retomada, frontend intocado e nenhum commit.

## Falhas e pendencias para ativacao

Nenhuma falha funcional na rodada real. Respostas negativas foram os resultados
esperados e conservaram os registros correspondentes. Nenhum residuo pendente.

Homologacoes de leitura e escrita aprovadas somente nos cenarios documentados.
Ativacao definitiva ainda requer reconciliacao dos dados/identidades importados,
plano de invalidacao de sessoes legadas, cutover/retorno e autorizacao especifica
para trocar o provedor normal. Nao remover o bloqueio com base somente neste
resultado. Limites de datas/fusos, paginacao/concorrencia e resultado incerto
apos possivel commit continuam relevantes fora dos cenarios exercitados.

## Historico: preflight anterior interrompido

Autorizacao recebida para o plano completo. A execucao parou ANTES de qualquer
escrita porque a precondicao de conferir catalogo do destino nao foi satisfeita.
Nao houve falha funcional demonstrada das RPCs; faltam metadados verificaveis.

## Verificado

- Configuracao privada aceita pelo validador existente, sem exibir segredos.
- GET OpenAPI real, origem exclusiva do PI Backend, project ref
  `gnwybroqfvwosiqzsfla` confirmado pelo header `sb-project-ref`.
- Quatro RPCs anunciadas para POST pela chave de servidor, com os argumentos
  esperados: substituir_custos_evento, publicar_cotacao,
  decidir_solicitacao_acesso e avaliar_proposta.
- Nenhum modulo mysql2/db.js carregado nesse preflight.

OpenAPI comprova a interface exposta; nao comprova os corpos SQL instalados,
SECURITY INVOKER, privilegios completos, FKs/cascatas ou efeitos de triggers.
Os hashes e testes SQL anteriores continuam sendo evidencia dos arquivos
validados, nao certificacao de que o destino tem corpos identicos.

## Motivo da interrupcao

Nao ha parametros PostgreSQL `PG*` nem token da API de gerenciamento no `.env`,
nem exportacao local de catalogo do destino identificada. A chave de servidor
PostgREST nao substitui acesso ao catalogo SQL. Nao foram tentadas chamadas RPC
de escrita como sonda, instalacoes, GRANTs ou alteracoes no destino.

O plano exige confirmar definicoes, privilegios e FKs antes da primeira escrita
e determina interromper quando nao ha acesso confiavel a esses metadados.
Por isso o inicializador de escrita ainda nao foi implementado nem iniciado.
O inicializador de leitura e o bloqueio do startup normal foram preservados.

## Registros e cobertura

- Endpoints de escrita validados nesta rodada: **0/12**.
- Registros criados, alterados ou excluidos: **0**.
- IDs criados por tabela: todos os conjuntos vazios no manifesto de preflight.
- Registros restantes desta homologacao: **0**; limpeza nao necessaria.
- Nenhuma conexao MySQL, nenhum servidor iniciado, frontend intocado.
- Nenhum teste ja aprovado foi repetido e nenhum commit criado.

## Para prosseguir

Disponibilizar metadados do mesmo projeto por uma das vias:

1. Configurar acesso SQL privado ao PI Backend: PGHOST, PGPORT, PGDATABASE,
   PGUSER e PGPASSWORD no `.env`, com TLS verificado. Nao enviar senha no chat.
2. Executar no SQL Editor do PI Backend o arquivo somente leitura
   `../Banco de dados/preflight_homologacao_escrita.somente-leitura.sql`
   e salvar o resultado JSON localmente para revisao. Confirmar o project ref
   na interface; current_database sozinho nao comprova identidade do projeto.

O SQL preparado nao foi executado e nao representa teste aprovado. Nao altera
dados nem permissoes. A autorizacao de homologacao nao permite corrigir DDL/ACLs
silenciosamente: eventual divergencia sera relatada antes de qualquer mutacao.

Pendencias de ativacao: conferir catalogo, construir/testar os controles novos,
validar os 12 endpoints com fixtures e atomicidade reais, comprovar limpeza e
depois tratar reconciliacao de identidades/sessoes e cutover separadamente.
Supabase continua bloqueado no servidor normal; MySQL permanece padrao.
