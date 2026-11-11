# Preflight administrativo — A7.7

Estado: preparado para revisão e execução manual futura. **Nenhuma consulta SQL
foi executada neste lote**, local ou remotamente. Este documento não autoriza
migração nem ativação. `ADMIN_EVENTOS_CRIACAO_ATIVA` deve permanecer desativada.

O diagnóstico é [eventos_admin.preflight.sql](eventos_admin.preflight.sql).
A migração é outro arquivo: [eventos_admin.incremental.sql](eventos_admin.incremental.sql).
Os resultados locais anteriores estão em [eventos_admin.integracao.md](eventos_admin.integracao.md).

## Inventário e interpretação

| Bloco | Finalidade | Resultado esperado / revisão necessária |
| --- | --- | --- |
| Q01 | Versão, schema, isolamento e timeouts da sessão | PostgreSQL 15–18 aceito pelo SQL; somente 17 foi testado localmente. Objetos em `public`. Caminho operacional em READ COMMITTED; sessão de diagnóstico não prova configuração do PostgREST. |
| Q02 | Presença, tipo de relação, proprietário e estados RLS | `usuarios`, `eventos`, `inscricoes` e `contas_teste_imagens` presentes como tabelas compatíveis. Auditoria ausente antes da primeira aplicação. `reltuples` é estimativa, nunca total confiável. |
| Q03 | Colunas, tipos, nulabilidade, defaults e identity | Comparar com schema base e migrações de gestão/capacidade. IDs inteiros compatíveis; dados do evento, `usuario_id`, `versao`, `criacao_chave` e `criacao_payload`. `capacidade_maxima` somente no caminho v3. Registro de contas deve conter `usuario_id` e `estado`. |
| Q04 | PKs, uniques, checks, FKs e vínculos de entrada | Constraints válidas e compatíveis. v3 exige UNIQUE não adiável `(usuario_id, evento_id)` conforme a verificação da migração. Revisar FKs de retenção, inclusive as externas às tabelas alvo. |
| Q05 | Índices, validade e predicados | Índice único de criação por usuário/chave, índices das PKs e, em v3, índice parcial de inscrições confirmadas. Índice ausente/inválido exige análise, não criação automática. |
| Q06 | Triggers ativos e definições das funções diretas | Comparar eventos/inscrições com a versão instalada. Revisar todo trigger adicional de usuários, contas ou auditoria. Não executar suas funções. |
| Q07 | Assinaturas exatas e ausência explícita | Gestão e capacidades presentes; `eventos_vagas_v3(integer[])` condicional à v3. RPCs administrativas ausentes antes da primeira aplicação. |
| Q08 | Definições, overloads, owner, linguagem e configuração das funções | Comparar integralmente com os arquivos versionados. RPCs esperadas com `prosecdef=false` e `search_path=pg_catalog`. Reconhecer retorno constante 1/3 na definição de capacidades sem chamá-la. Outros overloads exigem revisão. |
| Q09 | Sequences vinculadas às colunas e ownership | Sequences/identity compatíveis para IDs de eventos e inscrições; comparar vínculo também com default de Q03. Ausência ou geração alternativa exige interrupção. Não lê nem avança contadores. |
| Q10 | Papéis e heranças transitivas | Os três papéis devem existir. `service_role`: BYPASSRLS e não superuser; `anon`/`authenticated`: sem ambos. Examinar disponibilidade dos privilégios herdados e não apenas `rolinherit`. |
| Q11 | Privilégios efetivos de tabelas e grant options | Aplicar a matriz abaixo; inclui herança, ownership e PUBLIC no cálculo efetivo. MAINTAIN somente em PG17+. Privilégio adicional exige revisão contextual. |
| Q12 | ACLs de tabelas, sequences e schema | Exibe todos os beneficiários, inclusive PUBLIC e concedentes; `is_grantable` evidencia delegação. ACL nula é expandida para o default implícito. |
| Q13 | EXECUTE efetivo e ACLs das funções | `service_role` executa as RPCs necessárias; `anon`/`authenticated` não. Sem grant option indevido. Na ACL textual, beneficiário vazio antes de `=` significa PUBLIC. |
| Q14 | USAGE/CREATE do schema e acesso às sequences | USAGE no `public` e nas sequences necessárias para `service_role`. UPDATE/SELECT e delegação não são concedidos pelo diagnóstico; revisar excessos. |
| Q15 | Políticas RLS existentes | Comparar com o contrato de cada tabela. RLS forçado na auditoria administrativa, se já existir, e ausência de exposição inesperada. Políticas são exibidas, não avaliadas. |
| Q16 | Defaults globais e por schema/owner | Avaliar especialmente o papel que criará os objetos. Grants para outros papéis podem abortar a migração mesmo que os três papéis usuais estejam corretos. |
| Q17 | Configuração persistente de banco/papéis | Somente allowlist de isolamento, search_path e timeouts. Revisar `authenticator`/`service_role`; hooks e overrides do gateway continuam fora da prova. |
| Q18 | Arestas de membership e ADMIN OPTION | Delegação administrativa e caminhos de herança devem ser conhecidos. Q10/Q11/Q13/Q14 continuam sendo necessários para avaliar o acesso efetivo. |
| Q19 | ENUMs de perfil e estado | Se enum existir, deve admitir os valores canônicos necessários, incluindo `admin` e `organizador`. Sem linhas pode significar coluna textual; conferir Q03/Q04. |

