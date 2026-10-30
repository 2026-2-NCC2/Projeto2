# Leituras Supabase — estado consolidado da Etapa 5

**Encerramento atual: 27/27 implementadas localmente.** Contrato ICU de
propostas.listarPorFornecedor explicitamente aprovado e implementado, com SQL
real validado em PostgreSQL descartavel. Suite completa: 731 PASS/0 FAIL/8 SKIP
historicos. HTTP e ativacao continuam pendentes. Ver
[estado final](../../CONSOLIDACAO_ETAPA_5.md) e
[contrato/evidencias](../../CONTRATO_RPC_PROPOSTAS_FORNECEDOR.md).
Todas as contagens/pendencias de implementacao abaixo sao historicas.

**Estado atual: 26/27 implementacoes locais; HTTP e ativacao separados.**
Ver [relatorio unico](../../CONSOLIDACAO_ETAPA_5.md): criterio uniforme para as
27 operacoes, evidencias preservadas e bloqueios. Os 22/27 abaixo sao historicos;
misturavam codigo e integracao. Nao repetir testes SQL ja comprovados.

Progresso: 22/27 metodos SELECT implementados, ainda sem ativacao nas rotas.
Testes iniciais usaram mocks. A RPC de custos agora foi validada em PostgreSQL
17.11 descartavel: ver [resultado real](../../RESULTADO_VALIDACAO_RPC_CUSTOS_DESCARTAVEL.md).
Esta evidencia atualiza as pendencias D abaixo; nao comprova PostgREST/Supabase,
GET integrado ou publicacao efetiva. As linhas seguintes preservam o historico.
Atualizacao posterior: a publicacao efetiva em PostgreSQL e a concorrencia real
PUT/publicacao nos dois sentidos tambem passaram; ver
[resultado de publicacao](../../RESULTADO_VALIDACAO_PUBLICACAO_DESCARTAVEL.md).
Nao confundir essa evidencia com publicacao HTTP integrada.
Decisao de acesso tambem validada em PostgreSQL direto: ver
[resultado de acesso](../../RESULTADO_VALIDACAO_ACESSO_DESCARTAVEL.md).
As tres preparacoes atomicas tem provas SQL reais; HTTP/integracao continuam
separados e pendentes. Contagem reavaliada pelos criterios integrais: 22/27.
Contagem reavaliada apos completar o GET de custos: o inventario conta o metodo
MySQL integral (GET e releitura do PUT), nao cada nova interface separadamente.
GET pronto localmente nao comprova a parte transacional, ainda pendente.

## Historico: duas leituras anteriores de prazos

- cotacoes.listarDisponiveisParaFornecedor: INNER JOIN de eventos, status Aberta,
  prazo inclusivo a partir do dia do banco, id DESC e projecao do contrato.
- propostas.buscarCotacaoDisponivel: id original, status Aberta e mesmo prazo;
  devolve array de IDs, inclusive vazio, sem filtros adicionais de evento/perfil.

O filtro gte(prazo, today) usa a entrada especial DATE do PostgreSQL em vez de
calcular uma data UTC no Node. Isso conserva a responsabilidade do banco pelo
dia corrente, mas nao comprova igualdade entre os fusos das sessoes MySQL e
PostgREST. Comparar os fusos e testar prazos de ontem/hoje/amanha nas viradas de
dia antes da ativacao. O SQL Editor nao necessariamente usa o fuso do PostgREST.
Referencia: https://www.postgresql.org/docs/current/datatype-datetime.html

Paginas REST separadas nao compartilham snapshot. Contagens e IDs permitem
detectar algumas inconsistencias, sem garantir estabilidade entre paginas ou
durante a virada do dia. Datas/instantes importados continuam dependendo da
reconciliacao com a origem. Esses pontos nao foram resolvidos por mudancas no
banco, configuracao ou permissao.

## Matriz das cinco operacoes restantes

