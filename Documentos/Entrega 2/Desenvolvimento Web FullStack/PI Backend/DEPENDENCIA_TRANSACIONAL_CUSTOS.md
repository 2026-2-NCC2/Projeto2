# Dependencia transacional: custos.listarPorEvento

Atualizacao de contagem e evidencias: ver [consolidacao](CONSOLIDACAO_ETAPA_5.md).
GET e releitura atomica estao implementados e contabilizados sob criterio local
uniforme (26/27 no total). As exigencias HTTP abaixo sao de validacao integrada,
nao motivo para excluir apenas esta operacao da contagem de codigo.

Estado atual: GET/interface independente preparados localmente; a equivalencia
integral do metodo original, incluindo o PUT, ainda aguarda validacao transacional.
Progresso reavaliado em 22/27 pelos criterios abaixo, sem contar um caminho parcial.
MySQL continua ativo em todas as rotas. Nenhuma consulta real foi executada.

Atualizacao posterior: a substituicao atomica e sua releitura foram preparadas
em arquivo SQL e adaptador independente, sem instalacao ou ligacao a rotas.
Contrato, artefatos e pendencias constam exclusivamente na secao
"Preparacao local autorizada" de [PLANO_TRANSACOES_SUPABASE.md](PLANO_TRANSACOES_SUPABASE.md).
A leitura GET foi adicionada em repositories/supabase/custos.cjs. A analise
transacional abaixo permanece valida; o metodo original ainda nao e declarado
integralmente migrado.

## Dois usos do mesmo metodo

Em repositories/mysql/custos.cjs, a assinatura e listarPorEvento(id, conexao = db).
O metodo usa exclusivamente conexao.execute e devolve as linhas sem conversoes.

- GET /eventos/:id/custos: apos JWT, perfil organizador, ID valido e verificacao
  de propriedade, listarPorEvento(id) usa o pool padrao.
- PUT /eventos/:id/custos: listarPorEvento(id, conexao) usa a MESMA conexao obtida
  por db.getConnection e iniciada por beginTransaction. Nao e uma nova leitura
  independente do banco apos o salvamento.

Ordem observada no PUT de server.js:

1. Validar toda a lista antes de obter conexao ou gravar.
2. Obter conexao e iniciar transacao.
3. SELECT do evento proprio FOR UPDATE nessa conexao.
4. Excluir custos anteriores e inserir os itens validados.
5. Reler os custos na mesma conexao, ainda antes do commit.
6. Commit; somente depois enviar HTTP 200 com a lista relida.
7. Em falha, tentar rollback; liberar a conexao no finally.

A leitura enxerga as alteracoes da propria transacao, incluindo IDs gerados e
lista vazia apos excluir tudo. Os dados ainda podem ser revertidos se a releitura
falhar. O bloqueio do evento continua ate o termino da transacao e coordena o PUT
com a publicacao de cotacoes, que tambem precisa bloquear o evento primeiro.

## Contrato que deve permanecer

- SQL: SELECT id, evento_id, categoria, descricao, valor_estimado FROM custos_evento
  WHERE evento_id = ? ORDER BY id (ASC).
- Array de objetos com esses cinco campos. Lista sem custos: [].
- Sem joins, filtro de status, trim, somatorio ou regra de sinal nova na leitura.
- DECIMAL(12,2) em string no driver atual; preservar escala e precisao. Reutilizar
  decimalTexto e solicitar NUMERIC como texto na implementacao futura.
- Nao ha campos de data nessa projecao.
- A leitura nao verifica propriedade por si so: a verificacao pertence ao fluxo
  chamador. Nao devolver [] como substituto de falha, evento alheio ou erro de API.
- Falhas do executor sao propagadas; o GET conserva HTTP 500 / "Erro interno ao
  listar custos do evento."; o PUT conserva HTTP 500 / "Erro interno ao salvar
  custos do evento.". Evento ausente/alheio continua no 404 do fluxo existente.
- Validacoes, JWT, perfil organizador e mensagens nao sao alterados nesta etapa.

