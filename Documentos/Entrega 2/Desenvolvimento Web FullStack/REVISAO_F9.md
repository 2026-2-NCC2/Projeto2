# F9 — Revisão de acabamento e experiência de uso

Revisão por código/testes em 17/11/2026. **Inspeção visual real não realizada.** O host do navegador automatizado estava indisponível. A seleção da janela existente do Brave foi rejeitada pela revisão automática por risco de expor sessão privada alheia à tarefa; não houve tentativa de contornar a restrição. Abrir uma aba isolada também falhou por indisponibilidade do host.

Nenhum acesso ao Supabase, autenticação remota, alteração de flags, banco, Docker/Windows ou funcionalidades desativadas. A7, A10 e F8 permanecem bloqueados. As chamadas de API nos testes são sintéticas, sem acesso externo; não representam demonstração funcional conectada.

## Problemas comprovados e correções

| Tela | Problema | Correção |
| --- | --- | --- |
| Fornecedor / Mural | Falha de oportunidades sem nova tentativa na própria tela | Botão de reconsulta autenticada, preservando busca/URL e sem recarregar propostas ou realizar escrita. |
| Fornecedor / Mural | Resposta não-array virava lista vazia; cards podiam continuar visíveis em estados de falha/carregamento | Resposta incompleta vira erro explícito; cards aguardam consulta bem-sucedida. |
| Fornecedor / indicadores | Contagem de cotações rotulada como eventos únicos/compatibilidade, sem cálculo correspondente | Rótulos passam a identificar cotações disponíveis. Duas cotações do mesmo evento continuam sendo dois registros, sem inventar matching. |
| Fornecedor / cards e proposta | Organizador genérico e público ausente pareciam informações consultadas | Indisponibilidade desses campos é explícita; formulário identifica categoria e ID da cotação, sem dados fictícios. |
| Organizador / Cotações | Falha de consulta ou avaliação incerta sem ação direta para consultar novamente | Reconsulta GET na tela, incluindo após resultado incerto; não repete PATCH de aprovação/recusa. |
| Consultas alteradas | Respostas antigas podiam atualizar a tela após troca de evento/sessão ou desmontagem | AbortController, cleanup e verificação de contexto/sessão antes de atualizar estado; cancelamentos não geram mensagens de erro da consulta encerrada. |

Arquivos de produção alterados apenas: `PI React/src/pages/fornecedor/PortalFornecedor.jsx` e `PI React/src/pages/organizador/Cotacao.jsx`. Testes novos em `PI React/tests/acabamentoF9.test.js`; fixtures de `organizadorVisual.test.js` e `fornecedorLayout.test.js` ajustadas para os contextos de navegador utilizados. CSS, backend e SQL não foram modificados pelo F9.

## Revisão dos demais componentes

| Área | Evidência automatizada/código examinada | Limite |
| --- | --- | --- |
| Participante | PortalParticipante, testes de estados, busca/limpeza, detalhes, títulos e responsividade | Sem inscrição real ou inspeção geométrica. |
| Organizador | Layout/Menu, CriarEvento, Custos, Ticket e Cotacao; validações, cálculo, rascunhos e recuperação | Sem salvar/publicar ou medir overflow real. |
| Fornecedor | Menu recolhível, oportunidades, propostas, perfil e contratos bloqueados | Sem envio real de propostas, contratação ou inspeção visual. |
| Administrador | AdminPortal, AdminUI, Visão geral e regressões da suíte de catálogos/relatórios/navegação | Sem decisões administrativas reais ou habilitação A7/A10. |
| Landing/Login/404 | Textos e recursos reais, formulários/labels, controles de indisponibilidade, navegação/hash e estados da suíte completa | Sem navegador, preenchimento/login real ou verificação visual. |
| Compartilhado | Primitivas, NavegacaoRecolhivel, regras responsivas e suíte React Router | Sem alegação de auditoria WCAG completa ou aparência aprovada. |

Menus preservam os mecanismos existentes de Escape, retorno de foco e seção ativa. Tabelas mantêm regiões de rolagem interna. A suíte completa cobre URLs diretas, restauração/remontagem, histórico, sessão, 404 e permissões com dados simulados. Testes estruturais examinam regras em 320/375/390/768 px e larguras desktop, sem calcular o layout real.

Contraste calculado apenas para pares de tokens de index.css: texto principal/branco 14,23:1; secundário/branco 5,41:1; texto principal/Coral 4,56:1; Coral escuro/branco 5,53:1. Não avalia cascata final, transparência, imagens, foco sobre todas as superfícies ou todos os estados/badges.

## Validação executada

- React completo: **954 aprovados, zero falhas/skips**.
- Seleção direcionada dos quatro perfis, entrada pública e responsividade estrutural: **233 aprovados, zero falhas/skips**.
- ESLint, build e git diff --check aprovados.
- Regressões novas: recuperação do Fornecedor preserva busca; duas cotações do mesmo evento não são apresentadas como dois eventos; resposta incompleta não vira vazio; recuperação do Organizador não repete escrita; resposta de evento anterior não substitui a atual.
- Backend não reexecutado: nenhuma alteração de backend, API, contrato ou regra de negócio. Flags e trabalho anterior preservados.

## Checklist manual pendente

Executar somente em ambiente isolado autorizado. Não usar este roteiro como autorização de acesso remoto. Se as telas protegidas não puderem ser abertas nesse ambiente, mantê-las pendentes. Para inicialização e cuidados operacionais, reutilizar [DEMONSTRACAO_TROCATICKET.md](DEMONSTRACAO_TROCATICKET.md).

Todas as linhas abaixo estão **pendentes**, nas larguras 320, 375, 390, 768 e 1366 px, com zoom normal e 200%:

| Páginas | Resultado esperado |
| --- | --- |
| Landing, Login e 404/403 | Títulos legíveis, um h1, sem recortes; links, voltar e Mostrar/Ocultar senha operantes; erro legível e foco identificável. |
| Quatro menus/cabeçalhos | Sidebar desktop e menu móvel sem sobreposição; Tab/Shift+Tab, Escape, item ativo, Meu perfil e Sair distinguíveis; alvos de toque utilizáveis. |
| Participante / explorar, detalhes, ingressos e perfil | Cards/textos longos preservados; busca/limpeza, vazio/erro/recarga e foco; não efetuar inscrição remota. |
| Organizador / eventos, formulário, custos, ticket e cotações | Mensagens junto aos campos sem desalinhamento; cálculos legíveis; rascunhos preservados; reconsulta não perde contexto; não salvar/publicar em banco remoto. |
| Fornecedor / mural, propostas, portfólio e perfil | Busca preservada após retry; mensagens de ausência/erro claras; formatação monetária e tabelas legíveis; contratos bloqueados com explicação. |
| Administrador / dashboard, catálogos, solicitações, painel e relatórios | Filtros, badges, modais, fechamento e foco; tabela rola internamente sem arrastar toda a página; A7/A10 indisponíveis. |
| Histórico/sessão | Abrir URL direta, F5, Voltar/Avançar, logout e erro de sessão sem carregamento infinito ou perda silenciosa de rascunho. |
| Console/Network local | Somente chamadas previstas ao ambiente autorizado; nenhum erro de renderização, loop de navegação ou repetição de escrita. |

Registrar largura, página, screenshot e resultado real antes de declarar aprovação visual. Não houve novo redesign nem modificações cosméticas sem evidência neste lote.
