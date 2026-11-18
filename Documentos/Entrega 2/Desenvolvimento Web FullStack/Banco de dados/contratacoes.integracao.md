# F8 — Registro de contratação comercial

Implementação preparada localmente. **Desativada por padrão**: `CONTRATACOES_ATIVAS=false` (ou ausente). Não houve aplicação remota. A7 e A10 são independentes e continuam desativados.

## Regras e interface

- Proposta `Aprovada`, de evento que não esteja Cancelado/Encerrado, pode ser formalizada pelo Organizador proprietário mediante confirmação explícita.
- Uma proposta gera no máximo uma contratação. Repetir a formalização retorna o registro existente, inclusive se já encerrado; não reabre nem atualiza o snapshot.
- Valor em BRL, detalhes técnicos/serviço e condições de pagamento são copiados da proposta no instante da transação. Os nomes de evento/fornecedor são consultados atualmente, sem copiar dados pessoais adicionais.
- Contratação começa `ativo`; somente o Organizador original e ainda proprietário do evento pode concluir/cancelar, com justificativa de 3–1000 caracteres e versão atual. Estados terminais não reabrem. Não há conclusão automática pela data do evento.
- Fornecedor consulta seus registros; Administrador possui consulta na API, sem ações de escrita ou nova tela administrativa neste lote. Mudanças de perfil e contas em encerramento são revalidadas.
- Organizador acessa formalização e histórico na etapa **Cotações**, junto às propostas aprovadas. Fornecedor acessa **Contratos ativos**, com busca e filtro incluindo concluídos/cancelados. A sidebar só habilita após capacidade positiva. URL direta conserva a indicação real de indisponibilidade enquanto bloqueada.
- Registro comercial não equivale a assinatura digital, documento juridicamente assinado, pagamento, faturamento ou receita.

## Contrato HTTP

Todas as rotas usam a autenticação existente, com consulta atual do perfil no servidor, nunca o perfil informado no corpo.

| Método e caminho | Contrato |
| --- | --- |
| GET `/contratacoes/capacidades` | `{disponivel:boolean}`; fechado sem flag/repositório ou migração compatível |
| GET `/contratacoes?evento=ID` | Lista integral autorizada; evento opcional; Organizador/Fornecedor/Admin |
| POST `/contratacoes` | Organizador; somente `{proposta_id:ID}`; 201 com registro confirmado ou replay |
| PATCH `/contratacoes/:id` | Organizador; `{estado:"concluido"\|"cancelado",motivo:string,versao:inteiro}` |

400 argumentos inválidos; 401 sessão; 403 autorização; 404 ausência; 409 conflito; 503 indisponível/resultado não confirmado. Escritas incertas não são repetidas automaticamente. A UI bloqueia reenvio e exige consulta antes de nova decisão. A formalização possui chave natural (proposta), e transições usam versão para impedir duplicação de auditoria.

## SQL preparado e revisão futura

`contratacoes.incremental.sql` é uma instalação transacional única; objetos existentes interrompem a aplicação. Não é um script de atualização/reaplicação. Não executar sem autorização específica, backup e recuperação comprovados.

Pré-requisitos: tabelas atuais `usuarios`, `eventos`, `cotacoes`, `propostas`, seus IDs inteiros, estados/campos compatíveis; `contas_teste_imagens(usuario_id,estado)` com semântica `ativa`; schema public; papel `service_role` não superusuário com BYPASSRLS. O executor precisa CREATE/REFERENCES e capacidade de definir/revogar ACLs. O serviço precisa USAGE no schema, SELECT e privilégios de row lock (UPDATE) nas dependências, além de SELECT na guarda de contas. Comparar definições reais antes de qualquer aplicação; não presumir equivalência com a fixture mínima.

A migração adiciona duas tabelas, cinco índices de consulta (três de contratações e dois de auditoria), quatro RPCs, uma função interna de trigger, dois triggers e sequences de identidade. RLS é habilitado e forçado, sem políticas públicas. RPCs SECURITY INVOKER/search_path pg_catalog, executáveis só por service_role; dados e auditoria não são expostos a anon/authenticated. A função interna não recebe EXECUTE público nem service_role: é acionada pelos triggers. Snapshots não recebem UPDATE por esse papel; auditoria não recebe UPDATE/DELETE. Os triggers também recusam alteração de identidade/snapshots, exclusão de contratações e alteração/exclusão da auditoria. Defaults/grants inesperados interrompem a instalação. Revisar também heranças, grants por coluna e privilégios efetivos do destino antes de autorizar.

Formalização e auditoria são atômicas. Um advisory lock transacional serializa escritas de contratação; usuários são travados por ID e depois evento/cotação/proposta. A transição verifica proprietário, estado e versão sob lock. Essa estratégia prioriza integridade; serialização global limita throughput. Timeouts/deadlocks permanecem falhas/resultado incerto, nunca sucesso presumido.

