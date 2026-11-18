# F8.3 — Revisão integrada A7, A10 e F8

Revisão local de 17/11/2026. **Sem aprovação para migração ou ativação.** Nenhum código, SQL, flag ou configuração foi alterado neste lote; este relatório é o único arquivo novo do F8.3. Alterações anteriores foram preservadas.

Este documento consolida dependências e decisões entre módulos. Contratos, comandos de ensaio e detalhes de cada implementação permanecem nas fontes abaixo, sem duplicação:

- [A7: criação administrativa](eventos_admin.integracao.md), [preflight](eventos_admin.preflight.md) e [executor/recuperação](eventos_admin.executor-recuperacao.md).
- [A10: gerenciamento de perfis](admin_perfis.integracao.md).
- [F8/F8.1/F8.2: contratações e histórico](contratacoes.integracao.md).
- [Backup lógico e restauração offline V2](../PI%20Backend/BACKUP_POSTGRES_OFFLINE.md).

## 1. Dependências e compatibilidade estática

| Migração | Objetos próprios | Dependências verificadas na fonte |
| --- | --- | --- |
| [eventos_admin.incremental.sql](eventos_admin.incremental.sql) | eventos_criacao_admin; criar_evento_admin_v1; admin_eventos_capacidades_v1 | usuarios, eventos, contas_teste_imagens; gerir_evento_v1 e eventos_capacidades_v1 em versão 1 ou 3; sequences/permissões da gestão existente |
| [admin_perfis.incremental.sql](admin_perfis.incremental.sql) | admin_perfis_auditoria; alterar_perfil_admin_v1; admin_perfis_capacidades_v1 | usuarios.perfil do tipo public.usuarios_perfil_enum com os quatro perfis; contas_teste_imagens; READ COMMITTED e privilégios dos locks de tabela |
| [contratacoes.incremental.sql](contratacoes.incremental.sql) | contratacoes, contratacoes_auditoria; quatro RPCs; função interna de proteção; dois triggers; cinco índices e duas sequences | usuarios, eventos, cotacoes, propostas e seus campos/IDs compatíveis; contas_teste_imagens; permissões de leitura/row lock nas dependências |

**Comprovado na fonte:** os três conjuntos não compartilham nomes de objetos novos. Não substituem funções uns dos outros, não alteram defaults globais e não concedem automaticamente privilégios nas tabelas-base. As FKs novas usam RESTRICT. Os três criam objetos com RLS habilitado/forçado, RPCs SECURITY INVOKER e search_path pg_catalog; operações por usuário dependem da autenticação/backend e dos guards SQL. service_role possui BYPASSRLS e é uma fronteira de confiança, não o perfil administrativo da aplicação. A10 muda usuarios.perfil, não memberships/roles PostgreSQL.

As instalações são transacionais e de aplicação única. Não são scripts de upgrade/reaplicação: objetos, overloads, índices ou sequences já existentes podem abortar CREATE/verificações. Não apagar objetos nem usar substituições para contornar colisões. F8/F8.1/F8.2 representam a revisão do mesmo SQL ainda não aplicado; um destino que já possua uma versão antiga exige comparação e plano próprio.

**Compatibilidade com o esquema documentado:** os IDs inteiros, schema public, perfil canônico admin e modelo de perfil único são coerentes. A documentação A7.10 registra um preflight histórico com PostgreSQL 17.11 e capacidade v3. Isso não comprova o estado atual nem cobre automaticamente os requisitos posteriores de A10/F8. Nenhum banco remoto foi consultado nesta revisão.

### Ordem futura recomendada, sem execução neste lote

