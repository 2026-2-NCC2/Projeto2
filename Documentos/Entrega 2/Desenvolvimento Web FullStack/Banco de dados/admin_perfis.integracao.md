# A10.1 — Gerenciamento administrativo de perfis

## Modelo e limites

`usuarios.perfil` é um único valor do enum `usuarios_perfil_enum`: `participante`,
`organizador`, `fornecedor` ou `admin`. A ação **Gerenciar perfis**, na listagem de
Usuários, substitui esse valor; não acumula permissões. O modal apresenta o acesso
removido e o concedido, exige motivo e confirmação, com aviso para poderes
administrativos.

Eventos, inscrições, propostas, solicitações e demais históricos não são
reescritos. Seus vínculos permanecem; operações futuras continuam sujeitas ao novo
perfil. Uma solicitação pendente não é aprovada nem recusada automaticamente pela
troca direta: o fluxo existente mantém sua validação condicional do participante.

O middleware de autenticação consulta o perfil atual no banco em cada requisição.
Assim, um JWT previamente emitido não preserva permissões revogadas. Isso não
interrompe uma operação que já estava autorizada/em andamento. A navegação existente
revalida a sessão e identifica o portal compatível; uma tela já aberta pode
permanecer visível até a próxima requisição ou navegação, sem conceder autorização
no servidor. Não houve alteração no contrato ou conteúdo do JWT.

## Contrato HTTP

Ambas as rotas exigem autenticação e perfil canônico `admin`:

- `GET /admin/usuarios/perfis/capacidades`: `{ alterar: boolean, modelo: "unico" }`.
  Com flag desligada, retorna `alterar: false`; falha técnica retorna 503.
- `PATCH /admin/usuarios/:id/perfil`: header `Idempotency-Key` UUID v4 e corpo
  `{ perfil_anterior, perfil_novo, motivo, confirmado: true }`. Motivo de 10 a
  1000 caracteres, sem controles. Campos adicionais são recusados. Autor é extraído
  exclusivamente da sessão. Retorno confirmado: `{ usuario: { id, perfil } }`.

Erros: 400 para argumentos; 401 para sessão; 403 para autorização; 404 para usuário
ausente; 409 para conflito, conta em encerramento, último administrador, próprio
acesso ou lock concorrente; 503 para indisponibilidade/resultado não confirmado.
Erros de autenticação anteriores ao handler preservam o contrato já existente.
Não há repetição automática de escrita. Timeout, falha de transporte ou resposta
incompleta exigem reconciliação; o modal conserva a mesma chave e corpo para
confirmar a mesma operação. Fechar o modal atualiza a lista. A tentativa não é
persistida no navegador após F5; consulte novamente o perfil antes de outra decisão.

## Transação e segurança

[admin_perfis.incremental.sql](admin_perfis.incremental.sql) prepara somente os
objetos novos. Não aplica alterações remotas automaticamente.

`alterar_perfil_admin_v1` usa `SECURITY INVOKER`, `search_path=pg_catalog` e exige
`READ COMMITTED`. Revalida o administrador, o perfil anterior do alvo e contas em
encerramento. Proíbe remover o próprio acesso administrativo e o último
administrador autorizado. Não concede privilégios em tabelas existentes.

Um lock `SHARE ROW EXCLUSIVE` em `usuarios` serializa as alterações de perfil,
inclusive contra UPDATEs do fluxo de aprovação existente. Um lock `SHARE` na
tabela de contas em encerramento impede mudanças concorrentes desse estado durante
a decisão. O limite de espera é 2 segundos. São locks amplos e breves, com possível
impacto em outras escritas: avaliar volume e latência antes da ativação. Deadlock
ou timeout não é interpretado como sucesso.

Atualização do perfil e inserção na auditoria são atômicas. A chave composta
`(admin_id, chave)` permite replay do mesmo conteúdo e recusa conteúdo diferente.
Replay confirma a operação original, não garante que o perfil nunca tenha sido
alterado posteriormente. O ator é revalidado também no replay.

A auditoria contém IDs do autor e alvo, perfis anterior/novo, motivo e data; não
copia nome, e-mail, senha ou token. O motivo deve evitar dados pessoais
desnecessários. RLS está habilitado e forçado; `service_role` recebe apenas
SELECT/INSERT nessa tabela e EXECUTE nas duas funções. `anon`, `authenticated` e
PUBLIC não recebem acesso. As verificações finais abortam grants inesperados.
As garantias não substituem controle sobre administradores SQL, credenciais de
serviço ou processos que alterem usuários fora deste fluxo.

