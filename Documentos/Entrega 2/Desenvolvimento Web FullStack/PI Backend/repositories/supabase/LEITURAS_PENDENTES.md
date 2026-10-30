# Leituras Supabase — incremento de prazos

Progresso: 22/27 metodos SELECT implementados, ainda sem ativacao nas rotas.
Todos os testes desta etapa usam mocks; nenhuma consulta real foi realizada.

## Duas leituras implementadas neste incremento

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

## Duas leituras comuns adiadas

- custos.listarPorEvento(id, conexao = db): atende tanto o GET quanto a leitura
  final do PUT na mesma conexao da transacao. Nao ignorar o argumento conexao nem
  substituir essa leitura por uma chamada REST independente. Sua implementacao
  completa depende da estrategia transacional futura; nao contar um GET parcial
  como migracao completa desse metodo.
  Analise exclusiva concluida em
  [DEPENDENCIA_TRANSACIONAL_CUSTOS.md](../../DEPENDENCIA_TRANSACIONAL_CUSTOS.md).
  Nenhum metodo parcial foi adicionado; a releitura anterior ao commit precisa
  permanecer dentro da atualizacao atomica. Os testes existentes de conexao,
  falha na releitura e rollback foram aproveitados, sem alterar as rotas.
- propostas.listarPorFornecedor: GROUP_CONCAT(DISTINCT categoria) depende das
  regras de igualdade/collation do MySQL, limite de concatenacao e LEFT JOIN dos
  itens. Set do JavaScript e simples embedding nao comprovam equivalencia nem
  ausencia de truncamento dos itens relacionados. Exige estrategia de agregacao
  revisada; nenhuma funcao, view ou RPC foi criada nesta etapa.

## Tres leituras com bloqueio continuam adiadas

- custos.bloquearEventoDoUsuario
- cotacoes.bloquearCustosDoEvento
- solicitacoesAcesso.bloquearPorId

Plano consolidado:
[PLANO_TRANSACOES_SUPABASE.md](../../PLANO_TRANSACOES_SUPABASE.md).
Abrange PUT de custos, publicacao de cotacao e decisao de acesso. O lock do evento
e compartilhado por PUT/POST; a dependencia de listarPorEvento reaproveita a
documentacao existente. Posteriormente, somente a substituicao de custos ganhou
SQL preparado e adaptador independente custos-transacao.cjs, sem instalacao ou
ligacao a rotas. Ver secao "Preparacao local autorizada" do plano. Nao equivale
a migrar os metodos compartilhados pendentes; progresso 22/27 preservado.

MySQL, autenticação e selecao do provedor permanecem inalterados. Nao ativar o
Supabase em producao com base somente nestes testes simulados.

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
