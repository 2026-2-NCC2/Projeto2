# TrocaTicket — guia de demonstração presencial (F5)

Preparação verificada em 12/11/2026. Apresentadores: Lucas, Carlos Eduardo
(Cadu) e Guilherme. Este guia não executa comandos nem cria dados.

## 1. Situação e limites

- Frontend e API rodam no notebook. No modo principal, autenticação e dados
  persistidos dependem de internet e do único projeto Supabase compartilhado
  entre desenvolvimento e testes, identificado como produção pelo código.
- Rodar em localhost não isola o banco. Inscrever-se, salvar evento/custos,
  publicar cotação, enviar/avaliar proposta, editar perfil e decidir solicitações
  podem escrever no Supabase.
- O F5 não realizou login remoto, consulta autenticada, alteração de registro,
  migração ou preparação de dados. Não iniciou nem reiniciou o backend.
- Ações de escrita do roteiro abaixo ficam condicionadas a um ambiente real
  local isolado com dados sintéticos, previamente validado. Se não estiver
  disponível, apresentar consultas autorizadas e os formulários sem confirmar
  gravações. Não tratar essa apresentação limitada como ensaio ponta a ponta.
- Não preparar o ambiente usando dumps de origem não confirmada. Não executar
  testes do frontend como se fossem um sistema de demonstração conectado:
  suas APIs sintéticas servem exclusivamente à verificação automatizada.

## 2. Inicialização no notebook

Executar a partir da pasta deste documento, com dois terminais PowerShell.
Versões verificadas: Node.js 24.21.0 e npm 11.19.0. O backend usa
`node --use-system-ca server.js`; manter Node 24 e a validação TLS.

Se as dependências ainda não estiverem instaladas, executar `npm.cmd ci` em
**cada** pasta, antes da feira e com rede disponível. Usar os lockfiles atuais;
não atualizar dependências no momento da apresentação. Não há pacote npm na
pasta intermediária deste documento.

### Terminal 1 — backend

```powershell
Set-Location 'PI Backend'
npm.cmd start
```

Antes de executar, conferir que não existe outra instância usando a porta 3001.
Se a API já estiver funcionando, reutilizá-la; não matar processos desconhecidos.

O `.env` privado existente precisa fornecer:

| Variável | Requisito |
| --- | --- |
| `DB_PROVIDER` | `supabase`, conforme a ativação atual |
| `SUPABASE_URL` | URL HTTPS do projeto já autorizado; não trocar o destino |
| `SUPABASE_SECRET_KEY` | Secret key de backend, nunca enviada ao frontend |
| `JWT_SECRET` | Segredo privado com pelo menos 32 caracteres |
| `PORT` | 3001, ou ausente para usar o padrão |

Variáveis já definidas no terminal prevalecem sobre o `.env`. O exemplo
versionado contém campos vazios e não substitui a configuração privada completa.
Não copiar credenciais para este documento, slides, capturas ou variáveis `VITE_*`.

Preservar os manifestos `config/ativacao-supabase.json` e
`config/ativacao-imagens.json`, assim como as guardas de startup. A ativação de
imagens atual pode fazer verificações e iniciar limpeza em quarentena no startup;
`npm start` não é uma verificação de banco somente leitura. Não reiniciar a API
para contornar bloqueios de supervisor ou falhas de preflight.

Manter `ADMIN_EVENTOS_CRIACAO_ATIVA` e `ADMIN_PERFIS_GESTAO_ATIVA` ausentes ou
`false`. Não alterar essas flags ou habilitar flags de homologação para a feira.

### Terminal 2 — frontend

```powershell
Set-Location 'PI React'
npm.cmd run dev -- --host localhost --port 5173 --strictPort
```

Abrir **http://localhost:5173/#/inicio**. A API principal está fixada em
`http://localhost:3001`. O CORS do backend permite `http://localhost:5173`:
não aceitar silenciosamente outra porta, nem trocar a origem por `127.0.0.1`.

Para apresentar o build de produção, usar no lugar do servidor de desenvolvimento:

```powershell
Set-Location 'PI React'
npm.cmd run build
npm.cmd run preview -- --host localhost --port 5173 --strictPort
```

