# Supervisor e inventario de cutover — 31/10/2026

Estado tecnico atual: `ETAPA_FINAL_PREPARADA.md`.
O proprietario confirmou operacao exclusivamente local. Transicao/liberacao
integradas e startup protegido validados por simulacao; patch ainda nao aplicado.
Registro anterior: `INVENTARIO_GLOBAL_CUTOVER.md`.
MySQL foi retomado com autorizacao e READ ONLY confirmado na etapa anterior.
Roles/origens Supabase atribuidas a infraestrutura; escopo exclusivamente local
confirmado pelo proprietario. Os snapshots historicos abaixo nao representam
o estado atual.

Supervisor implementado e integrado ao backend, inicialmente inativo.
Nenhum congelamento real, cutover, alteracao de dados ou JWT foi executado.
Somente metadados operacionais foram consultados nas bases disponiveis.
Evidencia consolidada: `evidencias/supervisor-cutover-20261031.json`.

## Inventario efetivamente observado

- Windows atual: nenhum listener backend em 3001/3107/3111; nenhum listener
  MySQL local; quatro processos Node identificados como ferramentas Codex/MCP.
  Nenhum processo backend atribuivel nem tarefa/servico com referencia explicita
  ao backend. Nenhum container Docker listado. Nenhum processo principal ou
  servico foi iniciado ou encerrado.
- MySQL local: conexao de metadados recusada com ECONNREFUSED. A base nao foi
  iniciada; sessoes e transacoes MySQL nao puderam ser inventariadas.
- Supabase PI Backend: TLS verificado; metadados em READ ONLY. Cinco sessoes
  clientes ociosas: PostgREST, metricas, Session pooler e duas sem identificacao.
  Zero transacoes entre as sessoes clientes observadas naquele instante.
  Existem workers preload pg_cron/pg_net, mas as extensoes e tabelas de jobs/
  fila nao estao instaladas nesse database; nenhum comando/job foi executado.
- O usuario informou nao saber confirmar ambientes/clientes externos.
  Nenhum inventario local ou pg_stat_activity prova ausencia de outros clientes,
  detentores de credenciais ou conexoes ociosas no pooler.

**Inventario acessivel registrado; inventario global NAO confirmado.**
As evidencias sao snapshots com horario, nao monitoramento permanente.
Fontes: inventario-processos, inventario-conexoes e inventario-agendadores em
`evidencias/*20261031.json`. Jobs sem referencia explicita, outros hosts,
contas Windows e ambientes remotos permanecem sujeitos a confirmacao operacional.

## Implementacao instalada, ainda sem processo principal iniciado

`repositories/index.cjs` instrumenta repositorios e servicos, incluindo RPCs e
transacoes completas. `server.js` instala `config/supervisor-cutover.cjs` antes
de CORS, parsers e handlers. O startup comum continua MySQL por padrao;
`config/banco.cjs` mantem a recusa de Supabase normal.

O supervisor conta requisicoes e operacoes de persistencia separadamente.
Uma resposta HTTP terminada nao zera operacao de banco ainda pendente.
Solicitacoes mutantes admitidas anteriormente podem terminar; novas escritas
HTTP ou chamadas diretas aos repositorios/servicos instrumentados sao recusadas
durante freeze. Um callback tardio apos fim da requisicao nao obtem permissao
para iniciar nova escrita. Erros incertos, desconexao e 5xx impedem drenagem.
Nao ha endpoints HTTP de administracao e nenhuma alteracao nos JWTs.

`selar()` tambem recusa novas leituras/login antes do checkpoint final, evitando
que novos requests prolonguem indefinidamente a drenagem. Timeout conserva a
barreira; nao mata transacoes, nao libera escritas e nao repete operacoes.

Estado privado preparado fora do Git:
`C:\Users\Lucas\BackupsTrocaTicket\SupervisorCutover\estado.json`.
ACL restrita ao usuario Windows atual e SYSTEM; congelado=false, selado=false.
Gravacao atomica com fsync e rename. Estado ausente em diretorio previamente
preparado, inconsistente ou corrompido falha fechado. Nenhum segredo e salvo.

O marcador persistente e consultado na admissao de requests/operacoes.
Reinicios usam nova identidade de boot; se ha janela congelada, uma instancia
nao reconhecida recusa escritas e reporta incerteza, sem aprovar drenagem.
Falha ao gravar estado conserva bloqueio local e reprova o procedimento.
Nao apagar ou editar o estado para contornar o bloqueio.

