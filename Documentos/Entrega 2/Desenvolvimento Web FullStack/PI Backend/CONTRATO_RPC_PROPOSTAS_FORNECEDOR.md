# Contrato proposto: RPC de propostas do fornecedor

Estado: preparacao tecnica, sem RPC, chamada real ou ativacao nas rotas.
Progresso mantido em 22/27. O MySQL continua ativo. Nenhum novo objeto e exposto.

## Entrada e responsabilidade do backend

- Nome proposto: listar_propostas_por_fornecedor, ainda nao criado.
- Parametro: p_fornecedor_id, integer positivo, obrigatorio, sem default.
- O backend fornece req.usuario.id apos JWT proprio e perfil fornecedor. Nunca
  aceitar outro fornecedor do corpo/query do cliente ou encaminhar JWT ao Supabase.
- Sem parametros publicos para collation, limite, status, prazo ou ordenacao.
- Entrada ausente/invalida deve falhar, nunca transformar a operacao em listagem
  administrativa. O SQLSTATE especifico de validacao ainda sera definido na RPC;
  falha interna continua no caminho HTTP 500 existente, sem nova regra de rota.

## Retorno de transporte e contrato da rota

A futura funcao deve devolver um unico valor jsonb contendo o array completo.
Sem resultados: []; nunca NULL, envelope adicional ou lista parcial. Isso evita
depender do limite de linhas de uma RPC SETOF, mas nao elimina limites de memoria,
tempo ou tamanho da resposta. Esses limites exigem validacao integrada.

| Campo de cada objeto | Tipo no JSON da RPC | Contrato de saida atual |
|---|---|---|
| id | integer | numero, sem coercao ou perda de precisao |
| cotacao_id | integer | numero |
| valor | string decimal, escala 2 | string DECIMAL(12,2), sem arredondamento |
| condicoes_pagamento | string | preservar texto, caixa e espacos |
| detalhes_tecnicos | string | preservar texto, caixa e espacos |
| status | string | estado atual, sem filtro adicional |
| criada_em | string de instante com offset explicito | converter para Date com suporte existente; preservar JSON do driver |
| evento_nome | string | preservar texto |
| categoria | string ou NULL | resultado agregado, sem trim, split ou array |

Projetar apenas esses nove campos no adaptador futuro. O hash/senha, dados do
fornecedor e os objetos aninhados nao pertencem ao retorno. Nenhum adaptador de
RPC foi implementado nesta preparacao.

## Consulta, filtros e ordenacao

- Uma unica consulta SQL de leitura para propostas, cotações, eventos e itens.
- WHERE propostas.fornecedor_id = p_fornecedor_id.
- INNER JOIN cotacoes e eventos; LEFT JOIN itens por cotacao.
- Nao filtrar modalidade, prazo, estado da cotacao/evento/proposta ou categoria.
- Uma linha por proposta: propostas da mesma cotacao continuam separadas.
- Ordem externa: criada_em DESC, id DESC; manter as chaves de ordenacao na consulta
  que monta o array JSON, nao confiar na ordem incidental de uma subconsulta.
- Nao acrescentar ordem interna das categorias: a origem nao a especifica.
  Uma representacao deterministica diferente exigiria decisao de compatibilidade.

## Agregacao: garantias conhecidas e decisoes bloqueadas

- Separador literal ', ', sem escape de separadores dentro de uma categoria.
- DISTINCT conforme a igualdade efetiva da origem. Duplicatas exatas nao geram
  uma categoria por item. Acentos, caixa, Unicode e espacos finais nao devem ser
  normalizados no Node ou por uma collation escolhida por aproximacao.
- NULLs nao participam da concatenacao; sem valores nao NULL, categoria=NULL.
  O LEFT JOIN mantem a proposta sem itens. String vazia e valor, nao NULL.
- Sem trim, filter(Boolean), Set ou Intl.Collator para substituir o banco.
- Nao escolher o representante textual entre variantes equivalentes sem evidencia.
- string_agg(DISTINCT ..., ', ') e apenas a base candidata, nao a implementacao
  equivalente aprovada. A collation comparativa e o truncamento continuam abertos.