Executar apenas um dos dois servidores frontend. A porta padrão de preview
(4173) não corresponde ao CORS atual. Não abrir `dist/index.html` por `file://`.
Manter o servidor aberto: módulos sob demanda precisam ser servidos localmente.

### Conferência simples, sem consultar dados de negócio

```powershell
Invoke-RestMethod -Uri 'http://localhost:3001/'
(Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5173/').StatusCode
```

Esperado: `Backend do TrocaTicket funcionando!` e HTTP 200. A raiz da API confirma
o processo HTTP, não a conectividade do Supabase. `/eventos` sem token deve
recusar acesso com 401; isso também não comprova que o banco esteja acessível.
Login e consultas autenticadas precisam de ensaio manual autorizado separado.

## 3. Sessões dos quatro perfis

Preferir quatro perfis de navegador já disponíveis, identificados como
Participante, Organizador, Fornecedor e Administrador, ou navegadores distintos.
Entrar com uma conta própria de cada perfil e conferir a identidade no cabeçalho.

A sessão usa `sessionStorage`, normalmente separado por aba. Duplicar uma aba
autenticada ou abrir por uma janela com opener pode copiar a sessão inicial:
não usar duplicação como procedimento de isolamento. Se usar abas, criar cada
uma do zero, abrir a página inicial e autenticar a conta correta. Evitar login
e logout cruzados durante a fala; não projetar senhas, tokens ou DevTools com
cabeçalhos Authorization.

A seleção visual de perfil no Login só apresenta o portal. O servidor determina
o acesso efetivo. Não escolher “Administrador” esperando elevar uma conta comum.

## 4. Dados necessários — preparação futura exclusivamente isolada

Nenhum dos registros abaixo foi criado pelo F5. A existência, origem fictícia
e autorização das contas atuais ainda precisam de confirmação humana.

| Conjunto sintético | Finalidade e pré-condições |
| --- | --- |
| Quatro contas distintas | Um perfil canônico por conta: participante, organizador, fornecedor e admin; credenciais privadas |
| Evento futuro ativo | Pertence ao Organizador demo; disponível ao Participante, com inscrição autorizada e vagas quando houver controle de capacidade |
| Evento em planejamento | Pertence ao mesmo Organizador; início futuro em America/Sao_Paulo, dados editáveis e custos válidos |
| Custos do evento | Exemplo local: áudio R$ 1.000,00 e estrutura R$ 500,00, público previsto de 100 pessoas |
| Cotação disponível | Relacionada ao evento, com itens, modalidade e estado distintos, prazo futuro e retornada ao Fornecedor pela API |
| Proposta do Fornecedor | Vinculada à cotação e ao fornecedor correto, com valor, condições e detalhes técnicos fictícios |
| Solicitação de acesso | Pedido pendente fictício para demonstrar consulta e filtros do Administrador |
| Histórico opcional | Inscrição confirmada e propostas em estados já existentes, sem inventar transições ou séries históricas |

Exemplo de cálculo exclusivamente sintético: custos de R$ 1.500,00 / 100 pessoas
= R$ 15,00 de equilíbrio; acréscimo de 20% sobre os custos resulta em R$ 18,00
por participante. Isso não representa preço cobrado, margem líquida ou receita.

Não fixar IDs no roteiro. Anotar privadamente os IDs retornados pelo ambiente
isolado e confirmar os vínculos. Usar data pelo menos sete dias à frente do dia
da apresentação e prazo de cotação ainda válido. Capacidade máxima só deve ser
demonstrada quando disponibilizada pela capacidade real instalada.

### Limitação atual de isolamento

O contexto Docker é `desktop-linux`, mas o daemon Linux não estava acessível
no F5. A imagem `postgres:17` também não pôde ser verificada. Nenhum container
ou integração PostgreSQL foi iniciado, e nenhum opt-in foi habilitado.

As fixtures PostgreSQL dos testes são descartáveis; não constituem um backend
completo de demonstração. O inicializador histórico
`scripts/iniciar-backend-isolado.cjs` é específico de MariaDB local, com identidade
e configuração privada próprias; não é uma réplica automática do Supabase nem
comprova as RPCs PostgreSQL. Não trocar DB_PROVIDER, relaxar guardas ou usar mocks
para aparentar que os fluxos persistentes estão funcionando.

