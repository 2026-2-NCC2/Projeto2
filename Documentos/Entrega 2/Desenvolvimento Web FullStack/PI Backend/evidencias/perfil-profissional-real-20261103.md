Validação real do perfil profissional — 03/11/2026 (America/Sao_Paulo)

Resultado: integração funcional aprovada no backend local contra o Supabase real e no Chrome headless com o build React. Ativação persistida em `PI Backend/.env`: `PERFIL_PROFISSIONAL_ATIVO=true`. Um processo novo leu a flag do arquivo, autenticou a conta de homologação e retornou 200 em GET `/perfil/profissional`, com `edicao_disponivel=true`. Os servidores e navegadores temporários foram encerrados.

Há uma pendência de auditoria: a conexão PostgreSQL configurada terminou em timeout, inclusive fora do sandbox. Portanto esta execução não confirma integralmente o catálogo de permissões, RLS, políticas, triggers ou os atributos nullable/default pelo SQL. O SQL Editor foi informado pelo solicitante como confirmação de JSONB nullable. Pela API HTTPS, as duas colunas existem como JSONB opcionais, a chave privada do backend consegue consultar/gravar e a chave pública recebe 401 ao consultar as colunas. Isso não comprova os grants do papel Supabase `authenticated`; esse papel é distinto dos quatro papéis da aplicação.

| Verificação real | Resultado |
| --- | --- |
| Flag false / true | GET autenticado retorna 503 / 200, respectivamente |
| Consulta de redes nos quatro papéis | Aprovada |
| Edição das cinco redes pela API | Aprovada, persistência direta conferida |
| Remoção de redes com `{}` pela API e botão no Chrome | Aprovada, SQL NULL confirmado pela leitura Supabase |
| Comercial de fornecedor | Todos os campos, incluindo categorias, aprovados pela API |
| Comercial de organizador | Todos os campos permitidos aprovados; categorias rejeitadas com 400 |
| Comercial de participante e administrador | Valores, objeto vazio e null rejeitados com 403 |
| URLs HTTPS | Aceitas em redes e site oficial; HTTP, javascript, URL relativa, credenciais, controle e barra invertida rejeitados nas redes; HTTP rejeitado em site oficial |
| Campos desconhecidos e protegidos | 400; ID, papel, email, senha e extras de seção não gravados |
| Sessão ausente ou token inválido | GET e PATCH retornam 401 |
| Chrome nos quatro papéis | Login, edição pelo formulário de redes, atualização da página, logout, novo login, leitura persistida e remoção aprovados |
| Chrome nos dois papéis comerciais | Edição do nome comercial/organização, recarga e novo login aprovados |
| Chrome nos papéis sem comercial | Formulário comercial ausente |
| Seção omitida e isolamento | Outra seção preservada; quatro registros conferidos após cada PATCH; `usuario_id` divergente na query não troca o titular |
| Perfil pessoal | GET `/perfil` continua retornando 200 nos quatro papéis |
| Restauração | Quatro registros completos iguais aos originais, incluindo credenciais e campos pessoais; GET profissional também conferido |

Somente as contas de teste já identificadas no validador existente foram usadas: administrador e participante selecionados pelas variáveis HOMOLOG; fornecedor ID 3 e organizador ID 4, ambos com email de teste e senha previamente configurada validada por bcrypt. Nenhuma conta foi criada. O backup temporário de recuperação continha apenas ID, papel e as duas seções profissionais; foi removido após a restauração. Nenhum dado pessoal, token ou segredo integra esta evidência.

O roteiro completo foi repetido após ajustar a navegação aos rótulos dos portais. A tentativa anterior restaurou os valores antes de encerrar. A execução final reinicia apenas o backend temporário entre papéis, mantendo o middleware real de limite de logins. Nenhum limite, autenticação ou regra de autorização da aplicação foi modificado.

Verificações locais executadas:

- Backend: `node --test tests/perfil-profissional.test.cjs tests/perfil-edicao.test.cjs tests/usuarios-supabase-repository.test.cjs tests/autenticacao-http.test.cjs` — 80 aprovados, zero falhas.
- Frontend: `node --test tests/perfilProfissional.test.js tests/perfilEdicao.test.js tests/autenticacaoNavegacao.test.js tests/fornecedorIdentidades.test.js tests/useSessao.test.js tests/useNavegacao.test.js` — 55 aprovados, zero falhas. A execução precisou sair do sandbox por bloqueio de criação de processos EPERM.
- `npm.cmd run build` e `npm.cmd run lint` em `PI React` — aprovados.
- `node --check` nos dois scripts usados — aprovado.
- `git diff --check` — aprovado, com avisos de conversão LF/CRLF em arquivos preexistentes de outros trabalhos.

Arquivos alterados ou criados nesta validação:

| Arquivo | Mudança |
| --- | --- |
| `PI Backend/.env` | Acrescentada somente a flag; demais variáveis e bytes anteriores preservados |
| `PI Backend/scripts/validar-profissional-real.cjs` | Novo roteiro de validação real, auditoria somente leitura, testes de API/navegador e restauração |
| `PI Backend/scripts/perfil-navegador.cjs` | Navegação por papel e novo roteiro profissional; fluxo pessoal mantido |
| `PI Backend/evidencias/perfil-profissional-real-20261103.json` | Resultado estruturado sem credenciais |
| `PI Backend/evidencias/perfil-profissional-real-20261103.md` | Este relatório |

Artefato gerado: `PI React/dist`, reconstruído pelo build. As demais alterações que já existiam no workspace não pertencem a esta validação.

Não foram executadas migrações, mudanças de permissões, alterações em outras tabelas, alterações de credenciais ou commits. As escritas de teste foram restritas a `redes_sociais` e `dados_comerciais` das quatro contas, pela API autenticada. Os testes direcionados cobrem regressões de autenticação, autorização e perfil; não constituem uma validação manual de todas as telas existentes.

Pendência: repetir `Banco de dados/perfil_profissional.preflight.sql` em uma conexão SQL disponível e revisar também os grants por coluna para `anon`, `authenticated` e `service_role`. Não é necessário executar migração. A flag já estará ativa na próxima inicialização normal do backend; a leitura foi confirmada em processo novo durante esta validação.
