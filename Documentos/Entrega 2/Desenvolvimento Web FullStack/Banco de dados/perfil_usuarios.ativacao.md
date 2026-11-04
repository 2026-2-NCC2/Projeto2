# Edição persistente dos perfis

## Validação real após a migração — 03/11/2026

A execução manual da migração e os tipos `telefone varchar(30)` e `biografia varchar(1000)`, ambos nullable, foram confirmados pelo operador no SQL Editor. Nesta validação, nenhuma migração foi executada. O verificador `node --use-system-ca scripts/verificar-colunas-perfil.cjs` confirmou `id`, `nome`, `email`, `telefone` e `biografia` disponíveis via PostgREST.

`node --use-system-ca scripts/validar-perfil-real.cjs --executar-autorizado --navegador` terminou com código zero, usando o backend atual e o build React atual em Chrome headless real:

- `GET /perfil` retornou os quatro campos pessoais e `edicao_disponivel: true`, sem senha ou perfil de acesso.
- Nome, telefone e biografia foram alterados pelo formulário da conta de homologação administrativa configurada em `HOMOLOG_ADMIN_EMAIL`. A consulta direta ao Supabase confirmou os valores gravados.
- O formulário manteve os valores após atualizar a página e após sair e entrar novamente pelo login da interface. E-mail permaneceu somente leitura.
- Tentativas de enviar `email`, `senha`, `id` ou `perfil`, junto com nome válido, receberam HTTP 400; a comparação direta do registro confirmou ausência de alteração. ID, e-mail, hash de senha e perfil de acesso também permaneceram iguais após o salvamento válido.
- Somente essa conta recebeu escrita. Os valores originais dos três campos foram restaurados pelo endpoint, incluindo NULL; a igualdade do registro completo foi confirmada diretamente no Supabase e os campos pessoais foram reconferidos por GET.
- Login e GET real de perfil aprovados para administrador, participante, organizador e fornecedor. As três últimas contas receberam somente leitura. A edição das quatro modalidades está coberta pelos testes HTTP direcionados com persistência simulada; não foi realizada escrita real nas outras contas.
- 68 testes direcionados do backend e 96 do React aprovados, sem falhas. Build e lint do React aprovados. Os testes React exigiram execução fora da sandbox porque a primeira tentativa foi bloqueada por `spawn EPERM`.

Foram acrescentados somente os scripts de validação `scripts/validar-perfil-real.cjs` e `scripts/perfil-navegador.cjs` e este registro. Não foi necessária correção na aplicação. A identidade visual foi preservada, nenhuma outra tabela foi alterada e nenhum commit foi criado. A verificação de navegador cobre o formulário administrativo, atualização da página e novo login; não constitui teste completo de todos os fluxos de negócio dos quatro portais.

O relato abaixo documenta a entrega anterior à migração e suas pendências naquela ocasião, agora substituídas pelos resultados acima para a edição de perfil.

Implementada para participante, organizador, fornecedor e administrador. Nenhuma migração foi aplicada e nenhum usuário real foi atualizado nesta entrega. Nenhum commit foi criado.

## Estrutura e validação

O schema versionado em `trocaticket_supabase.sql` define `public.usuarios` com `id` inteiro, `nome varchar(100)`, `email varchar(150)`, `senha varchar(100)` e `perfil` enum. A autenticação própria usa JWT e recupera a identidade atual do banco; esse fluxo foi preservado.

Em 03/11/2026, `node --use-system-ca scripts/verificar-colunas-perfil.cjs`, executado em `PI Backend`, confirmou por GET no Supabase, com limite zero e sem buscar registros:

| Coluna | Resultado |
| --- | --- |
| id, nome, email | Disponíveis |
| telefone, biografia | Ausentes, PostgreSQL `42703` |

`perfil_usuarios.incremental.sql` foi revisado e passou por verificação estática automatizada: transação, adição condicional, limites, ausência de DML e de comandos destrutivos. A execução SQL não foi validada em um banco, pois a migração não foi executada. A inspeção remota acima confirma a existência das colunas, não tipos, índices, triggers, políticas ou permissões; a conferência desses metadados está preparada no preflight.

## Aplicação manual no Supabase

1. No SQL Editor do projeto usado pelo backend, executar **somente** `perfil_usuarios.preflight.sql` e guardar o resultado. Conferir a estrutura de `public.usuarios`, contagem de usuários, constraints, índices, triggers, RLS e grants. Não executar o dump completo `trocaticket_supabase.sql`, que contém criação de tabelas e registros.
2. Executar manualmente `perfil_usuarios.incremental.sql`. Ele adiciona `telefone varchar(30)` e `biografia varchar(1000)`, ambas opcionais, sem default ou backfill. Usuários existentes permanecem com NULL nas novas colunas. Não há alteração de IDs, hashes, e-mails, perfis de acesso, permissões ou tabelas existentes.
3. Se já houver colunas incompatíveis, o SQL cancela a transação; revisar a estrutura antes de continuar. O timeout de lock é 5 segundos e o timeout de execução é 30 segundos. Nenhum índice ou constraint é recriado. A alteração precisa de lock breve na tabela; indisponibilidade do lock aborta a transação.
4. Reexecutar o preflight e conferir a mesma contagem de usuários e as novas colunas. O `NOTIFY pgrst, 'reload schema'` da migração solicita atualização do cache do PostgREST após o commit.
5. Em `PI Backend`, executar `node --use-system-ca scripts/verificar-colunas-perfil.cjs`: as cinco colunas devem aparecer disponíveis.
6. Colocar o backend e o build React desta entrega em execução e recarregar a página de perfil. Com as colunas acessíveis, `GET /perfil` devolve `edicao_disponivel: true` e o formulário habilita **Editar dados**. Não é necessária mudança de JWT, segredo, permissões, provedor ou sistema de autenticação.
7. Verificar com uma conta de cada tipo: salvar, navegar e reabrir a página, depois recarregar. Conferir nome no cabeçalho, telefone e biografia persistidos, e e-mail somente leitura. A validação de escrita real após a migração permanece pendente.

