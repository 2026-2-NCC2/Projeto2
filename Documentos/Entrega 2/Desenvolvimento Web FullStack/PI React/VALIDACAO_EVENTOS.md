# PI.2 — Validação e mensagens de eventos

## Regras implementadas

`src/utils/validarEvento.js` calcula o calendário civil e o horário atual com
`Intl.DateTimeFormat` e `America/Sao_Paulo`, sem depender do fuso do navegador.
O relógio é consultado novamente ao enviar. Uma criação deve começar estritamente
no futuro: ontem, horário passado hoje e início igual ao instante atual são
recusados. O campo de data auxilia a escolha com `min` igual a hoje em Brasília.

O formulário mantém os limites existentes: nome 100, local 200, categoria 100 e
descrição 10000 caracteres; calendário real entre 1000 e 9999; horário HH:mm;
público inteiro entre 1 e 2147483647; capacidade opcional no mesmo intervalo,
quando habilitada. Se a quantidade de inscritos estiver disponível, a capacidade
não pode ser menor. Não se inventa uma contagem quando essa informação não existe.
As restrições de caracteres de controle acompanham o backend; a descrição aceita
quebras de linha e tabulação.

Eventos publicados (`Ativo`) preservam a edição legítima de descrição/capacidade
mesmo com agenda passada. Seus campos congelados continuam congelados e o `min`
histórico é preservado. A edição de planejamento segue a exigência de futuro já
presente na RPC. Eventos cancelados/encerrados continuam bloqueados pelas
capacidades e permissões existentes. Nenhuma regra SQL foi alterada.

`CriarEvento` usa `noValidate` para apresentar as próprias mensagens, conservando
tipos e limites HTML como auxílio. Os erros usam `Campo`, `aria-invalid`,
`aria-describedby` e foco no primeiro campo inválido. Erros de categoria são
associados ao grupo de botões existente. O erro de envio recebe um alerta com foco,
sem apagar os valores. Corrigir um campo remove sua mensagem, e corrigir a data
também limpa o erro de horário para permitir nova avaliação.

O envio permanece bloqueado por ref e estado enquanto o callback está pendente.
`App` repassa as falhas de salvamento ao formulário, em vez de chamar `alert()`
nesse fluxo. Mensagens de API são preservadas; rede/resposta ilegível apresenta
aviso de resultado não confirmado. Sessão expirada oferece **Entrar novamente**.
Os demais fluxos e alertas fora deste formulário não foram redesenhados.

O formulário administrativo reutiliza essa validação. Sua capacidade continua
desativada; esta implementação não habilita A7 nem A10.

## Backend e idempotência

`services/eventos.cjs` oferece `validarEvento(dados, { criacao: true, agora })`.
Os dois endpoints de criação exigem início futuro antes de uma intenção nova.
A validação estrutural padrão usada em edição não impõe futuro indiscriminadamente
a registros históricos. A RPC permanece como proteção transacional final contra
mudanças de horário, perfil, proprietário ou estado entre validação e COMMIT.

Uma repetição de criação já confirmada pode ocorrer após o horário do evento.
Para não quebrar esse contrato, somente nesse caso temporal os adaptadores podem
consultar a existência da chave anterior: proprietário + chave em `eventos`, ou
administrador + chave em `eventos_criacao_admin`. São leituras restritas ao registro
de idempotência, sem buscar dados pessoais. Chave ausente/inválida ou registro
inexistente não permitem escrever uma criação passada.

A leitura **não confirma sucesso**: se houver registro, a RPC existente compara
o payload e revalida autoria/proprietário antes de confirmar o replay. Falha de
consulta ou resposta incompleta não é tratada como sucesso. Não foi criado endpoint
nem alterada migração, RLS, grant ou política. No formulário, uma agenda passada
continua bloqueada; reconciliação deve ser feita consultando Meus Eventos, conforme
o aviso de resultado incerto. Não se reenvia automaticamente a escrita.

## Conferência da redução de testes no PI.1

A comparação foi feita com os arquivos anteriores disponíveis no Git, sem executar
checkout/reset nem alterar histórico. A contagem dos registros de teste (incluindo
os gerados pelos loops) explica exatamente a diferença:

| Arquivo/grupo | Antes do PI.1 | Ao concluir PI.1 |
| --- | ---: | ---: |
| autenticacaoNavegacao.test.js | 55 | 13 |
| historicoNavegacao.test.js | 20 | 42 |
| Demais testes React | 761 | 761 |
| Total | 836 | 816 |

Os testes de autenticação isolada permaneceram no primeiro arquivo. Os cenários
do App e da pilha de navegação foram consolidados no segundo, com React DOM,
`createHashRouter` e History API de jsdom reais. Não é equivalência de quantidade
nem prova de cobertura exaustiva; o mapeamento funcional é:

