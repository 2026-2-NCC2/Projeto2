# Executor e recuperação pré-migração — A7.10

Preparação somente. Nenhum SQL, backup, restauração ou acesso ao Supabase foi
executado neste lote. Nenhum arquivo de produção foi alterado. Novo evento deve
continuar desativado. A autorização futura para diagnóstico, backup, restauração,
migração e ativação deve indicar separadamente o alcance de cada operação.

## Executor: evidência disponível e verificações pendentes

O A7.8.1 confirmou PostgreSQL 17.11, capacidade v3, definições versionadas das
funções, acesso de execução por service_role e ausência dos objetos administrativos.
service_role não tinha CREATE no schema public; BYPASSRLS não substitui DDL.
Os grants das funções examinadas apontavam postgres como concedente. Isso não
comprova que a conexão candidata tenha todos os poderes necessários à migração.

**Candidato recomendado para verificação: postgres**, usando conexão administrativa
oficial e TLS validado. Não há executor aprovado ainda. supabase_admin é inventariado
como papel gerenciado: não presumir login disponível nem solicitar suas credenciais.
Um executor dedicado existente só é alternativa depois de demonstrar os mesmos
requisitos; criar papel ou ampliar grants fica fora deste lote.

Consultas propostas: [eventos_admin.executor.preflight.sql](eventos_admin.executor.preflight.sql).
São nove blocos, alguns com mais de um SELECT, sem alteração de sessão ou objetos.

| Bloco | Justificativa e critério |
| --- | --- |
| E01 | Confirmar session_user/current_user, versão e atributos dos candidatos. Nome de papel não comprova acesso operacional. |
| E02 | CREATE e USAGE em public e CONNECT no banco. Não é necessário criar outro database para esta migração. Ausência bloqueia aquele executor. |
| E03 | REFERENCES em usuarios(id)/eventos(id), SELECT e ownership/herança. REFERENCES na coluna pode satisfazer a FK mesmo sem privilégio na tabela inteira. Comparar presença explícita com o preflight geral. |
| E04 | EXECUTE nas dependências e ownership. A migração chama a RPC de capacidades; o diagnóstico não a executa. Grant option de função existente não é necessário para conceder acesso às funções novas do próprio criador. |
| E05 | Defaults globais e public do papel que realmente criará os objetos. Verificar beneficiários adicionais e grant options contra o bloco final da migração. Defaults de um papel pai não são automaticamente os defaults do criador. |
| E06 | Heranças transitivas e delegação. ADMIN OPTION de membership é diferente de WITH GRANT OPTION de objetos. Ownership herdado pode dar poderes adicionais e fazer as checagens finais recusarem a aplicação. |
| E07 | USAGE nas linguagens SQL/plpgsql e nos tipos nativos utilizados. Ausências exigem revisão; não conceder automaticamente. |
| E08 | Objetos administrativos ou overloads existentes. Qualquer colisão interrompe o plano; não apagar ou substituir objetos para reaplicar. |
| E09 | Event triggers do ambiente que podem executar no CREATE/GRANT/ALTER. Revisar antes de escrever; definição exibida não é execução. |

O criador efetivo será proprietário dos objetos novos, e o ownership normalmente
lhe permite ALTER/RLS/GRANT/REVOKE nesses objetos. Catálogos permitem avaliar essa
expectativa, **não provar uma execução de DDL** ou todas as restrições do provedor.
Não é preciso conceder/revogar permissões em tabelas existentes para este arquivo.

Revisar especificamente as verificações finais de
[eventos_admin.incremental.sql](eventos_admin.incremental.sql):

- Na auditoria: service_role somente SELECT/INSERT, sem grant options ou extras;
  anon/authenticated sem privilégios efetivos; outros beneficiários inesperados abortam.
- Nas duas funções: service_role com EXECUTE sem grant option; anon/authenticated
  sem EXECUTE; outros beneficiários inesperados abortam.
- Os direitos inerentes ao owner e os papéis superuser são tratados pelo SQL;
  não presumir que direitos herdados serão neutralizados por REVOKE direto.
- Defaults amplos para os papéis conhecidos são revogados nos novos objetos na
  mesma transação. Defaults para terceiros ou heranças podem ainda causar aborto.

