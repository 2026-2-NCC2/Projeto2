# Painel administrativo de evento — Etapas 1 e 2

Implementado em 06/11/2026, sem migração ou escrita de teste em produção.

## Contrato

`GET /admin/eventos/:id/painel`, autenticado, exclusivo de administrador,
com `Cache-Control: no-store`. ID inteiro positivo até 2147483647.
Retorna `evento`, `custos`, `cotacoes` com `itens`, `propostas`, `resumo`,
`consultado_em` e `aviso`. Ausência retorna 404; entrada inválida 400;
sem sessão 401; perfil incorreto 403; falha técnica é sanitizada.

O resumo usa o cálculo existente de capacidade/vagas da Etapa 3. A coluna
`publico` continua sendo público estimado, independente do limite de inscrições.
Custos são somados uma única vez por ID, em centavos inteiros, com retorno
decimal textual. Itens das cotações e propostas alternativas não são adicionados
ao total de custos. IDs duplicados ou relações inconsistentes recusam o painel.

Os repositórios Supabase filtram pelo evento no servidor. As chamadas existentes
sem argumento preservam seus contratos. Não foram alteradas as regras de escrita,
propriedade, idempotência, versão, estados ou inscrições das Etapas 1 e 3.

As seções usam consultas independentes e não prometem um snapshot transacional
único. A tela informa essa limitação. Não há pagamentos ou relatório financeiro
realizado. Nenhum controle de upload foi habilitado.

## Interface

Acesso pelo menu Painel de evento ou Abrir painel na lista de eventos. Seletor
de evento, resumo, quatro estados, capacidade NULL como Sem limite configurado,
confirmados, vagas, lotação, custos, cotações/itens e propostas com links internos.
Skeleton, erro/repetição, sessão expirada, ausência de dados, cancelamento de
consultas na desmontagem, foco visível e estilos locais para desktop/tablet/celular,
com respeito a prefers-reduced-motion. Relatórios, Novo evento, busca geral e
ações em lote continuam indisponíveis.

## Arquivos desta implementação

Novos:

- `PI Backend/painel-evento-admin-http.cjs`
- `PI Backend/services/painel-evento-admin.cjs`
- `PI Backend/tests/painel-evento-admin.test.cjs`
- `PI Backend/docs/painel-evento-admin.md`
- `PI React/src/components/admin/PainelEventoAdmin.jsx`
- `PI React/src/components/admin/PainelEventoAdmin.css`
- `PI React/src/services/painelEventoAdmin.js`
- `PI React/tests/painelEventoAdmin.test.js`

Atualizados:

- `PI Backend/server.js`
- `PI Backend/repositories/supabase/eventos.cjs`
- `PI Backend/repositories/supabase/cotacoes.cjs`
- `PI Backend/repositories/supabase/propostas.cjs`
- `PI React/src/components/admin/AdminPortal.jsx`
- `PI React/tests/administrador.test.js`
- `PI React/tests/estruturaResponsiva.test.js`
- `PI React/tests/useFocoModal.test.js`

Arquivos operacionais/evidências de migração presentes anteriormente no workspace
não fazem parte desta implementação.

## Validação

- Backend: 88 testes aprovados, zero falhas e zero skips, incluindo serviço,
  filtros dos repositórios, Express, autenticação real com persistência simulada,
  preservação de leituras existentes e regressão da capacidade.
- Frontend: 41 testes aprovados, zero falhas e zero skips, incluindo navegação,
  seleção, skeleton, quatro estados, capacidade, sessão, erros, desmontagem,
  âncoras, precisão monetária e regras CSS responsivas.
- `npm.cmd run lint` e `npm.cmd run build`: aprovados.
- Backend local reiniciado por Ctrl+C e retomado com encerramento gracioso.
- GETs reais nos seis painéis: 2 custos, 6 cotações, 17 itens e 6 propostas.
  Confirmados 401/403 e 400/404; hashes, contagens e configuração da verificação
  oficial da Etapa 3 idênticos antes/depois; marcador 3 e uploads bloqueados.
- Vite retornou HTTP 200 para o painel, integração no AdminPortal, serviço e CSS.

Pendente apenas a inspeção visual humana no navegador autenticado. Testes de
componentes/CSS e leitura HTTP não substituem inspeção geométrica em dispositivos.
Não houve criação/edição/exclusão de eventos, migração, alteração de credenciais,
RLS/políticas/configuração de segurança, commit ou push.
