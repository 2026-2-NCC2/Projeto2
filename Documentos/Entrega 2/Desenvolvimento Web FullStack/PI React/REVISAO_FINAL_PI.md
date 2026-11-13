# PI.3 — Revisão final dos requisitos e responsividade

## Resultado e limites

Revisão local dos PI.1/PI.2, com 39 casos estruturais adicionais nas larguras de
320px e 375px. A matriz mantém 390px, 768px e desktop já existentes, além de
larguras intermediárias. **Não houve inspeção visual real:** o host de acesso ao
navegador automatizado retornou indisponibilidade. jsdom e análise de CSS não
medem geometria, cortes, overflow efetivo, zoom ou qualidade visual.

Não foi identificado defeito estrutural comprovado que justificasse mudar o CSS
ou redesenhar painéis. Nenhum código de produção, regra de negócio ou estilo foi
alterado neste lote. Uma expectativa do teste do Participante foi corrigida para
reconhecer a regra de uma coluna já existente em `max-width: 340px`; foi mantido
também o teste específico desse breakpoint.

O contexto Docker é `desktop-linux`, mas o daemon Linux não estava disponível
(pipe `dockerDesktopLinuxEngine` ausente). A imagem `postgres:17` não pôde ser
verificada por esse motivo. Nenhum container foi iniciado e nenhuma integração
PostgreSQL real foi executada. Não houve tentativa de alterar configurações.

## Feedback do professor versus implementação

| Requisito | Situação | Evidência concreta |
| --- | --- | --- |
| Organizador responsivo, sem sidebar fixa no celular | Implementado; aprovação visual pendente | `Layout.jsx`, `OrganizadorLayout.css`: sidebar sticky no desktop, estática e recolhível abaixo de 1000px; ajuste adicional em 340px; grid com `minmax(0,1fr)` e conteúdo com min-width zero. `organizadorLayout.test.js` verifica menu, Escape, foco e breakpoints. |
| Conteúdo sem cortes/overflow horizontal | Estrutura automatizada aprovada; medição visual pendente | CSS local de Dashboard/Gerenciamento/Acabamento; tabelas com rolagem interna no `App.css`; testes de conteúdo e dos quatro perfis. Não se oculta o overflow da página para mascarar problemas. |
| Dados reais e consumo assíncrono de API | Concluído no código e testes locais | `services/eventos.js`, `useCustosPersistidos.js`, `useConsultaAdmin.js` e consultas de propostas. `organizadorDadosReais.test.js` verifica ausência dos antigos valores simulados e bloqueio de estimativas sem dados. Não houve consulta remota nesta revisão. |
| Carregamento, erro, vazio e nova tentativa | Concluído localmente | `Skeleton`, `Alerta`, `EstadoVazio`, estado da consulta em `App.jsx`, `useConsultaAdmin.js`; regressões em `auditoria4B`, `organizadorDashboard`, `organizadorVisual` e testes administrativos. |
| Navegação altera a URL e usa React Router | Concluído localmente | React Router 7.18.5, `router/RouterAplicacao.jsx`, `createHashRouter` e `RouterProvider`. `useNavegacao.js` adapta os callbacks para o Router, sem listeners ou índices próprios de histórico. |
| Endereços inexistentes não voltam silenciosamente ao login | Concluído localmente | `PaginaNaoEncontrada.jsx`: 404 preserva a URL e oferece saída segura. Seções/parâmetros inválidos são rejeitados por `router/contratos.js`. Rota protegida sem sessão mostra login; outro perfil recebe apresentação distinta de acesso não autorizado. |
| Página 404 dedicada | Concluído localmente; aparência pendente | Identidade Coral, h1 único, foco no título, título da aba e links seguros. Testes reais de Router/DOM em `historicoNavegacao.test.js`. |
| Login autentica credenciais reais | Concluído no código e testes locais | `POST /login` busca usuário, compara bcrypt e emite JWT HS256; middleware consulta o perfil atual para autorizar. `autenticacao-http.test.cjs` e regressões dos quatro perfis. Seleção visual de perfil não concede autorização. |
| Rejeitar criação com início passado/igual ao atual | Concluído no código e testes locais; SQL real não reexecutado | `utils/validarEvento.js`, `CriarEvento.jsx`, `services/eventos.cjs` e endpoints de criação. America/Sao_Paulo, data+horário e relógio controlado. RPC v1/v3 permanece como proteção transacional final, sem alteração do SQL. |
| Validações com mensagens próprias | Concluído localmente; uso visual/leitor de tela pendente | `Campo`, aria-invalid/aria-describedby, foco no primeiro erro, noValidate, alerta de API sem apagar valores e trava de envio. `validacaoEvento.test.js` e `validacao-eventos.test.cjs`. Edição publicada histórica preservada. |
| Separação de componentes | Concluído | Páginas por perfil, componentes de layout/UI, hooks, serviços, utilitários e repositórios. `App.jsx` tem 698 linhas e `server.js`, 1185; reduzir responsabilidades permanece melhoria opcional. |
| Busca e filtros de eventos | Preservados e aprovados localmente | `Eventos.jsx`, `organizadorDashboard.test.js`, `organizadorGerenciamento.test.js`: busca por nome, filtros de estado, vazio e sem resultados; resumo da conta não é confundido com total filtrado. |
| Ticket e controle de margem/acréscimo | Preservados e aprovados localmente | `Ticket.jsx` e `organizadorDadosReais.test.js`: custos 100/público 10 resulta em ticket 10; acréscimo de 30% recalcula para 13. Trata-se de acréscimo sobre custos, não margem sobre faturamento. |
| Fornecedor/Admin responsivos | Estrutura automatizada aprovada; visual pendente | `FornecedorLayout.css`, `AdminLayout.css`, tabelas/menus/modais e respectivas suítes em 320, 375, 390, 768 e desktop. |

