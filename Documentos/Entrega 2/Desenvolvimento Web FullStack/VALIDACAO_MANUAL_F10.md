# F10 — Roteiro prático de validação manual

Preparado em 17/11/2026, com base em [REVISAO_F9.md](REVISAO_F9.md). Baseline anterior: 954 testes React aprovados. **Nenhuma tela foi inspecionada no navegador neste lote.** Preencher resultados reais em [REGISTRO_VISUAL_F10.md](REGISTRO_VISUAL_F10.md); item não executado fica “Não testado”, nunca aprovado por inferência.

## 1. Escolher o caminho seguro

**Não usar o modo principal neste roteiro:** `npm.cmd start` no backend carrega a configuração privada principal e pode acessar o Supabase/iniciar rotinas no startup. `npm.cmd run dev` com a configuração padrão em localhost:5173 aponta para localhost:3001; localhost não significa banco isolado. Não editar `.env`, flags, manifestos, Docker/Windows nem substituir guardas para fazê-lo funcionar.

| Condição previamente comprovada pelo operador | O que testar |
| --- | --- |
| Só frontend isolado; porta 3107 comprovadamente livre | Landing, Login sem autenticação, links públicos e 404. Não enviar credenciais nem submeter formulários válidos. Telas protegidas ficam pendentes. |
| MariaDB isolado já disponível, configuração privada existente e dados comprovadamente sintéticos | Iniciar pelo executor isolado abaixo e verificar os quatro perfis com contas locais autorizadas. Os recursos dependentes de capacidades ausentes continuam indisponíveis. |
| Origem do banco/dados, serviço na porta 3107 ou isolamento não confirmados | Parar antes de iniciar/navegar; registrar impedimento. Não usar o Supabase como alternativa, dumps de origem incerta, JWT forjado ou mocks para aparentar funcionamento. |

O ambiente histórico MariaDB não é réplica completa do Supabase. A7/A10/F8 permanecem desativados; fixtures SQL do F8.4 não constituem servidor web de demonstração. Este documento não cria banco, contas ou dados. A existência de arquivos privados/PID não comprova que o serviço esteja disponível ou que o conteúdo seja sintético.

## 2. Inicialização local existente — comandos não executados pelo F10

Pré-requisitos: dependências do projeto já instaladas, portas previstas livres ou ocupadas apenas pelos serviços isolados conhecidos. Usar terminais próprios, sem variáveis de outro ambiente injetadas. Não encerrar processos desconhecidos ou instalar/reconfigurar serviços neste roteiro.

**Terminal 1 — somente se MariaDB e dados isolados já estiverem confirmados:**

```powershell
Set-Location 'PI Backend'
node .\scripts\iniciar-backend-isolado.cjs --config 'C:\Users\Lucas\MariaDBTest\TrocaTicket\backend-isolado.json'
```

Esse é o caminho privado fixado pelo executor existente; não copiar seu conteúdo para evidências. A guarda exige MariaDB 10.4.32, loopback 127.0.0.1:3307, database/usuário/datadir/PID compatíveis e fornece a API em **http://127.0.0.1:3107**. Não lê `.env` principal nem usa Supabase como fallback. Esperado: `Backend isolado pronto em http://127.0.0.1:3107.` Se faltar arquivo, identidade ou serviço, ou aparecer `ISOLATED_*`, parar e anotar somente o código, sem alterar configuração/credenciais para contornar a recusa.

**Terminal 2 — frontend isolado, inclusive para testar só a entrada pública:**

```powershell
Set-Location 'PI React'
npm.cmd run dev -- --config vite.isolated.config.js --mode isolado
```

Abrir manualmente **http://127.0.0.1:5174/#/inicio** em uma janela/perfil de teste escolhido pelo próprio usuário, sem acessar janelas privadas já abertas. A configuração fixa host/porta, ignora `.env` do Vite, usa `/api` → 127.0.0.1:3107 e CSP de conexão local; não mudar para 5173/3001 nem usar preview principal como substituto. Se 3107 estiver ocupada por processo não identificado, não prosseguir nem usar o proxy.

Com os serviços isolados confirmados, verificações opcionais:

```powershell
(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5174/').StatusCode
Invoke-RestMethod -Uri 'http://127.0.0.1:3107/'
```

Esperado: HTTP 200 e mensagem de backend funcionando. Isso confirma HTTP, não completude do esquema/dados. Não chamar a API principal ou endpoints remotos. Para encerrar, Ctrl+C **somente nos terminais iniciados pelo teste**; não apagar bancos/arquivos nem alterar serviços.

