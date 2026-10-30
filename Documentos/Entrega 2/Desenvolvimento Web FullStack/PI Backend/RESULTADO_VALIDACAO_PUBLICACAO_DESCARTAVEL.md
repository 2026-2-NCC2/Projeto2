# Publicacao — PostgreSQL descartavel, 30/10/2026

Estado: executado com sucesso, exit code 0; 11 grupos PASS. PostgreSQL 17.11
direto, sem PostgREST/Supabase. Nao houve acesso aos bancos existentes, .env,
rotas ou credenciais da aplicacao. RPCs originais nao precisaram de correcao.

## Execucao e isolamento

Controlador existente reutilizado com `--publicacao`; cenarios separados em
scripts/cenarios-publicacao-descartavel.cjs. Caminho padrao de custos mantido.
Nao repetimos a bateria de custos nem sondas de publicacao: executamos os dois
corpos SQL reais para a concorrencia nova. Identidade e isolamento sempre se
revalidam porque cada execucao cria outro cluster.

Manifesto e evidencias:
`C:\Users\Lucas\PostgreSQLTest\tt-custos-pg-c163c33f9e3c41a9b2999a13a532eca1\manifesto.json`.
Mesma pasta: rpc.sql, publicacao.sql, controlador.cjs, cenarios-publicacao.cjs,
postgres.log. Hashes, imagem oficial/digest, identificacao e resultados no JSON.

- Conteiner: b90794af3b6103b5afa353ee5d3558546521a5dc53c5f7802c5d9364266ea3ea.
- Cluster: 7702538173301841959; banco UUID exclusivo.
- Contexto local desktop-linux; rede none, sem TCP/portas publicadas.
- PGDATA tmpfs novo; apenas senha sintetica nova montada read-only.
- Identidade conferida antes do DDL; banco/cluster conferidos em cada sessao.
- Estrutura sintetica de usuarios/perfis, eventos, custos, cotacoes e itens;
  sem importacao do dump. Roles e grants apenas dentro do cluster novo.
- Controles de memoria/CPU e timeouts do controlador anterior preservados.
- Limpeza: stop e rm retornaram sucesso, removed=true; senha nova removida.
  Evidencias mantidas; imagem em cache preservada; nenhum prune.

## Testes reais

| Evidencia | Resultado |
|---|---|
| Compilacao e execucao da RPC original | PASS |
| Evento alheio/ausente, ator participante, evento vazio | TP404 / TP403 / TP402, sem escritas |
| Lista revisada incompleta, fora de ordem, outro valor ou caixa | TP409, estado integral inalterado |
| Prazo passado e calendario invalido | TP401, sem escritas |
| Resposta completa | ID positivo; evento, prazo, Fechada/Aberta, observacoes e itens exatos |
| Precisao e ordem | 0.00, 0.10, 0.20, 9999999999.99 em texto; itens ordenados como custos |
| Persistencia independente | Consulta de outra sessao confirmou cotacao e quatro itens |
| Snapshot | Substituir custos depois nao alterou itens da cotacao anterior |
| Rollback parcial | Trigger AFTER INSERT falhou no segundo item (TX003), apos cotacao e primeiro item; cotacoes, itens e custos anteriores intactos |

Concorrencia real READ COMMITTED, duas sessoes, espera comprovada por
pg_blocking_pids e estado anterior observado antes do commit:

1. PUT primeiro: RPC de custos segura transacao; publicacao real espera; apos
   commit cria cotacao com a lista nova revisada, sem mistura.
2. Publicacao primeiro: RPC publica snapshot antigo e segura transacao; PUT
   espera; apos commit muda custos, preservando snapshot publicado.
3. PUT primeiro/revisao antiga: publicacao espera e depois levanta TP409; nenhuma
   cotacao ou item adicional. Custos novos do PUT permanecem confirmados.

Todos executaram `substituir_custos_evento` e `publicar_cotacao`; nenhuma sonda
manual substituiu a publicacao. Sessoes encerraram com os exit codes esperados
(0 em sucesso, 3 para erro SQL intencional). Cotacao anterior preservada.

## Revisao e testes locais

- Nenhuma falha da RPC ou do controlador nesta execucao.
- Hash publicacao original antes/depois:
  `200eac57222fae6b0e3259835551107c99df5f5be9f7a53b918b6e58e41850b0`.
- Hash custos original preservado:
  `5e148d4043bc4a0c257f192ae4733a2fc3665955e70baeb9442bf9d69612339a`.
- 94 testes existentes de adaptadores publicacao/custos aprovados; zero falhas
  e zero SKIP nesse recorte. Suite completa nao reexecutada.
- node --check nos dois controladores e git diff --check aprovados.

## Limites e contagem

TP409 real e seu mapeamento HTTP 409 simulado estao comprovados separadamente;
nao houve HTTP 201/409 real. SET ROLE sintetico nao comprova identidade JWT nem
privilegios reais da chave. Sem provas de PostgREST (binding, commit/resposta,
schema cache, ACL/RLS), timeout apos commit/perda de resposta ou GET integrado.
Fixture minima nao reproduz collation ICU, gatilhos ou configuracao de producao.
Nao foi simulada falha de commit/transporte real; rollback parcial foi real.

22/27 reavaliado: as duas leituras com locks de custos/publicacao agora tem
provas diretas dos fluxos SQL completos e serializacao mutua. Seus criterios
documentados ainda incluem binding/identidade/privilegios da integracao e
resultado incerto; nao contabilizamos preparacao SQL como operacao Supabase
integral. custos.listarPorEvento ainda carece GET integrado/paginado. Acesso e
GROUP_CONCAT nao foram retomados. Etapa 5 aberta, sem ativacao do provedor.

Proposta seguinte: revisar e autorizar stack PostgREST descartavel para validar
as interfaces HTTP e os adaptadores com ambas RPCs ja comprovadas em SQL.
