# F7 — perfil, contratos e criação administrativa

## Entrega implementada

O item **Meu perfil** fica no rodapé da sidebar do Fornecedor, imediatamente
acima de Sair. A URL `#/fornecedor-perfil` foi mantida, inclusive para acesso
direto, restauração e histórico. O h1 pertence ao componente de perfil pessoal;
o portal não adiciona um segundo h1 nessa seção.

O antigo “Perfil fornecedor” não era um cadastro comercial separado:
`App.jsx::PerfilFornecedor` já renderizava `PerfilPessoal`, acrescentando
indicadores de propostas. Essa composição foi preservada. As informações
profissionais/comerciais continuam em `PerfilProfissional`, dentro da mesma
página, e o portfólio continua com sua seção própria. Não foi criado outro
formulário ou serviço de edição.

`PerfilPessoal` utiliza `GET /perfil`, `PATCH /perfil`, o formulário compartilhado,
as imagens conforme capacidade e `AcessoPrivacidadeConta`. O PATCH continua
limitado a nome, telefone e biografia; e-mail é somente leitura. A edição só
aparece se o backend anunciar `edicao_disponivel`. O servidor usa a identidade
autenticada, não um ID selecionável no cliente. Não há nova permissão ou acesso
a outro fornecedor. O erro 401 e a ação Entrar novamente continuam existentes.

## Contratos — diagnóstico comprovado

- `PortalFornecedor.jsx` marca Contratos ativos como desabilitado; o acesso direto
  à URL apresenta indisponibilidade, sem requisitar uma lista de contratos.
- O modelo versionado contém propostas ligadas a cotação e fornecedor, com
  valor, condições de pagamento, detalhes técnicos, estado e criação.
- `rpc_avaliar_proposta.preparacao.sql` altera condicionalmente o estado de uma
  proposta em avaliação, validando o Organizador do evento. Não cria um contrato,
  não registra vigência e não torna outras propostas incompatíveis por si só.
- Não foi encontrada entidade ou endpoint de contrato formalizado nos arquivos
  de negócio examinados. “Contratos” em nomes de testes também significa contrato
  JSON de API, não contrato comercial.

**Aprovada não será convertida em Contrato ativo.** A tela local foi preparada
com explicação específica e acesso à lista comercial existente. A sidebar
permanece desabilitada e não foi criada API fictícia, lista sintética ou flag.

### Estrutura mínima proposta — depende de decisão antes de implementar persistência

Este é um desenho de implementação futura, não um contrato de API já disponível.

| Aspecto | Requisito proposto / decisão pendente |
| --- | --- |
| Formalização | Definir quem confirma a contratação e qual ato ou evidência é suficiente; aprovação isolada não é confirmação |
| Vínculo | Contrato próprio ligado à proposta, cotação, evento, fornecedor e Organizador; definir se pode haver mais de um por proposta |
| Conteúdo acordado | Registrar snapshot do serviço, valor/condições e moeda no ato confirmado; não reinterpretar alterações posteriores da proposta |
| Estado e vigência | Definir o que significa ativo, início/fim, encerramento e cancelamento; não inferir atividade pela data do evento |
| Concorrência | Formalização transacional, idempotente, com unicidade conforme cardinalidade aprovada e validação dos estados atuais |
| Auditoria | Autor autenticado, instante e transição; motivo nas alterações sensíveis, sem duplicar dados pessoais desnecessários |
| Exclusão/retenção | Definir preservação de histórico e impacto das FKs sobre usuários/eventos; não criar exclusão em cascata automaticamente |
| Leitura do fornecedor | Endpoint separado com filtro obrigatório pelo ID autenticado; detalhes de outro fornecedor devem ser recusados; não confiar em fornecedor enviado pelo cliente |
| Interface futura | Busca, lista, detalhe, carregamento, erro e vazio; exibir apenas campos acordados e existentes, sem assinaturas ou pagamentos inventados |
| Ativação | Capacidade positiva do servidor após migração revisada, sem habilitação só no frontend |

