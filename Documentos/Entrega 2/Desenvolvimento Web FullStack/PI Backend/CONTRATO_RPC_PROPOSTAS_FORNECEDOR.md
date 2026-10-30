# Contrato proposto: RPC de propostas do fornecedor

Estado: preparacao tecnica, sem RPC, chamada real ou ativacao nas rotas.
Progresso atual: 26/27 implementadas. Esta operacao continua nao implementada.
O MySQL continua ativo. Nenhum novo objeto e exposto.

**Atualizacao apos autorizacao de coleta:** metadados e 23 casos sinteticos
observados em 30/10/2026. Nao solicitar novamente esses metadados. Ver resultado
ao final deste contrato; as secoes de preparacao anteriores sao historicas.

## Decisao concreta apos comparacao PostgreSQL — 30/10/2026

Comparacao REAL concluida em novo PostgreSQL 17.11 descartavel, sem rede/TCP,
sem downloads e sem reconectar ao MySQL. Foi reutilizada somente a evidencia
MySQL anterior. Nenhum banco existente, rota, autenticacao ou permissao externa
foi alterado. Este resultado substitui o proximo passo de comparacao das secoes
historicas abaixo: nao solicitar novamente essa rodada.

Manifesto e resultados completos:
`C:\Users\Lucas\PostgreSQLTest\tt-custos-pg-41d06031ddb746448af3b2e5546869db\manifesto.json`
e `comparacao.json`, com hash da evidencia MySQL, controlador e resultados brutos
das fronteiras. Cinco grupos PASS significam comparacao executada/assertivas
corretas, NAO implementacao equivalente aprovada. removed=true; stop/rm sucesso;
senha sintetica removida; imagem preservada. Nenhum prune.

O controlador ganhou modo --comparar-propostas, sem fallback de download nesse
modo. A primeira tentativa falhou somente na leitura do nome do campo de catalogo
ICU; corrigida via to_jsonb/COALESCE como na auditoria existente. Conteiner dessa
tentativa tambem removido. RPCs/adaptadores de negocio nao foram modificados.

### Ordens e representantes: criterio correto de comparacao

SQL original garante **apenas ordem das propostas: criada_em DESC, id DESC**.
Nao existe ORDER BY interno no GROUP_CONCAT. DISTINCT define classes segundo
general_ci, mas nao documenta representante entre equivalentes. Portanto nao
exigimos string interna alfabetica fixa nem grafia identica a uma execucao.
Um representante admissivel precisa ser uma entrada pertencente a mesma classe
de equivalencia da origem; nao basta ser parecido visualmente. Diferenca apenas
de grafia entre membros da mesma classe nao foi considerada falha.

### Resultados que demonstram incompatibilidade da candidata ICU

Usada a declaracao de collation do esquema: provider ICU, und-u-ks-level1,
deterministic=false. Runtime descartavel tem ICU 153.128; destino foi auditado
com 153.121. Nao afirmar que isto e teste do destino real ou equivalencia de
versoes. Ha contraexemplos concretos nesta combinacao disponivel:

| Entradas sinteticas | MariaDB general_ci observado | PostgreSQL ICU observado |
|---|---|---|
| Áudio / audio | Iguais | Iguais |
| Áudio / A + U+0301 + udio | Diferentes; duas categorias | Iguais; uma categoria |
| Som / Som com espaco final | Iguais; um representante | Diferentes; ambos aparecem |
| Dois emojis diferentes | Iguais | Diferentes |
| ß / ss | Diferentes | Iguais |

Nos casos compostos/decompostos e espacos, a divergencia e do NUMERO/COMPOSICAO
das classes, nao uma exigencia inventada de representante ou ordem. Caixa e
acentos tiveram representante variavel coerente com a ordem de entrada nos dois
servidores; isso nao foi rejeitado. NULL, ausencia e string vazia coincidiram
nos casos. Nenhuma normalizacao/ICU foi aplicada ao codigo de negocio.

PostgreSQL string_agg nao tem teto automatico igual a GROUP_CONCAT. Nas quatro
fronteiras sinteticas ja coletadas, o agregado sem limite teve tamanho original;
left(text,1048576) falhou como limite em bytes no caso multibyte. Uma sonda
EXPLICITA de prefixo UTF-8 valido ate 1048576 bytes reproduziu os quatro retornos
MySQL, inclusive 1048574 bytes quando o emoji seria cortado. Essa sonda de bytes
nao e uma RPC implementada nem prova universal. ORDER BY n usado nessa sonda
isolou truncamento; nao foi atribuido ao contrato MySQL.

