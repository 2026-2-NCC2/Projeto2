# Dependencia transacional: custos.listarPorEvento

Estado: analisada e adiada. Progresso mantido em 22/27; nenhuma implementacao
Supabase de listarPorEvento foi adicionada. Este incremento nao retoma propostas.
MySQL continua ativo em todas as rotas. Nenhuma consulta real foi executada.

Atualizacao posterior: a substituicao atomica e sua releitura foram preparadas
em arquivo SQL e adaptador independente, sem instalacao ou ligacao a rotas.
Contrato, artefatos e pendencias constam exclusivamente na secao
"Preparacao local autorizada" de [PLANO_TRANSACOES_SUPABASE.md](PLANO_TRANSACOES_SUPABASE.md).
A analise abaixo permanece valida; listarPorEvento nao e declarado migrado.

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

Assim, nao foi criado um listarPorEvento que so funcione sem conexao, descarte o
argumento transacional ou use fallback MySQL. Nenhum desses atalhos conta como
migracao completa do metodo. A dependência nao e do SELECT isolado, mas de sua
reutilizacao dentro da atualizacao atomica.

## Solucao futura proposta, nao implementada

Definir uma operacao PostgreSQL atomica de substituicao de custos, em etapa
propria autorizada. Uma RPC de escrita pode executar validacao, verificacao de
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

Ao separar futuramente a interface do GET da atualizacao atomica, registrar a
mudanca de interface em etapa propria. O GET pode usar uma leitura independente;
o PUT deve devolver a lista construida internamente, apos o sucesso transacional.
Nao sinalizar sucesso apos timeout incerto nem repetir a substituicao automaticamente.

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

Quando a estrategia transacional for autorizada, testar em ambiente descartavel:
visibilidade das proprias insercoes antes do commit; dados anteriores para outras
sessoes; falha na releitura revertendo toda a substituicao; array vazio; precisao
decimal; disputa PUT/publicacao com o mesmo evento; e timeout apos possivel commit.
Paginas REST nao sao substituto de snapshot nem de uma unica transacao. Fidelidade
dos dados importados continua dependendo da reconciliacao, nao de mocks.

Referencias verificadas:
- repositories/mysql/custos.cjs
- server.js, handlers GET e PUT /eventos/:id/custos
- tests/custos-repository.test.cjs
- https://docs.postgrest.org/en/v12/references/transactions.html
