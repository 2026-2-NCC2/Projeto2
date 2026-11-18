# F8.4 — Ensaio integrado PostgreSQL local

**Preparado, ainda não executado em PostgreSQL real.** Docker Linux indisponível na verificação deste lote (pipe dockerDesktopLinuxEngine ausente). A preparação não aprova migração ou ativação.

Este roteiro complementa a [revisão conjunta F8.3](revisao_integrada_A7_A10_F8.md). Regras de negócio, contratos, retenção e bloqueios operacionais continuam na documentação de [A7](eventos_admin.integracao.md), [A10](admin_perfis.integracao.md) e [F8](contratacoes.integracao.md); não são redefinidos aqui.

## Arquivos e reutilização

- `PI Backend/tests/ensaio-integrado-sql.test.cjs`: testes estáticos/de segurança e dois cenários reais opt-in (gestão v1 e capacidade v3).
- `PI Backend/tests/helpers/ensaio-integrado-postgres.cjs`: executor local, identidades, aplicação sequencial, sessões e limpeza.
- `PI Backend/tests/fixtures/ensaio-integrado-base.sql`: somente base sintética, incluindo enum real de perfis e UNIQUE(usuario_id,evento_id). Não executar isoladamente.

Reutiliza os SQLs versionados sem modificá-los, os padrões de socket local/porta efêmera/prontidão SQL do A7, os contratos de perfil A10 e as proteções de isolamento F8. Os testes individuais continuam intactos. Não importa arquivos `.test.cjs` como biblioteca nem inicia a aplicação inteira. JWT e middleware de autenticação de produção são usados com ponte de repositório para o PostgreSQL descartável. Isso testa revogação com dados reais **locais**, mas não equivale a HTTP/PostgREST/Supabase reais.

## Pré-requisitos e isolamento

1. Dependências existentes do backend instaladas, Docker Linux operacional e imagem `postgres:17` já presente. O executor não inicia Docker, baixa imagens ou altera configurações.
2. Contexto Docker em um socket revisado: dockerDesktopLinuxEngine/docker_engine locais via npipe, ou unix:///var/run/docker.sock. TCP, SSH e sockets desconhecidos são recusados. Sobreposições DOCKER_HOST, DOCKER_CONTEXT, DOCKER_TLS_VERIFY e DOCKER_CERT_PATH interrompem o ensaio; não são removidas automaticamente.
3. `ADMIN_EVENTOS_CRIACAO_ATIVA`, `ADMIN_PERFIS_GESTAO_ATIVA` e `CONTRATACOES_ATIVAS` devem permanecer ausentes ou `false`. O executor recusa outro valor, não modifica essas flags e não lê `.env`. A disponibilidade dos handlers desligados tem teste próprio.
4. Opt-in exclusivo `TROCATICKET_ENSAIO_INTEGRADO_SQL_LOCAL=1`, somente na sessão do teste.

Cada cenário cria container `tt-f84-UUID`, labels de finalidade/nonce e um banco `tt_f84_UUID`. Usa imagem fixada pelo ID local, credencial aleatória só sintética, bridge com PostgreSQL publicado **apenas em 127.0.0.1 e porta efêmera**. Não aceita host, database, password ou connectionString fornecidos por operador. Não há porta fixa, URL externa, credencial de origem ou fallback de provedor.

Antes de CREATE DATABASE, o cluster acessado por TCP é comparado ao system_identifier lido via docker exec no container próprio. Cada sessão reconfirma cluster/container; cada comando SQL reconfirma nome do banco, nonce e finalidade no schema de instrumentação tt_ensaio. Esse schema contém apenas um marcador, consultável pelos papéis sintéticos para permitir a checagem após SET LOCAL ROLE. Identidade divergente interrompe antes de DML/DDL. Bootstrap limita-se ao container/cluster recém-identificado; não há DROP DATABASE ou operações de limpeza genéricas.