Nenhum resultado de E01–E09 foi obtido. Executar futuramente com autorização,
TLS validado, identidade candidata e, preferencialmente, transação READ ONLY.
Não usar SET ROLE para simular o executor. Parar no primeiro erro ou divergência.
Metadados de funções podem conter literais sensíveis: saída restrita, sem
versionar resultados brutos. Se a visibilidade não for suficiente, não concluir
ausência. Nenhuma consulta de leitura não comprovada foi incluída: só catálogos
e funções nativas de inspeção, sem avaliar funções da aplicação/event triggers.

## Infraestrutura local encontrada

- `PI Backend/scripts/backup-postgres-isolado.cjs`: dump custom, roles sem senhas,
  snapshot exportado, TLS verificado e hashes. Declara excluir arquivos Storage
  e configuração da plataforma. Exige estado histórico de oito tabelas public e
  52 registros; não está preparado como procedimento genérico para o estado atual.
- `PI Backend/scripts/restaurar-postgres-isolado.cjs`: container sem rede e sem
  portas, backup montado somente leitura e restauração com parada no erro. Usa
  imagem Supabase/Postgres específica e manifesto próprio. A opção --ensaio-retorno
  também abre conexão com a origem; não usá-la em um ensaio estritamente isolado.
- `PI Backend/scripts/backups-t0.cjs`: preparação de cutover com artefatos PostgreSQL
  e MySQL, manifesto e diretório privado. Acopla-se a domínios e funções históricos;
  não é um comando aprovado para A7.10.
- `PI Backend/tests/backups-isolados.test.cjs`: testes de escape e integridade de
  helpers; sua existência não comprova backup atual nem restauração bem-sucedida.

Esses scripts foram apenas lidos. Não foram importados/executados e não foram
modificados. Sua revisão/adaptação, caso escolhidos, precisa de lote autorizado.
Não há comprovação neste lote de arquivos atuais recuperáveis ou de sua localização.

## O que confirmar no painel, futuramente

Não houve acesso ao painel e não se presume qualquer recurso do plano:

- Existência de backups gerenciados, último sucesso, período retido, escopo,
  possibilidade de download e procedimento/destino de restauração.
- Disponibilidade e habilitação efetiva de recuperação pontual, janela coberta,
  requisitos, custos e impacto operacional. Não considerar disponível pelo nome do plano.
- Se há opção de restauração isolada/clonagem e quais dados/configurações inclui.
- Tratamento de Auth, roles, configurações, extensões e arquivos Storage; obter
  confirmação explícita de cobertura e das exclusões de cada mecanismo.
- Acesso do operador, tempo estimado de recuperação e eventual indisponibilidade.

Sem essas evidências, classificar recursos gerenciados como NÃO CONFIRMADOS.
Um backup lógico é alternativa a preparar; também precisa de ensaio comprovado.

## Procedimento proposto de backup lógico

Não há comandos prontos para execução automática. Antes de executar:

1. Aprovar escopo, operador, janela, destino privado fora do Git e tempo de retenção.
   Dumps podem conter credenciais armazenadas e dados pessoais; proteger acesso,
   cópias e criptografia. Roles sem senhas não tornam o dump de dados não sensível.
2. Confirmar projeto, conexão administrativa apropriada para dump, CA/TLS verify-full,
   cliente pg_dump compatível com PostgreSQL 17 e extensões necessárias. Não usar
   URI com senha em argumentos/logs. Usar mecanismo de credenciais temporário restrito.
3. Inventariar schemas e dependências. Não limitar silenciosamente a public. Definir
   como capturar schemas gerenciados e como restaurá-los em destino compatível.
   Qualquer objeto não legível ou omitido precisa de tratamento explícito.
4. Planejar pg_dump em formato custom, incluindo pre-data/data/post-data, ownership
   e ACLs; não usar no-owner/no-acl para esconder falhas. Capturar roles/memberships
   separadamente, sem hashes de senha, com pg_dumpall --roles-only --no-role-passwords
   quando permitido. Não assumir que o papel pode ler todo o cluster.
5. Usar o snapshot consistente do dump; se gerar manifestos de contagem/hash em
   paralelo, compartilhar o snapshot mediante procedimento revisado. Não comparar
   contagens de instantes diferentes como se fossem o mesmo estado.
6. Registrar versões, horário, cobertura, exclusões, SHA-256 e resultado dos processos.
   Inspecionar TOC com pg_restore --list antes de restaurar. Falha parcial não é backup.
7. Preparar captura separada dos arquivos Storage e manifesto de integridade,
   buckets e suas configurações. Metadados no PostgreSQL não demonstram que os
   bytes dos arquivos foram preservados. Coordenar janela com o snapshot do banco.
