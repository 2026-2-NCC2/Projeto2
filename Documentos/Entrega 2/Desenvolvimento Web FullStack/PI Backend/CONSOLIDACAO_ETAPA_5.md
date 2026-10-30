# Etapa 5 — consolidacao operacional, 30/10/2026

Estado atual de referencia. Corrige a contagem anterior, que misturava codigo e
integracao. Preserva as evidencias originais. Nesta consolidacao nao houve
download, instalacao, consulta de banco ou repeticao de testes aprovados.

## Concluido

**Implementacao local: 26/27.** Inventario dos 27 metodos SELECT MySQL conferido
com fontes Supabase: 23 leituras independentes e tres equivalencias internas a
RPCs atomicas. custos.listarPorEvento tem GET e releitura dentro da RPC, sem
fingir aceitar conexao REST. Nenhum lock foi implementado como RPC avulsa.

Decisao mais recente de propostas: comparacao PostgreSQL descartavel executada,
sem nova coleta MySQL. Classes ICU divergiram de general_ci (Unicode composto,
espacos finais, emojis e ß/ss); nao sao meras diferencas de ordem ou grafia.
Comparacao e proposta minima de contrato NAO aplicada estao na secao inicial do
CONTRATO_RPC_PROPOSTAS_FORNECEDOR.md. Nao repetir essa rodada nem contar 27/27.
Os proximos passos antigos de coleta/comparacao abaixo sao historicos; agora
falta decisao explicita de compatibilidade, ou emulacao fiel fora do escopo atual.

Incremento exclusivo de propostas: conversor puro dos nove campos implementado,
com quatro testes novos usando fixtures existentes; agregacao ainda bloqueada.
Procedimento unico de coleta parametrizada documentado no contrato RPC, com
template somente leitura em Banco de dados/coleta_propostas_fornecedor_origem.sql.
Nao executado; nao representa nova operacao migrada nem altera a contagem.

Criterio uniforme: codigo efetivo e contrato coberto por testes locais; quando
transacional, fluxo atomico completo. HTTP real e ativacao sao eixos separados
para TODAS as 27 operacoes. Exigir HTTP apenas das ultimas quatro, enquanto as
primeiras 22 foram contadas com mocks, era uma classificacao desigual.

Base concreta do criterio original: tests/usuarios-supabase-repository.test.cjs
injeta cliente falso, compara campos/ausencia/erros com executor MySQL falso e
verifica fabrica/importacao; tests/leituras-supabase-incremento.test.cjs aplica
o mesmo padrao a consultas pontuais. As demais suites de repositorios seguem
mocks/VM e SDK com fetch falso, sem exigir servidor HTTP ou ativacao. Assim,
as primeiras 22 nao eram 22 integracoes homologadas. Os testes existentes de
custos/GET, publicacao e acesso cumprem esse criterio e acrescentam provas SQL
reais. Nao ha motivo contratual para excluir suas quatro unidades do inventario.

| Dominio | Leituras independentes implementadas | Equivalencia atomica | Total |
|---|---|---|---|
| usuarios | listar, buscarIdPorEmail, buscarParaLogin, buscarParaAutenticacao, buscarPerfil | — | 5/5 |
| eventos | listarPorUsuario, listarAdministrativo, listarAtivosParaParticipante, buscarPorIdDoUsuario | — | 4/4 |
| custos | buscarEventoDoUsuario, listarPorEvento (GET + releitura interna) | bloquearEventoDoUsuario nas RPCs custos/publicacao | 3/3 |
| cotacoes | listarPorOrganizador, listarAdministrativo, listarDisponiveisParaFornecedor, listarItens | bloquearCustosDoEvento na publicacao | 5/5 |
| propostas | buscarCotacaoDisponivel, listarPorOrganizador, listarAdministrativo | — | 3/4 |
| inscricoes | buscarEventoAtivo, buscarPorUsuarioEEvento, listarPorUsuario | — | 3/3 |
| solicitacoes-acesso | buscarPendentesPorUsuario, listar | bloquearPorId na decisao | 3/3 |

O mesmo lock de evento conta uma vez. Equivalencia atomica nao significa mesma
assinatura de conexao MySQL. Fluxos de escrita nao sao novas unidades entre os
27 SELECTs e a contagem nao afirma que todos os repositorios de escrita migraram.

