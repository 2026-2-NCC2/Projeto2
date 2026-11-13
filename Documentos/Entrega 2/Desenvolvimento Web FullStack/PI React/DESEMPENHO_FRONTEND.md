# F4 — carregamento e roteamento

## Diagnóstico e comparação

Build de produção medido com `npm.cmd run build` no Vite 8.3.0.
Valores em kB decimais; gzip conforme o relatório do Vite, com somas arredondadas.

| Recurso | Antes | Depois | Redução inicial |
| --- | ---: | ---: | ---: |
| JavaScript inicial, incluindo imports estáticos | 592,19 | 404,37 | 31,7% |
| JavaScript inicial gzip | 171,71 | 127,64 | 25,7% |
| CSS inicial | 172,51 | 86,92 | 49,6% |
| CSS inicial gzip | 26,97 | 15,80 | 41,4% |

O JavaScript inicial inclui o entry de 394,43 kB (123,81 gzip) e seu módulo
compartilhado `api` de 9,93 kB (3,83 gzip), listado no HTML como modulepreload.
O maior chunk passou a ser o próprio entry, abaixo de 500 kB. O limite de aviso
do Vite não foi alterado.

O bundle anterior carregava antecipadamente todos os perfis, incluindo as
listagens, painéis e relatórios administrativos. React DOM e React Router eram
os maiores módulos de infraestrutura; não foi identificada uma biblioteca
adicional de gráficos ou semelhante que justificasse remover dependências.

Há 14 chunks JavaScript gerados automaticamente, com compartilhamento entre
portais. As etapas do Organizador pertencem ao mesmo grupo; CriarEvento também
é compartilhado com o formulário administrativo. Não há divisão manual por
componente ou mudança no vite.config.js.

O total de JavaScript de todos os módulos é aproximadamente 598,27 kB, frente
a 592,19 kB antes. A soma gzip de todos eles é aproximadamente 184,46 kB,
frente a 171,71 kB antes. O CSS completo continua aproximadamente 172,51 kB;
compactar arquivos separados aumenta a soma gzip. O benefício medido é carregar
inicialmente menos recursos e baixar os demais conforme o perfil utilizado.
Não foram medidos tempo de interação, latência ou Core Web Vitals no navegador.

## Estado, falhas e recuperação

- Landing e Login continuam disponíveis no entry inicial.
- Participante, Fornecedor e Administrador carregam quando renderizados após
  a verificação existente de sessão e permissão.
- Layout e etapas do Organizador são exportados por um módulo compartilhado.
  Rascunhos, seleção do evento e confirmações continuam no App, sem extração
  ou remontagem da raiz ao trocar a URL.
- Perfil pessoal, cadastro e solicitação de acesso também usam import dinâmico.
- Os carregadores compartilham promessas concorrentes e reutilizam módulos
  bem-sucedidos. Cada componente lazy tem identidade estável entre renders.
- Suspense reutiliza o Skeleton existente. Falhas de importação recebem alerta,
  foco e ação explícita de nova tentativa, sem recarregar o documento ou limpar
  a sessão. A tentativa gera um novo tipo lazy para não reutilizar uma rejeição
  que o React tenha armazenado.
- Exceções de renderização que não sejam de importação seguem para o limite
  de erro externo; não são classificadas como falhas de rede.
- Uma falha permanente de publicação de assets ou avaliação do módulo ainda
  exige diagnóstico da entrega. A nova tentativa não muda URLs dos chunks,
  não altera autenticação e não contorna permissões.

## React Router

As antigas rotas filhas não tinham element e não eram consumidas por Outlet.
O App já compõe as telas a partir de usePaginaRoteada e dos contratos centrais.
A configuração agora possui uma rota contêiner `*`, mantendo a mesma instância
do App entre os caminhos. createHashRouter, useBlocker e a History API do Router
continuam ativos. Os caminhos, parâmetros e seções válidos são verificados em
`src/router/contratos.js`; desconhecidos continuam na página 404 e acessos
protegidos seguem a validação de sessão/403 existente.

Não há filtro de warnings em produção. O teste de regressão captura os avisos
para comprovar que as rotas reais não emitem mais o aviso de folha sem element.

## Verificação

- Suíte React: 927 aprovados, nenhuma falha ou skip.
- ESLint e build de produção aprovados.
- Testes reais de Router preservam acesso direto, remontagem equivalente a F5,
  Voltar/Avançar, saída recusada com rascunhos, sessões e os quatro perfis.
- Testes novos cobrem importação adiada, falha, foco, retry, cache, remontagem,
  preservação de estado e composição efetiva do build.
- O teste de importação com falha deliberada produz um erro esperado no console
  do React e comprova a recuperação pelo Error Boundary.

A inspeção visual e a avaliação de desempenho em navegador real permanecem
pendentes. Nenhum backend, flag, banco remoto ou migração foi alterado.