**L** = verificavel/preparavel localmente, sem banco. **D** = exige autorizacao
especifica para PostgreSQL/Supabase descartavel e revisao dos privilegios do
novo objeto. **M** = depende de metadados/resultados da origem, obtidos apenas
com autorizacao de leitura ou evidencias fornecidas; nao repetir auditoria ja
concluida do destino. Nenhuma dessas autorizacoes foi presumida nesta revisao.

| Operacao restante | Preparacao existente | Dependencias | Evidencia disponivel | Falta para considerar implementada integralmente |
|---|---|---|---|---|
| custos.bloquearEventoDoUsuario | Mesmo lock em ambas RPCs originais; adaptadores sem ativacao | Ator confiavel; todos os escritores usando evento antes de custos | **L:** contratos/mocks. **D PostgreSQL:** propriedade, compilacao de ambas, PUT/PUT, PUT/publicacao real nos dois sentidos, espera, rollback e liberacao comprovados | Integracao PostgREST: binding, identidade/ACLs efetivos, timeout/perda de resposta e erros. Manter o mapeamento para fluxo atomico, sem RPC de lock separada. Contar uma vez. |
| cotacoes.bloquearCustosDoEvento | RPC original e adaptador preparados; fluxo SQL real validado | Lock anterior do evento, comparacao e snapshot na mesma transacao | **L:** mocks 409/timeout. **D PostgreSQL:** compilacao, propriedade, snapshot/ordem/decimais, vazio, TP409, rollback apos cotacao/primeiro item e concorrencia real com PUT comprovados | PostgREST: binding/resposta HTTP, privilegios reais da chave, timeout apos possivel commit; falha de commit/transporte nao exercitada. Nao repetir provas SQL concluidas sem mudanca. |
| solicitacoesAcesso.bloquearPorId | RPC original e adaptador preparados; fluxo SQL real validado | Admin autenticado; solicitacao antes do estado; aprovacao condicional unica e status atomico | **L:** 25 testes do adaptador/MySQL. **D PostgreSQL:** compilacao, casts, NUMERIC grande, EXECUTE/guard separados, TA404/TA409/TA412, rejeicao em todos os perfis, rollback perfil/status, concorrencia mesma solicitacao e pedidos distintos do mesmo usuario comprovados | Integracao PostgREST: binding JSON NUMERIC/erros/status, identidade e privilegios efetivos, timeout/perda de resposta apos commit. Ligacao futura ao admin do middleware, nunca ao corpo. Nao repetir provas SQL concluidas sem mudanca. |
| custos.listarPorEvento | GET independente implementado em [custos.cjs](custos.cjs), com segundo argumento recusado; releitura do PUT continua na RPC atomica | Separacao explicita GET(id) versus substituir(id, usuario, custos), sem handle REST; propriedade no chamador | **L:** 12 testes do GET, comparação MySQL, campos/ordem/decimais historicos, vazio, erros/paginas, recusa de conexao e SDK com fetch falso; SQL e adaptador atomico preservados | Nenhuma lacuna local do GET/interface neste escopo. **D:** compilar/testar RPC, binding/privilegios, releitura das proprias escritas antes do commit, IDs/vazio/precisao e rollback em falha; validar equivalencia da leitura independente e limitacao de snapshot paginado. So entao considerar substituido o metodo original completo, sem exigir ativacao em producao. |
| propostas.listarPorFornecedor | [Contrato RPC e fixtures](../../CONTRATO_RPC_PROPOSTAS_FORNECEDOR.md); sem SQL de RPC/adaptador implementado | Uma consulta com joins/agregacao, DISTINCT da origem, NULL/vazio, ordenacao externa, limite em bytes e instantes | **L:** SQL MySQL e contrato conhecidos, testes sinteticos; oito comparacoes reais continuam SKIP. Collation ICU de destino ja auditada | **M:** charset/collation efetivos e group_concat_max_len/codificacoes da sessao do pool, representantes e truncamento/avisos ainda sem evidencia. **L apos M:** implementar agregacao/adapter sem aproximar regras. **D:** comparar fixtures controladas, instantes e limites de resposta. |