As FKs da auditoria usam `RESTRICT`: a exclusão física de uma conta referenciada
passa a exigir decisão de retenção/anonimização. Não foi implementada purga nem
definido prazo automático. Essa compatibilidade com exclusão e retenção deve ser
aprovada antes da aplicação real.

## Pré-condições e ativação futura

O recurso está **desligado por padrão**, por `ADMIN_PERFIS_GESTAO_ATIVA=false`.
Somente o adaptador Supabase foi implementado; o modo MySQL continua indisponível
para essa ação, sem fallback. A interface só libera o formulário após confirmação
positiva da capacidade pelo backend.

Antes de qualquer aplicação autorizada:

1. Conferir o banco de destino e executor, backup/recuperação aprovados, enum e
   estrutura de `usuarios` e `contas_teste_imagens`, incluindo estados e políticas.
2. Confirmar `service_role` com BYPASSRLS, USAGE no schema, SELECT/UPDATE em
   usuários e privilégios suficientes para ambos os locks. A fixture usa
   SELECT/UPDATE também na tabela de contas em encerramento; SELECT isolado não
   comprova aptidão para o lock SHARE. Revisar privilégios efetivos/herdados/defaults e contratos
   de exclusão; não conceder permissões automaticamente para passar o preflight.
3. Conferir ausência dos novos objetos. A migração não é reaplicável silenciosamente:
   colisões exigem comparar definições. Depende do esquema PostgreSQL atual e do
   mecanismo de contas em encerramento; não depende da ativação do A7.2.
4. Aplicar a migração completa somente mediante autorização separada, com seu
   BEGIN/COMMIT e verificações finais. Em divergência, interromper e revisar;
   após COMMIT, recuperação exige roteiro próprio, sem apagar a auditoria.
5. Validar PostgREST, permissões e cenários funcionais em ambiente apropriado.
   Somente depois decidir habilitar a flag e reiniciar o backend autorizado.

Não houve acesso remoto, migração remota, backup/restore real ou ativação neste
lote. `ADMIN_EVENTOS_CRIACAO_ATIVA` permanece intocada. O A7.15 está suspenso e a
infraestrutura de backup e K: foram preservados.

## Testes locais

No diretório `PI Backend`:

```powershell
node --test tests/admin-perfis.test.cjs tests/admin-perfis-sql.test.cjs
```

Sem opt-in, apenas o cenário PostgreSQL é ignorado. Para executar a integração
**sintética local**, Docker Linux e a imagem `postgres:17` já devem estar
disponíveis. A suíte aceita apenas socket local, publica porta efêmera em
127.0.0.1, não carrega `.env`, cria banco descartável e remove o container ao fim:

```powershell
$perfilOptInAnterior = [Environment]::GetEnvironmentVariable('TROCATICKET_ADMIN_PERFIS_SQL_LOCAL', 'Process')
try {
    $env:TROCATICKET_ADMIN_PERFIS_SQL_LOCAL = '1'
    node --test tests/admin-perfis-sql.test.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Integração de perfis reprovada.' }
} finally {
    [Environment]::SetEnvironmentVariable('TROCATICKET_ADMIN_PERFIS_SQL_LOCAL', $perfilOptInAnterior, 'Process')
}
```

A fixture verifica os quatro perfis, histórico, auditoria, replay, conflitos,
demissões cruzadas, conta em encerramento, último administrador, próprio acesso,
rollback e privilégios/RLS. É evidência local, não certificação do esquema remoto.

No diretório `PI React`: `node --test tests/adminPerfis.test.js`, seguido da suíte
completa, ESLint e build. Os testes de interface usam o harness estrutural existente;
não substituem inspeção real em navegador, teclado e diferentes larguras.

### Resultado local do A10.1

- React completo: 836 aprovados, zero falhas/skips; ESLint e build aprovados.
- Backend completo: 1718 aprovados, zero falhas, 19 skips (oito comparações
  históricas e onze integrações condicionadas a opt-in).
- Integração nova executada separadamente em PostgreSQL 17 descartável: nove
  testes aprovados, zero falhas/skips. Container removido e opt-in restaurado.
- Sintaxe dos módulos/testes alterados e `git diff --check` aprovados.
- Sem inspeção visual em navegador nem validação remota/PostgREST neste lote.