FKs RESTRICT preservam histórico e impedem exclusão de contas/eventos/propostas referenciados. A limpeza de contas descartáveis pode ser bloqueada após contratação. Aprovar política de retenção/anonimização e recuperação antes de ativar; este lote não executa limpeza, não altera LGPD e não adiciona exclusão automática. Auditoria armazena IDs, estados, motivo e data; orientar usuários a não inserir dados pessoais desnecessários no motivo.

Listagem usa agregado JSON em uma RPC, sem truncamento silencioso do limite de linhas PostgREST. Não oferece paginação: volume/latência e tamanho máximo de resposta precisam ser avaliados antes de escala elevada. Consultas independentes não formam snapshot transacional da tela.

## Testes locais

Sem PostgreSQL: `node --test tests/contratacoes.test.cjs tests/contratacoes-sql.test.cjs`, no backend. A integração real fica explicitamente ignorada sem opt-in; isso não comprova validação SQL real.

Execução futura **somente em Docker local**, com imagem postgres:17 já disponível e daemon Linux operacional:

```powershell
Push-Location 'PI Backend'
$anteriorF8 = [Environment]::GetEnvironmentVariable('TROCATICKET_CONTRATACOES_SQL_LOCAL','Process')
try {
  $env:TROCATICKET_CONTRATACOES_SQL_LOCAL = '1'
  node --test tests/contratacoes-sql.test.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Integração F8 reprovada' }
} finally {
  [Environment]::SetEnvironmentVariable('TROCATICKET_CONTRATACOES_SQL_LOCAL',$anteriorF8,'Process')
  Pop-Location
}
```

A suíte rejeita sobreposições DOCKER_HOST/CONTEXT/TLS; usa socket local revisado, container `--network none`, sem portas publicadas ou credenciais da origem. A autenticação trust limita-se ao container sintético sem rede. Aplica SQL somente nesse container; remove-o em finally. Não usa `.env` nem conecta ao Supabase. Fixtures incluem perfis, contas em encerramento, snapshots/replay, concorrência, conflitos de versão, rollback e privilégios. Erros concorrentes não são aceitos como sucesso.

Antes de disponibilização real: executar integração sem skips, revisar esquema/ACLs/retencão, autorizar migração separadamente, verificar PostgREST e capacidade com flag ainda desligada, e autorizar ativação separadamente. Nenhuma dessas autorizações é implícita neste documento.

## Auditoria F8.1 — 17/11/2026

Correções pontuais, sem reconstrução do fluxo:

- O CHECK de encerramento agora exige explicitamente motivo não nulo. A RPC já recusava NULL, mas o CHECK anterior podia aceitar o resultado SQL UNKNOWN em uma escrita direta.
- O fechamento da migração também verifica privilégios efetivos de anon/authenticated nas tabelas, sequences e quatro RPCs. A inspeção de ACLs declaradas não demonstrava ausência de acesso herdado. A fixture prepara um cenário de herança indevida, que deve interromper e reverter a instalação.
- O frontend mantém resultado incerto em falhas de escrita 5xx/408 sem sinalização explícita, inclusive corpo JSON nulo, e em troca de sessão. A resposta de recusa explícita continua distinguível. O timeout agora cobre também a leitura do corpo. Duas regressões 503 falharam antes da correção e passaram depois.

Validação executada: 948 testes React aprovados; 1.744 backend aprovados e 21 skips; ESLint, build, sintaxe dos testes e diff check aprovados. A integração de contratações está entre os skips: o daemon Docker Linux não respondeu no socket local. Não foi criado container nem executado SQL real/remoto.

Controles confirmados por leitura e testes simulados: ator derivado da sessão e perfil atual, propriedade na RPC e defesa no adaptador, fornecedor somente leitura de seus registros, estados terminais com versão/motivo, chave única por proposta, snapshots e auditoria na mesma transação. O replay retorna o snapshot original; não atualiza valor nem reabre contratos encerrados.

Não comprovados operacionalmente: compilação/aplicação desta revisão SQL; disputa real entre transações e mudanças de perfil/propriedade; rollback de auditoria; enforcement de constraints/FKs, RLS, heranças e grants no PostgreSQL; equivalência do esquema futuro com a fixture. Os cenários locais já preparados não substituem execução sem skips. RLS bloqueia papéis públicos; service_role possui BYPASSRLS e continua sendo uma fronteira de confiança do backend, não uma proteção por usuário final.

Pendências de ativação: preflight autorizado do destino/executor; revisão de ACLs/defaults/heranças; ensaio e recuperação; retenção proporcional e atendimento de solicitações de dados, inclusive titulares que mudaram de perfil. FKs RESTRICT impedem apagar os vínculos históricos, mas não definem prazo de retenção nem política de anonimização. A consulta de privacidade atual é limitada e não inclui contratações/auditoria. Transferir a propriedade de um evento torna o contrato inacessível para alteração pelo antigo e pelo novo proprietário, por exigir simultaneamente autoria original e propriedade atual; qualquer evolução dessa regra exige decisão específica.