Sequência recomendada: decidir formalização/cardinalidade/vigência → versionar
schema e RPC transacional → implementar repositório/HTTP com isolamento → criar
consulta e detalhes → testar exclusivamente em PostgreSQL local descartável →
revisar migração/ativação separadamente. Testes necessários incluem proposta não
aprovada, ator inválido, fornecedor alheio, replay, concorrência, rollback de
auditoria, histórico, campos financeiros e estados de interface.

**Limite do F7:** a persistência, os endpoints e a migração de contratos não
foram implementados. Criá-los agora exigiria inventar as regras acima. A
preparação entregue é a interface bloqueada, sua regressão e este desenho;
não uma implementação de contratos pronta para ativação.

## Novo evento administrativo — A7 preservado

| Camada | Evidência e comportamento |
| --- | --- |
| Frontend | `AdminNovoEvento.jsx` exige `caps.criar === true`; diferencia erro de consulta, bloqueio e carregamento; reutiliza `CriarEvento` e suas validações |
| Proprietário | Seleção obrigatória a partir de usuários organizadores; servidor revalida existência e perfil |
| HTTP | `admin-eventos-http.cjs`: GET `/admin/eventos/capacidades` e POST `/admin/eventos`, autenticados, perfil canônico `admin`, flag explícita, campos permitidos e UUID de idempotência |
| Repositório | `repositories/supabase/admin-eventos.cjs` exige RPC de capacidade v1 e confere ID do evento, proprietário e autoria na resposta |
| SQL | `Banco de dados/eventos_admin.incremental.sql`: auditoria `eventos_criacao_admin`, RPC `criar_evento_admin_v1`, autoria separada, locks e replay; valida resultado Em planejamento |
| Dependências | Gestão segura v1 ou capacidade v3 e estruturas de contas em encerramento conforme preflight e documentação A7 existentes |

O estado instalado do banco remoto não foi consultado neste lote. A capacidade
continua bloqueada por padrão; não foi alterada a flag ou qualquer SQL existente.
Faltam revisão/autorização da migração no destino, confirmação de executor,
privilégios/defaults/RLS, retenção e recuperação, aplicação autorizada e validação
funcional via PostgREST. A ativação é uma decisão independente desses passos.

### Demonstração local

`tests/admin-eventos-sql.test.cjs` já prepara PostgreSQL 17 descartável nos
cenários v1/v3 com dados fictícios, cobrindo autoria/propriedade, perfis,
idempotência, concorrência, timeout de lock, rollback, contas em encerramento,
privilégios e preservação da criação do Organizador. É ensaio SQL, não um portal
completo conectado ao PostgREST local. Os testes React/HTTP sintéticos não são
uma demonstração operacional dessa integração.

O Docker Linux continua indisponível no F7. Nenhum container ou integração real
foi iniciado. Para uma demonstração ponta a ponta futura ainda será necessário
um Supabase/PostgREST local isolado, configuração privada sintética, migrações
locais revisadas e autorização independente para disponibilizar A7 nesse
ambiente. Não há motivo para ativar a funcionalidade no projeto compartilhado.

## Validação F7

- React completo: **930 aprovados**, zero falhas/skips.
- Backend direcionado: **49 aprovados**, zero falhas; **2 skips**, ambientes SQL
  administrativos v1/v3 sem opt-in. Executados `admin-eventos.test.cjs`,
  `admin-eventos-sql.test.cjs`, `autenticacao-http.test.cjs` e
  `propostas-fornecedor-contrato.test.cjs` com dependências simuladas.
- Backend de produção não alterado; a suíte backend completa não foi repetida.
- ESLint e build aprovados; nenhum aviso de bundle ou rotas vazias.
- `git diff --check` aprovado.
- Sem inspeção visual real neste lote. Menu mobile e refluxo continuam cobertos
  por testes estruturais, não por medição geométrica no navegador.

O teste novo usa componentes reais para edição, PATCH com campos permitidos,
privacidade, histórico, montagem direta e duas identidades sintéticas distintas.
`CustomEvent` do JSDOM foi vinculado ao ambiente de teste para que a notificação
de perfil atualizado execute como no navegador; nenhum serviço foi substituído
em produção. Regressões comprovam que propostas aprovadas não aparecem como
contratos e que o atalho consulta apenas o fluxo de propostas existente.

Nenhuma escrita remota, migração, ativação de flag, backup, commit ou publicação.