| Comportamento anterior | Evidência atual |
| --- | --- |
| Login, sessão ausente/expirada, quatro perfis | autenticação isolada e login/logout/403 com Router real |
| URL direta e F5 com seção/ID | acesso direto e remontagem dos quatro portais, custos por ID e detalhes do participante |
| Voltar/Avançar, Relatórios e Novo evento bloqueado | navegação real das seções administrativas e dos demais perfis |
| Modal de cotação, fechamento e histórico | detalhe por URL com replace, Back/Forward e teste de fechamento |
| Guards e cancelamento do descarte | formulário real de custos conserva campos, sessão e URL ao cancelar saída ou logout |
| Respostas assíncronas obsoletas | navegação durante GET e troca de sessão não aplicam evento da conta anterior |
| Skeleton de sessão/restauração | testes com resposta de identidade e de evento mantidas pendentes |
| Estado de histórico sem credenciais | teste do estado real do Router e contratos dos parâmetros |
| Instância do Fornecedor e updaters consecutivos | nó do portal permanece conectado e última intenção de seção é preservada |
| Transparência e Termos | testes dos documentos por hash e caminhos legados, sumários e cadastro existentes |

No PI.2 foram acrescentadas quatro regressões reais de navegação para tornar
explícitos sessão pendente, troca de sessão, páginas públicas com sessão e detalhe
do participante. As expectativas antigas de ignorar rota desconhecida e de
simular ausência da History API são obsoletas: agora há 404 e React Router exige
um navegador compatível. A saída para outro site e o layout visual dependem de
inspeção em navegador; a antiga fixture simulada não comprovava esses aspectos.
Não foi identificada perda relevante nos comportamentos funcionais mapeados.

## Execução e limites

```powershell
# PI React
node --test tests/validacaoEvento.test.js tests/historicoNavegacao.test.js
node --test tests/*.test.js
npm run lint
npm run build

# PI Backend
node --test tests/validacao-eventos.test.cjs tests/eventos-criar-supabase.test.cjs tests/admin-eventos.test.cjs
node --test tests/*.test.cjs
```

Os testes controlam o relógio, incluem UTC, Kiritimati e Los Angeles, e usam dados
sintéticos. O teste do formulário completo do App verifica ausência de POST para
campos inválidos, falhas da API/rede sem alertas, conservação dos valores e sucesso
com encaminhamento a Custos. A suíte existente verifica custos, ticket e acréscimo
sobre custos (margem), além dos outros portais.

O contexto Docker local foi identificado, mas o daemon Linux estava indisponível
(pipe `dockerDesktopLinuxEngine` ausente). Nenhum container foi iniciado, nem foi
executada integração PostgreSQL neste lote. Os testes SQL opcionais permanecem
pendentes de reexecução em banco local descartável, inclusive gestão v1/v3,
edição histórica e replay. Não houve acesso ao Supabase, migração ou alteração
de flags. A inspeção real de pixels/zoom e de mensagens com leitor de tela continua
dependendo de navegador e tecnologia assistiva.

Resultado das suítes completas no PI.2: **870 aprovados no React**, zero falhas/skips;
**1729 aprovados no backend**, zero falhas e 20 skips (oito comparações históricas e
12 integrações opcionais). O teste de Termos registrou explicitamente a
indisponibilidade do Docker. Os skips não são evidência de aprovação PostgreSQL.
ESLint, build e `git diff --check` aprovados. O build mantém o aviso de bundle
JavaScript acima de 500 kB (aproximadamente 587 kB, ou 170 kB com gzip).

## Arquivos do PI.2

- Frontend: `src/utils/validarEvento.js` (novo), `src/pages/organizador/CriarEvento.jsx`
  e o callback de salvamento em `src/App.jsx`.
- Backend: `services/eventos.cjs`, `server.js`, `admin-eventos-http.cjs`,
  `repositories/supabase/eventos.cjs` e `repositories/supabase/admin-eventos.cjs`.
- Testes novos: `tests/validacaoEvento.test.js` (React) e
  `tests/validacao-eventos.test.cjs` (backend).
- Testes adaptados no React: `organizadorGerenciamento`, `organizadorVisual`,
  `eventosGestao`, `capacidadeEvento`, `adminNovoEvento` e `historicoNavegacao`.
- Testes adaptados no backend: `admin-eventos`, `eventos-criar-supabase` e
  `eventos-supabase-repository`.
- Este documento registra a implementação e o mapeamento da cobertura do PI.1.

As alterações não versionadas do PI.1 foram preservadas. Nenhum arquivo SQL,
dependência, configuração de ativação ou infraestrutura de backup foi modificado
pelo PI.2. Não houve exclusão adicional de arquivos neste lote.
