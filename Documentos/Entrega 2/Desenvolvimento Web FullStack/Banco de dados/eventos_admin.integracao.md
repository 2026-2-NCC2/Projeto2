# Criação administrativa de eventos — preparação A7.2

Estado: código preparado, **desativado por padrão**. Nenhum SQL ou cadastro remoto
deve ser executado automaticamente. O identificador de perfil do projeto é `admin`.

## Contratos novos

- `GET /admin/eventos/capacidades`: exige autenticação e perfil `admin`.
  Com a configuração desligada responde `{criar:false,controleCapacidade:false}`.
  Com a configuração ligada exige a RPC de capacidades versão 1.
- `POST /admin/eventos`: exige `admin`, configuração ativa e RPC disponível.
  Cabeçalho `Idempotency-Key`: UUID v4. Corpo: `organizador_id` inteiro positivo,
  `nome`, `data` (AAAA-MM-DD), `horario` (HH:mm), `local`, `publico`, `categoria`
  e `descricao` opcionais; `capacidade_maxima` somente quando disponível.
  Campos extras, incluindo `status`, `usuario_id`, `admin_id` e `perfil`, são recusados.
  Retorno 201: `{evento:{id,usuario_id}}`. Replay confirmado também retorna 201.
  Erros de POST contêm `erro` e `resultado_incerto`; não há retry automático.

`POST /eventos` continua exclusivo do Organizador. Publicação, custos, edição,
cancelamento e imagens não foram liberados ao Administrador.

## Transação e autoria

`eventos_admin.incremental.sql` cria somente uma tabela e duas funções novas.
Não substitui `gerir_evento_v1` nem altera tabelas ou registros preexistentes.
O evento é criado por essa RPC original, no estado Em planejamento, para o dono
Organizador. A nova função valida e trava ator e dono em ordem de ID, verifica
contas em encerramento e grava a auditoria na mesma transação.

`eventos_criacao_admin` guarda IDs de ator/dono/evento, instante, chave e hash
SHA-256 dos dados para comparação idempotente. Não guarda nome, e-mail, JWT ou
o texto do formulário na auditoria. A gestão existente ainda possui seu próprio
payload de criação, conforme seu contrato anterior. A chave interna da criação
é independente da chave administrativa. Mesmo ator/chave/dados retorna o mesmo
evento; mudança dos dados ou dono com a mesma chave gera conflito.

A auditoria usa FKs RESTRICT: uma futura exclusão de usuário/evento precisa
respeitar esse histórico. Não adicionar cascatas para contornar isso.
Somente service_role recebe SELECT/INSERT na auditoria e EXECUTE nas novas
funções. RLS é forçado; não há acesso direto anon/authenticated. Grants herdados
inesperados abortam a migração; defaults globais não são alterados.

## Revisão manual antes de autorizar

1. Manter `ADMIN_EVENTOS_CRIACAO_ATIVA` ausente ou `false`.
2. Confirmar PostgreSQL 15–18, projeto correto e gestão segura já aplicada
   (`eventos_capacidades_v1()` retorna 1 ou 3; capacidade somente na versão 3).
3. Comparar as definições reais de `gerir_evento_v1`, `eventos_capacidades_v1`,
   tabelas e triggers com as migrações aprovadas. Versão anunciada sozinha não
   substitui essa revisão.
   O arquivo `eventos_admin.preflight.sql` contém consultas somente de leitura
   para essa revisão; não deve ser executado automaticamente. O inventário,
   os limites e o procedimento manual estão em
   [eventos_admin.preflight.md](eventos_admin.preflight.md). Não chama RPCs nem
   consulta registros de negócio; não comprova sozinho a integridade dos dados.
4. Revisar integralmente o novo SQL: privilégios, heranças, BYPASSRLS do service_role,
   permissões de lock/sequence da gestão existente e impacto de RESTRICT.
5. Executar a integração PostgreSQL **apenas no container local descartável**:

   ```powershell
   cd 'PI Backend'
   $testeAdminAnterior = $env:TROCATICKET_ADMIN_EVENTOS_SQL_LOCAL
   try {
     $env:TROCATICKET_ADMIN_EVENTOS_SQL_LOCAL='1'
     node --test tests/admin-eventos-sql.test.cjs
     if ($LASTEXITCODE -ne 0) { throw 'Integração administrativa não aprovada.' }
   } finally {
     if ($null -eq $testeAdminAnterior) {
       Remove-Item Env:TROCATICKET_ADMIN_EVENTOS_SQL_LOCAL -ErrorAction SilentlyContinue
     } else {
       $env:TROCATICKET_ADMIN_EVENTOS_SQL_LOCAL = $testeAdminAnterior
     }
   }
   ```

   Requer Docker disponível e imagem `postgres:17` já instalada; não baixa imagem,
   não lê .env e não permite URL de banco externo. O endpoint Docker deve usar
   socket local npipe/unix; TCP/SSH é recusado, inclusive TCP em localhost. Cada
   comando fixa explicitamente esse socket. Não inicia o daemon nem baixa imagens.
   São dois containers independentes: gestão v1 e gestão v1 + capacidade v3,
   seguidos da migração administrativa. A fixture inclui UNIQUE(usuario_id,evento_id).
   Os resultados de execução local estão registrados abaixo. Testes estáticos não provam SQL.