A rodada concentrou-se em igualdade/agregados/representantes, NULL/vazio e
fronteiras. Nao repetiu os joins/filtro/ordem externa ja verificados com dados
sinteticos na origem. Os oito SKIP historicos de equivalencia integral nao
viraram oito aprovacoes: a incompatibilidade ja tem contraexemplos suficientes.

### Proposta minima de mudanca de contrato — NAO APLICADA

Aprovar explicitamente **somente para o campo categoria desta listagem**:
1. Deduplicar pela collation PostgreSQL existente und-u-ks-level1, em vez de
   prometer identidade com utf8mb4_general_ci. Homologar a versao real do destino
   na integracao; testes finitos nao provam identidade universal.
2. Preservar a grafia original do item de menor ID em cada classe aprovada e
   listar essas classes pela ordem desses IDs. Isso fixa uma regra interna hoje
   nao garantida, sem tratar qualquer string como representante admissivel.
3. Manter NULL/ausencia, string vazia, separador ', ', teto de 1048576 bytes e
   corte somente em fronteira UTF-8 valida. Nao alterar ordem externa, filtros,
   campos restantes, propostas, valores ou registros.

Impacto visivel: a lista de categorias pode unir grafias Unicode antes separadas,
mostrar separadamente variantes com espacos/emojis e unir ß/ss. Representante e
ordem interna tornam-se definidos; em listas enormes isso tambem afeta quais
categorias cabem antes do corte. Nenhuma categoria armazenada seria reescrita.

Isso e uma decisao de compatibilidade, nao uma correcao silenciosa. Sem aprovacao,
nao usar string_agg DISTINCT/ICU como se fosse general_ci. Emulacao fiel da
collation MariaDB por versao seria outro projeto, nao sustentada apenas por essas
amostras nem disponivel como solucao local pronta. Nao se afirma impossibilidade
matematica de toda emulacao; a candidata simples foi refutada concretamente.

**Conclusao: decisao contratual necessaria. Nao implementado; 26/27.** A
implementacao da Etapa 5 permanece aberta. HTTP e ativacao continuam pendentes
separadamente. Sintaxe dos controladores e git diff --check verificados; nenhum
teste de negocio aprovado foi repetido sem mudanca funcional.

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

Preparacao independente concluida posteriormente: o conversor puro
repositories/supabase/propostas-fornecedor-resultado.cjs projeta os nove campos,
reutiliza decimalTexto/instante, valida toda a lista (inclusive esparsa), IDs e
ordem externa; conserva categoria NULL/vazia/Unicode/espacos/string parcial.
Nao agrega nem decide collation/truncamento, nao abre cliente e nao e importado
por rotas. Quatro testes novos reutilizam as fixtures existentes. A futura RPC
usara esse conversor; nao adicionar um metodo falso ao repositorio agora.

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

## Coleta unica minima para autorizacao posterior

Nao executada. Template: ../Banco de dados/coleta_propostas_fornecedor_origem.sql.
E um procedimento parametrizado, NAO um arquivo pronto para importar inteiro no
cliente SQL (contem ?). Nenhum comando de escrita/configuracao esta incluido.

**Ja comprovado nos arquivos:** dump MariaDB 10.4.32, tabela itens_cotacao
utf8mb4/utf8mb4_general_ci, categoria VARCHAR(100) NOT NULL; SET NAMES utf8mb4,
SQL_MODE e time_zone do dump. Esses SET valem para importar/exportar o dump,
nao descrevem a conexao Node. db.js nao define group_concat_max_len, charset ou
collation; isolamento.cjs tampouco fornece um valor desse limite. Nao foram
encontrados valores efetivos ou saidas-oraculo em arquivos/evidencias locais.

Executar futuramente UMA coleta, em conexao do backend reservada e explicitamente
identificada/autorizada, sem fallback para outra instancia:

1. Conferir host/porta/processo por fora; executar somente a primeira SELECT de
   metadados do template. Registrar CONNECTION_ID e um unico registro CSV/JSON:
   limite_bytes, charsets client/connection/results, collation_connection e
   charset/collation/tipo reais da coluna. Sem credenciais ou dados de usuarios.
   Nao executar SET NAMES/SET SESSION para fazer coincidir o resultado esperado.