Dados ficam em tmpfs do container e não há bind mount nem volume existente. **Somente dados sintéticos:** tmpfs não prova proteção de dados reais contra paginação/persistência da VM. Este ensaio não retoma A7.15, não cria backup e não usa K: ou dados reais. O bridge não equivale a container sem rede: a conexão do runner é exclusivamente loopback e os SQLs/testes não consultam serviços externos.

## Ordem e validação

Cada etapa deve concluir e passar sua verificação antes da seguinte:

1. Base sintética com enum, usuários, eventos, inscrições, cotações e propostas.
2. `contas_teste_imagens.preparacao.sql` completo.
3. `eventos_gestao.incremental.sql` completo, com triggers de proprietário/estado.
4. Apenas no cenário v3: `eventos_capacidade.incremental.sql` completo; confirmar capacidade 3.
5. `rpc_avaliar_proposta.preparacao.sql` e grants locais explícitos de EXECUTE apenas ao serviço. A proposta é aprovada pela RPC existente antes da formalização.
6. `eventos_admin.incremental.sql` (A7): conferir tabela/capacidade administrativa e suporte a capacidade da versão escolhida.
7. `admin_perfis.incremental.sql` (A10): conferir tabela/capacidade de perfis.
8. `contratacoes.incremental.sql` (F8): conferir tabela/capacidade de contratações.

Não se modificam as migrações para passar a fixture. Colisão, erro de permissão, resultado inesperado ou falha de etapa interrompem a preparação. Não se avança para F8 se A10 falhar. Os grants da base são privilégios locais explícitos da fixture, não recomendação automática para o destino Supabase.

## Cobertura real preparada nos dois cenários

| Cenário | Critério de aprovação |
| --- | --- |
| A7 + replay | Admin cria para Organizador válido, Em planejamento, autoria separada, mesma chave/dados sem duplicata; perfil inválido ou conteúdo alterado recusado com SQLSTATE exato. |
| Proposta → F8 | Aprovação pela RPC existente, formalização somente pelo dono, valor/serviço/condições preservados e auditoria única. |
| A10 + sessão antiga | Troca de perfil via RPC A10 revoga acesso nas próximas verificações do middleware/JWT antigo e da RPC; contratos ativos permanecem intactos. Último Admin e auto-remoção continuam protegidos. |
| Isolamento/histórico | Outro Organizador/Fornecedor não consulta contratos alheios; Admin somente consulta; trigger original rejeita transferência do evento; snapshot e autoria não mudam. |
| Conta em encerramento | Marcas válidas do esquema existente bloqueiam titular/JWT e os módulos; não apagam histórico nem criam desativação geral de contas comuns. |
| Duplicidade concorrente | Duas formalizações da mesma proposta nova retornam um único contrato e uma única auditoria. Erro inesperado não passa como sucesso. |
| Auditoria falha | Trigger sintético faz a auditoria lançar ZX001 em A7, A10, formalização e encerramento F8; dados e contagens devem voltar ao estado anterior. Trigger de falha é removido em finally. |
| F8 bloqueia A10 | Transação contratual mantém locks; A10 deve atingir lock e reprovar com 55P03, sem mudar perfil/auditoria. A contratação pode confirmar após a asserção. |
| A10 bloqueia A7 | Perfil muda dentro de transação; A7 aguarda, revalida após commit e recusa com EV403, sem criar evento/auditoria. |
| Deadlock controlado | Locks parciais reproduzem o ciclo possível entre A7/A10. As duas RPCs reais completam o ciclo; deve haver exatamente uma vítima 40P01 e um commit, com contagens correspondentes. Não se aceita qualquer falha como deadlock. |
| Statement timeout | Sonda pg_sleep limitada por SET LOCAL deve falhar com 57014 e não alterar histórico. É teste de infraestrutura, não medição de latência de negócio. |
| Privilégios/RLS/FKs | RLS/FORCE nas auditorias/contratos, papéis públicos sem acesso, EXECUTE restrito e sequence necessária disponível; exclusões/transições inválidas rejeitadas. |

