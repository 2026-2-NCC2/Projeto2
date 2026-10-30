# Plano transacional PostgreSQL/Supabase — Etapa 5

Referencia atual: [consolidacao unica](CONSOLIDACAO_ETAPA_5.md). Tres fluxos SQL
validados, implementacao local 26/27, HTTP e ativacao separados. Os estados e
22/27 das secoes seguintes preservam o historico, nao a contagem atual.

Estado atual: substituicao de custos e publicacao de cotacao preparadas
LOCALMENTE em SQL e adaptadores independentes; nao instaladas, ativadas ou
validadas em banco real. Decisao de acesso tambem preparada localmente, conforme
a secao final deste plano, sem instalacao ou ativacao.
Progresso mantido em 22/27.
Suite anterior a esta preparacao: 585 aprovados e oito comparacoes reais SKIP.
Os testes existentes permanecem preservados; nao sao prova de concorrencia real.

Revisao do anexo Texto colado.txt: conclusoes conferidas novamente nos handlers e
repositorios atuais. Os complementos do anexo foram incorporados nas secoes
correspondentes abaixo, sem criar outra copia do plano. O resultado de testes e
o impedimento de diff descritos no anexo sao historicos, nao aprovacao desta
revisao. A verificacao atual e registrada ao final deste documento.

## Tres leituras com bloqueio ainda pendentes

| Metodo MySQL | Bloqueio e conexao | Escritas que dependem dele |
|---|---|---|
| custos.bloquearEventoDoUsuario(conexao, id, usuarioId) | SELECT id FROM eventos WHERE id=? AND usuario_id=? FOR UPDATE | PUT /eventos/:id/custos e POST /cotacoes; a MESMA operacao e compartilhada pelos dois fluxos |
| cotacoes.bloquearCustosDoEvento(conexao, eventoId) | SELECT id, categoria, descricao, valor_estimado FROM custos_evento WHERE evento_id=? ORDER BY id FOR UPDATE | POST /cotacoes: criar cotacao e inserir seus itens |
| solicitacoesAcesso.bloquearPorId(conexao, id) | SELECT usuario_id, perfil_solicitado, status FROM solicitacoes_acesso WHERE id=? FOR UPDATE | PATCH /solicitacoes-acesso/:id: atualizar perfil condicionalmente e finalizar a solicitacao |

Esses tres metodos nao correspondem a tres RPCs de SELECT. O bloqueio so e util
se sobreviver ate o fim das escritas relacionadas. Uma RPC que apenas bloqueie
e retorne libera o bloqueio antes da proxima requisicao HTTP.

Os dois outros metodos ainda nao migrados sao custos.listarPorEvento e
propostas.listarPorFornecedor. Somente a dependencia de custos participa deste
plano; a RPC de propostas nao foi retomada.

## Fluxo 1 — substituir custos

Reutilizar [DEPENDENCIA_TRANSACIONAL_CUSTOS.md](DEPENDENCIA_TRANSACIONAL_CUSTOS.md),
sem reimplementar aqui sua analise ou ignorar o argumento conexao da leitura.

Sequencia MySQL: validar a lista inteira -> getConnection -> BEGIN -> bloquear
evento proprio -> DELETE custos -> INSERTs -> listarPorEvento(id, conexao) ->
COMMIT -> HTTP 200. Falhas: ROLLBACK quando ha conexao e release no finally.
Evento ausente/alheio: rollback e 404, antes de excluir qualquer custo.

Escritas dependentes: custos.excluirPorEvento e custos.inserir. A releitura
obrigatoria antecede o commit, usa a mesma conexao e retorna os IDs efetivos.
Array vazio e valido e remove todos os custos. O GET permanece leitura comum,
mas isso nao permite marcar o metodo compartilhado como completamente migrado.

Proposta: uma RPC de substituicao atomica, com validacao antes das escritas,
propriedade, lock do evento, substituicao e releitura ordenada na mesma transacao.
Compartilhar o fragmento/helper de leitura INTERNAMENTE, sem segunda RPC do Node.
Resposta: array dos cinco campos de Custo, id ASC, DECIMAL textual e [] quando
vazio; nao retornar apenas o payload nem reler por HTTP depois do commit.

## Fluxo 2 — publicar cotacao

Sequencia MySQL: validar evento/prazo/itens revisados -> getConnection -> BEGIN ->
custos.bloquearEventoDoUsuario -> cotacoes.bloquearCustosDoEvento -> normalizar
custos persistidos -> comparar com revisados -> criar cotacao -> inserir itens ->
COMMIT -> HTTP 201. Todos os passos SQL recebem a mesma conexao.

Dependencias: primeiro o mesmo lock do evento do PUT; depois custos por id ASC.
Sem custos: 400. Evento ausente/alheio: 404. Revisao divergente: 409. Custo
persistido invalido ou falha tecnica: 500. Preservar mensagens em CONTRATOS.md.
Comparar categoria, descricao, ordem e valor decimal canonico; nao comparar a
ordem textual das chaves JSONB nem aceitar itens enviados como fonte da gravacao.

Escritas: cotacoes.criar e cotacoes.inserirItem. Os itens publicados sao snapshots
dos custos persistidos. Preservar Fechada, Aberta, prazo, observacoes, normalizacao
e campos/valores da resposta existente, sem acrescentar IDs aos itens retornados.
Prazo e validado hoje pelo dia UTC da aplicacao; nao trocar silenciosamente por
CURRENT_DATE da sessao PostgreSQL. Definir esse limite no contrato da RPC futura.

Proposta: uma RPC de publicacao que englobe toda essa sequencia, incluindo a
comparacao protegida pelos locks. Nao fazer SELECT de custos em uma requisicao
e INSERT de cotacao em outra. PUT e publicacao precisam usar o mesmo protocolo:
evento -> custos -> escritas, sem inverter bloqueios ou supor gap locks do InnoDB
no PostgreSQL. O lock do evento coordena inclusive um conjunto de custos vazio.
Isso depende de todos os escritores participantes seguirem esse protocolo.
Nao substituir FOR UPDATE por NOWAIT ou SKIP LOCKED: isso mudaria o contrato de
espera e os resultados. O isolamento efetivo da origem nao foi medido nesta
revisao. Nao presumir equivalencia entre InnoDB e PostgreSQL apenas por ambos
suportarem transacoes. Em READ COMMITTED, a leitura de custos depois de obter o
lock do evento pode observar o commit do escritor anterior. Outro isolamento
exige revalidar snapshots e erros de serializacao, sem alterar configuracoes agora.

Falhas fazem rollback; a rota atual tenta descartar conexao quando rollback
falha e protege release apos commit. Na RPC, a infraestrutura gerencia a conexao;
nao criar um falso handle SQL no Node. Preservar a resposta segura e o resultado
incerto quando nao for possivel confirmar a publicacao. Sem retry automatico.
Locks nao garantem idempotencia: o contrato atual nao impede duas publicacoes
sequenciais validas. Nao acrescentar chave unica ou regra de publicacao unica.

## Fluxo 3 — aprovar/rejeitar solicitacao de acesso

Sequencia MySQL: JWT/admin e validacao de id/status -> getConnection -> BEGIN ->
bloquear solicitacao -> conferir pendente -> se aprovado, UPDATE do usuario
WHERE id=? AND perfil='participante' exigindo uma linha afetada -> atualizar
status da solicitacao -> COMMIT -> HTTP 200. ROLLBACK nas falhas e release no
finally. Os dois UPDATEs e o SELECT usam a mesma conexao.