### Matriz de privilégios para revisão

Não é uma proposta de grants. A infraestrutura existente pode ter permissões
para outros módulos: qualquer diferença deve ser explicada, não removida ou
aceita automaticamente.

- `usuarios`: service_role precisa SELECT e UPDATE para leitura e locks.
- `contas_teste_imagens`: SELECT para conferir encerramento. O próprio fluxo de
  contas utiliza outros privilégios já existentes; não confundir isso com excesso novo.
- `eventos`: SELECT, INSERT e UPDATE conforme gestão existente.
- `inscricoes`: SELECT e INSERT conforme gestão v1; revisar UPDATE usado pela v3.
- Sequences de IDs: USAGE para operações existentes; auditoria nova não cria sequence.
- Auditoria administrativa, **se presente**: somente SELECT/INSERT para service_role,
  sem grant options; sem acesso anon/authenticated/PUBLIC. Owner conserva privilégios
  inerentes; RLS não substitui a análise de BYPASSRLS.
- RPCs administrativas, **se presentes**: EXECUTE para service_role sem delegação,
  SECURITY INVOKER e sem concessões a anon/authenticated/PUBLIC.

## Segurança de leitura e limites

Todos os comandos preparados são SELECT ou WITH ... SELECT sobre catálogos e
views do PostgreSQL, usando funções nativas de inspeção qualificadas por
`pg_catalog`. Não há RPC de aplicação, DO, DDL, DML, NOTIFY, SET, lock explícito,
nextval ou setval. Não há consulta às tabelas de negócio, nem leitura de nomes,
e-mails, hashes de senha, tokens, IDs de usuários ou payloads de criação.

Foi removida a chamada à função de capacidades: sua definição real poderia
divergir do repositório. Marcação STABLE/INVOKER, sozinha, não comprova ausência
de efeitos colaterais. **Nenhuma consulta de segurança de leitura desconhecida
foi incluída.** Isso pressupõe catálogos nativos de um servidor confiável.

Definições de funções, defaults, políticas e nomes de papéis são metadados
operacionais. Em um banco divergente podem conter literais sensíveis embutidos.
Revisar a saída somente em sessão restrita; não exportar automaticamente, colar
em relatório público ou versionar o resultado bruto. Q17 não retorna settings
arbitrários, JWT, connection strings ou credenciais. Falta de visibilidade ou
permissão nunca significa ausência de objetos ou aprovação.