Riscos operacionais: advisory lock global serializa as escritas; avaliar latência e limites de timeout reais. Os SET LOCAL do início do arquivo limitam a instalação, não configuram timeouts permanentes das chamadas RPC. A listagem integral agregada não possui paginação. Nenhuma inspeção visual real foi realizada neste lote. Contratações, A7 e A10 não foram ativados.

## F8.2 — Histórico, perfil e propriedade

O modelo permanece de **um perfil por usuário**, sem novos estados de conta ou sistema paralelo de permissões. A revisão altera somente o SQL preparado, defesa do adaptador e regressões. Não implementa transferência de eventos ou contratos, desativação geral de usuários, exclusão automática, anonimização ou prazo de retenção.

| Situação | Regra |
| --- | --- |
| Organizador perde o perfil | Novas requisições usam o perfil atual; perde as operações de Organizador, sem alteração das contratações ou auditoria. Se passar a Admin, somente consulta administrativa explicitamente existente. |
| Fornecedor perde o perfil | Não consulta os contratos antigos pelo papel anterior. Outro perfil não herda seus registros. O Organizador autorizado conserva consulta/conclusão/cancelamento, mesmo se o Fornecedor perder o perfil ou entrar em encerramento. |
| Perfil restaurado | Direitos são reavaliados com os vínculos atuais; não há transferência automática nem reabertura de contratos. |
| Conta em encerramento | As marcas existentes `encerrando`/`excluida` em contas_teste_imagens impedem autenticação e RPCs do titular. Os registros comerciais permanecem. |
| Mudança de responsável pelo evento | Somente Organizador original **e** ainda proprietário pode consultar/alterar pelo portal de Organizador. Antigo e novo responsáveis não podem alterar contratos anteriores após transferência; o novo não recebe o histórico do anterior. O Fornecedor original, mantendo perfil/conta válidos, conserva consulta; Admin conserva somente consulta. |
| Ativo/concluído/cancelado | Regras de leitura valem nos três estados. Mudanças de perfil/conta/evento não encerram, reabrem ou transferem contratos. Transições legítimas continuam somente ativo → concluído/cancelado com versão e justificativa. |

O histórico permanece vinculado a IDs originais, mesmo após mudança de nome/perfil. Valores, serviço, condições, autoria e data de formalização não são recalculados. Nomes de evento/Fornecedor exibidos são dados atuais de apresentação; não são snapshots históricos de identidade civil. Os triggers defendem contra DML acidental; não protegem contra superusuário que deliberadamente altere DDL ou desabilite triggers. service_role continua sendo credencial confiável do backend.

A consulta SQL segura bloqueia o ator com FOR SHARE antes de revalidar perfil e marca de encerramento. Isso coordena a leitura com os fluxos existentes que atualizam/bloqueiam usuarios. Para o Organizador, a lista devolve evento_organizador_id para o adaptador recusar também resultados em que o proprietário atual diverge do autenticado; nos demais perfis esse campo fica nulo. O replay verifica a cotação original além de evento, Fornecedor e Organizador.

Regressões: JWT real antigo + middleware de produção + repositório de autenticação simulado; perda de perfil e marcas de encerramento; remoção da identidade; defesa de propriedade no adaptador; interface deixa de mostrar dados/ações após nova consulta 401/403. Integração SQL preparada compara os três estados e auditoria antes/depois de mudanças de perfil/conta/proprietário, testa triggers e bloqueio de exclusão. **950 React e 1.750 backend aprovados, zero falhas; 21 skips backend**, incluindo esta integração real. ESLint, build, sintaxe e diff check aprovados. Docker Linux indisponível; não houve execução SQL real, migração ou acesso remoto.

### Decisões que ainda bloqueiam ativação

- Não existe desativação geral de contas comuns no esquema atual. Definir seu contrato em lote próprio antes de anunciar essa capacidade. Não cadastrar contas comuns artificialmente na guarda de contas de teste.
- Pedido de exclusão/privacidade não equivale a autorização para apagar vínculos comerciais. FKs RESTRICT e triggers preservam histórico, mas não substituem política de retenção, base/finalidade, revisão LGPD e procedimento proporcional de atendimento. Nenhum prazo ou anonimização foi adotado.
- Contratos ativos sem Organizador atualmente autorizado permanecem ativos e protegidos. Decidir procedimento explícito de resolução: este lote não dá ao Admin poder de encerrar, não transfere propriedade e não restaura permissões automaticamente.
- O encerramento/exclusão física de contas descartáveis referenciadas pode ser bloqueado; não limpar contratos para contornar a proteção. A rotina existente de contas de teste exige identidade compatível com Participante e não é um encerramento geral de Organizadores/Fornecedores.
- Executar os cenários PostgreSQL sem skips, inclusive concorrência com mudanças cadastrais, e revisar destino, privilégios, recuperação e esquema. Migração e ativação continuam exigindo autorizações separadas. A7/A10 permanecem desativados e seus arquivos de produção não foram modificados.