Ausente: 404. Ja analisada: 409. Aprovacao sem exatamente um usuario participante
atualizado: 409. Rejeicao NAO atualiza nem exige que o perfil atual seja ainda
participante; nao acrescentar essa restricao. Sucesso conserva as duas mensagens
de aprovacao/rejeicao. Falha tecnica conserva o caminho 500 e sanitizacao atual.
As particularidades de erro de rollback/release documentadas nos contratos nao
devem ser convertidas em sucesso ou ocultar um resultado incerto.

Proposta: uma RPC de decisao atomica. Bloquear solicitacao primeiro e conservar
o UPDATE condicional do perfil; o UPDATE tambem bloqueia a linha do usuario.
Conferir ROW_COUNT, em vez de presumir sucesso. Diferentes solicitacoes do mesmo
usuario tambem devem disputar a atualizacao condicional, sem promover duas vezes.
No PostgreSQL, perfil_solicitado e usuarios.perfil sao ENUMs distintos: converter
explicitamente via texto para o enum de destino, apenas para os valores atuais
organizador/fornecedor. Nao alterar enums ou regras de aprovacao nesta fase.

## RPCs necessarias e operacoes diretas

Com a fabrica supabase-js atual, os TRES fluxos de negocio acima precisam de
uma chamada atomica cada. Leituras FOR UPDATE nao podem virar chamadas REST
independentes. A alternativa seria um adaptador de conexao PostgreSQL real,
fora do escopo atual; nao introduzi-lo como fallback.

Leituras comuns independentes podem usar PostgREST diretamente, com as limitacoes
ja registradas. Escritas ja expressas em uma unica instrucao independente, como
INSERT de evento ou UPDATE de evento filtrado por ID/proprietario/status, podem
ser candidatas a operacoes diretas em sua etapa propria. Nenhuma escrita foi
migrada ou declarada validada por este plano. Operacoes encadeadas nao herdam
atomicidade apenas por reutilizar o mesmo cliente Supabase.

RPCs de escrita: VOLATILE, chamadas de escrita, SECURITY INVOKER e schemas
explicitos. A transacao e da requisicao PostgREST, nao de comandos BEGIN/COMMIT
enviados em chamadas separadas. Excecoes devem abortar escritas; nao capturar
falha SQL e devolver objeto de sucesso. A infraestrutura finaliza commit ou
rollback e libera recursos. Bloco BEGIN de PL/pgSQL nao e BEGIN transacional.

JWT proprio, perfil atual e origem confiavel de req.usuario.id continuam no
backend. Nao usar auth.uid() como substituto do JWT do TrocaTicket. As funcoes
devem conferir propriedade e precondicoes do negocio, pois service_role ignora
RLS. Parametros de ator nao podem vir livremente do corpo do cliente.
O codigo atual consulta o perfil no middleware, antes do handler; nao afirmar
que ja revalida o perfil administrativo dentro da transacao. O desenho futuro
deve fixar a fronteira de confianca com o backend e impedir execucao por clientes
nao autorizados. admin=true, ID recebido do cliente ou SECURITY INVOKER isolado
nao comprovam autorizacao. Rever os privilegios especificos antes de expor RPCs.

Definir erros de negocio identificaveis pela futura camada de persistencia e
mapeados aos mesmos HTTP/mensagens. Nao mapear todo SQLSTATE de banco para 409.
Deadlock, timeout e falha tecnica nao podem disparar nova escrita automaticamente.
Timeout/desconexao apos possivel commit exige consulta de confirmacao por leitura;
nao prometer rollback remoto de uma operacao ja confirmada.
Sem identificador de operacao, uma leitura posterior pode nao provar qual
tentativa confirmou. Ela auxilia reconciliacao, nao garante confirmacao exata.
Nao acrescentar idempotencia ou reenvio automatico nesta migracao por inferencia.

Cada nova RPC requer revisao especifica de EXECUTE para PUBLIC/anon/authenticated
e service_role antes de exposicao. O risco aceito das ACLs e limitado a codigo e
testes simulados. Nao alterar defaults globais nem supabase_admin neste plano.

## Ordem recomendada e criterios de conclusao

1. **Contratos e testes simulados:** fixar entradas/saidas, erros, casts de enums,
   protocolo de locks e diferencas de transporte. Reutilizar suites existentes;
   nao contar stubs de locks ou SELECTs parciais como operacoes migradas.
2. **Custos atomicos + leitura compartilhada:** implementar futuramente o conjunto
   que preserva listarPorEvento e bloquearEventoDoUsuario no PUT. Validar vazio,
   IDs gerados, ordem, escala monetaria e rollback se a releitura falhar.
   PUT versus PUT no mesmo evento deve serializar; eventos distintos nao devem
   receber um lock global da aplicacao. Nao exigir IDs consecutivos ou restauracao
   dos valores de sequencia apos rollback: PostgreSQL pode deixar lacunas.
3. **Publicacao atomica:** depender do protocolo anterior. Validar custos vazios,
   evento alheio, revisao 409, snapshot e falhas em cada INSERT/commit. Disputa:
   PUT primeiro -> POST espera e revisao antiga conflita; POST primeiro -> snapshot
   publicado persiste mesmo apos PUT. Nao confundir snapshot de itens publicados
   com custos que podem mudar depois.
4. **Decisao de acesso atomica:** fluxo independente de custos/publicacao; pode
   ser preparado separadamente, sem dependencias artificiais. Validar aprovacao,
   rejeicao com perfil ja alterado, enums, usuario nao participante, decisao
   repetida e duas solicitacoes distintas para o mesmo usuario.
   Aprovar versus rejeitar a mesma solicitacao: uma decisao conclui; a seguinte
   observa que ja foi analisada. Falha ao finalizar status depois de promover
   perfil deve reverter ambos os UPDATEs. Rejeicao nao altera perfil do usuario.
5. **Validacao integrada autorizada:** apenas ambiente descartavel confirmado;
   demonstrar espera/liberacao dos locks com duas sessoes, rollback integral e
   ausencia de gravacao parcial. Conferir falhas e resultados incertos sem retry.
   Mocks nao comprovam locks, isolamento ou equivalencia de instantes reais.
6. **Ativacao posterior, com autorizacao:** conferir identidade/provedor e dados
   reconciliados; preservar MySQL e modo isolado ate liberacao propria. Nao ativar
   rotas por ter passado apenas em mocks ou criado uma RPC no banco de teste.

O progresso de 22/27 so aumenta ao substituir efetivamente cada metodo pendente
com suas invariantes e testes, sem contar duas vezes o lock de evento compartilhado.
Os contratos de negocio das RPCs devem ser rastreados separadamente da contagem
historica dos 27 metodos SELECT.

## Historico da revisao documental anterior

- server.js: POST /cotacoes, PUT /eventos/:id/custos e PATCH /solicitacoes-acesso/:id.
- repositories/mysql/custos.cjs, cotacoes.cjs e solicitacoes-acesso.cjs.
- CONTRATOS.md e DEPENDENCIA_TRANSACIONAL_CUSTOS.md.
- Anexo do usuario Texto colado.txt, incluindo sua revisao documental anterior.
- tests/custos-repository.test.cjs, cotacoes.test.cjs,
  solicitacoes-acesso-repository.test.cjs e demais suites existentes.
- https://docs.postgrest.org/en/v12/references/transactions.html
- https://www.postgresql.org/docs/current/explicit-locking.html