As evidencias **L** nao comprovam execucao PostgreSQL, concorrencia, rollback ou
equivalencia de collation da origem. Oito SKIP nao sao aprovacao. Os tres locks
nao podem virar RPCs de SELECT independentes que liberem o bloqueio antes das
escritas; sua equivalencia exige o fluxo atomico completo. A validacao em teste
nao exige ativacao em producao, mas tambem nao a autoriza.

Documentacao de referencia, sem repetir suas analises:
- [Plano transacional e preparacoes locais](../../PLANO_TRANSACOES_SUPABASE.md).
- [Dependencia de custos.listarPorEvento](../../DEPENDENCIA_TRANSACIONAL_CUSTOS.md).
- [Contrato de propostas do fornecedor](../../CONTRATO_RPC_PROPOSTAS_FORNECEDOR.md).

GET monetario de custos/interface de integracao preparados localmente neste
incremento, com restricao transacional explicita. Nos fluxos atomicos preparados, as garantias de banco estao
pendentes de **D**; isso nao e falha local comprovada nem razao para novos mocks
que apenas repitam o SQL. A agregacao de propostas depende de **M** antes de
escolher equivalencia de collation/truncamento. Paginas, empates e fidelidade
de instantes importados mantem as limitacoes ja registradas.

Proximo incremento proposto: com autorizacao especifica, validar somente a RPC
de substituicao de custos num PostgreSQL descartavel (nao MariaDB 3307), com
esquema/fixtures minimos sem dados reais, identidade/papel confirmados, ACL do
novo objeto revisada, compilacao, rollback e duas sessoes. Manter o provider
principal MySQL e os registros importados intocados. Depois validar publicacao
com o mesmo protocolo; decisao de acesso e independente. Nao executar agora.

Progresso mantido em **22/27**. Etapa 5 permanece aberta. MySQL, autenticacao e
rotas ativas preservados; nenhum novo objeto do Supabase foi exposto.

## Diagnostico exclusivo: propostas.listarPorFornecedor

**Bloqueada por equivalencia ainda nao comprovada. Nao implementada no Supabase.**
O progresso permanece 22/27. Nenhuma leitura real de banco ou mudanca de ACL foi
executada para este diagnostico; a analise usa codigo, contratos e documentacao.

Preparacao tecnica posterior: ver
[CONTRATO_RPC_PROPOSTAS_FORNECEDOR.md](../../CONTRATO_RPC_PROPOSTAS_FORNECEDOR.md).
Contrato de entrada/saida e fixtures sinteticas preparados; nenhuma RPC ou
adaptacao de rota foi implementada. Testes de contrato ficam separados de oito
comparacoes reais explicitamente SKIP, que nao constituem evidencias aprovadas.

### Contrato observado na consulta MySQL

- Filtro unico: p.fornecedor_id = fornecedorId. Nao restringe status da proposta,
  modalidade/status/prazo da cotacao nem status do evento.
- INNER JOIN cotacoes e eventos: proposta sem essas referencias nao aparece.
- LEFT JOIN itens_cotacao por cotacao_id: ausencia de itens nao remove a proposta.
- GROUP BY inclui o ID da proposta e os demais campos projetados. Cada proposta
  recebe sua propria linha; varias propostas da mesma cotacao nao sao fundidas.
- Campos, em ordem: id, cotacao_id, valor, condicoes_pagamento, detalhes_tecnicos,
  status, criada_em, evento_nome, categoria. categoria e string ou NULL, nao array.
- valor continua DECIMAL em string; criada_em acompanha a serializacao Date do
  driver atual. Os utilitarios Supabase existentes podem atender essas conversoes,
  mas nao resolvem a agregacao. Nenhuma mudanca no login/JWT e necessaria.
- Ordem das propostas: p.criada_em DESC, p.id DESC. Nao confundir essa ordem com
  a ordem interna das categorias: GROUP_CONCAT nao possui ORDER BY explicito.
  Nao prometer ordenacao alfabetica ou por ID do item a partir de ordem observada.
- GROUP_CONCAT(DISTINCT i.categoria SEPARATOR ', ') elimina duplicatas segundo a
  igualdade/collation efetiva da expressao. Preserva um representante textual;
  o codigo nao fixa qual variante grafica prevalece entre valores equivalentes.