## Validações executadas

| Verificação | Resultado |
| --- | --- |
| React completo | 909 aprovados, zero falhas/skips |
| Backend completo | 1729 aprovados, zero falhas, 20 skips |
| ESLint | Aprovado |
| Build | Aprovado; aviso de chunk JavaScript acima de 500 kB |
| git diff --check | Aprovado |
| Inspeção visual/zoom 200% | Não executada: host do navegador indisponível |
| PostgreSQL real local | Não executado: daemon Docker Linux indisponível |

Os 20 skips são oito comparações históricas e 12 integrações opcionais; não são
evidência de aprovação PostgreSQL. O build gerou aproximadamente 587 kB de JS
(170 kB com gzip). Não foi alterado o limite do aviso para escondê-lo.

A suíte completa abrange criação futura, rejeição de agenda passada, erro de
API/rede e nova tentativa, preservação de valores, custos, ticket e acréscimo,
Router, 404, acesso direto e remontagem equivalente à inicialização após F5,
Voltar/Avançar, sessão, logout, permissões e confirmações de rascunhos. Fluxos de
escrita foram testados com mocks/fixtures; não foram executados contra o Supabase.

Os detalhes de sessão e histórico do PI.1 e a explicação de 836 → 816 testes
permanecem em [VALIDACAO_EVENTOS.md](VALIDACAO_EVENTOS.md). Os 39 casos de largura
deste lote elevam o baseline PI.2 de 870 para 909; são testes de regras CSS e
estrutura, não screenshots ou simulação de zoom.

## Checklist visual manual curto

Usar ambiente local isolado e dados fictícios. Não utilizar o projeto compartilhado
para gravar eventos, inscrições ou decisões administrativas nesta revisão.
Conferir **320, 375, 390, 768 e 1440px de largura CSS**, além de zoom real de 200%
no desktop. Não considerar o teste estrutural de 720px prova de zoom.

| Páginas | Resultado esperado | Estado |
| --- | --- | --- |
| Organizador: Meus eventos, criar/editar, custos, cotações e ticket | Menu abre/fecha, Escape retorna foco, navegação mantém seção; cards e textos longos quebram; campos/erros e botões ficam acessíveis; apenas tabelas rolam horizontalmente. | Pendente |
| Participante: explorar/detalhes, ingressos e perfil | Menu recolhível, cards/dados longos sem corte; foco e ações utilizáveis. | Pendente |
| Fornecedor: mural, elaboração, propostas e perfil/portfólio | Campos e botões sem sobreposição; tabelas com rolagem interna; menu e foco preservados. | Pendente |
| Admin: resumo, solicitações, eventos/painel, usuários, cotações, propostas e relatórios | Sidebar/menu e filtros acessíveis; modais cabem na altura, com foco contido; tabelas rolam internamente. Novo evento e gestão de perfis permanecem bloqueados. | Pendente |
| Landing, Login e 404 | Textos e ações cabem em 320px, tabulação/foco visíveis; 404 mantém URL inválida, foca título e permite voltar ao início/portal. | Pendente |
| Todas, com teclado e zoom 200% | Sem controles encobertos, corte de texto ou rolagem horizontal da página; conteúdo continua alcançável. | Pendente |

No formulário, conferir campos obrigatórios, ontem, hoje com horário passado/igual
e horário futuro. A validação deve impedir os inválidos antes do POST e preservar
os campos. Testar envio futuro somente no ambiente isolado autorizado. Custos e
ticket devem usar valores sintéticos conhecidos (100/10 e acréscimo de 30%).

## Arquivos deste lote e pendências

Foram ampliadas somente as matrizes de largura dos testes:
`organizadorLayout`, `organizadorDashboard`, `organizadorGerenciamento`,
`participanteVisual`, `fornecedorLayout`, `adminLayout`, `adminCatalogos`,
`adminRelatorios`, `adminVisaoGeral`, `administrador`, `landingPage`,
`conteudoResponsivo` e `estruturaResponsiva`, além deste relatório.
As alterações anteriores foram preservadas; não houve exclusão adicional.

**Pendências de verificação:** executar o checklist visual e, quando o Docker
local estiver disponível, reexecutar as integrações PostgreSQL pertinentes ao
PI.2 exclusivamente em containers descartáveis. Isso não autoriza migração ou
teste remoto. Não se declara funcionamento visual ou integração remota aprovada.

**Melhorias opcionais:** dividir o bundle, reduzir a coordenação concentrada em
App/servidor e ampliar automação visual futura. Não foi identificada falta de
implementação nos requisitos funcionais auditados que exija novo recurso neste lote.
O fechamento visual permanece condicionado à inspeção manual.

A7/A10 continuam desativados, sem alterações de flag. Não houve acesso remoto,
migração, backup real, mudança no Windows/Docker, commit, push ou deploy.