## 3. Larguras e ordem de execução

Usar a emulação responsiva do navegador ou dimensões equivalentes em pixels CSS. Não alterar escala/resolução do Windows. Registrar largura real e zoom, inclusive se a emulação diferir do dispositivo.

- **Passagem completa:** desktop 1366×768, tablet 768×1024 e celular 390×844, em todas as linhas do roteiro abaixo.
- **Passagem concentrada:** 320×740 e 375×812 em Login, menus, formulários, filtros, tabelas e modais dos quatro perfis.
- **Zoom 200% no desktop:** conferir menus, campos/ações, tabelas e mensagens. Retornar a 100% ao terminar.

Em cada tela: título claro/um h1, textos longos sem corte, botões legíveis, contraste dos estados, foco visível e nenhuma rolagem horizontal da página inteira. Tabela extensa pode rolar dentro da própria região. Testes estruturais anteriores não substituem essa observação.

## 4. Percurso prático

Usar quatro contas **locais sintéticas já autorizadas**, identificadas no registro somente como P1/O1/F1/A1. Preferir sessões de navegador independentes. Não duplicar aba autenticada nem compartilhar tokens; não registrar senha, Authorization, e-mail pessoal ou dados de negócio em capturas. A seleção visual de perfil no Login não concede acesso.

| Ordem / sessão | Percurso | Conferir |
| --- | --- | --- |
| 1 / sem sessão | `#/inicio` → Como funciona/Benefícios/Sobre → Acessar sistema (`#/entrar`) → Voltar à apresentação | Âncoras/foco, CTA, textos e rodapé. F5 em Entrar mantém essa tela; Voltar/Avançar acompanha os destinos. |
| 2 / Login | Tab/Shift+Tab pelos campos, Mostrar/Ocultar senha, submissão vazia/e-mail inválido | Labels, mensagens e foco do primeiro inválido; campos não sobrepostos. Sem backend isolado, não enviar credenciais. |
| 3 / sem sessão | Abrir `#/rota-inexistente-f10` e `#/admin?secao=secao-inexistente` → voltar | Página 404 dedicada, sem conteúdo protegido. Rota protegida válida sem sessão deve pedir autenticação, não ser confundida com 404. |
| 4 / P1 | `#/participante` → Explorar eventos (`?secao=eventos`) → detalhes pelo card → Meus ingressos (`?secao=ingressos`) → Perfil (`?secao=perfil`) | Cards, busca/filtros e limpeza, detalhes, vazio e rótulos de status; não efetuar inscrição. Abrir URL admin válida nesta sessão deve negar acesso sem exibir dados administrativos. |
| 5 / O1 | `#/eventos` → abrir evento sintético existente → edição → Custos → Ticket → Cotações → Perfil | Contexto do evento em cada etapa, campos/validações, resumo monetário, controle de acréscimo, propostas e ações de retorno. Usar URLs geradas com ID local existente; não copiar ID de outro ambiente. |
| 6 / O1 | Novo evento: preencher dados fictícios inválidos; testar campo obrigatório/data passada | Erros junto aos campos, foco e valores preservados. **Não enviar formulário válido nem avançar/salvar/publicar:** essas ações podem persistir dados. Abrir Custos/Ticket de evento já existente para inspecioná-los. |
| 7 / F1 | `#/fornecedor-mural` → abrir formulário da cotação sem enviar → Propostas enviadas → Desempenho → Portfólio → Meu perfil | Contagem de cotações, busca preservada, dados ausentes identificados, valores/badges, tabelas/formulário e retorno. Não enviar proposta nem salvar perfil/portfólio. |
| 8 / A1 | `#/admin` → Solicitações → Eventos → Painel de evento → Usuários → Cotações → Propostas → Relatórios (cinco categorias) → Meu perfil | Filtros, limpeza, recarga, detalhes/modais, rolagem e fechamento por Escape/botão. Não confirmar aprovações, recusas ou edições. Relatórios devem distinguir consultado/filtrado e propostas de pagamentos. |
| 9 / cada perfil | Abrir menu móvel → Tab → selecionar seção → reabrir → Escape | Expansão, item ativo, fechamento e retorno ao botão Menu. Testar atalho de conteúdo, detalhes/modal e retorno de foco ao fechar. |
| 10 / cada perfil | F5 numa seção salva → duas mudanças de seção → Voltar → Avançar → abrir a URL em nova aba de teste | Seção, contexto e parâmetros preservados; sem carregamento infinito, tela errada ou acesso indevido. Nova aba deve exigir sessão quando não autenticada. |
| 11 / O1 | Alterar um campo local sem salvar → tentar navegar → cancelar saída → repetir e confirmar descarte, se houver confirmação | Cancelar preserva o rascunho; descarte só após a confirmação existente. **Não assumir que F5 restaura campos não salvos:** registrar o comportamento e os avisos. |
| 12 / cada perfil | Sair → Voltar no navegador → tentar rota protegida válida | Sessão encerrada, sem restaurar conteúdo protegido ou identidade anterior. Não fabricar token para forçar sessão expirada. |