Somente este plano foi atualizado. A analise detalhada de custos.listarPorEvento
permanece em DEPENDENCIA_TRANSACIONAL_CUSTOS.md, preservada sem alteracoes; nao
foi duplicada neste documento. Fontes funcionais, testes e configuracoes do
backend sao comparados por hash antes/depois da revisao.

Antes da execucao da suite, foram conferidos o script npm test e os caminhos
de dependencias: handlers carregados em VM com db/dotenv/HTTP substituidos;
repositorios usam executores/clientes injetados; testes de provider e PostgreSQL
substituem drivers/SDK; inicializador isolado usa processo/banco/servidor falsos.
Subprocessos existentes servem a testes de fuso, com clientes injetados. Os oito
casos de comparacao real permanecem SKIP sem callbacks de conexao. Nenhum script
de teste de conexao real e chamado pelo npm test. Essa verificacao nao e auditoria
do isolamento de uma instancia real nem substitui testes integrados posteriores.

Resultados atuais, revalidados nesta revisao:
- npm test: 593 testes, 585 aprovados, zero falhas e oito SKIP. As comparacoes
  reais ignoradas nao foram consideradas aprovadas.
- node --check: sintaxe aprovada em 46 arquivos JS/CJS de repositorios, testes,
  config e server/db. Nenhum desses modulos foi iniciado como servidor real.
- git diff --check: concluido com exit code 0. O impedimento de acesso negado
  informado no anexo nao se repetiu. Como o plano pode estar nao rastreado pelo
  Git, conferir tambem whitespace e links locais do documento diretamente.
- Hash conjunto dos 48 arquivos funcionais/testes/configuracao/pacotes e hash
  de DEPENDENCIA_TRANSACIONAL_CUSTOS.md preservados antes/depois da revisao.
- Nenhuma consulta real, nova RPC, permissao, autenticacao ou rota alterada.
- Pendentes: contratos detalhados das RPCs, autorizacao para implementacao e
  exposicao de objetos, testes integrados de locks/rollback/concorrencia e
  validacao de isolamento, instantes importados e resultados incertos.

Progresso mantido em 22/27. Esses resultados historicos aprovam a verificacao
documental anterior; nao liberam ativacao do Supabase.

## Preparacao local autorizada — substituicao de custos

Artefatos exclusivos deste fluxo:
- [SQL preparado](../Banco%20de%20dados/rpc_substituir_custos_evento.preparacao.sql).
- [Adaptador independente](repositories/supabase/custos-transacao.cjs).
- [Testes sem conexao real](tests/custos-transacao-supabase.test.cjs).

Contrato do adaptador: criarAdaptadorSubstituicaoCustos(clienteOpcional,
{ timeoutMs = 15000 }).substituir(eventoId, usuarioId, custos). Recebe os itens
do contrato PUT (valor_estimado), nao item.valor da interface. Valida toda a
lista antes de criar cliente ou enviar requisicao, com as regras e mensagens
do handler atual. Normaliza dinheiro somente por operacoes textuais; nao
arredonda nem faz aritmetica monetaria em ponto flutuante. Preserva trim,
comprimentos em pontos Unicode e array vazio. IDs dos custos enviados sao
ignorados; a substituicao gera novos IDs. Nao exige IDs consecutivos.

Sem cliente injetado, reutiliza tardiamente criarClienteSupabase, sem modificar
a fabrica, provider ou configuracao. "Independente" significa nao ligado a
rotas: NAO habilita Supabase no modo isolado MariaDB, que continua exclusivo.
O ator deve futuramente vir de req.usuario.id autenticado, nunca do payload.
Nenhum JWT de usuario e recebido ou encaminhado pelo adaptador.

RPC preparada: public.substituir_custos_evento(bigint, bigint, jsonb), uma
chamada POST, VOLATILE, SECURITY INVOKER, search_path vazio e schemas explicitos.
Argumentos: p_evento_id, p_usuario_id, p_custos. Os valores monetarios internos
devem ser strings canonicas nao negativas de duas casas, ate 9999999999.99.
Validacao integral -> perfil organizador -> evento proprio FOR UPDATE -> DELETE
filtrado -> INSERTs na ordem recebida -> releitura ordenada por id -> retorno.
O retorno e um unico JSONB com os cinco campos de Custo; numeric e convertido
em texto ANTES da serializacao JSON. [] permanece []. Nao ha segunda chamada
REST, paginacao ou releitura depois do commit. Nao altera cotacoes existentes.

O primeiro lock de linha e o evento; a futura publicacao precisa bloquear a
MESMA linha antes de ler/bloquear custos. O SELECT de perfil nao adquire lock
de linha e nao cria um novo protocolo de bloqueio de usuario. Essa verificacao
adicional nao muda o middleware atual, que permanece intocado. O bloqueio do
evento cobre inclusive custos vazios. Outros escritores que ignorem o protocolo
podem quebrar a coordenacao: esta preparacao nao os protege por inferencia.

Nao ha tratamento SQL que capture falhas e permita commit parcial. A transacao
e finalizada pelo PostgREST; erro em DELETE, INSERT, releitura ou commit deve
reverter a requisicao. Lacunas de sequencia sao possiveis. Isso e o desenho do
SQL, ainda NAO comprovado por execucao PostgreSQL.

Erros internos preparados: TC400 (entrada invalida), TC403 (papel/ator recusado),
TC404 (evento ausente/alheio). O adaptador traduz em respostaStatus 400/403/404;
nao escreve HTTP nem altera handlers. Validacao local conserva as mensagens do
PUT. Falhas tecnicas/resposta invalida usam 500 e mensagem generica existente,
sem transportar SQL, parametros, detalhes ou causa do SDK. Falhas tecnicas sao
conservadoramente marcadas resultadoIncerto=true, inclusive erros SQL para os
quais o banco normalmente teria feito rollback. Nunca afirmar commit/rollback
por um erro de transporte. Erros de negocio identificados nao sao incertos.

Uma tentativa por chamada: retry(false) explicito no SDK, AbortSignal e limite
local de 15s (configuravel de 1 a 60000ms). Timeout cancela a espera/transporte,
NAO garante cancelamento remoto ou rollback. Resposta tardia nao vira sucesso.
Nao ha replay, fallback MySQL ou consulta automatica de confirmacao. O fluxo
chamador futuro deve preservar o rascunho e reconciliar por leitura autorizada.
Chamadas explicitas simultaneas nao sao deduplicadas pelo adaptador; a RPC deve
serializar por evento. A interface conserva suas protecoes atuais, inalteradas.

Seguranca de futura instalacao: CREATE sem OR REPLACE, sem GRANT/REVOKE ou
mudanca de defaults. Ha recusa adicional de current_user diferente de
service_role. Isso NAO substitui revisao de EXECUTE nem autoriza instalar/expor
o objeto. A chave privada fornece acesso amplo; o backend continua responsavel
por JWT/perfil/origem do ator. Invoker nao deve ser trocado por DEFINER.
Execucao manual como postgres seria recusada pelo guard: validar futuramente
pelo cliente privado autorizado, sem contornar o guard ou alterar permissoes.

Testes preparados verificam normalizacao, rejeicao integral antes do transporte,
lista vazia, Unicode, valores-limite, retorno, erros sanitizados, timeout, resposta
tardia, fabrica tardia e ausencia de retry. A inspecao estatica verifica ordem
do SQL e ausencia de captura de excecoes/commit interno; NAO executa SQL.
As suites MySQL existentes continuam cobrindo rollback e conexao compartilhada
com mocks. Nao foi criado um simulador SQL apresentado como prova transacional.