8. Registrar separadamente configuração operacional/segredos necessários à recuperação,
   com acesso restrito. Não publicá-los no manifesto, SQL de diagnóstico ou Git.
9. Remover somente credenciais temporárias criadas para a operação, com procedimento
   restrito. Preservar dumps originais e logs privados para o ensaio autorizado.

## Restauração e validação isoladas

1. Aprovar novo destino descartável; nunca reutilizar banco existente. Conferir
   imagem/versão/extensões, ausência de conexão de origem e isolamento de rede.
2. Montar backup somente leitura e conferir checksums. Escolher container sem
   rede/portas quando suficiente; não carregar .env do projeto na aplicação de teste.
3. Revisar scripts contidos no dump e event triggers antes da execução. O restore
   executa SQL armazenado: usar ambiente controlado sem segredos da origem.
4. Restaurar papéis necessários sem senhas e depois o dump, com parada no erro.
   Resolver colisões com papéis gerenciados por plano explícito. Não ignorar erros,
   usar CASCADE ou retirar ACLs/owners apenas para o restore terminar.
5. Comparar dados no snapshot de referência, schema, funções/assinaturas, PK/FK/check,
   índices, triggers, policies, flags RLS/FORCE, ACL/default ACL, ownership, roles,
   sequences e respectivos valores/ligação. Asserções devem cobrir a auditoria nova
   se o backup for posterior à migração. Registrar divergências sem valores pessoais.
6. Testar localmente autorização, rejeições, idempotência, rollback e estado inicial;
   manter entrega de e-mails, integrações e acesso externo bloqueados. Dependências
   indisponíveis no container devem constar como não verificadas.
7. Validar separadamente bytes e metadados Storage em destino isolado autorizado.
   Restore PostgreSQL sozinho não comprova recuperação da plataforma inteira.
8. Confirmar que a origem não foi acessada no ensaio, preservar evidências redigidas
   e remover somente os recursos descartáveis identificados, sob autorização própria.

## Projeto compartilhado e recuperação

Não presumir ausência de usuários/dados importantes porque o mesmo projeto serve
para desenvolvimento e testes. Inventariar todos os escritores: backend, scripts,
jobs, sessões administrativas, clientes e Storage. Uma restauração antiga pode
apagar alterações de outros módulos feitas depois do snapshot.

Definir perda máxima aceitável (RPO), tempo de recuperação (RTO), responsável e
janela. No cutover de recuperação, pausar/drenar escritores mediante autorização,
registrar alterações posteriores e aprovar reconciliação antes de reabrir. A flag
de criação administrativa não interrompe gravações dos demais módulos.

Antes do COMMIT: primeiro erro implica interromper e ROLLBACK. Conexão perdida
próxima ao COMMIT implica resultado incerto: verificar estado antes de reaplicar.
Após COMMIT: manter flag desligada, preservar dados/auditoria, avaliar correção
específica ou restauração autorizada. Não existe rollback SQL versionado nem
autorização para DROP CASCADE. Rollback de dados pode deixar lacunas em sequences;
IDs sem lacunas não são critério de integridade.

## Checklist de autorização futura

- [ ] Projeto compartilhado e alcance do diagnóstico aceitos; TLS e executor confirmados.
- [ ] E01–E09 e preflight geral executados futuramente, sem divergências inexplicadas.
- [ ] Defaults/heranças confrontados com as verificações finais da migração.
- [ ] Método de backup/cobertura aprovados e cópia íntegra restaurada em isolamento.
- [ ] Limitações de schemas gerenciados, Auth, Storage e configuração aceitas.
- [ ] RPO/RTO, interrupção de escritores e tratamento de gravações posteriores aprovados.
- [ ] Retenção da auditoria, FKs RESTRICT e destino dos dados de teste decididos.
- [ ] Janela, operador, plano de falha pré/pós-commit e validação estrutural aprovados.
- [ ] Migração autorizada especificamente; testes remotos e ativação autorizados separadamente.

Interromper se faltar privilégio/visibilidade, houver objeto existente, default ou
event trigger não revisado, dump incompleto, restore com erro, destino ambíguo,
integração externa ativa ou ausência de decisão sobre perda de gravações posteriores.
Não corrigir automaticamente nenhum desses casos.

## Validação desta preparação

Somente revisão dos arquivos e validações estáticas de links/comandos/espaços.
Não há sintaxe validada pelo servidor, teste de DDL, backup ou restore aprovado
neste lote. A existência de scripts antigos não altera esse estado.