## Por que nao implementar apenas uma chamada de leitura REST

Uma leitura independente para GET e tecnicamente possivel com a fabrica Supabase,
os utilitarios compartilhados, filtro por evento e ordem por ID. Isso cobre apenas
um dos usos do metodo. Ignorar o segundo argumento conexao produziria falsa
compatibilidade e permitiria uma leitura em outra transacao durante o PUT.

O cliente Supabase/PostgREST existente nao fornece um handle de transacao SQL
compartilhavel entre chamadas HTTP separadas. Cada requisicao tem sua propria
transacao. Reutilizar a mesma instancia do cliente nao reutiliza a transacao do
PUT. Outra sessao nao garante leitura das alteracoes ainda nao confirmadas.

Mover a releitura para depois do commit tambem muda o contrato: uma falha de
leitura ja nao permitiria reverter a substituicao, e outro PUT poderia modificar
os custos antes da resposta. Ler dados previamente confirmados ou retornar o
payload enviado ignora IDs efetivos e o resultado da persistencia.

Nesta etapa foi autorizada a separacao explicita: listarPorEvento(id) no
repositorio Supabase e SOMENTE leitura independente. Qualquer segundo argumento,
inclusive undefined, e recusado com SUPABASE_CUSTO_CONNECTION_UNSUPPORTED antes
de construir a consulta. Nao ha descarte de conexao, fallback MySQL ou alegacao
de que esse metodo pode substituir listarPorEvento(id, conexao) dentro do PUT.
A dependencia do metodo original nao e do SELECT isolado, mas tambem de sua
reutilizacao dentro da atualizacao atomica.

## Solucao transacional preparada, ainda nao executada

Foi preparada a operacao atomica de substituicao descrita no plano, sem executar
ou instalar o SQL. Uma RPC de escrita deve executar validacao, verificacao de
propriedade, bloqueio do evento, exclusao, insercoes e a releitura ordenada na
mesma transacao da requisicao. Falhas devem abortar a transacao, nao ser capturadas
e transformadas em retorno de sucesso ou objeto de erro que permita commit.

A RPC de escrita deve ter semantica VOLATILE e ser chamada pelo backend em
requisicao de escrita. A transacao pertence a requisicao PostgREST: nao tentar
controla-la com begin/commit do cliente entre chamadas independentes. Seguranca,
EXECUTE, risco das ACLs e concorrencia exigem revisao separada antes de expor
qualquer objeto; nenhuma funcao ou permissao foi criada nesta etapa.

Para compartilhar a projecao, usar o mesmo fragmento SQL ou helper SQL interno
na funcao de atualizacao e no fluxo de leitura. A chamada desse helper deve
ocorrer DENTRO da transacao da atualizacao, nao via uma segunda RPC do Node.
Preservar o bloqueio do evento como primeiro bloqueio tambem na futura publicacao.

Alternativa arquitetural: um adaptador PostgreSQL com conexao SQL transacional
real poderia preservar a assinatura com conexao. Isso exigiria decisao separada
de infraestrutura e nao e equivalente a reutilizar a fabrica Supabase existente.
Nao introduzir tal adaptador neste incremento.

## Interfaces locais separadas

| Caminho | Interface | Contexto da leitura |
|---|---|---|
| MySQL atual, GET/PUT | criarRepositorioCustos(db).listarPorEvento(id, conexao = db) | Executor real recebido ou pool; assinatura/chamadores preservados |
| Supabase, apenas GET | criarRepositorioCustos(cliente).listarPorEvento(id) | Requisicoes independentes de leitura; segundo argumento recusado |
| Supabase, substituicao atomica | criarAdaptadorSubstituicaoCustos(cliente).substituir(eventoId, usuarioId, custos) | Releitura ocorre no SQL da mesma RPC, antes do commit; nenhum GET posterior |