6. Somente com autorização posterior, aplicar a migração manualmente e verificar
   tabela/RLS/ACL e definições das duas funções. Uma falha exige ROLLBACK da
   transação de aplicação, não reaplicação forçada. Não alterar defaults para aceitar
   grants que falharam sem revisão.
7. Após aprovação dos testes isolados e da implantação do SQL, autorizar separadamente
   a configuração local `ADMIN_EVENTOS_CRIACAO_ATIVA=true` e reiniciar o backend.
   A interface consultará a disponibilidade; sem flag/RPC válida o botão fica bloqueado.
8. Validar criação real somente com contas/dados descartáveis autorizados. Esta etapa
   não foi executada. Não modificar credenciais ou permissões de operações antigas.

## Interface e resultados incertos

`#/admin?secao=novo-evento` reutiliza os campos do Organizador com textos
administrativos, sem etapas de Custos e sem Imagens. O seletor lista apenas
organizadores de GET /usuarios, mas o servidor e a transação revalidam o dono.
Salvar confirmado abre o Painel de evento administrativo. Cancelar abre Eventos.
Os campos required/limites do formulário são reutilizados; todas as validações
de negócio continuam no backend e na RPC original.

O formulário não é persistido. F5 e Voltar/Avançar restauram a seção, não os dados.
Antes do POST, o navegador grava somente `adminEventoPendente=1` no sessionStorage.
Não contém token, chave ou payload. Na mesma montagem, confirmação de uma tentativa
incerta reutiliza exatamente chave e payload; novas alterações ficam bloqueadas.
Depois de F5/saída com pendência, novos envios ficam bloqueados e o usuário deve
consultar Eventos e pedir reconciliação operacional. Não limpar o marcador só para
tentar novamente: confirmar o resultado pela auditoria e pela listagem primeiro.
Após reconciliação autorizada, limpar apenas esse marcador local; nenhum registro
de banco deve ser excluído para “desbloquear” o formulário.

Limites: armazenamento de sessão indisponível impede envio; o marcador é conservador
e vale para a aba, mesmo se outra conta entrar nela. Não é mecanismo de autorização.
O banco garante idempotência por ator/chave, não deduplicação semântica entre novas
chaves ou dispositivos. A disponibilidade técnica não substitui autorização do backend.

## Verificações locais

Backend: `node --test tests/admin-eventos.test.cjs tests/admin-eventos-sql.test.cjs`.
React: `node --test tests/adminNovoEvento.test.js tests/eventosGestao.test.js`.
Complementar com suites de navegação/autenticação, ESLint, build e diff --check.
Inspeção visual, PostgreSQL real e teste remoto não devem ser declarados concluídos
sem execução. Não criar contas, eventos ou aplicar SQL de produção nesta preparação.

## Preparação A7.4 e execução futura A7.5

Neste lote foram preparados, sem executar PostgreSQL:

- Criação autorizada, autoria separada, estado inicial e regressão da RPC do Organizador.
- EV400 para ator/proprietário iguais e estado indevido; EV403 para perfis/IDs inválidos,
  sempre com um organizador distinto e válido no teste do ator não autorizado.
- Replay sequencial e concorrente; mesma chave com outro conteúdo ou proprietário.
- Troca concorrente dos perfis do administrador e do organizador. O ensaio observa
  o lock em pg_stat_activity antes de liberar a alteração; não depende de um sleep fixo.
- Timeout de lock exige 55P03; recusa de perfil exige EV403; erro inesperado falha o teste.
- Contas em encerramento/excluídas e rollback da criação por falha TA001 na auditoria.
- Capacidade v3 omitida, NULL, explícita e inválida.
- Privilégios efetivos de tabelas, RPCs, schema e sequences; ausência de grant options
  nas tabelas/RPCs/sequences, RLS forçado e negação de chamadas diretas anon/authenticated.
- Defaults amplos e grant inesperado, verificando rollback da tabela e das duas funções.

As permissões verificadas são as da fixture PostgreSQL 17 descartável, não uma
certificação dos grants do Supabase. As tabelas mínimas de usuários/contas de teste
não reproduzem todos os módulos e triggers do projeto; a integração completa e a
exposição via PostgREST continuam sendo etapas distintas, se posteriormente autorizadas.

