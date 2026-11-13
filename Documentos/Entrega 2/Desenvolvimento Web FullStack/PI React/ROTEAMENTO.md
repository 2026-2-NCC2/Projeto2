# PI.1 — Rotas com React Router

O frontend utiliza React Router 7.18.5 com **data HashRouter**, criado por
`createHashRouter` e fornecido por `RouterProvider`. Esta é a variante por hash
que disponibiliza `useBlocker`, necessário para preservar as confirmações de saída
dos rascunhos em Voltar/Avançar. Não existe um segundo controlador de histórico.

Referências oficiais: [createHashRouter](https://reactrouter.com/api/data-routers/createHashRouter)
e [useBlocker](https://reactrouter.com/api/hooks/useBlocker).

## Organização

- `src/router/RouterAplicacao.jsx`: árvore central de rotas. O App é o layout
  persistente entre caminhos, sem remontar os portais por mudança de query.
- `src/router/contratos.js`: caminhos, parâmetros permitidos e validação de seções
  e IDs. Um caminho ou combinação inválida resulta em 404.
- `src/hooks/useNavegacao.js`: adaptação dos callbacks existentes para
  `useLocation`, `useNavigate` e `useBlocker`. Não registra `popstate`, não chama
  `pushState`/`replaceState` diretamente e não mantém índices de histórico próprios.
- `src/pages/publicas/PaginaNaoEncontrada.jsx`: 404 e apresentação distinta de
  acesso não autorizado (403), com foco no título, título da aba e retorno seguro.

## Contratos preservados

Os caminhos continuam na parte hash, sem exigir rewrite do servidor para novos
links internos:

| Contexto | Caminhos |
| --- | --- |
| Público | `/#/`, `/#/inicio`, `/#/entrar`, `/#/cadastro` |
| Participante | `/#/participante`, `?secao=inicio`, `eventos`, `detalhes&evento=ID`, `ingressos`, `perfil` |
| Organizador | `/#/eventos`, `/#/criar`, `/#/custos`, `/#/cotacao`, `/#/ticket`, `/#/perfil`, `/#/solicitar-acesso` |
| Contexto de evento | `?evento=ID` em criar, custos, cotacao e ticket |
| Administrador | `/#/admin`, `?secao=inicio`, `contas`, `eventos`, `usuarios`, `cotacoes`, `propostas`, `relatorios`, `perfil`, `painel`, `novo-evento` |
| Detalhes administrativos | `?secao=painel&evento=ID`, `?secao=cotacoes&cotacao=ID` |
| Fornecedor | `/#/fornecedor-mural`, `fornecedor-proposta`, `fornecedor-enviadas`, `fornecedor-cotacoes`, `fornecedor-contratos`, `fornecedor-catalogo`, `fornecedor-desempenho`, `fornecedor-perfil`; parâmetro `?cotacao=ID` preservado |
| Transparência | `/#/privacidade`, `/#/termos`, `/#/contato-privacidade`, `/#/preferencias-privacidade` |

As seções da tabela são valores de `secao`, não caminhos adicionais. URLs legadas
de transparência sem hash continuam sendo atendidas por `EntradaAplicacao`; como
antes, acesso HTTP direto a esses caminhos depende da hospedagem servir a entrada
da aplicação. Os novos caminhos por hash dispensam essa configuração. As âncoras
`#lp-*` da Landing Page permanecem válidas. Os sumários de transparência movem foco
sem substituir a rota.

## Sessão e comportamento

A Landing Page permanece pública, mesmo com sessão existente. A URL é a fonte de
verdade; `paginaAtual` não substitui um endereço desconhecido por uma tela salva.
Uma rota inexistente, seção inválida ou parâmetro inválido mostra 404 e conserva
o endereço. Um caminho protegido válido sem sessão mostra login; com outro perfil,
mostra acesso não autorizado. Nenhuma dessas telas exibe conteúdo privado.

Autenticação e autorização do backend não foram alteradas. Mantêm-se skeletons de
validação e de restauração assíncrona do evento, tratamento de respostas obsoletas,
confirmações de descarte e limpeza da sessão no logout. F5 restaura seção e ID,
mas não recupera dados de formulário não salvos. Um ID válido cujo evento esteja
indisponível conserva o comportamento anterior de retorno a Meus eventos; isso é
diferente de uma rota inexistente.

As ações já aprovadas pelo guard do App são marcadas com um booleano no estado do
Router; POP sempre revalida a saída. Nenhum token, perfil, e-mail, payload ou
rascunho é armazenado na URL/estado do histórico. O encerramento ou recarregamento
do documento continua sujeito aos comportamentos já existentes; o bloqueio do
Router se aplica à navegação interna, não a abas externas.

Novo evento administrativo (A7) e gerenciamento de perfis (A10) não foram ativados:
as consultas de capacidades e os bloqueios existentes continuam em vigor.

## Validação

```powershell
node --test tests/historicoNavegacao.test.js tests/navegacaoUrls.test.js tests/autenticacaoNavegacao.test.js
node --test tests/*.test.js
npm run lint
npm run build
git diff --check
```

`tests/helpers/routerDom.js` executa React DOM, a árvore de produção e
`createHashRouter` reais em jsdom. Voltar/Avançar usa a History API do DOM, sem a
antiga fixture que reimplementava a pilha. APIs são substituídas por respostas
sintéticas; nenhuma credencial ou banco remoto é utilizado. A remontagem verifica
o equivalente à inicialização após F5, sem alegar um recarregamento visual real.

Os testes de contrato/validação e dos componentes internos continuam separados.
Os cenários antigos de pilha simulada foram substituídos por regressões com o
roteador real; a quantidade de casos não é diretamente comparável à suíte anterior.
Os testes em jsdom não verificam pixels, layout renderizado, zoom nem a integração
com o navegador do usuário. O build pode emitir aviso de chunk acima de 500 kB;
divisão de bundle fica como otimização futura, sem refatoração dos painéis neste lote.

Resultado local do PI.1: 816 testes React aprovados, zero falhas/skips; ESLint,
build e `git diff --check` aprovados. O build informou chunk JavaScript de
aproximadamente 583 kB antes de gzip (169 kB com gzip). O host de acesso ao
navegador estava indisponível; inspeção visual real permanece pendente.