Antes de demonstrar gravações, falta disponibilizar e ensaiar uma base local
compatível e sintética, com autorização e isolamento comprovados. Isso não foi
resolvido neste lote por alterações de configuração ou migrações.

## 5. Roteiro curto — aproximadamente 8 a 10 minutos

“Escrita isolada” significa executar apenas quando a condição acima tiver sido
atendida. No projeto compartilhado, limitar-se às consultas autorizadas e não
confirmar inscrições, salvamentos, publicações, propostas ou decisões.

| Quem / perfil | Tela e ação | Resultado esperado | Retorno em caso de falha |
| --- | --- | --- | --- |
| Lucas / público | Abrir Landing e “Entrar no TrocaTicket” | Apresentação Coral e Login; explicar os três públicos e o acesso administrativo | Voltar à apresentação, sem trocar configurações |
| Cadu / Participante | Explorar eventos, pesquisar e abrir detalhes | Lista real filtrada; data, local, estado e disponibilidade do evento selecionado | Limpar busca e voltar à listagem |
| Cadu / Participante | Inscrever-se (escrita isolada), depois Meus ingressos | Confirmação somente após resposta da API; inscrição refletida na lista | Se incerto, consultar Meus ingressos antes de repetir; se indisponível, explicar o bloqueio |
| Cadu / Participante | Abrir Perfil | Dados da própria conta e ações autorizadas | Voltar a Explorar eventos sem editar dados |
| Lucas / Organizador | Dashboard e evento em planejamento | Indicadores da consulta e evento selecionado identificado nas etapas | Atualizar consulta ou retornar a Meus eventos |
| Lucas / Organizador | Novo evento: demonstrar rejeição de início passado e corrigir para data futura | Mensagem junto ao campo; avanço após salvamento confirmado (escrita isolada) | Preservar campos e corrigir; se gravação incerta, consultar a listagem antes de reenviar |
| Lucas / Organizador | Custos: adicionar item ao rascunho e explicar salvar separadamente | Total recalculado; persistência apenas em “Salvar custos no banco” (escrita isolada) | Aplicar/cancelar o formulário; não descartar rascunho sem conferir |
| Lucas / Organizador | Ticket: alterar acréscimo de 0% para 20% | Recálculo imediato com dados disponíveis; simulação não salva nem confirma pagamentos | Voltar aos custos; público/custos inválidos bloqueiam o cálculo |
| Lucas / Organizador | Cotações e propostas recebidas | Itens, prazo, modalidade e estados reais; publicação só após custos confirmados (escrita isolada) | Consultar cotação existente; não repetir publicação com resultado incerto |
| Cadu / Fornecedor | Oportunidades, pesquisa e elaborar proposta | Cotação identificada; formulário com condições e detalhes técnicos | Limpar busca ou voltar para oportunidades |
| Cadu / Fornecedor | Enviar proposta (escrita isolada) e abrir propostas enviadas | Registro após confirmação e acompanhamento do estado | Consultar histórico antes de repetir; valores não representam pagamentos |
| Guilherme / Administrador | Dashboard, Solicitações, Usuários e Eventos | Contagens reais, busca, filtros, detalhes e painel do evento | Limpar filtros, atualizar lista ou “Entrar novamente” em 401 |
| Guilherme / Administrador | Cotações, Propostas e Relatórios | Cinco categorias; total consultado versus filtrado; períodos com significado explícito | Limpar filtros; erro/acesso negado não deve aparecer como zero |
| Lucas / encerramento | Abrir URL inexistente e voltar ao início | 404 dedicada, sem perder o contrato de navegação | Usar a ação da própria página |

Não executar aprovação/recusa administrativa na base compartilhada para criar
conteúdo de demonstração. Consultar os detalhes já autorizados. Não usar cancelar,
encerrar ou excluir como método de limpeza da apresentação.

## 6. Disponibilidade e apresentação honesta

- **Fluxos existentes:** eventos, inscrições, perfil, planejamento de custos,
  simulação de ticket, cotações, propostas, consultas administrativas e relatórios.
  A disponibilidade concreta depende de sessão, dados, capacidades e serviços.