Pendencias antes de instalacao/ativacao:
1. Compilar o PL/pgSQL em ambiente descartavel autorizado; conferir versoes,
   PostgREST e papel real da chave privada. O arquivo nao foi executado.
2. Revisar EXECUTE/ACLs do novo objeto, sem herdar exposicao publica indevida;
   risco de defaults aceito apenas para desenvolvimento/mocks permanece aberto.
3. Provar rollback em falha de insercao/releitura/commit e ausencia de alteracao
   em eventos alheios; validar vazio, IDs e decimal real.
4. Testar duas sessoes PUT/PUT e, quando preparada, PUT/publicacao, inclusive
   espera do lock e snapshot. Mocks nao comprovam concorrencia real.
5. Validar UTF-8 real (NUL/surrogates nao representaveis em PostgreSQL nao devem
   ser convertidos com perda), payloads grandes, isolamento e timeout pos-commit.
6. Integrar GET/PUT em etapa propria, com autorizacao; nao declarar migrados
   listarPorEvento/bloquearEventoDoUsuario apenas por preparar esta RPC local.

Progresso permanece 22/27. Na preparacao de custos descrita nesta secao,
publicacao/decisao de acesso ainda nao haviam sido implementadas.
MySQL, db.js, server.js, autenticacao, rotas e provedor ativo foram preservados.

Verificacoes desta preparacao local:
- npm test: 639 testes, 631 aprovados, zero falhas e oito SKIP; inclui as
  46 novas verificacoes de adaptador/contrato SQL. Sem consultas reais.
- node --check: adaptador e novo arquivo de testes aprovados.
- git diff --check: exit code 0; whitespace dos arquivos novos tambem conferido
  diretamente, pois arquivos nao rastreados nao integram o diff comum.
- A primeira tentativa de node --test foi impedida por spawn EPERM do sandbox,
  nao por falha dos testes. A suite completa foi executada com a permissao
  necessaria para os subprocessos locais. Nao houve instalacao de dependencias.
- Revisao local: lista esparsa tambem e validada integralmente; erros de
  transporte nao podem forjar os campos de um erro de negocio confiavel.
- PL/pgSQL nao compilado nem executado. Locks, transacoes e rollback reais
  continuam pendentes; nao contabilizar mocks ou SKIP como prova integrada.

## Revisao critica local antes da publicacao

Achado corrigido: a validacao de resposta usava Array.map, que pula posicoes
ausentes em arrays esparsos. Uma resposta malformada com tamanho correto podia
ser aceita sem validar todos os itens. Agora Array.from verifica cada posicao;
o teste de regressao exige erro incerto sem retry. JSON valido nao produz arrays
esparsos; ainda assim, o adaptador nao deve aceitar tal objeto do transporte.

Teste anteriormente chamado "IDs fora de ordem ou repetidos" cobria somente
ordem invertida. Passou a cobrir tambem IDs repetidos. O mock principal ecoa
entrada e continua util para validacao/projecao, mas nao e oraculo de persistencia.
Foi acrescentada resposta independente com IDs gerados e lacunas, outros IDs
de evento/ator, itens distintos e rejeicao de campos extras enviados no corpo.
Isso verifica o contrato de delegacao, nao a autoria real do ator.

Tres testes adicionais usam o SDK REAL instalado com fetch integralmente falso:
verificam POST, caminho RPC, JSON monetario textual, 503 sem reenvio e timeout
com abort. Nao resolvem DNS nem fazem requisicoes externas. Evitam depender
somente de um mock fluente que presumiria o comportamento de retry(false).

Conclusoes conferidas no codigo, sem executar SQL:
- A identidade atual em server.js vem de JWT HS256 verificado, ID seguro e
  usuario relido no repositorio; permitirPerfis exige organizador. O novo
  adaptador recebe um numero: nao autentica quem o forneceu. A futura montagem
  deve passar EXCLUSIVAMENTE req.usuario.id, nunca body.usuario_id. O teste de
  extras nao comprova essa integracao, ainda inexistente. Nao expor a RPC como
  substituto publico do middleware. Nenhuma autenticacao foi modificada.
- A RPC verifica perfil e propriedade, bloqueia a linha do evento antes de
  DELETE/INSERT e rele os cinco campos ainda na mesma funcao. [] e valido;
  insercoes seguem a ordem da lista e a resposta e ordenada por IDs efetivos.
  Valores sao texto canonico e o cast numeric(12,2) ocorre apos a validacao.
  A futura publicacao deve participar do mesmo lock do evento. Nao foi criada.
- Nao existe EXCEPTION WHEN que capture erro e permita commit parcial. Falhas
  SQL propagam para a transacao PostgREST. Testes estaticos de texto NAO validam
  compilacao, semantica PostgreSQL, propriedade, bloqueios ou rollback reais.
  Os testes de rollback MySQL simulam o handler atual; nao validam a nova RPC.
- O SELECT de perfil e simples e ocorre antes da espera pelo evento. Nao garante
  perfil imutavel ate o commit, assim como o middleware MySQL atual. Nao foi
  introduzido lock de usuario nem prometida protecao adicional contra revogacao
  concorrente. Conferir o isolamento real antes de habilitar os escritores.
- TC400/TC403/TC404 sao traduzidos pelo adaptador, sem propagar mensagem SQL.
  A futura rota deve usar esse mapeamento, nao repassar automaticamente o HTTP
  bruto do PostgREST. Timeout/erro tecnico/resposta invalida continuam incertos;
  abort do cliente nao prova rollback remoto. Nenhuma escrita e repetida.

Exposicao e privilegios de futura instalacao (somente inventario, SEM comandos):
- A funcao seria criada em public, esquema exposto pelo PostgREST. Os defaults
  conhecidos podem conceder EXECUTE a PUBLIC/anon/authenticated. O guard de
  current_user recusa esses papeis, mas nao torna desnecessaria a revisao de ACLs.
  A instalacao/exposicao continua bloqueada ate revisao especifica autorizada.
- Com SECURITY INVOKER, o papel executor precisa de USAGE em public, EXECUTE
  nessa assinatura, SELECT de usuarios (id/perfil) e eventos (id/usuario_id),
  privilegio UPDATE em eventos para FOR UPDATE, SELECT/DELETE/INSERT de
  custos_evento e acesso de sequencia necessario ao ID gerado. Defaults atuais
  nao sao prova de que cada um desses requisitos existe; nao foram consultados.
  Nao ha necessidade de conceder administracao, BYPASSRLS ou DEFINER novos.
- service_role ja e o papel previsto da chave privada e ignora RLS. Ter esse
  papel nao vincula p_usuario_id a um usuario do TrocaTicket: a chave privada
  autoriza o backend, enquanto JWT/middleware atestam o usuario da aplicacao.
  Concessoes/credenciais nao podem ir ao frontend. Nenhum privilegio foi alterado.

Validacao real ainda pendente: compilacao PL/pgSQL, papel e privilegios efetivos,
propriedade/perfil reais, RLS, decimal e Unicode no transporte, rollback em cada
etapa, espera de locks com duas sessoes e resultado incerto apos possivel commit.
Aceitar os testes locais nao autoriza exposicao da funcao ou ativacao de rotas.
Progresso mantido em 22/27.