As barreiras de concorrência observam pg_stat_activity.wait_event_type='Lock'; não inferem concorrência só por disparar Promises. Se o lock não for observado no prazo, o cenário reprova. O deadlock é deliberadamente induzido com locks auxiliares na mesma ordem de atores dos módulos; não é um teste de frequência de deadlocks sob tráfego comum. deadlock_timeout/statement_timeout são ajustados somente com SET LOCAL nas sessões sintéticas, nunca globalmente ou em migrações de produção.

## Execução futura

No PowerShell a partir da pasta do projeto, somente após conferir os pré-requisitos:

```powershell
Push-Location 'PI Backend'
$integradoAnterior = [Environment]::GetEnvironmentVariable('TROCATICKET_ENSAIO_INTEGRADO_SQL_LOCAL','Process')
try {
    $env:TROCATICKET_ENSAIO_INTEGRADO_SQL_LOCAL = '1'
    node --test --test-concurrency=1 tests/ensaio-integrado-sql.test.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Ensaio integrado reprovado; revisar etapa e SQLSTATE.' }
} finally {
    [Environment]::SetEnvironmentVariable('TROCATICKET_ENSAIO_INTEGRADO_SQL_LOCAL',$integradoAnterior,'Process')
    Pop-Location
}
```

Sem opt-in: `node --test tests/ensaio-integrado-sql.test.cjs` executa só verificações estáticas/infraestrutura, com **dois skips explícitos**. Isso não comprova compilação ou comportamento SQL.

Para aprovação real exigir: pais v1/v3 e todos os subcenários aprovados, zero falhas/cancelamentos/skips, validações de cada etapa e confirmação de remoção dos dois containers. Recomenda-se repetir o ensaio completo; não enfraquecer asserções para aprovar.

## Diagnóstico e descarte

- `EV*`, `AP*`, `CT*`, `TA*`: comparar com a regra esperada **naquele cenário**, não aceitar uma lista genérica de erros.
- `55P03`: lock timeout; `40P01`: deadlock; `57014`: statement timeout. Só são resultado esperado nos testes que os induzem explicitamente. Nos demais cenários são falhas.
- Demais SQLSTATE/erros: falha inesperada de ambiente, fixture ou implementação, a diagnosticar. Código de retorno zero ou presença da tabela não prova o restante do contrato.
- Preparação registra etapa exata, código, tentativas, tempo, estado do container e logs recentes disponíveis, sem senha. Não se imprimem JWT, dados reais ou credenciais. As mensagens de falha do executor não propagam argumentos com senha. O ensaio não deve ser redirecionado para dados reais.
- Cleanup é registrado antes de docker run, faz rollback/encerra conexões e para apenas o container com nome/labels/nonce/imagem correspondentes. `--rm` e tmpfs descartam o ambiente. Não usa prune nem remove bancos/volumes genéricos.
- Interrupção forçada pode impedir finally. Identificar o container pelos labels `trocaticket.ensaio=f84` e nonce, conferir nome/imagem e parar **somente aquele recurso próprio**, usando o mesmo socket local. Não fornecer nomes de containers existentes como argumento ao executor. Uma falha de limpeza impede aprovação, mesmo com testes funcionais aprovados.

## Resultado deste lote

Docker Linux indisponível; nenhum container ou banco foi criado e nenhum SQL real foi executado. Sintaxe dos arquivos novos e verificações direcionadas locais aprovadas: **42 testes aprovados, zero falhas, seis skips** (quatro pais PostgreSQL individuais já existentes e dois conjuntos novos v1/v3). Não se reexecutaram React completo, ESLint ou build: não houve alteração de frontend ou produção. As proteções estáticas não substituem o ensaio real.

Permanecem sem comprovação: bootstrap efetivo desta fixture, compilação conjunta, grants/triggers reais, concorrência/timeouts/deadlock/rollback e limpeza após uma execução real. PostgREST, Supabase remoto, esquema completo do provedor, performance em carga e recuperação real continuam fora desta aprovação. Flags A7/A10/F8 permanecem desativadas; não houve migração remota, mudança de Windows, backup, commit, push ou deploy.