- **Desativados:** Novo evento administrativo (A7) e gerenciamento administrativo
  de perfis (A10). Não habilitar nem apresentar como operacionais.
- **Não oferecer:** pagamento, checkout, faturamento, revenda, QR Code, contratos
  assinados, gráficos/CSV de relatórios, busca global ou notificações inexistentes.
- **Login:** SSO, recuperação de senha e lembrar dispositivo continuam
  indisponíveis; mostrar/ocultar senha funciona localmente.
- **Cadastro:** continua condicionado à publicação e validação dos Termos de Uso;
  não cadastrar contas na feira nem ocultar os avisos de minuta.
- **Imagens e portfólio:** dependem das capacidades e configuração atuais;
  Storage não é disponibilizado por iniciar o frontend. Usar os fallbacks reais
  quando indisponíveis e não alterar flags para preencher a demonstração.
- **Sem internet:** Landing, formulário de Login e 404 podem ser apresentados
  com o servidor local ativo. Login, consultas e gravações do modo Supabase
  não se tornam offline. Módulos em cache não substituem o banco.

## 7. Checklist pré-feira e recuperação

- [ ] Notebook com dependências instaladas, carregador e rede de internet testada.
- [ ] Confirmar o ambiente e a origem fictícia dos dados, antes de projetá-los.
- [ ] API em localhost:3001 e um frontend em localhost:5173, sem conflito de porta.
- [ ] Login manual das quatro contas, identidade correta e consultas autorizadas.
- [ ] Ensaio de inscrições, salvamentos e propostas somente no ambiente isolado
      real; se ausente, combinar previamente a versão limitada da apresentação.
- [ ] Confirmar A7/A10 desativados e não executar SQL de preparação.
- [ ] Visitar os quatro portais para verificar os módulos antes da fala; não
      prometer que esse aquecimento elimina dependências de rede.
- [ ] Conferir Landing, Login, 404/403 e portais em desktop, 320, 375, 390 e 768px,
      mais zoom de 200%; tabelas devem rolar dentro do contêiner.
- [ ] Testar menus, Escape, foco visível, mensagens de validação e retorno do foco.
- [ ] F5, Voltar/Avançar e saída com rascunho: testar a recusa e a confirmação
      somente com dados locais descartáveis; F5 pode perder valores não salvos.
- [ ] Conferir Console e Network sem exibir tokens/corpos pessoais ao público.
      401 exige novo login; 403 não se resolve mudando a seleção visual de perfil.
- [ ] Em falha de módulo, usar “Tentar novamente”, sem repetir uma operação de
      gravação. Em resultado incerto, consultar o recurso antes de qualquer reenvio.
- [ ] Em falha TLS, preservar certificados e guardas; não desabilitar a validação.
- [ ] Em falha persistente, interromper aquele fluxo e explicar a dependência;
      não simular sucesso, importar dumps ou executar migrações durante a feira.

## 8. Evidências e pendências do F5

| Verificação | Resultado deste lote |
| --- | --- |
| React completo | 927 aprovados; zero falhas/skips |
| ESLint e build | Aprovados; sem avisos de bundle acima de 500 kB ou rotas vazias |
| HTTP local | API raiz 200; `/eventos` sem autenticação 401; frontend 5173 não estava iniciado |
| Configuração privada | `.env` presente e campos necessários preenchidos; valores não exibidos; isso não valida credenciais remotamente |
| A7/A10 | Flags ausentes na configuração efetiva observada, portanto desativadas por padrão |
| Docker/PostgreSQL | Daemon Linux indisponível; integrações reais não executadas |
| Backend | Nenhum código alterado; baseline anterior de 1.729 aprovados e 20 skips não foi reexecutado neste lote |
| Navegador | Controle web indisponível; inspeção visual, Console/Network e ensaio autenticado não realizados |

As regressões locais cobrem busca, filtros, detalhes, inscrições, propostas,
custos, recálculo do ticket, validação de datas em São Paulo, módulos sob demanda,
sessões, permissões e navegação. Executam componentes e/ou HTTP com dependências
sintéticas de teste; não comprovam a integração atual com o projeto remoto.

Para repetir a validação do frontend:

```powershell
Set-Location 'PI React'
node --test tests/*.test.js
npm.cmd run lint
npm.cmd run build
git diff --check
```

Integrações PostgreSQL pertinentes continuam pendentes de Docker local isolado:
`tests/eventos-gestao.test.cjs` e `tests/eventos-capacidade-sql.test.cjs`, com
opt-ins próprios. Não habilitar esses opt-ins neste roteiro, apontar testes a
bancos existentes ou considerar skips como aprovação. A7/A10 não precisam ser
ativados para apresentar os fluxos autorizados do Organizador.

**Conclusão:** preparação técnica local e roteiro documentados. A apresentação
completa com operações persistentes ainda depende do ensaio visual, das contas
e dados confirmados e de um ambiente isolado real disponível para as gravações.

## 9. Atualização operacional F6 — 12/11/2026

Esta seção atualiza o estado observado no F5; não certifica a integração remota.

| Verificação real local | Resultado F6 |
| --- | --- |
| Frontend | Já ativo em `http://localhost:5173/`; HTTP 200, identidade TrocaTicket e cliente Vite presentes; não foi iniciada segunda instância |
| API | Já ativa em `http://localhost:3001/`; HTTP 200 na raiz e 401 em `/eventos` sem token; não foi reiniciada |
| CORS | OPTIONS local retornou 204, com origem `http://localhost:5173` permitida |
| Recursos frontend | `main.jsx`, `RouterAplicacao.jsx`, `carregamento/portais.jsx` e `pages/organizador/modulo.jsx` responderam 200 com transformação Vite |
| Configuração privada | Provedor Supabase e destino compatíveis com o manifesto; campos de credenciais presentes, porta compatível e TLS não desabilitado; valores não divulgados |
| A7/A10 | Configuração efetiva observada mantém ambos desativados |
| Docker | Daemon Linux indisponível; nenhuma alteração de configuração, container ou migração |
| Ambiente isolado histórico | Arquivos privados de configuração e PID MariaDB existem, mas sem serviços escutando em 3107/3307; PID file não comprova processo ativo ou origem sintética dos dados |
| Navegador | Controle web indisponível; nenhuma inspeção visual ou autenticação executada |

Os GETs aos arquivos de código só comprovam sua entrega pelo servidor Vite.
Não comprovam importação dinâmica bem-sucedida no navegador, execução React,
responsividade, restauração de sessão ou ausência de erros no Console/Network.
Nenhuma credencial de teste foi usada, nenhum JWT foi enviado e nenhum endpoint
autenticado ou registro de negócio foi consultado no F6. Presença da configuração
não comprova conectividade, validade das credenciais ou disponibilidade das RPCs
no Supabase. As leituras locais de configuração não alteraram flags ou arquivos
privados, e não acessaram o provedor remoto.

Não foi encontrada falha de execução comprovada que justificasse mudança no
código. Apenas esta documentação foi atualizada. A suíte React, ESLint e build
do F5 permanecem como a última execução (927 aprovados); não foram repetidos no
F6 porque não houve alteração de implementação. `git diff --check` foi repetido.

### Checklist restante para a apresentação

1. Abrir `http://localhost:5173/#/inicio`, conferir Landing, Login e uma URL
   inexistente; manter os serviços atuais enquanto estiverem saudáveis.
2. Em sessões independentes, usar somente contas fictícias já autorizadas e
   conferir identidade, perfil, carregamento e consultas. Não criar contas.
3. Percorrer as telas do roteiro sem confirmar gravações no projeto compartilhado.
   Verificar especialmente Novo evento → Custos → Ticket → Cotações, sem salvar.
4. Testar F5, Voltar/Avançar, logout e nova sessão; conferir a recusa de saída com
   rascunho local antes de descartar algo. Não presumir que F5 preserve rascunhos.
5. Conferir Console/Network, desktop, 320/375/390/768px e zoom de 200%, sem
   projetar credenciais, tokens ou conteúdo pessoal.
6. Manter inscrições, propostas e demais gravações pendentes até existir um
   ambiente local real, sintético e validado. Não usar os arquivos históricos,
   fixtures de testes ou portas vazias como evidência de isolamento pronto.