Resultados revalidados apos esta revisao: npm test com 644 testes, 636 aprovados,
zero falhas e oito SKIP. A suite especifica tem 51 aprovados; inclui cinco casos
novos e o reforco do caso de IDs duplicados. node --check nos dois arquivos
JS/CJS alterados e git diff --check aprovados; whitespace dos quatro arquivos
alterados conferido diretamente. Hashes de server.js, db.js, db-supabase.cjs,
CONTRATOS.md, package/lock, configuracao e todos os repositorios MySQL permaneceram
iguais. Nenhum SQL/servidor/banco real foi executado ou iniciado.

Referencias de privilegios conferidas na revisao (nao sao evidencias do banco):
- https://www.postgresql.org/docs/current/sql-select.html — FOR UPDATE exige
  tambem UPDATE em pelo menos uma coluna da tabela selecionada.
- https://www.postgresql.org/docs/current/sql-createfunction.html — EXECUTE
  publico por padrao exige revisao especifica antes da exposicao do objeto.

## Preparacao local autorizada — publicacao de cotacao

Artefatos:
- [RPC preparada](../Banco%20de%20dados/rpc_publicar_cotacao.preparacao.sql).
- [Adaptador independente](repositories/supabase/cotacoes-publicacao.cjs).
- [Testes locais](tests/cotacoes-publicacao-supabase.test.cjs).
- [Validacao pura compartilhada](repositories/supabase/validacao-custos.cjs).

O normalizador da preparacao anterior de custos foi movido, sem mudar as regras
ou mensagens, para validacao-custos.cjs. Ambos os adaptadores o reutilizam; a
publicacao converte erros de entrada para a mensagem propria do POST. A suite
de custos e executada novamente para verificar a extracao. O pequeno ajuste em
seu teste VM permite importar esse modulo puro, sem inicializar SDK ou conexao.
Nao ha alteracao no SQL de substituicao de custos nem no handler MySQL.

Interface local: criarAdaptadorPublicacaoCotacoes(clienteOpcional,
{ timeoutMs = 15000, agora = () => new Date() }).publicar(usuarioId, entrada).
entrada segue o corpo atual do POST; usuarioId deve vir EXCLUSIVAMENTE do
req.usuario.id estabelecido pelo middleware, nunca de entrada.usuario_id.
O adaptador nao autentica esse numero. A futura integracao ainda precisara de
testes dessa fronteira; hoje nenhuma rota o importa. "Independente" NAO ativa
Supabase no modo isolado MariaDB nem altera o provider ativo.

Antes da RPC: verificar ator, evento seguro com a coercao numero/string atual,
lista revisada inteira, observacoes string opcional sem trim (default vazio),
formato de prazo, calendario ISO real e dia UTC. Itens revisados vazios passam
a validacao de entrada, como no MySQL. IDs/metadados extras nao sao fonte das
escritas. Dinheiro e normalizado em strings de duas casas, sem arredondamento.
Relogio invalido e recusado localmente com erro seguro, sem enviar requisicao.

RPC public.publicar_cotacao(bigint,bigint,text,text,text,jsonb):
p_evento_id, p_usuario_id, p_prazo, p_hoje_utc, p_observacoes e p_itens. Os itens
internos usam apenas categoria/descricao/valor_estimado textual canonico.
p_hoje_utc e capturado uma unica vez pelo backend, antes da espera por locks,
preservando o instante da validacao atual. NAO usa CURRENT_DATE nem o fuso da
sessao PostgreSQL, nem avanca o limite se houver espera atraves da meia-noite.
Esse parametro e tao confiavel quanto o ator: nao pode ser aceito do cliente.

Sequencia SQL preparada: validacao de entrada/calendario -> perfil organizador
-> evento proprio FOR UPDATE -> custos WHERE evento_id ORDER BY id FOR UPDATE
-> normalizacao dos custos persistidos -> vazio/compare -> INSERT cotacao
RETURNING id -> INSERTs dos itens persistidos -> retorno. Perfil e leitura
simples; primeiro lock de linha e o evento, identico ao da substituicao.
Comparar e escrever ocorre na mesma requisicao/transacao PostgREST.

A RPC normaliza categoria/descricao com o trim ECMAScript existente e converte
numeric(12,2) persistido em TEXTO antes de JSONB. Negativo/NaN/campos invalidos
persistidos falham, em vez de publicar. Arrays revisado e persistido sao ambos
reconstruidos com os mesmos tres campos e formato canonico de objeto JSONB.
A comparacao de suas serializacoes usa explicitamente COLLATE pg_catalog."C":
quantidade, ordem e valores textuais devem ser exatos, sem igualdade aproximada
da collation ICU das colunas, normalizacao Unicode ou comparacao por IDs.
Essa comparacao ainda exige execucao PostgreSQL real para validacao final.

Fonte exclusiva de INSERT de itens e de cotacao.itens: v_persistidos, nunca
p_itens nem v_normalizados. Modalidade Fechada/status Aberta fixos, observacoes
preservadas, sem filtro adicional de status/data do evento. A RPC retorna o
objeto cotacao; o adaptador o envolve em mensagem e cotacao, conservando os
campos {id,evento_id,prazo,modalidade,observacoes,status,itens}; itens
sem IDs e com decimal textual. Retorno e construido do snapshot validado,
como no MySQL; nao ha consulta REST posterior nem risco de paginar esse snapshot.
O adaptador projeta e valida todo o retorno, inclusive arrays esparsos/IDs seguros.

Erros preparados e mapeamento do adaptador:
| Codigo SQL | Status futuro / semantica |
|---|---|
| TP400 | 400, informe evento/prazo/itens validos |
| TP401 | 400, prazo invalido ou anterior ao dia UTC capturado |
| TP403 | 403, papel privado/perfil recusado |
| TP404 | 404, evento ausente/alheio |
| TP402 | 400, cadastre custos persistidos |
| TP409 | 409, custos divergentes; consultar e revisar |
| TP500 ou outro erro tecnico | 500, publicacao nao confirmada |

As mensagens portuguesas sao as do handler/CONTRATOS.md. Codigo HTTP do
PostgREST nao deve ser repassado diretamente. O adaptador nao escreve HTTP nem
altera os handlers. Erros de negocio reconhecidos nao sao incertos; falhas
tecnicas, resposta invalida, desconexao ou timeout sao conservadoramente
resultadoIncerto=true. SDK/SQL/parametros/credenciais nao integram o erro seguro.
Nao foi introduzido campo idempotente, publicacao unica ou pesquisa de cotacao
anterior. Duas acoes explicitas validas podem gerar duas cotacoes, como hoje.

VOLATILE/SECURITY INVOKER/search_path vazio/guard service_role preservam a
estrategia de custos. A captura de SQLSTATE 22007/22008 e restrita a casts de
calendario ANTES de qualquer lock/escrita e relanca TP401. Nao ha captura apos
os locks: erro de custo, INSERT, construcao da resposta ou commit deve abortar
a transacao inteira, sem sucesso parcial. Nao ha COMMIT interno. Falha remota
apos commit pode ser incerta: AbortSignal e limite local nao provam rollback.
Uma RPC POST por acao, retry(false), sem repeticao ou reconciliacao automatica.