1. Revalidar o esquema-base e o executor no destino autorizado, todas as flags explicitamente desligadas e recuperação comprovada.
2. Se faltar alguma dependência, parar e aprovar um plano separado: estrutura de contas; gestão de eventos v1; depois capacidade v3, quando desejada. Não reaplicar dependências já instaladas. A v3 exige a unicidade validada/não adiável de inscricoes(usuario_id,evento_id), os triggers v1 e demais verificações de seu próprio preflight.
3. Aplicar **A7 → A10 → F8**, cada arquivo integralmente em sua própria transação, com validação entre etapas e interrupção na primeira divergência.
4. Verificar catálogo/RLS/ACLs/ownership, dependências e exposição PostgREST antes de qualquer decisão de ativação.

A ordem entre os três módulos é operacional, não uma dependência SQL rígida: A10 não chama A7/F8; F8 não chama A7/A10. F8 fica por último por concentrar vínculos comerciais e requisitos de retenção. A7 aceita gestão v1 ou v3; F8 usa os dados-base e não anuncia controle de vagas. Se o destino já estiver em v3, não executar novamente v1 ou v3.

Nenhum dos arquivos altera flags de aplicação. A7/A10 enviam NOTIFY de reload do schema; F8 não inclui essa notificação. A disponibilidade no PostgREST precisa de confirmação ou procedimento de refresh previamente autorizado, sem presumir mecanismos automáticos do provedor. Flags desligadas bloqueiam HTTP/UI, mas não removem os objetos nem os grants SQL criados. Se uma flag já estiver ligada, instalar a RPC pode tornar o recurso disponível: verificar as três como false/ausentes é pré-condição explícita, não confiar apenas no default.

## 2. Riscos conjuntos e evidências

| Ponto | Classificação / impacto | Evidência e encaminhamento |
| --- | --- | --- |
| Locks entre módulos | Potencial, prioridade alta para ensaio | A10 usa SHARE ROW EXCLUSIVE em usuarios e SHARE na guarda; A7 trava Admin/Organizador por ID; F8 usa advisory lock, row locks e FOR SHARE na consulta. Ordens/abrangências diferentes podem gerar espera, timeout ou deadlock. Ordem de aplicação das migrações não resolve concorrência em runtime. Testar A10 alterando ator/dono/Fornecedor enquanto A7/F8 operam e confirmar rollback/reconciliação, nunca sucesso presumido. |
| Fixtures não equivalem a integração conjunta | Comprovado, bloqueio de validação | A7 testa gestão v1/v3, A10 usa enum e tabelas mínimas, F8 usa perfil text e base simplificada. Não há suíte que instale e exercite os três módulos com todos os triggers da gestão no mesmo banco. Aprovações individuais não comprovam compatibilidade integrada. |
| Transferência de evento | Comprovado no esquema versionado; cenário excepcional no F8 | eventos_gestao.incremental.sql: eventos_guardar_v1 recusa NEW.usuario_id diferente de OLD.usuario_id. Não existe fluxo atual de transferência autorizado. O teste F8 que altera proprietário na fixture mínima é defesa contra divergência/legado; não prova que transferência seja permitida no esquema completo. No ensaio integrado, a alteração normal deve falhar e manter os históricos intactos, sem desabilitar triggers. |
| Revogação de perfil com contratos ativos | Comprovado, decisão operacional pendente | A10 não migra contratos nem bloqueia toda mudança por haver contrato. F8 exige perfil atual, Organizador original e propriedade atual. Pode haver contrato ativo sem Organizador autorizado a encerrá-lo. Admin não ganha poder de encerramento por esse motivo. Definir tratamento explícito antes de ativação conjunta. |
| Defaults e permissões do destino | Potencial, bloqueio até preflight específico | A7/A10 toleram certos beneficiários superuser nas ACLs finais; F8 rejeita beneficiários fora de owner/service_role e verifica acesso efetivo público. Defaults/heranças compatíveis com um arquivo podem abortar outro. F8 cria sequences/triggers adicionais. Não uniformizar/revogar privilégios automaticamente. |
| Cache PostgREST | Comprovada diferença de scripts; impacto condicional | F8 não notifica reload como A7/A10. Uma migração bem-sucedida não prova RPC acessível, transporte ou formato esperado pelo adaptador, inclusive evento_organizador_id. Validar separadamente. |
| Capacidade nula em esquema divergente | Guard incompleto comprovado; impacto potencial, prioridade média | A7 usa IF eventos_capacidades_v1() NOT IN (1,3). Se a dependência retornasse NULL, a condição SQL não seria verdadeira e não abortaria por esse guard. As definições versionadas retornam constantes 1/3, portanto não há falha demonstrada no esquema documentado. Exigir resultado não nulo no preflight futuro e preparar correção/regressão em lote próprio se for revisar o guard; não tratar função divergente como compatível. |
| Limites de auditoria | Comprovado | F8 tem triggers contra alteração/exclusão do histórico; A7/A10 restringem SELECT/INSERT por grants ao serviço, mas não têm a mesma defesa por trigger contra executor SQL amplo. Nenhum deles protege contra um administrador SQL que altere DDL ou desabilite proteções. Não confundir permissões do Admin da aplicação com ownership SQL. |