Não se comprova integridade semântica de registros somente pelos catálogos.
Q04/Q05 identificam checks não validados, uniques e FKs ausentes, mas não provam
ausência de estados legados desconhecidos, duplicidades onde não existe unique,
vínculos inconsistentes ou contas em encerramento específicas. Para isso será
necessário propor e autorizar separadamente consultas agregadas mínimas, depois
de revisar tabelas, RLS, views e funções envolvidas. Nenhuma foi incluída aqui.

Q06 cobre funções diretamente associadas aos triggers. Chamadas auxiliares ou
SQL dinâmico dentro dos corpos exigem rastreamento manual; pg_depend não seria
prova completa dessas dependências. Objetos administrativos existentes devem
ser avaliados mesmo quando vazios. Este arquivo não produz selo automático
APROVADO/REPROVADO e consultas independentes não constituem snapshot transacional.

## Execução futura, somente após autorização

1. Confirmar o projeto por canal confiável e conferência privada da conexão.
   Q01 não identifica o projeto; nunca imprimir DSN ou credenciais.
2. Manter a criação administrativa desativada e fechar qualquer execução automática.
3. Revisar novamente este SQL e os arquivos de gestão v1/capacidade v3/admin.
4. Usar conexão TLS validada e cliente confiável com parada no primeiro erro.
   Não reutilizar scripts que carreguem migrações. Não passar senha na linha de comando.
5. Configurar externamente a proteção READ ONLY e os limites operacionais aprovados,
   se disponíveis. O arquivo não altera configurações e não assume papel via SET ROLE.
6. Executar os blocos identificados Q01–Q19 manualmente, somente com autorização.
   Não chamar RPCs para complementar resultados. No primeiro erro, interromper.
7. Comparar os resultados com o inventário e a matriz, registrando apenas conclusão,
   divergências e evidências redigidas. Reconfirmar condições perto da aplicação:
   este levantamento pode ficar desatualizado.

### Interromper e manter desativado quando

- Projeto, conexão, TLS, versão, papel executor ou visibilidade não forem confirmados.
- Faltar dependência; definição/assinatura divergir; versão 1/3 não puder ser
  estabelecida estaticamente; v3 estiver parcialmente instalada.
- Qualquer objeto administrativo já existir, inclusive criação parcial ou overload
  inesperado. A migração recusa reaplicação; não usar DROP/CREATE OR REPLACE como correção.
- Houver constraint/índice inválido, sequence incompatível, trigger não revisado,
  privilégios/heranças/defaults inesperados, SECURITY DEFINER ou exposição indevida.
- Isolamento e timeouts do caminho real ainda não estiverem esclarecidos.
- Retenção, backup/recuperação ou tratamento dos dados de teste não estiverem aprovados.

## Decisões que SQL de diagnóstico não resolve

- Aprovar retenção da auditoria e impacto das FKs RESTRICT. Contas descartáveis
  vinculadas à auditoria/eventos não podem ser excluídas pelo fluxo atual. Não
  adicionar cascatas nem apagar histórico para contornar isso.
- Definir destino e limpeza segura dos futuros dados de teste antes de criá-los.
- Confirmar backup recuperável, ensaio de restauração, responsável e janela de aplicação.
- Aprovar recuperação após commit: não existe script de desinstalação versionado;
  conter pela flag e preservar auditoria/dados até um plano específico ser aprovado.
- Validar posteriormente PostgREST/cache, identidade efetiva e testes HTTP autorizados.
- Autorizar separadamente aplicação da migração e eventual ativação. Os dois
  resultados locais v1/v3 aprovados no A7.5.1 não substituem essas decisões.

Validação deste lote: revisão estática e verificações de arquivos apenas. Não há
validação de sintaxe pelo servidor PostgreSQL, plano de execução ou resultados reais.