Permissoes/exposicao continuam apenas documentadas. Antes de instalar a RPC,
revisar EXECUTE nessa assinatura, USAGE public, SELECT usuarios/eventos/custos,
UPDATE nas tabelas bloqueadas (eventos E custos_evento), INSERT cotacoes/itens,
SELECT do id retornado e acessos necessarios as sequencias geradoras. Guard
service_role nao comprova origem do ator nem substitui ACLs especificas. O
risco conhecido das ACLs padrao nao autoriza expor novo objeto. Nenhuma concessao,
RLS, papel ou default foi alterado; nao usar DEFINER como atalho.

Testes significativos: contrato comparado com o handler MySQL carregado em VM
com persistencia falsa; validacao/erros/datas/prioridades, UTC, Unicode, valores
limite, ordem, vazio, 409 e resposta independente; SQLSTATEs/erros sanitizados;
timeout e resposta atrasada; SDK instalado com fetch inteiramente simulado;
fabrica tardia e ausencia de retry/idempotencia. As verificacoes estaticas do
SQL conferem o mesmo lock de evento, custos id ASC, comparacao antes de INSERT
e origem persistida dos itens. Nao executam SELECT, DDL ou RPC reais.

Os mocks de handler e os testes existentes PUT/POST concorrentes NAO executam
a nova funcao PostgreSQL. Compilacao PL/pgSQL, ACL/papel efetivo, calendario e
Unicode reais, comparacao C/JSONB, precisao, espera de locks, rollback em cada
INSERT/commit e concorrencia PUT/POST em duas sessoes continuam pendentes.
Outro isolamento ou escritores que ignorem o lock do evento exigem revisao.
Progresso mantido em 22/27; nenhuma operacao foi declarada migrada por ter sido
apenas preparada localmente. Ativacao exige autorizacao posterior.

Consolidacao autorizada pelo usuario: reutilizar a outra preparacao existente.
Os tres caminhos acima e o nome publicar_cotacao foram mantidos como canonicos.
As tres duplicatas criadas nesta sessao (RPC publicar_cotacao_evento, adaptador
publicacao-cotacao.cjs e sua suite) foram removidas APENAS apos integrar suas
verificacoes relevantes. Nao ha segunda implementacao ativa ou preparada.

Foram incorporados: normalizador puro compartilhado; erros de prazo TP401;
captura restrita a calendario antes dos locks; comparacao textual C de arrays
JSONB canonicos; verificacao decimal textual/estrutura da resposta; recusa de
codigos herdados como SQLSTATE; erro seguro de relogio. Testes diferenciais do
handler MySQL, UTC, resposta independente, ausencia de idempotencia e fabrica
tardia foram integrados a suite existente, sem preservar uma suite duplicada.
Um teste VM inicialmente falhou por comparar prototipos de realms distintos;
o mock foi corrigido para comparar os valores das opcoes. Nao era falha da RPC.

Depois da consolidacao: 40 testes de publicacao e 51 de custos aprovados na
execucao especifica. A compilacao e os testes transacionais reais permanecem
pendentes. Nao executar o SQL preparado sem autorizacao e revisao de privilegios.

Verificacao final consolidada: npm test com 684 testes, 676 aprovados, zero
falhas e oito SKIP. O total diminuiu ao remover a suite paralela e consolidar
seus casos relevantes, sem contar cenarios duplicados como progresso. Sintaxe
dos cinco modulos/testes JS/CJS novos ou ajustados aprovada; git diff --check
sem erros, apenas avisos de normalizacao futura LF/CRLF. Whitespace dos novos
arquivos e ausencia dos tres duplicados tambem conferidos diretamente.
MySQL, server/db, fabrica Supabase, contratos, pacotes e configuracao principal
preservados por comparacao de hashes; nenhuma consulta ou RPC real executada.
Progresso final deste incremento: 22/27, aguardando revisao do usuario.

## Revisao critica da preparacao consolidada e validacao compartilhada

Nao foi confirmado defeito funcional adicional nos contratos JSON analisados.
SQL, adaptadores e normalizador nao precisaram de nova alteracao nesta revisao.
Foram corrigidas lacunas de cobertura, sem atribuir a mocks garantias de banco.

**Inspecao estatica:** imports e links locais resolvem para os arquivos
canonicos; nao ha referencia executavel as tres duplicatas removidas. Os nomes
antigos permanecem somente no historico documental da consolidacao. As duas
RPCs preservam propriedade e o primeiro lock do evento; publicacao bloqueia
depois custos id ASC, compara arrays normalizados e grava apenas v_persistidos.
Nao ha captura de falhas depois dos locks, retry ou nova regra de unicidade.
Prazo usa o dia UTC fornecido pelo backend, snapshot e dinheiro textual mantem
os contratos, e as capturas de calendario continuam anteriores as escritas.

**Testes simulados adicionais:**
- [custos-validacao-contrato.test.cjs](tests/custos-validacao-contrato.test.cjs)
  compara o normalizador diretamente com o handler PUT MySQL atual em VM,
  com repositorios/conexao falsos. Verifica valores limite, Unicode/trim,
  prioridade e mensagens de cada classe de erro. Nao copia um segundo
  normalizador para servir de oraculo. ID invalido e vazio tambem sao comparados.
- O PUT conserva mensagens especificas; a publicacao traduz entrada invalida
  para sua mensagem generica propria. [] e valido no PUT/normalizador, mas
  a publicacao depende da verificacao dos custos persistidos na RPC. Esse teste
  nao transforma uma resposta RPC falsa em prova de verificacao real do banco.
- Suites de custos/publicacao foram ampliadas com respostas independentes
  malformadas: buracos no inicio/fim, ordem/quantidade, campos ausentes, tipos,
  IDs inseguros, escala monetaria e newline. Todas exigem erro incerto e uma
  tentativa; nao ecoam nem modificam os dados revisados para fabricar sucesso.
- O teste de referencias resolve arquivos/imports/links sem executar os modulos.
  Os testes anteriores de SDK usam fetch inteiramente falso. As suites MySQL
  de rollback/concorrencia simulada continuam preservadas, sem novo motor SQL.

**Limites mantidos:** usuarioId e dia UTC nao sao autenticados pela assinatura
da RPC; devem vir do middleware/relogio confiaveis na futura integracao. Nenhuma
rota foi ligada aos adaptadores. O guard service_role nao substitui revisao de
EXECUTE/ACLs. Perfil nao fica bloqueado ate o commit. Somente PostgreSQL real
pode comprovar compilacao, privilegios/RLS, isolamento, espera/liberacao de locks,
comparacao C/JSONB, precisao/Unicode no transporte e rollback de cada etapa.
Timeout/abort nao garante rollback remoto; ausencia de retry foi verificada
com mocks/SDK simulado. As oito comparacoes reais SKIP continuam pendentes.

Resultado revalidado: 691 testes, 683 aprovados, zero falhas e oito SKIP.
As tres suites focadas somam 98 aprovados (41 publicacao, 52 custos e cinco
de contrato/referencias). node --check em seis modulos/testes relevantes e
git diff --check aprovados, com avisos LF/CRLF ja conhecidos. Nenhum SQL,
RPC, HTTP real ou servidor foi executado. Nenhuma dependencia foi instalada.
Alteracoes deste incremento: este plano, as duas suites de respostas e a nova
suite de contrato; nao houve implementacao do fluxo de acesso. Progresso: 22/27.

## Preparacao local autorizada — decisao de solicitacoes de acesso