| Eixo | Evidencia | Estado |
|---|---|---|
| Implementacao | 23 leituras e tres mapeamentos atomicos, testes locais | 26/27; falta propostas.listarPorFornecedor |
| PostgreSQL direto | Custos 14 grupos, publicacao 11, acesso 10; manifestos PASS | Tres fluxos atomicos validados; nao extrapolar para todas as leituras REST |
| HTTP Supabase/PostgREST real | SDK com fetch falso; sem endpoint real na Etapa 5 | 0/27 comprovadas por HTTP real nesta etapa |
| Ativacao Supabase | server.js ainda importa sete repositorios MySQL | 0/27 ativadas; MySQL preservado |

### Decisao de acesso encerrada no eixo PostgreSQL

Compilacao, enums, ausente/repetida, atualizacao condicional unica, rejeicao nos
quatro perfis, rollback e dois cenarios concorrentes ja passaram. Nao ha lacuna
SQL concreta para repetir testes. Hash original reconferido agora, inalterado;
manifesto PASS, removed=true. Ha imagem/controlador reutilizaveis, nao cluster
vivo: os servidores descartaveis foram removidos conforme autorizacao anterior.

EXECUTE/guard SQL foram testados separadamente. Autenticacao administrativa JWT
e HTTP nao sao comprovados por SQL direto. Decisao concluida quanto a codigo/SQL;
integracao pendente, com o mesmo criterio das demais operacoes.

Manifestos preservados em C:\Users\Lucas\PostgreSQLTest\tt-custos-pg-<run>:
- Custos: 68b18b8c500d4d27bc475c1a3287cedb — 14 grupos PASS.
- Publicacao: c163c33f9e3c41a9b2999a13a532eca1 — 11 grupos PASS.
- Acesso: bc50c5a5f77a458b9a00a86156aa1256 — 10 grupos PASS.

Os tres hashes SQL atuais coincidem com esses manifestos; removed=true nos tres.
Resultados locais anteriores: 64 testes custos/GET; 94 publicacao/custos; 25
acesso. Recortes se sobrepoem: NAO somar. Suite nao reexecutada, pois apenas
documentos mudaram. Oito comparacoes de agregacao continuam SKIP, nunca aprovacao.
Tentativas anteriores com falhas do controlador tambem foram preservadas.

## Pendencias externas — lista unica

1. **Codigo 27/27:** propostas.listarPorFornecedor depende de GROUP_CONCAT.
   Coleta autorizada concluida: limite real 1048576, charsets utf8mb4, sessao
   unicode_ci/coluna general_ci; 23 casos sinteticos preservados. Nao faltam
   mais esses metadados. Bloqueio agora e a equivalencia no PostgreSQL das classes
   de comparacao/ordem e representantes variaveis com a ordem de entrada.
   Ver resultados e exemplos concretos no contrato RPC; nao repetir coleta de
   origem nem escolher MIN/NFC/ICU como aproximacao silenciosa.
2. **HTTP real:** somente postgres:17 esta disponivel no Docker; nenhum PostgREST
   no PATH ou imagem local. PostgreSQL nao o inclui. SDK/Node/pg ou gateway
   caseiro nao provam comportamento PostgREST. Sem download nao e possivel
   encerrar esse eixo. Nao e bloqueio da contagem de codigo local.
3. **Ativacao:** escritas ainda nao migradas, selecao Supabase intencionalmente
   bloqueada, integracao confiavel de req.usuario.id/JWT, privilegios reais e
   reconciliacao da importacao permanecem fora deste incremento. ACLs padrao sao
   risco conhecido aceito para desenvolvimento/mocks, nao para exposicao de novos
   objetos. Datas/fusos, empates e snapshot paginado continuam limites para os
   testes integrados; nao iniciar novas auditorias individuais agora.

### Menor alternativa futura para HTTP

Finalidade: testar binding JSON/NUMERIC, respostas, SQLSTATE/status HTTP,
transacao por requisicao, commit e perda de resposta sem retry com os adaptadores
existentes. Nao exige stack completa Supabase para essa primeira prova.