Antes do A7.5, disponibilizar o daemon e a imagem local postgres:17. Somente com
autorização executar o bloco opt-in acima. Não usar banco já existente. Conferir
que os dois cenários reais rodaram sem skips e que os containers aleatórios foram
removidos pelo teardown. Se o processo for interrompido à força, verificar somente
os containers tt-admin-eventos-v1/v3 criados pelo ensaio; não remover recursos genéricos.
Nenhum desses comandos habilita ADMIN_EVENTOS_CRIACAO_ATIVA ou migra produção.

Validação sem banco (segura mesmo que a variável opt-in esteja herdada):

```powershell
cd 'PI Backend'
node --check tests/admin-eventos-sql.test.cjs
node --test --test-name-pattern='migração administrativa|ensaio PostgreSQL|asserção de recusa|prontidão SQL|endpoint administrativo|ator vem|organizador ausente|mudança concorrente|adaptador usa|servidor real' tests/admin-eventos.test.cjs tests/admin-eventos-sql.test.cjs
```

O filtro exclui os testes chamados PostgreSQL isolado v1/v3. O relatório dessa
execução não deve ser apresentado como aprovação dos cenários reais.

## Estabilização da fixture — A7.5.1

O diagnóstico em container descartável confirmou que `pg_isready -U postgres`,
sem host TCP, pode aceitar o servidor temporário do bootstrap. Na observação de
11/11/2026, a mesma sonda retornou `UNIX_READY`, PID 99 e `TCP_NOT_READY`.
Os logs mostraram esse servidor escutando somente no socket Unix e recebendo
`fast shutdown request` em seguida. O servidor definitivo inicia depois, como
PID 1, com listeners TCP. Assim, a prontidão anterior não garantia a conexão
usada pelo pool; as falhas do A7.5 ocorreram antes da primeira DDL da fixture.

A fixture agora exige conexão TCP autenticada em `127.0.0.1`, na porta efêmera
publicada pelo container, e `SELECT 1 AS pronto` antes de criar o pool. Cada
tentativa usa um Client descartável, encerrado inclusive na falha, com timeout
de conexão/consulta de até 1 segundo e prazo total de 30 segundos. A sondagem
aguarda até 100 ms entre falhas transitórias classificadas; autenticação inválida,
erro SQL inesperado e resultado inválido reprovam imediatamente. DDL, migrações
e operações funcionais não recebem tentativas automáticas.

Falhas de preparação informam etapa, tipo/código/mensagem, tempo, tentativas,
estado do container e logs relevantes. A senha aleatória é redigida. O teardown
é registrado antes da criação do container, encerra o pool e remove somente o
container com nome aleatório daquele cenário. Erros ociosos do pool também
reprovam o ensaio. Testes sem banco verificam classificação de erros, prazo,
encerramento dos Clients e redação da senha, sem enfraquecer as asserções SQL.

### Resultados locais de 11/11/2026

Docker Linux 29.9.3, imagem local `postgres:17` e socket local npipe verificados.
Não houve leitura de `.env` nem conexão com Supabase. Cada execução utilizou
dois containers novos com porta efêmera publicada somente em `127.0.0.1`.

| Execução | Cenários v1 | Cenários v3 | Total do runner | Falhas / skips |
| --- | --- | --- | --- | --- |
| Primeira, 43,06 s | 21 aprovados | 21 aprovados | 50 aprovados | 0 / 0 |
| Repetição, 10,17 s | 21 aprovados | 21 aprovados | 50 aprovados | 0 / 0 |

O total inclui seis testes estáticos/de infraestrutura e os dois testes pais.
A prontidão SQL levou 17.375/15.529 ms (v1/v3) na primeira execução e
1.325/1.323 ms na repetição; não foi imposta espera fixa para iniciar a DDL.
Os quatro containers foram removidos e o opt-in foi restaurado em ambos os
blocos `finally`. A listagem final de containers locais estava vazia.

Além disso, os testes estáticos e HTTP simulados selecionados passaram:
12 aprovados, nenhuma falha ou skip. A primeira tentativa desses testes no
sandbox foi impedida por `spawn EPERM`; a execução com permissão para subprocessos
foi concluída. A sintaxe do teste e `git diff --check` foram aprovados.

Os cenários reais mantiveram asserções de SQLSTATE exato, concorrência,
rollback, privilégios/RLS, contas em encerramento e regressão do Organizador.
Não houve alteração das RPCs, migrações ou da configuração de ativação.
Essas duas execuções comprovam o resultado local observado, sem garantir
estabilidade em qualquer ambiente. A revisão das dependências/grants reais,
a autorização de migração e a ativação continuam pendentes e separadas.
