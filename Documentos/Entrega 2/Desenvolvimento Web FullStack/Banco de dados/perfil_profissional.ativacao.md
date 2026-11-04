Ativação manual do perfil profissional

1. Manter `PERFIL_PROFISSIONAL_ATIVO` ausente ou `false` no backend. Nenhuma configuração VITE é necessária.
2. Executar `perfil_profissional.preflight.sql` no SQL Editor, guardar resultados e revisar estrutura, políticas, permissões e triggers. Confirmar que usuários só são acessados pelo backend autenticado e que as novas colunas não ficarão acessíveis por grants genéricos indevidos. Não conceder acesso público para este recurso.
3. Revisar e executar manualmente `perfil_profissional.incremental.sql`. A transação adiciona somente duas colunas JSONB opcionais em `public.usuarios`, sem DEFAULT, backfill, DML, novas tabelas ou mudanças de RLS. SQL NULL representa ausência. Se já existirem colunas homônimas, revisar seus valores e dependências antes de aplicar. Objetos devem seguir os campos descritos abaixo.
4. Repetir o preflight, comparar contagem e estrutura e verificar que os registros existentes continuam com NULL nas colunas novas. A compatibilidade local foi verificada contra o schema versionado; a estrutura remota precisa dessa revisão manual.
5. Somente após aprovação e aplicação, definir `PERFIL_PROFISSIONAL_ATIVO=true` no ambiente privado do backend e reiniciar pelo fluxo de startup já utilizado. MySQL permanece bloqueado para este recurso.
6. Validar com contas autorizadas: GET/PATCH `/perfil/profissional`, salvar, recarregar, remover e conferir outra conta intacta. Essas escritas reais são uma etapa manual posterior. GET/PATCH `/perfil` permanecem independentes.

Contrato: GET retorna `id`, `perfil`, `redes_sociais`, `dados_comerciais`, `edicao_disponivel`. PATCH substitui integralmente cada seção enviada; seção omitida é preservada, `{}` ou `null` remove a seção. Não aceita ID no corpo. As duas seções são gravadas em um único UPDATE restrito ao ID autenticado, sem retry automático. Uma resposta incerta exige recarregar antes de reenviar.

Redes para todos os perfis: `instagram`, `linkedin`, `facebook`, `tiktok`, `site_pessoal`. Somente URLs HTTPS absolutas, sem credenciais, controles, espaços ou barras invertidas. Nenhum link é buscado pelo servidor.

Dados comerciais para fornecedor e organizador: `nome_comercial` (150), `descricao` (2000), `telefone_comercial` (30), `email_comercial` (150), `cidade` (120), `site_oficial` (HTTPS, 2048). O organizador vê o nome como nome da organização. Somente fornecedor aceita `categorias_servicos` (lista de até 20 textos distintos de até 80 caracteres). Categorias são informadas pelo usuário, sem catálogo inventado. Os demais perfis só editam redes. Validação e autorização ficam no backend, com o tipo de perfil consultado na autenticação, nunca no corpo/JWT isolado.

Desativação: remover a flag e reiniciar. Manter colunas e dados; não executar DROP. Não incluir credenciais Supabase no frontend. Nenhum script desta entrega aplica migrações ou altera usuários automaticamente.

Validação local em 03/11/2026

- Backend direcionado: `node --test tests/perfil-profissional.test.cjs tests/perfil-edicao.test.cjs tests/usuarios-supabase-repository.test.cjs tests/autenticacao-http.test.cjs`: 80 aprovados.
- Backend completo: `node --test tests/*.test.cjs`: 1.465 aprovados, zero falhas, 8 casos históricos já marcados como ignorados no projeto (equivalência estrita ICU). Resultado em `PI Backend/perfil-profissional-testes-backend.log`.
- Frontend completo: `node --test tests/*.test.js`: 236 aprovados, zero falhas.
- Frontend: `npm.cmd run lint` e `npm.cmd run build` aprovados.
- `git diff --check` sem erros de whitespace.
- Testes do novo recurso usam transportes simulados e fixtures exclusivamente locais. Cobrem os quatro papéis, autenticação, isolamento entre contas, remoção, preservação da seção omitida, URLs e limites, schema ausente, falhas de persistência, confirmação inconsistente, bloqueio padrão, formulários e compatibilidade pessoal.
- Nenhuma migração foi executada, nenhum registro remoto foi alterado e nenhum commit foi criado. Não houve validação em PostgreSQL/Supabase real ou inspeção visual em navegador nesta etapa. A compatibilidade SQL foi revisada estaticamente contra o schema versionado e coberta por testes de ausência de colunas no transporte simulado.

Arquivos criados ou alterados nesta entrega

O workspace já continha alterações da edição pessoal e de outros trabalhos. A relação abaixo identifica apenas arquivos tocados nesta implementação, preservando o conteúdo anterior.

| Área | Arquivos |
| --- | --- |
| SQL e ativação, novos | `Banco de dados/perfil_profissional.preflight.sql`, `Banco de dados/perfil_profissional.incremental.sql`, `Banco de dados/perfil_profissional.ativacao.md` |
| Backend, novos | `PI Backend/perfil-profissional.cjs`, `PI Backend/repositories/supabase/perfil-profissional.cjs` |
| Backend, integração | `PI Backend/perfil.cjs`, `PI Backend/server.js`, `PI Backend/repositories/supabase/usuarios.cjs` |
| Frontend, novos | `PI React/src/components/perfil/PerfilProfissional.jsx`, `PI React/src/services/perfilProfissional.js` |
| Frontend, integração e estilos | `PI React/src/components/perfil/PerfilPessoal.jsx`, `PI React/src/App.css` |
| Testes novos | `PI Backend/tests/perfil-profissional.test.cjs`, `PI React/tests/perfilProfissional.test.js` |
| Testes existentes, composição/inventário | `PI Backend/tests/helpers/http-autenticacao.cjs`, `PI Backend/tests/usuarios-supabase-repository.test.cjs`, `PI Backend/tests/leituras-supabase-incremento.test.cjs`, `PI Backend/tests/usuarios-pendencias-listagens-supabase.test.cjs`, `PI Backend/tests/banco-provider.test.cjs`, `PI Backend/tests/isolamento.test.cjs`, `PI Backend/tests/contratos.test.cjs`, `PI React/tests/perfilEdicao.test.js` |

Artefatos adicionais: log local da suíte backend acima e `PI React/dist` regenerado pelo build. Nenhum arquivo `.env` foi alterado.