2. Se corresponder ao DDL historico, usar a mesma conexao e template parametrizado
   com os itens de comparacoesPendentes, alterando apenas numero de UNION ALL.
   CONVERT/COLLATE explicitos reproduzem o tipo de comparacao declarado; nao
   comprovam uma coluna que tenha outra collation. Divergencia: parar e revisar.
   Capturar categoria, HEX, OCTET_LENGTH e SHOW WARNINGS imediatamente depois
   de cada SELECT. Manter inputs e saida bruta juntos, sem split/trim/sort.
3. Casos sinteticos ja existentes: duplicatas/multiplos itens; caixa/acentos;
   Unicode composto/decomposto; espacos finais; NULL e relacao vazia separados;
   strings vazias/separador; fronteiras multibyte; duas propostas da mesma cotacao.
   Para NULL e vazio usar relacoes derivadas, pois categoria real e NOT NULL.
   O template de agregacao nao prova joins/ordem externa: o ultimo caso precisa
   da consulta completa do repositorio com tabelas DERIVADAS sinteticas de
   propostas/cotacoes/eventos/itens e fornecedor distinto excluido pelo filtro.
   Nao consultar registros reais nem criar tabelas para completar essa parte.
4. Fronteira em bytes: 8 bytes da fixture NAO e limite do servidor. Sem SET,
   gerar categorias sinteticas distintas de ate 100 caracteres, identificadas
   por prefixos unicos, com totais antes/em/acima do limite REAL registrado.
   Incluir fronteira no separador e no caracter UTF-8 multibyte. Planejar teto
   de 1 MiB para limite coletado e 16 MiB para pacote sintetico; se exceder,
   registrar inconclusivo e pedir autorizacao propria, sem reduzir configuracao.
   Capturar avisos/HEX como acima. Nao presumir prefixo truncado ou arredondamento.
5. Registrar metadados uma vez, resultados por caso e eventuais avisos num unico
   arquivo JSON (preserva NULL e estruturas) ou CSV com JSON nas celulas.
   Conferir o mesmo CONNECTION_ID; liberar apenas a conexao reservada. Nao
   reiniciar servicos nem alterar o pool. Nada e aprovado apenas por ter rodado.

Resultados de relacoes derivadas sao evidencia sintetica, nao promessa da ordem
incidental do plano das tabelas reais. O SQL MySQL nao fixa ORDER BY interno nem
representante entre equivalentes; se a comparacao mostrar ambiguidade, registrar
o bloqueio contratual, sem inventar desempate. Uma amostra nao prova equivalencia
universal entre utf8mb4_general_ci e ICU. A solucao final exige evidencia ou uma
decisao explicita de compatibilidade, nunca aproximacao silenciosa.

Conclusao deste incremento: agregacao/RPC e listarPorFornecedor continuam nao
implementados, portanto 26/27. Conversor completo nao e operacao completa.
Nao houve consultas reais ou retomada de PostgREST. Integracao HTTP e ativacao
continuam eixos posteriores separados; implementacao da Etapa 5 ainda aberta.

## Resultado real da coleta autorizada — 30/10/2026

Processo separado, mysql2/promise e mesmas opcoes/defaults de db.js (pool 10,
waitForConnections); parametros de conexao fornecidos explicitamente pelo usuario
em memoria, sem .env ou arquivo permanente de credenciais. Nenhum hook por
conexao ou SET de sessao foi encontrado no backend; nenhuma inicializacao SQL
extra foi adicionada. Driver instalado usa handshake UTF8MB4_UNICODE_CI quando
charset nao e explicitado. Medicao confirmou a sessao, sem presumir esse default.
Nao e a sessao de um backend ja em execucao: e uma nova sessao inicializada pelo
mesmo driver/opcoes normais, conforme autorizacao explicita do usuario.

Destino conferido: listener XAMPP PID 30896, executavel mysqld.exe, porta 3306,
arquivo mysql.pid com o mesmo PID. Consulta confirmou banco trocaticket,
MariaDB 10.4.32 e datadir C:/xampp/mysql/data. A existencia do banco foi verificada
pela conexao e metadados, sem ler registros das tabelas. Conexao reservada 12,
mantida do inicio ao fim; nenhuma troca de conexao ou configuracao.