Alternativa de menor download a uma imagem nova: binario Linux estatico oficial
em novo conteiner baseado na imagem PostgreSQL em cache. Rede none e comunicacao
no mesmo namespace/socket; planejar transporte do teste sem acesso aos bancos
reais e sem alterar fabrica/provider. Exige autorizacao nova para baixar,
verificar hash e executar; nenhum componente foi obtido ou iniciado.

Referencia de tamanho, nao versao homologada: release oficial v16.5 informa
4.31 MB para linux-static-x86-64.tar.xz e 14.4 MB para Windows ZIP. Descompactado
e tamanho total nao medidos. Isso NAO estima tamanho de imagem Docker PostgREST.
Fonte: https://github.com/PostgREST/postgrest/releases/expanded_assets/v16.5

Sem nenhum download: encerrar o eixo SQL com as evidencias atuais e deixar HTTP
pendente. Repetir psql ou criar mocks nao resolve ausencia do gateway real.

## Espaco e limpeza — somente leitura

- Docker system df -v: unica imagem postgres:17, ID 31ba9c94a03a, exibida 646 MB;
  unico 645.8 MB, compartilhado 0 B, containers associados 0.
- image inspect Size=639991864 bytes: metrica de metadados distinta; nao somar
  ao system df nem tratar como medicao do VHDX do Windows.
- Containers: nenhum. Volumes: nenhum. Build cache: 0 B.
- Sete pastas de evidencias: 213050 bytes (~208 KiB), incluindo tentativas com
  falha. Nenhum bootstrap-password.txt remanescente. Nada removido agora.

Removivel futuramente, com autorizacao: imagem postgres:17 exata
sha256:31ba9c94a03ada9988f2bb493a22a75eef3a185884533e5cdbcd498ea835b08f,
sem containers dependentes no inventario atual. Liberacao logica estimada pelo
tamanho unico: ~646 MB; manter evita outro download. Nao ha containers/volumes
a limpar. Preservar evidencias; sem prune. Remover imagem nao garante reducao
automatica do VHDX; nao manipular servicos ou compactacao de disco.

## Menor proximo passo

Receber uma unica coleta/oraculo da origem ja especificada no contrato de
propostas e implementar somente a agregacao faltante: caminho para 27/27 codigo,
sem trocar provider. HTTP e aceite separado comum a todas as operacoes, quando
houver PostgREST disponivel/autorizado. Nenhum codigo funcional adicional seguro
ficou adiado por falta de novos mocks: os bloqueios sao externos e concretos.
Etapa 5 nao declarada concluida; nenhuma rota ou provedor ativados.

## Trabalho local dos adaptadores e ausencia de metadados

Conferidos os adaptadores custos-transacao.cjs, cotacoes-publicacao.cjs e
solicitacoes-acesso-decisao.cjs: entrada validada, ator por argumento separado,
fabrica tardia/injecao de cliente existente, RPC POST unica, retry(false),
AbortSignal/timeout, validacao de resposta e erros incertos. Nao foi encontrado
trabalho local obrigatorio adicional nesses tres adaptadores. Nao criar novo
wrapper ou mudar seus contratos apenas para preparar um transporte inexistente.
Fabrica continua exclusiva do backend; JWT de usuario nao vai para Supabase.

O unico adaptador de leitura ainda por escrever e propostas.listarPorFornecedor,
junto da agregacao equivalente de consulta unica. Depende das lacunas abaixo.
Depois delas, reutilizar suporte-leitura.cjs, conversores e fixtures existentes,
e completar comparacoes atualmente SKIP. Isso e trabalho obrigatorio da Etapa 5,
nao ativacao de rotas.

Inventario consultado: Banco de dados/trocaticket.sql, contrato RPC de propostas,
matriz de leituras, documentacao de resultados, db.js e fixtures/testes de
propostas. Busca de CSV no repositorio nao encontrou exportacoes. Nao foi lido
.env, dump de registros ou banco real. Evidencias nao anexadas/localizadas nao
sao presumidas disponiveis.