- group_concat_max_len da sessao de origem define o teto em bytes. Nao assumir
  default de servidor. Nao arredondar por caracteres, cortar Buffer arbitrariamente
  ou rejeitar qualquer excesso como erro se a origem devolve string truncada.
- Casos com categorias vazias e prefixo multibyte devem definir o comportamento
  a partir do resultado da origem, incluindo separador parcial e avisos.

## Precisao, datas e erros

Usar valor::text na montagem do JSON para evitar que NUMERIC seja convertido
para ponto flutuante antes do Node. Reutilizar decimalTexto e instante na futura
leitura do resultado. Nao impor valor positivo na leitura: isso seria regra nova
para dados historicos. A equivalencia dos instantes importados continua pendente.

Erro PostgREST/RPC, rede, timeout ou resposta invalida nao deve virar [], NULL ou
resultado parcial. Sem fallback MySQL e sem retry automatico introduzido pelo
repositorio. O handler atual mantem HTTP 500 e {erro:"Erro interno ao buscar
propostas."}; JWT/perfil e seus 401/403 permanecem no middleware atual. Nao expor
SQL, parametros, credenciais ou registros nos logs. Uma string truncada devolvida
normalmente pela origem nao deve ser confundida automaticamente com excecao.

## Seguranca e execucao futura

Proposta: funcao SQL STABLE, SECURITY INVOKER e referencias de schema explicitas,
com search_path restrito. A chave privilegiada fica no backend. INVOKER nao
substitui o filtro do fornecedor nem a autorizacao JWT, especialmente com
service_role/BYPASSRLS. Uma RPC nova exige revisao de EXECUTE para PUBLIC, anon,
authenticated e service_role antes de exposicao. Nenhuma permissao ou funcao foi
criada. A aceitação provisoria das ACLs nao autoriza novos objetos.

Uma chamada com uma unica consulta elimina a montagem por paginas separadas de
propostas/itens. Nao garante igualdade com outro banco lido em momento diferente;
as comparacoes precisam de fixture e estado controlados. A implementacao futura
deve evitar limites silenciosos de itens relacionados e truncamento do array.

## Evidencias ainda faltantes, sem reabrir a auditoria

1. Charset/collation efetivos da coluna itens_cotacao.categoria na origem.
2. group_concat_max_len e codificacoes da sessao usada pelo pool do backend;
   limites/configuracoes que afetem a resposta, nao o default presumido.
3. Comparacao dos grupos equivalentes e representantes textuais para acentos,
   caixa, normalizacao Unicode e espacos finais.
4. Respostas em limites de bytes, caracteres multibyte, separadores e avisos.

ICU de destino, NULL, separador, campos, joins e ordenacao externa ja estao
documentados; nao solicitar novamente seus blocos de auditoria. O inventario CSV
de ACLs ja foi conferido pelo usuario e nao precisa ser refeito. Nenhuma nova
consulta de origem e solicitada ou executada nesta preparacao.

## Testes separados

- propostas-fornecedor-rpc-contrato.test.cjs: formato proposto, conversores ja
  existentes, repasse de strings/NULL pelo driver MySQL mockado e medidas de bytes
  de fixtures sinteticas. Nao executa DISTINCT nem emula uma collation.
- propostas-fornecedor-rpc-comparacao.test.cjs: casos reais explicitamente SKIP,
  com dados de entrada preparados. Sem resultados esperados inventados para
  deduplicacao, representantes, ordem interna ou truncamento. Esses testes nao
  contam como aprovados e nao abrem conexoes mesmo se o arquivo for carregado.
- tests/fixtures/propostas-fornecedor-rpc.cjs: valores ficticios, sem dados reais;
  limite de 8 bytes apenas para construir casos de teste, nunca configuracao do
  TrocaTicket. A codificacao UTF-8 dessas fixtures nao afirma a codificacao da origem.

Na comparacao real, guardar entrada, metadados da sessao e saida bruta de cada
banco. Nao dividir categoria por ', ' para comparar: o separador pode fazer parte
do valor. Para casos sem ordem interna contratual, comparar grupos de categorias
com evidencia separada, e registrar diferencas literais sem mascara-las. A regra
de aprovacao dos representantes/truncamento precisa ser revisada antes de liberar
a implementacao. Fixtures reais exigirao ambiente descartavel e autorizacao propria.