Evidencias sem credenciais em evidencias/:
- propostas-origem-74fe2d17-2347-4621-8425-dda96672edc8.json: saidas brutas,
  HEX, tamanhos e avisos de 23 casos (~12.6 MB, inclui fronteiras de 1 MiB).
- analise-propostas-origem-74fe2d17.json: hash e verificacoes automatizadas.

| Metadado efetivamente observado | Valor |
|---|---|
| group_concat_max_len | 1048576 bytes |
| character_set_client/connection/results | utf8mb4 / utf8mb4 / utf8mb4 |
| collation_connection | utf8mb4_unicode_ci |
| itens_cotacao.categoria | varchar(100), utf8mb4_general_ci |

Cada comparacao usou somente valores sinteticos/relacoes derivadas. SHOW WARNINGS
foi executado imediatamente depois, antes de conferir CONNECTION_ID. Nao houve
CREATE, SET, escrita, mudanca de permissao ou leitura de registros reais.
Consulta completa de propostas foi capturada do repositorio MySQL e suas quatro
fontes substituidas por relacoes sinteticas: filtro excluiu fornecedor ficticio
diferente, duas propostas da mesma cotacao permaneceram separadas, IDs 2/1 na
ordem correta. Nenhuma tabela real entrou nessa consulta.

### Observacoes que impedem uma traducao aproximada

- ['Áudio','audio','ÁUDIO','Audio'] agregou 'Áudio'; inverter a mesma lista
  agregou 'Audio'. Igualdade da classe nao fixa seu representante textual.
- ['Som','Som ','Som  '] agregou 'Som'; inverter agregou 'Som  '. Nao usar trim.
- 'Áudio' e 'A'+U+0301+'udio' foram DIFERENTES na origem; ambos permaneceram na
  concatenacao. Normalizar NFC ou remover acentos silenciosamente e incorreto.
- Dois emojis diferentes foram considerados iguais no caso observado; 'ß' e
  'ss' foram diferentes. Set/Intl.Collator nao reproduzem essas regras por prova.
- NULL e ausencia retornaram NULL. String vazia permaneceu valor, inclusive
  separador inicial. Duplicatas exatas foram eliminadas sem apagar outras classes.
- Total 1048575 e 1048576 bytes: sem aviso. Total 1048577: retorno 1048576 bytes,
  aviso 1260. Total 1048578 com emoji atravessando o corte: retorno 1048574 bytes,
  aviso 1260. Cortar Buffer arbitrariamente ou contar caracteres seria incorreto.

Os HEX e OCTET_LENGTH foram conferidos automaticamente contra todos os agregados
recebidos, assim como conexao e limite finais; verificacoes passaram. Sintaxe do
coletor e git diff --check verificados. Nao repetimos testes locais aprovados,
pois nao houve implementacao nova da agregacao. As oito comparacoes MySQL versus
PostgreSQL continuam SKIP: estes 23 resultados sao da origem, nao do destino.

### Bloqueio remanescente exato

Nao faltam mais metadados da sessao/coluna de origem desta coleta. Falta provar
ou implementar no PostgreSQL as mesmas classes/ordem da general_ci e a escolha
do representante. O contrato original nao fornece ordem interna/criterio de
desempate; a coleta demonstrou que mudar a ordem de entrada muda a grafia
devolvida. Uma regra nova como MIN, primeiro ID, NFC ou ICU por aproximacao nao
esta autorizada. Valores sinteticos em relacoes derivadas tambem nao estabelecem
uma ordem fisica universal para o plano das tabelas reais.

Proxima verificacao realmente nova: comparar esses mesmos casos contra a
collation PostgreSQL auditada, com SELECTs sinteticos apenas, sob autorizacao
propria de destino. Nao reconsultar MySQL ou repetir a auditoria. Se divergir,
sera necessaria implementacao fiel das regras ou decisao explicita de
compatibilidade; nenhuma das duas esta sendo presumida.

Portanto a agregacao e listarPorFornecedor nao foram implementados. O conversor
local pronto nao mascara essa ausencia. Progresso 26/27; implementacao da Etapa 5
nao encerrada. HTTP e ativacao continuam separados; nenhuma rota foi alterada.