Verificada previamente a ausencia de equivalentes transacionais; o repositorio
Supabase solicitacoes-acesso.cjs existente permanece apenas de leitura, intocado.
Artefatos independentes:
- [RPC preparada](../Banco%20de%20dados/rpc_decidir_solicitacao_acesso.preparacao.sql).
- [Adaptador](repositories/supabase/solicitacoes-acesso-decisao.cjs).
- [Testes locais](tests/solicitacoes-acesso-decisao-supabase.test.cjs).

Interface: criarAdaptadorDecisaoAcesso(clienteOpcional, {timeoutMs=15000})
.decidir(adminId, solicitacaoId, status). adminId deve vir EXCLUSIVAMENTE de
req.usuario.id autenticado e autorizado por permitirPerfis("admin"); nao aceita
ator, papel ou status aninhados no corpo como substituto desses argumentos.
O numero em si nao e identidade autenticada. A RPC exige service_role e confere
o perfil atual de p_admin_id, mas nao substitui JWT/middleware nem ACLs. Nao ha
lock do ator administrativo ate o commit nem promessa de revogacao atomica.

Contrato preservado: Number(id), Number.isInteger e positivo; status exato
aprovado/rejeitado. Diferentemente de custos/publicacao, o handler atual NAO
exige isSafeInteger no ID da solicitacao. Para nao introduzir novo 400 ou
overflow bigint, o adaptador envia String(Number(id)); p_solicitacao_id e NUMERIC.
O esquema auditado tem ID INTEGER: depois de validar entrada e administrador,
valores acima de 2147483647 retornam 404 sem cast para integer ou acesso a outra
tabela. Dentro da faixa, usa o cast integer e o indice da PK. Esse limite deriva
do esquema atual; mudanca futura de tipo de PK exige revisar o guard. IDs de
administradores continuam seguros, como os IDs autenticados pelo middleware.
Nao foi criada nova politica para IDs nao seguros nas rotas MySQL existentes.

RPC public.decidir_solicitacao_acesso(bigint,numeric,text):
1. Validar papel privado/entrada e administrador atual.
2. SELECT da solicitacao FOR UPDATE; somente depois conferir o status.
3. Ausente: TA404. Estado diferente de pendente: TA409.
4. Se aprovado, UPDATE usuarios WHERE id=usuario_id AND perfil='participante'.
   Converter perfil_solicitado::text::public.usuarios_perfil_enum, pois os enums
   origem/destino sao tipos diferentes. GET DIAGNOSTICS ROW_COUNT deve ser 1;
   zero ou outro valor levanta TA412. O UPDATE adquire o segundo lock implicito.
5. Se rejeitado, pular totalmente o UPDATE de usuario: nenhum requisito novo
   sobre o perfil atual do destinatario.
6. UPDATE do status na solicitacao ja bloqueada, com cast explicito para
   public.solicitacoes_acesso_status_enum; retornar apenas mensagem de sucesso.

Os rotulos dos tres enums foram conferidos no DDL local, sem alterar ou consultar
o banco: usuarios organizador/fornecedor/participante/admin; perfil solicitado
organizador/fornecedor; status pendente/aprovado/rejeitado. O SQL nao adiciona
valores, casts globais ou regras de aprovacao. UPDATE de status conserva o filtro
por ID atual; nao introduz requisito novo de contagem nesse UPDATE. A contagem
exatamente igual a um e exigida no UPDATE de perfil, como no handler MySQL.

VOLATILE, SECURITY INVOKER, search_path vazio e schemas explicitos. Uma chamada
POST, com lock, dois UPDATEs quando aprovado e resposta na mesma transacao.
Nenhum EXCEPTION captura falhas; falha no cast/status ou commit deve reverter
tambem o perfil. PostgREST finaliza commit/rollback e conexao. Os callbacks de
rollback/release do driver MySQL nao existem nessa interface; nao alegar que
foram executados pelo adaptador, nem converter falha de finalizacao em sucesso.
Os handlers MySQL e seus testes desse comportamento permanecem preservados.

Mapeamento preparado, com mensagens atuais:
| Codigo | Status e mensagem |
|---|---|
| TA400 | 400 — Informe uma solicitação e um status válidos. |
| TA403 | 403 — Você não tem permissão para realizar esta ação. |
| TA404 | 404 — Solicitação não encontrada. |
| TA409 | 409 — Esta solicitação já foi analisada. |
| TA412 | 409 — O usuário não possui mais o perfil participante. |
| erro tecnico/timeout/resposta invalida | 500 — Erro interno ao analisar solicitação. |

Sucesso: {mensagem:"Solicitação aprovada com sucesso!"} ou
{mensagem:"Solicitação rejeitada com sucesso!"}, sem IDs/perfil do usuario.
O adaptador exige objeto com mensagem propria e exata da decisao, rejeita arrays,
vazios, tipos errados/mensagem da outra decisao e projeta apenas essa propriedade.
Erros nao propagam SQL, parametros, causa do SDK, dados restaurados ou credenciais.
Codigos de negocio sao identificados sem consulta a propriedades herdadas.

Factory Supabase existente reutilizada tardiamente. Nao inicializa SDK ao
importar ou rejeitar entrada. retry(false) e AbortSignal por chamada, limite
local de 15s (configuravel de 1 a 60000ms). Timeout/erro tecnico/resposta invalida
tem resultadoIncerto=true e nunca reenvia. O abort nao prova rollback remoto;
sucesso atrasado nao altera o resultado local. Erros de negocio reconhecidos
nao sao incertos. Chamadas explicitas repetidas dependem do estado bloqueado,
sem nova regra de idempotencia. Nao ha ligacao a rotas, troca de provider ou
Supabase no modo isolado MariaDB; "independente" significa preparacao sem ativacao.

Seguranca de futura instalacao: revisar USAGE public, EXECUTE da assinatura,
SELECT usuarios/solicitacoes e privilegios UPDATE necessarios aos locks e
colunas alteradas. Nao requer novas sequencias, inserts, superusuario, DEFINER
ou BYPASSRLS adicionais. O risco de ACLs padrao continua aberto para objetos
novos; este arquivo NAO autoriza instalacao/exposicao nem altera permissoes.

Testes locais executam o handler MySQL atual em VM como oraculo de contrato,
com persistencia/conexao falsas; comparam aprovacao dos dois perfis, rejeicao
inclusive quando destinatario ja mudou de perfil, ausente, decisoes repetidas,
contagem de perfil diferente de uma, validacao e mensagens. A simulacao de falhas
em conexao/begin/lock/perfil/status/commit confirma o contrato do oraculo MySQL
e o mapeamento seguro do adaptador; NAO executa etapas internas da nova RPC.
Outros testes cobrem mensagens/respostas malformadas, projecao, timeout tardio,
fabrica inerte, SQLSTATEs, SDK instalado com fetch integralmente falso e inspecao
estatica de SQL/enums. O oraculo foi corrigido para nao substituir um argumento
undefined explicito por ID padrao; era defeito do teste, nao do adaptador.
Assercoes do esquema nao imprimem o dump em caso de falha.

Validacao real PENDENTE, separada dos testes simulados:
- Compilacao PL/pgSQL, binding NUMERIC/strings e identidade/papel/ACLs efetivos.
- Aprovar versus rejeitar a MESMA solicitacao em duas sessoes: uma decisao
  conclui; a segunda deve observar estado analisado ou falha de serializacao
  conforme isolamento real, sem reenvio automatico.
- Aprovar duas solicitacoes distintas do MESMO usuario: o UPDATE condicional
  deve coordenar a disputa e impedir duas promocoes; nao ha lock global novo.