Nos três tamanhos principais repetir todas as telas acessíveis. Se faltar registro, capacidade ou ambiente, marcar “Não testado” com motivo; não criar dados para preencher o checklist.

## 5. Vazio, erro e recuperação — sem mudar registros

1. Buscar um texto sem correspondência, por exemplo `zz-f10-sem-resultado`; verificar mensagem de filtro sem resultados, depois Limpar filtros/busca e retorno dos registros.
2. Lista realmente vazia: verificar apenas se já existir no conjunto sintético. Não apagar dados para produzi-la.
3. Loading: observar consulta inicial/recarga; se rápido demais para avaliar, registrar “Não testado”. Não inferir skeleton a partir de captura estática.
4. Erro de API: somente na instância isolada iniciada pelo próprio teste, encerrar com Ctrl+C e abrir uma tela que faça nova consulta. Conferir mensagem e ação de recuperação. Reiniciar pelo mesmo executor; como o JWT local muda por execução, pode ser necessário entrar novamente. Não reiniciar API principal ou processos desconhecidos.
5. Prioridade F9: Fornecedor deve oferecer “Tentar consultar cotações novamente”, preservando busca; Organizador deve oferecer nova consulta das propostas. Não provocar erro enviando aprovação/recusa para testar resultado incerto. Apenas conferir a ação se esse estado já estiver disponível em ensaio autorizado.
6. Sessão expirada e erros específicos 401/403/500: usar somente condições já disponíveis no ambiente local. Sem reprodução segura, marcar pendente; não alterar relógio, permissões, flags ou tokens. Logout não comprova todos os cenários de expiração.

## 6. Disponibilidade esperada

| Situação | Expectativa |
| --- | --- |
| Implementado, dependente de API/dados locais | Eventos/busca, inscrições existentes, perfil, planejamento/custos/ticket, cotações/propostas, portfólio textual e consultas/relatórios administrativos. Disponibilidade de escrita depende dos contratos/capacidades; o F10 não pede confirmá-la gravando. |
| **A7 / Novo evento administrativo** | Desativado; item bloqueado e URL direta com explicação. Não ativar. |
| **A10 / Gerenciar perfis** | Desativado; não deve apresentar alteração operacional disponível. Não ativar nem mudar perfil para criar cenários. |
| **F8 / Contratos ativos** | Desativado; menu bloqueado e estado explicativo na URL existente. Proposta aprovada não é contrato formalizado. |
| Recuperação de senha, lembrar dispositivo, Google/SSO | Continuam indisponíveis e identificados no Login. |
| Cadastro | Bloqueado enquanto Termos estiverem em minuta/não aprovados; não é defeito de layout. |
| Imagens/Storage, exportação de privacidade e outras capacidades | Respeitar a disponibilidade real do ambiente e os avisos; não ativar para completar o roteiro. MariaDB não comprova as integrações específicas do Supabase. |
| Pagamentos, assinatura digital, revenda ou faturamento | Não apresentar como funcionalidades existentes. Ticket é estimativa; propostas são comerciais. |

## 7. Encerramento e evidências

Preencher [REGISTRO_VISUAL_F10.md](REGISTRO_VISUAL_F10.md), inclusive páginas pendentes. Priorizar: menu em 320 px/zoom 200%, formulários e erros do Organizador, retry e rótulos do Fornecedor, tabelas/modais/Relatórios do Admin, cards/detalhes do Participante e Login.

Somente documentar: este F10 não iniciou serviços, abriu navegador, consultou banco, preparou contas ou corrigiu código. Não houve necessidade de correção adicional comprovada. Não foram repetidos testes/build; nenhuma fonte foi alterada. Manter baseline F9 separado da futura inspeção real. git diff --check é a verificação documental deste lote.