- O separador e virgula seguida de espaco. Nao ha escape: uma categoria contendo
  ', ' nao pode ser distinguida das demais apenas dividindo a string retornada.
- Valores NULL sao ignorados pela agregacao. Sem valores nao NULL, o resultado e
  NULL, inclusive pela linha sintetica do LEFT JOIN sem itens. String vazia nao e
  NULL: nao usar filter(Boolean), trim ou conversao automatica para lista vazia.

### Limites e diferencas ainda nao comprovados

O teto e group_concat_max_len, em bytes, e depende da configuracao da sessao do
banco de origem. db.js nao o define. O valor efetivo nao foi consultado nem
fornecido nesta etapa. A documentacao MariaDB informa default de 1 MiB; a MySQL
informa 1024 bytes. Nenhum desses valores e assumido como configuracao real do
TrocaTicket. Quando ha truncamento, a consulta pode devolver uma string parcial
com aviso; o repositorio atual repassa as linhas e nao consulta avisos. Lancar
erro ou devolver sempre a string completa seria uma diferenca a revisar.
Codificacao e limites de outros componentes tambem precisam ser identificados.

O DISTINCT utiliza a collation efetiva de itens_cotacao.categoria no MySQL/MariaDB.
O destino auditado usa ICU nao deterministica, und-u-ks-level1, versao 153.121.
Isso nao comprova equivalencia universal com general_ci. Set compara strings de
forma distinta; toLowerCase, remocao de acentos e Intl.Collator tambem nao sao
provas de equivalencia com as regras do servidor. Comparar caixa, acentos,
normalizacao Unicode, caracteres especiais e espacos finais, sem inventar uma
nova regra de deduplicacao para encaixar os testes.

Embedding PostgREST nao fornece esse GROUP_CONCAT MySQL automaticamente. Uma
agregacao no Node precisaria coletar TODOS os itens, controlar os limites de
relacoes aninhadas, reproduzir igualdade/representantes e o teto em bytes. Usar
somente a primeira pagina pode produzir categorias incompletas silenciosamente.
Consultas separadas tambem nao garantem o snapshot do SELECT original. As
limitacoes de paginacao, empates e instantes importados continuam registradas.

### Proxima solucao proposta, sem execucao

1. Obter futuramente, com autorizacao propria, metadados de leitura da origem:
   versao, charset/collation efetiva da coluna e group_concat_max_len da sessao
   usada pelo backend. Nao ler registros pessoais nem presumir defaults.
2. Criar uma referencia de comparacao descartavel com multiplos itens,
   duplicatas, variantes de caixa/acentos/normalizacao, NULL, string vazia,
   separador dentro da categoria e limites com UTF-8 multibyte. Nao usar mocks
   como prova de execucao de DISTINCT/collation/truncamento.
3. Preferir agregacao em uma unica consulta PostgreSQL, via view/RPC revisada,
   apenas em etapa futura autorizada. string_agg(DISTINCT categoria, ', ')
   isoladamente nao resolve diferencas de collation, representantes ou limite
   em bytes. Validar a compatibilidade antes de declarar a operacao migrada.
4. Qualquer novo objeto exige revisao dos privilegios/RLS/EXECUTE, especialmente
   pelo risco conhecido das ACLs futuras. Nao criar/expor funcao ou view agora;
   nao usar SECURITY DEFINER como atalho. Manter os filtros e a autorizacao no
   backend e o MySQL ativo ate aprovacao e validacao integradas.

Os testes novos fixam a delegacao SQL e o repasse de resultados agregados
simulados do driver, incluindo acentos, duplicatas, NULL e string parcial.
Eles NAO executam GROUP_CONCAT nem comprovam sua equivalencia no Supabase.

Referencias oficiais:
- https://mariadb.com/docs/server/reference/sql-functions/aggregate-functions/group_concat
- https://dev.mysql.com/doc/refman/8.4/en/aggregate-functions.html
- https://www.postgresql.org/docs/current/collation.html