## Comportamento e segurança

- `GET /perfil` retorna somente `id`, `nome`, `email`, `telefone`, `biografia` e `edicao_disponivel`.
- Enquanto faltarem colunas (`42703` ou `PGRST204`), a leitura básica continua no mesmo Supabase, com novos campos nulos e edição desabilitada. Falhas de rede ou permissão continuam sendo erros. Não há troca automática de banco.
- `PATCH /perfil` usa o middleware de autenticação existente e filtra exclusivamente pelo ID autenticado. Corpo e query string não escolhem o usuário.
- Lista explícita de entrada: `nome`, `telefone`, `biografia`. Campos extras, incluindo e-mail, ID, senha, perfil e permissões, causam 400 antes da escrita. O repositório também restringe os campos.
- Atualização parcial preserva campos omitidos. Nome: 1–100 caracteres após trim; telefone: até 30, com dígitos e caracteres de formatação; biografia: até 1000. Tipos e controles inválidos são rejeitados. Telefone e biografia vazios são persistidos como NULL.
- O update retorna a projeção do perfil na mesma chamada, sem retry automático. Falhas não confirmam sucesso. Falta de schema devolve 503. No ambiente MySQL legado/isolado, a leitura continua e o PATCH devolve 503, sem tentar atualizar colunas inexistentes.
- A chave do Supabase permanece exclusivamente no backend. O React usa apenas a API com o JWT já existente.
- Formulário compartilhado com carregamento, edição, cancelamento, salvamento, sucesso e erro. Após sucesso, as instâncias de `usePerfil` atualizam os cabeçalhos e o resumo; GET atrasado e eventos de outra sessão não sobrescrevem o perfil salvo. A desmontagem aborta a requisição do formulário.

## Arquivos desta implementação

Alguns arquivos já tinham alterações da modernização visual. Elas foram preservadas; a lista abaixo descreve apenas os arquivos tocados nesta implementação.

Banco:

- `Banco de dados/perfil_usuarios.preflight.sql` (novo)
- `Banco de dados/perfil_usuarios.incremental.sql` (novo)
- `Banco de dados/perfil_usuarios.ativacao.md` (novo)

Backend:

- `PI Backend/server.js`
- `PI Backend/perfil.cjs` (novo)
- `PI Backend/repositories/supabase/usuarios.cjs`
- `PI Backend/scripts/verificar-colunas-perfil.cjs` (novo)
- `PI Backend/scripts/validar-leituras-supabase-https.cjs`
- `PI Backend/tests/perfil-edicao.test.cjs` (novo)
- `PI Backend/tests/usuarios-supabase-repository.test.cjs`
- `PI Backend/tests/autenticacao-http.test.cjs`
- `PI Backend/tests/helpers/http-autenticacao.cjs`
- `PI Backend/tests/helpers/persistencia.cjs`
- `PI Backend/tests/contratos.test.cjs`
- `PI Backend/tests/banco-provider.test.cjs`
- `PI Backend/tests/isolamento.test.cjs`
- `PI Backend/tests/cutover-transicao-final.test.cjs`

React:

- `PI React/src/components/perfil/PerfilPessoal.jsx` (novo)
- `PI React/src/services/perfil.js` (novo)
- `PI React/src/hooks/usePerfil.js`
- `PI React/src/App.jsx`
- `PI React/src/App.css`
- `PI React/src/pages/organizador/Perfil.jsx`
- `PI React/src/pages/participante/PortalParticipante.jsx`
- `PI React/src/pages/fornecedor/PortalFornecedor.jsx`
- `PI React/src/components/admin/AdminPortal.jsx`
- `PI React/tests/perfilEdicao.test.js` (novo)
- `PI React/tests/fornecedorIdentidades.test.js`
- `PI React/tests/organizadorDadosReais.test.js`
- `PI React/tests/auditoria4B.test.js`
- `PI React/tests/administrador.test.js`
- `PI React/tests/estruturaResponsiva.test.js`

## Validação automatizada

- Backend direcionado: 68 aprovados (perfil, autenticação HTTP e repositório Supabase).
- Backend completo: 1451 aprovados, 8 ignorados, zero falhas (1459 casos). Os testes usam persistência simulada, sem gravações no Supabase real.
- React completo: 227 aprovados, zero falhas (218 existentes atualizados para os novos contratos e 9 novos).
- `npm.cmd run lint`: aprovado.
- `npm.cmd run build`: aprovado.
- Testes existentes de responsividade cobrem regras de CSS em 1920, 1366, 768, 390 e 360 pixels. Não houve inspeção visual em navegador nesta sessão.

Logs locais: `PI Backend/perfil-testes-backend.log` e `PI React/perfil-testes-react.log`.