## Controle local privado e coordenacao global

`config/controlador-supervisor.cjs` coordena filhos por IPC herdado, verifica
origem de cada resposta e usa IDs individuais. Persiste o marcador para todas
as instancias esperadas ANTES de pedir freeze. Falha parcial, queda de filho,
timeout ou fechamento do controlador nao removem o marcador.

Entrada preparada, **nao executada nesta etapa**:

```
node scripts/supervisionar-backend.cjs --iniciar
```

Esse comando iniciara o backend e fica reservado a autorizacao operacional.
O controlador aceita no stdin local `status`, `congelar` e `selar-e-drenar`.
Nao existe comando de troca de banco, JWT ou liberacao automatica da barreira.
O CLI prepara apenas o processo local; a API do controlador permite registrar
mais filhos. Outros hosts/usuarios exigem respectivos supervisores e controle
operacional, antes de qualquer afirmacao de freeze global.

O controlador local nao suspende clientes SQL, PostgREST, jobs ou escritores
externos. A garantia global depende de controlar essas entradas e confirmar o
inventario, inclusive credenciais fora deste computador. Enquanto isso faltar,
`avaliarCongelamentoGlobal` e o executor final permanecem bloqueados.
O patch antigo `cutover-freeze-integracao.proposta.patch` foi superado por esta
integracao; NAO aplicar uma segunda barreira ao servidor.

## Execucao final preparada, nao realizada

`scripts/executar-delta-final.cjs` exige inventario confirmado, supervisor de
cada instancia esperada, selagem, zero requests/operacoes pendentes e zero
incertezas. Revalida o gate ANTES e DEPOIS da coleta, incluindo persistencia e
escritores externos. Troca de instancia, evidencia vencida ou falha bloqueia.

`scripts/coletar-delta-readonly.cjs` fornece o adapter real, construido sem abrir
conexoes. Somente a chamada apos o gate conecta a origem local e ao PI Backend.
Usa transacoes REPEATABLE READ READ ONLY, UTC, timeouts e TLS verificado no
PostgreSQL. Confere InnoDB e catalogos esperados; coleta as oito tabelas apenas
em memoria. Fecha/encerra as sessoes em finally; nao imprime linhas nem erros
brutos. Nenhum INSERT/UPDATE/DELETE/RPC e executado pelo coletor.

Para a janela autorizada, fornecer ao executor: inventario real, controlador,
evidencias atuais dos escritores externos, verificacao de persistencia,
checkpoints/catalogos T0 privados, colunas e adapter READ ONLY. Os checkpoints
antigos nao substituem novos backups T0. Dados, identidades, perfis, hashes
bcrypt, relacoes e dez extras sao comparados sem exportar valores privados.
Se a janela de evidencias expirar, renovar evidencias e repetir somente leituras.
O executor retorna resultado sanitizado; nao executa cutover nem libera startup.

## Testes novos executados

Quatorze aprovados, zero falhas. Execucoes filtradas: sete casos iniciais, quatro
novos de durabilidade/coordenacao/delta, dois novos do coletor/estado e um caso
de admissao async apos JSON real e callback herdado apos resposta. Nenhum
teste aprovado foi repetido. Drivers e estado privado foram substituidos por
fixtures; Express usou somente porta efemera e persistencia falsa.

Cobertura: escrita bloqueada antes do JSON, operacao apos resposta HTTP,
callbacks tardios, RPC/servicos instrumentados, timeout, incerteza, reinicio,
arquivo perdido/corrompido, falha de disco, IPC privado, duas replicas com falha
parcial, revalidacao do delta e coletor sem escritas/encerramento das sessoes.
Os harnesses existentes receberam apenas compatibilidade com a nova dependencia;
suas suites anteriores nao foram reexecutadas.

## Bloqueios restantes

1. Restabelecer/disponibilizar MySQL local para inventariar sessoes/transacoes;
   nenhum servico de banco foi iniciado automaticamente.
2. Identificar os dois clientes Supabase sem identificacao e confirmar todos
   os ambientes/detentores de credenciais, jobs e acessos diretos externos.
3. Iniciar as instancias reais sob supervisao somente quando autorizado;
   registrar boot IDs e comprovar controle operacional de todos os escritores.
4. Sob nova autorizacao: congelamento global, selagem/drenagem reais, backups
   T0 e delta final. Depois, autorizacao especifica para JWT e startup Supabase.

Sem frontend modificado, commits, escrita nas bases principais ou JWT alterado.