- Rejeicao com perfil ja alterado, casts dos dois perfis permitidos, PK INTEGER
  e IDs grandes, rollback integral apos alterar perfil se status/commit falhar.
- Perda de resposta antes/depois de commit, espera/liberacao dos locks, deadlocks
  e efeitos do isolamento. Nao considerar os mocks prova desses comportamentos.

Nenhuma consulta, SQL ou RPC real executada. Progresso preservado em 22/27;
preparacao local nao constitui migracao validada. Aguardar revisao do usuario.

Verificacao desta preparacao: 24 testes especificos aprovados. npm test completo:
715 testes, 707 aprovados, zero falhas e oito SKIP anteriores. node --check do
novo adaptador e de sua suite aprovados; git diff --check sem erros, com avisos
LF/CRLF ja existentes. Whitespace e links locais dos artefatos tambem conferidos.
Hashes de server.js, db.js, db-postgres.js, db-supabase.cjs, isolamento.cjs,
CONTRATOS.md, pacotes/lock, configuracao e repositorios MySQL preservados.
Nao foram alterados os fluxos locais de custos/publicacao nem criado equivalente
duplicado de decisao. Nenhuma dependencia instalada ou alteracao publicada.

## Revisao critica da decisao e consolidacao das cinco pendencias

Inspecao conferida contra handler/repo MySQL e CONTRATOS.md, sem reabrir analises
de custos ou agregacao. Autor administrativo permanece parametro do backend,
nao identidade autenticada pela propria RPC. SQL confere admin, bloqueia a
solicitacao antes de ler estado, exige uma atualizacao condicional de perfil
somente na aprovacao e atualiza status ainda na mesma transacao. Rejeicao nao
restringe perfil do destinatario. Os casts entre enums e as mensagens continuam
coerentes; nao ha captura SQL que permita sucesso parcial. Isso e inspecao,
nao compilacao ou prova de rollback/concorrencia real.

Falha local reproduzida e corrigida: um codigo de erro JSON como ["TA409"] era
convertido implicitamente em chave textual por Object.hasOwn e classificado
como conflito confirmado (409, resultadoIncerto=false). Agora apenas codigos
string conhecidos recebem tratamento de negocio; array/objeto malformado vira
500 incerto, sem reenvio. O mesmo padrao estava no adaptador de publicacao e
recebeu a mesma correcao minima, com uma regressao dirigida em cada suite. O
adaptador de custos ja usava comparacoes estritas e nao precisou mudar.
Nenhuma mensagem ou status de um SQLSTATE legitimo foi alterado.

Nao foram criados testes para repetir o algoritmo transacional ou aumentar a
contagem. As duas novas verificacoes impedem precisamente a falha reproduzida;
as suites existentes mantem aprovacao/rejeicao, dois 409, respostas invalidas,
timeout, falhas de etapas e as particularidades de rollback/release MySQL.

A matriz unica, atualizada com preparacoes, dependencias, evidencias e criterios
faltantes das cinco operacoes esta em
[LEITURAS_PENDENTES.md](repositories/supabase/LEITURAS_PENDENTES.md).
Ela distingue trabalho local (GET de custos/interface), validacao descartavel
PostgreSQL dependente de autorizacao e metadados/fixtures da origem para
GROUP_CONCAT. Nao solicita novamente resultados de auditoria ja confirmados.
As RPCs locais nao acrescentam operacoes ao inventario: progresso 22/27, sem
encerrar Etapa 5 nem liberar rotas ou mudar o provider.

Verificacao desta revisao: npm test com 717 testes, 709 aprovados, zero falhas e
oito SKIP. Decisao de acesso: 25 testes especificos, incluindo uma regressao
nova para o codigo malformado; publicacao recebeu uma regressao equivalente.
node --check dos dois adaptadores e duas suites aprovados; git diff --check sem
erros (avisos LF/CRLF ja existentes). Links e whitespace dos seis arquivos
alterados conferidos diretamente. Hashes de contratos, schema local, server/db,
fabrica Supabase, isolamento, pacotes, configuracao e repositorios MySQL
permaneceram iguais ao inicio da revisao. Nenhum SQL, RPC ou consulta real foi
executado; nenhuma dependencia instalada. Compilacao, locks, concorrencia e
rollback PostgreSQL continuam sem evidencia real e dependem de autorizacao.

## GET/interface de custos — preparacao local completada

Foi implementada somente a leitura independente listarPorEvento(id) em
repositories/supabase/custos.cjs. A assinatura MySQL com conexao permanece
intocada. O GET Supabase recusa qualquer segundo argumento, inclusive undefined,
antes de construir consulta, em vez de ignorar o executor transacional.
O PUT permanece no adaptador atomico/RPC, com releitura interna; nenhum SQL,
handler, provedor ativo ou adaptador de substituicao foi alterado.

Contrato detalhado e reavaliacao de contagem atualizados no documento existente
[DEPENDENCIA_TRANSACIONAL_CUSTOS.md](DEPENDENCIA_TRANSACIONAL_CUSTOS.md), sem
duplicar sua analise; os criterios das cinco operacoes continuam na matriz
[LEITURAS_PENDENTES.md](repositories/supabase/LEITURAS_PENDENTES.md).

Testes novos em [custos-listagem-supabase.test.cjs](tests/custos-listagem-supabase.test.cjs):
retorno comparado com repositorio MySQL mockado; decimais textuais incluindo
negativos historicos, Unicode/espacos e strings vazias; ausencia de custos;
projecao sem mutacao; paginas completas e erros/inconsistencias; ordem por ID;
respostas invalidas; conexao recusada; factory inerte e SDK instalado com fetch
falso verificando GET/::text/count/range/retry(false). Nao reproduzem transacoes
SQL nem afirmam snapshot entre paginas. Nenhuma chamada real foi realizada.

O helper de leitura compartilhado foi reutilizado, sem modifica-lo ou usar a
validacao de gravacao para dados historicos. Na revisao do teste, o caso undefined
foi construido sem acionar o default da fixture, para nao omitir casos invalidos;
IDs repetidos e fora de ordem sao cenarios distintos efetivamente exercitados.

O caminho GET ficou completo localmente. A operacao original tambem serve ao
PUT; a equivalencia dessa parte continua dependendo de compilacao e validacao
PostgreSQL da RPC, rollback e releitura, sem falsa conexao entre HTTPs. Assim,
a reavaliacao nao acrescenta uma operacao integral: 22/27. Nao e uma restricao
numerica arbitraria; e o criterio documentado do inventario original. Rotas
MySQL e a proibicao de ativar Supabase sem aprovacao permanecem preservadas.

Verificacao deste incremento: 12 testes novos aprovados; suite completa com
729 testes, 721 aprovados, zero falhas e oito SKIP. Inclui as suites existentes
do PUT, releitura na mesma conexao MySQL, rollback, SDK e adaptador atomico;
nenhuma foi substituida por um mock que ignore a conexao. node --check do
repositorio GET e da nova suite aprovados; git diff --check sem erros, com avisos
LF/CRLF existentes. Links/whitespace conferidos diretamente. Hashes de
server/db, fabrica Supabase, contratos, pacotes, configuracao, repositorios
MySQL, SQL/adaptador atomico de custos e suporte-leitura.cjs preservados.
Nenhuma validacao PostgreSQL, consulta, RPC ou HTTP real iniciada. Nao houve
alteracao de banco, permissoes, autenticacao ou .env nem instalacao de pacotes.