O GET recebe o ID numerico validado pelo chamador, como o handler atual. Ele
nao substitui JWT, perfil ou buscarEventoDoUsuario, nem cria resposta 404 por si:
lista vazia significa sem custos, e propriedade continua no fluxo chamador.
Retorna id/evento_id/categoria/descricao/valor_estimado; nao faz trim em textos,
nao calcula total nem reaplica validacoes de escrita. Negativos historicos e
strings vazias sao preservados. NUMERIC e solicitado como ::text antes de JSON.
decimalTexto e reutilizado sem alterar o helper compartilhado; whitespace final
monetario e recusado, nunca corrigido silenciosamente.

listarPaginas coleta a lista por id ASC com count exact, recusa contagens
inconsistentes, IDs repetidos/fora de ordem e erros em qualquer pagina. Os erros
originais do SDK/transporte sao propagados; nunca viram [] ou lista parcial.
retry(false) e explicito, sem alterar a fabrica. Nao ha snapshot entre paginas:
mudancas concorrentes podem manter a contagem e escapar das verificacoes. Essa
limitacao ja documentada para leituras REST permanece pendente de validacao/
decisao de compatibilidade antes da ativacao; nao afeta a releitura interna da RPC.

Nao sinalizar sucesso apos timeout incerto do PUT nem repetir substituicao
automaticamente. O SQL e o adaptador atomico nao foram alterados neste incremento.

## Evidencias e validacoes

Ja existem testes mockados em tests/custos-repository.test.cjs para:

- pool padrao e executor transacional injetado;
- releitura final com a conexao recebida, nunca o pool;
- normalizacao monetaria e ordem completa do PUT;
- lista vazia apos exclusao;
- falha na releitura, rollback e liberacao da conexao;
- propriedade, erros de GET, falhas de commit e ausencia de retry.

Esses testes serao aproveitados, sem duplicar testes apenas para aumentar a
contagem. A suite completa foi solicitada novamente neste incremento. Nenhum
teste de equivalencia Supabase ou concorrencia real foi considerado aprovado.

Quando a validacao transacional for autorizada, testar em ambiente descartavel:
visibilidade das proprias insercoes antes do commit; dados anteriores para outras
sessoes; falha na releitura revertendo toda a substituicao; array vazio; precisao
decimal; disputa PUT/publicacao com o mesmo evento; e timeout apos possivel commit.
Paginas REST nao sao substituto de snapshot nem de uma unica transacao. Fidelidade
dos dados importados continua dependendo da reconciliacao, nao de mocks.

## Reavaliacao da contagem

Completo LOCALMENTE: leitura independente para o GET, rejeicao de conexao,
projecao, filtros/ordem/decimais/vazio/erros e testes simulados significativos.
Essa interface ja nao e uma pendencia de codigo local. Nao alterou rotas.

Para contabilizar custos.listarPorEvento no inventario original de 27 metodos,
faltam as garantias do seu segundo uso: compilar a RPC em PostgreSQL autorizado,
comprovar releitura das proprias insercoes antes do commit, IDs/ordem/precisao,
vazio e rollback integral se a releitura falhar; conferir binding/privilegios e
equivalencia real da leitura independente, incluindo paginacao. A interface GET
nao aceita uma conexao, portanto nao alegar compatibilidade de assinatura com
o metodo MySQL completo. O mapeamento GET separado + resultado da RPC esta
definido; sua validacao integral continua pendente. Nao e necessario ativar
producao para comprovar essas garantias num ambiente descartavel autorizado.

Assim, o incremento conclui o caminho GET, mas nao completa uma nova operacao
integral do inventario: 22/27, por criterio contratual e evidencia faltante,
nao por ordem de manter um numero fixo. Ver a matriz unica em
[LEITURAS_PENDENTES.md](repositories/supabase/LEITURAS_PENDENTES.md) para os
criterios das outras quatro operacoes. Nenhuma validacao PostgreSQL foi iniciada.

Referencias verificadas:
- repositories/mysql/custos.cjs
- server.js, handlers GET e PUT /eventos/:id/custos
- tests/custos-repository.test.cjs
- https://docs.postgrest.org/en/v12/references/transactions.html