Não foi identificado, por revisão estática, um conflito direto que obrigue a reescrever os módulos. Isso **não aprova SQL real, privilégios do destino ou ausência de problemas concorrentes**. A10 exige READ COMMITTED; a homologação conjunta deve usar esse isolamento e verificar também as configurações das chamadas PostgREST. O timeout de instalação não configura automaticamente timeout permanente das RPCs.

## 3. Histórico, autorização e encerramento

- A7 separa Admin autor e Organizador proprietário, sempre cria Em planejamento e não concede ao Admin gerenciamento/custos/publicação/imagens. Mudança posterior de perfil não reatribui autoria; replay revalida ator/dono/vínculo.
- A10 substitui o único perfil, conserva vínculos e auditoria, protege último Admin e auto-remoção. JWT antigo não conserva o perfil anterior: o backend consulta o estado atual em novas requisições. Operações já autorizadas/em andamento dependem dos locks/ordem transacional, não de cancelamento retroativo do JWT.
- F8 conserva IDs, snapshots de serviço/valor/condições, autoria e datas. Estados ativo/concluído/cancelado não mudam por alteração cadastral. Fornecedor precisa do perfil atual e do vínculo original; Organizador precisa também continuar proprietário. Admin apenas consulta. Não existe herança de contratos pelo novo dono de evento.
- As três auditorias e as FKs comerciais restringem exclusão de contas/eventos. F8 ainda impede DELETE/UPDATE de histórico pelos triggers preparados. Não apagar auditoria/contratos para liberar a rotina de limpeza ou exclusão.
- contas_teste_imagens é guarda de contas descartáveis, não modelo geral de desativação. Seu ciclo exige identidade compatível com Participante e pode ser bloqueado por histórico referenciado. Não marcar contas comuns artificialmente, rebaixar perfis ou transferir contratos para contornar isso.
- Pedido de exclusão, desativação e anonimização são decisões distintas. A consulta limitada de privacidade atual não cobre integralmente contratações/auditorias. Definir procedimento de atendimento, finalidade/retencão, responsáveis e solução para contratos ativos sem gestor; nenhum prazo legal ou purga automática foi estabelecido.

## 4. Validação disponível e pendente

**Agora:** docker info falhou ao abrir npipe:////./pipe/dockerDesktopLinuxEngine (pipe ausente). Não se iniciou daemon/container, não se alterou Windows e não se verificou a imagem por um daemon funcional. Nenhuma integração PostgreSQL foi executada no F8.3; testes simulados não a substituem.

Evidências anteriores, sem renovação de aprovação:

- A7: documento registra em 11/11/2026 dois ensaios independentes v1/v3, cada runner com 50 aprovações e zero skips/falhas.
- A10: documento registra nove testes PostgreSQL sintéticos aprovados no A10.1, zero skips/falhas.
- F8 atual, incluindo F8.1/F8.2: revisão estática e testes simulados aprovados; integração real continua pendente.
- Baseline fornecido/preservado: React 950 aprovados; backend 1.750 aprovados e 21 skips. Não se reexecutaram suítes completas neste lote exclusivamente documental.