| Informacao | Ja disponivel | Realmente ausente |
|---|---|---|
| Estrutura historica da origem | trocaticket.sql: MariaDB 10.4.32; itens_cotacao.categoria VARCHAR(100) NOT NULL; tabela utf8mb4/utf8mb4_general_ci, sem override da coluna; SET NAMES utf8mb4 no dump | Confirmacao de que a sessao/coluna usadas pelo pool ainda correspondem ao snapshot, se a origem tiver mudado; nao pedir novamente o DDL historico |
| Limite da agregacao | Nenhum valor efetivo registrado; db.js nao configura group_concat_max_len | @@session.group_concat_max_len da sessao equivalente ao pool |
| Codificacao efetiva | Dump declara utf8mb4; nao prova configuracao do cliente Node em execucao | character_set_client, character_set_connection, character_set_results e collation_connection efetivos; charset/collation da expressao agregada se diferentes do DDL historico |
| Semantica da consulta | DISTINCT, NULL, separador literal ', ', joins/filtros e ausencia de ORDER BY interno ja conhecidos | Nao sao metadados: faltam saidas-oraculo para variantes equivalentes/representantes, ordem incidental e truncamento/avisos em bytes. Nao inventar regra para preencher essas lacunas |

Nao solicitar novamente versao historica do MariaDB, collation ICU do destino,
separador, NULL, campos/joins, ordenacao externa ou os CSVs de ACL ja conferidos.
Oito SKIP sao exatamente comparacoes ainda sem resultado, nao oito novos pedidos
de auditoria. Metadados sozinhos nao provam equivalencia universal de collations.

## Encerramento possivel e criterios de aceite

**Pode encerrar agora:** preparacao local e validacao PostgreSQL dos tres fluxos
atomicos, com pendencias HTTP explicitamente preservadas. As provas anteriores
permanecem validas: codigo SQL nao mudou. Nao recriar clusters para repeti-las.

**Obrigatorio para concluir a implementacao da Etapa 5:** resolver a unica
agregacao faltante sem aproximacao, implementar repositorio/RPC correspondente,
preservar contratos e executar testes pertinentes a essa mudanca. Progresso
atual: 26/27 implementadas; nenhuma das tres RPCs voltou a ser pendencia local.

**Aceite de integracao separado, comum as 27:** validar HTTP real (leituras,
binding/serializacao, erros, paginacao e RPCs) quando houver PostgREST disponivel.
Nao e justo exigir isso so das ultimas quatro nem declarar 27/27 HTTP por mocks.
Uma unica rodada para os tres fluxos podera usar fixture compartilhada e SDK
existente, verificando JSON/NUMERIC, respostas/SQLSTATE, commit/rollback por
requisicao e timeout sem reenvio. Nao repetir toda a bateria SQL de concorrencia
se o corpo/protocolo nao mudar; focar as garantias novas do transporte.

**Ativacao posterior:** ligar identidades do middleware aos adaptadores, selecionar
provider somente apos escritas/rotas restantes estarem prontas, revisar permissoes
do destino e reconciliar importacao/datas. Exige autorizacao propria. Esses itens
nao impedem encerrar desenvolvimento das leituras nem aumentam o denominador 27.

PostgREST nao foi localizado: nenhum comando no PATH, nenhum executavel nos dois
locais adicionais verificados (PostgreSQLTest e Program Files/PostgREST), nenhuma
imagem local alem de postgres:17. Inventario parcial de arquivos, nao prova de
ausencia absoluta em todo disco. Nenhum endpoint externo sera usado como fallback.
Alternativa minima e tamanho estao acima; nenhum programa/imagem foi baixado.

Inventario Docker reconferido nesta revisao: mesmos 646 MB, zero containers,
zero volumes e cache 0 B. Nada excluido. Apenas este relatorio foi atualizado;
git diff --check executado. Nenhum teste repetido sem mudanca funcional.

Atualizacao posterior: a coleta de origem acima foi autorizada e concluida.
O inventario de ausencias e o proximo passo anteriores sao historicos. Estado
atual no resultado final do CONTRATO_RPC_PROPOSTAS_FORNECEDOR.md: 23 observacoes,
mesma conexao 12, sem registros reais/escritas; dados suficientes para rejeitar
aproximacoes, ainda insuficientes para declarar equivalencia PostgreSQL. Proximo
passo e comparacao sintetica no destino explicitamente autorizado, sem nova
coleta MySQL. 26/27 permanece por agregacao nao implementada, nao por HTTP.