Testes direcionados existentes executados nos sete arquivos admin-eventos*, admin-perfis*, contratacoes*, incluindo sessão e SQL: **34 aprovados, zero falhas e quatro skips** (pais PostgreSQL A7 v1/v3, A10 e F8). São verificações HTTP simuladas/estáticas/infraestrutura; não são aprovação PostgreSQL. git diff --check executado sem erros.

Quando o Docker local estiver disponível, utilizar os opt-ins específicos já documentados, sem flags funcionais, com imagem postgres:17 e containers descartáveis. Além das suítes individuais, preparar e executar uma fixture conjunta fiel: enum, guarda, tabelas de propostas/cotações, gestão v1/v3, três migrações e todos os triggers. Cobrir criação A7 → aprovação/proposta → F8 → mudança A10, sessões antigas, concorrência entre módulos, último Admin, rollback, replay, FKs e direitos efetivos. Erros de regra, lock timeout, deadlock e falha inesperada devem ser distinguidos. Não contornar o trigger de proprietário para obter um cenário de transferência artificialmente aprovado.

## 5. Bloqueios e sequência operacional

| Bloqueio real antes da etapa correspondente | Próxima ação concreta |
| --- | --- |
| SQL atual sem ensaio integrado | Disponibilizar Docker Linux sem alterações automáticas; executar suítes individuais e a futura integração conjunta sintética. |
| Backup/recuperação real não comprovados | A7.15 permanece suspenso por decisão do usuário. V2 foi validado com dados sintéticos, não com recuperação do projeto real. Definir solução protegida aceitável e autorização específica para backup/ensaio, sem presumir que K: proteja VM, temporários ou paginação. Não retomar neste lote. |
| Executor e grants atuais não comprovados para os três conjuntos | Aprovar preflight de leitura que cubra objetos, enum, ownership, CREATE/REFERENCES, funções, triggers, sequences, locks, defaults/heranças/RLS. Evidência anterior de A7 não basta para A10/F8. Não presumir DDL para service_role. |
| Retenção, encerramento e contratos ativos sem gestor | Aprovar procedimento proporcional para pedidos de exclusão e resolução comercial sem apagar histórico, alterar proprietário ou ampliar o Admin implicitamente. Definir escopo da desativação geral, se desejada. |
| Homologação operacional | O projeto conhecido é compartilhado desenvolvimento/testes e identificado como produção pelo código. Prefixos HOMOLOG não provam isolamento. Aprovar ambiente fiel para testes HTTP/PostgREST; a demonstração MySQL isolada não implementa os adaptadores Supabase destes módulos. |
| Migração e ativação sem autorização atual | Após evidências acima, autorizar destino/executor/janela e migração; validar catálogo/cache/transporte; decidir separadamente a ativação de cada flag. Diante de divergência, parar sem corrigir grants ou reaplicar automaticamente. |

Melhorias opcionais, que não devem ser confundidas com liberação dos bloqueios: paginação da lista de contratações se o volume justificar, otimização dos locks após medir contenção, dashboards/gráficos/CSV e refinamentos visuais. Devolução/transferência de contratos, poderes adicionais ao Admin e desativação geral são novos contratos de negócio, não simples ajustes opcionais de interface.

**Recomendação:** manter os três recursos desligados. Próximo lote técnico: integração PostgreSQL conjunta sintética; em paralelo, decisões operacionais de recuperação, homologação e histórico. Aprovação de testes locais, prontidão para migração e autorização para ativação continuam sendo três marcos distintos.

Atualização F8.4: o [ensaio integrado](ensaio_integrado_A7_A10_F8.md) foi preparado com executor/fixture local e cenários v1/v3. Não foi executado em PostgreSQL, pois o Docker Linux segue indisponível; o bloqueio de validação integrada permanece. Detalhes, comandos e critérios estão nesse roteiro, sem alterar as decisões desta revisão.
