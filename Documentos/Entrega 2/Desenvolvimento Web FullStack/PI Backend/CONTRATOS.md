# Contratos atuais do backend TrocaTicket — Etapa 1

Levantamento de `server.js` e dos testes em 29/10/2026. Este documento fixa o
comportamento existente para orientar uma migração futura; não propõe nem executa
alterações de rotas, autenticação, persistência ou infraestrutura. São **29 pares
método/caminho**, incluindo a raiz. O código é a fonte de verdade. As ferramentas
do grafo de revisão não estavam disponíveis na sessão; a análise usou leitura
direta do código e dos testes.

## Convenções e regras compartilhadas

- Os caminhos abaixo são relativos à raiz da API. Não há paginação nem parâmetros
  de query consumidos pelas rotas. Campos adicionais no corpo são ignorados.
- Entradas estruturadas são JSON; respostas de negócio são JSON. Listagens
  retornam arrays diretamente, inclusive `[]`; detalhes retornam objetos, sem
  envelope. Erros tratados usam exclusivamente `{ "erro": "mensagem" }`.
- `Público` dispensa token. `Autenticado` aceita qualquer perfil do usuário
  encontrado no banco. Os demais perfis são literais, sensíveis a maiúsculas:
  `admin`, `organizador`, `participante`, `fornecedor`. Admin **não** tem acesso
  automático às rotas dos demais perfis.
- Autenticação exige `Authorization: Bearer <token>` com esse prefixo exato.
  JWT é verificado com HS256; `id` no payload precisa ser número inteiro positivo
  seguro. O usuário é consultado em cada requisição; autorização usa seu perfil
  atual no banco, não o perfil declarado no token. Login emite HS256 por uma hora.
- Erros comuns a **todas as 26 rotas protegidas**: `401` / `Token não informado.`,
  `401` / `Token inválido ou expirado.`, `401` / `Usuário não encontrado.`;
  `500` / `Erro interno ao autenticar usuário.`. Rotas com restrição de perfil
  também retornam `403` / `Você não tem permissão para realizar esta ação.`.
  `POST /solicitacoes-acesso` faz sua própria restrição, descrita abaixo.
  O middleware de perfis ainda contém `401` / `Usuário não autenticado.`, ramo
  defensivo precedido por autenticação em todas as rotas atuais.
- Antes dos handlers, `express.json()` pode produzir `400` (JSON malformado) ou
  `413` (corpo excedido), ambos com `Corpo da requisicao invalido ou muito grande.`.
  O handler final usa `500` / `Erro interno no servidor.` para erros inesperados;
  se os headers já foram enviados, destrói a resposta. Limite/tipos de parsing
  seguem os defaults da versão instalada do Express, sem configuração própria.
  CORS permite origem `http://localhost:5173`; não substitui autorização.
- Caminhos/métodos não cadastrados usam o comportamento padrão do Express (404,
  sem promessa de JSON). OPTIONS/CORS e HEAD implícito do Express não são rotas
  adicionais neste inventário.
- Resultados SELECT são repassados sem DTO ou conversão explícita. IDs, datas,
  horários, timestamps, DECIMAL e valores nulos recebidos do driver não têm tipos
  de saída uniformizados pela aplicação. Datas recebidas como `Date` passam pela
  serialização JSON; strings continuam strings. A migração deve verificar essa
  serialização com fixtures de integração antes de alterar os tipos. As listas
  de campos abaixo são projeções SQL, não validadores de saída.
- `Number(x)` precede a validação dos IDs da URL. IDs de detalhe/edição/exclusão
  de evento e custos usam `Number.isSafeInteger`; publicação de evento, inscrição,
  proposta e análise de acesso usam `Number.isInteger` (sem exigir segurança).
  `evento_id` de cotação exige string ou número e inteiro seguro positivo.
  Coerções aceitas pelo JavaScript não devem ser confundidas com validação estrita
  de uma representação decimal. Não foi acrescentada validação nesta etapa.

## Formatos de resposta

Os nomes abaixo abreviam objetos nas tabelas. `X[]` significa array de objetos X.

| Nome | Campos, exatamente como selecionados ou construídos |
| --- | --- |
| Usuario | `id, nome, email, perfil` (nunca senha) |
| Perfil | `id, nome, email` (não inclui perfil) |
| Evento | `id, nome, data, horario, local, categoria, publico, descricao, status, usuario_id` |
| EventoAdmin | Evento + `organizador_nome` |
| EventoDisponivel | Evento sem `usuario_id` |
| Inscricao | `id, evento_id, status, data_inscricao, evento_nome, evento_data, evento_horario, evento_local, evento_categoria` |
| Custo | `id, evento_id, categoria, descricao, valor_estimado` |
| ItemCotacao | `id, categoria, descricao, valor_estimado` |
| ItemPublicado | `categoria, descricao, valor_estimado` (sem id; valor decimal canônico em string) |
| Cotacao | `id, evento_id, evento_nome, evento_data, evento_local, prazo, modalidade, observacoes, status, criada_em, itens: ItemCotacao[]` |
| CotacaoAdmin | `id, evento_id, evento_nome, prazo, modalidade, observacoes, status, criada_em` (sem itens, data ou local do evento) |
| PropostaFornecedor | `id, cotacao_id, valor, condicoes_pagamento, detalhes_tecnicos, status, criada_em, evento_nome, categoria` |
| PropostaRecebida | `id, cotacao_id, fornecedor_id, valor, condicoes_pagamento, detalhes_tecnicos, status, criada_em, evento_id, evento_nome, fornecedor_nome` |
| Solicitacao | `id, usuario_id, nome, email, perfil_solicitado, justificativa, status, criada_em` |

`categoria` de PropostaFornecedor é `GROUP_CONCAT(DISTINCT i.categoria SEPARATOR ', ')`
com LEFT JOIN; pode ser nula se não houver itens. A ordem interna das categorias
não é especificada. JOINs das demais listagens são INNER JOIN: registros sem a
referência correspondente não aparecem. Não há ordenação implícita adicional aos
critérios expressos abaixo, inclusive nos empates.

## Inventário das 29 rotas

Os códigos de erro nesta tabela são **específicos do handler**, somados aos erros
comuns de autenticação/parsing acima. `500` refere-se ao erro de execução do
handler; as mensagens exatas constam na última tabela.

| # | Método e caminho | Autenticação/perfil | Parâmetros e corpo | Resposta de sucesso | Erros do handler |
| --- | --- | --- | --- | --- | --- |
| 1 | `GET /` | Público | Nenhum | `200 {mensagem:"Backend do TrocaTicket funcionando!"}` | Nenhum explícito |
| 2 | `POST /usuarios` | Público; limite por IP | `{nome,email,senha,perfil}` | `201 {mensagem:"Usuário cadastrado com sucesso!",usuario:Usuario}` | 400, 409, 429, 500 |
| 3 | `POST /login` | Público; limite por IP | `{email,senha}` | `200 {mensagem:"Login realizado com sucesso!",token,usuario:Usuario}` | 400, 401, 429, 500 |
| 4 | `GET /usuarios` | admin | Nenhum | `200 Usuario[]` | 500 |
| 5 | `GET /perfil` | Autenticado | Nenhum | `200 Perfil` | 404, 500 |
| 6 | `GET /eventos` | Autenticado | Nenhum | `200 Evento[]` do usuário atual | 500 |
| 7 | `GET /admin/eventos` | admin | Nenhum | `200 EventoAdmin[]` de todos os proprietários | 500 |
| 8 | `GET /participante/eventos` | participante | Nenhum | `200 EventoDisponivel[]` ativos | 500 |
| 9 | `POST /eventos` | organizador | Corpo EventoEntrada abaixo | `201 {mensagem:"Evento cadastrado com sucesso!",evento:Evento}` | 400, 500 |
| 10 | `GET /eventos/:id` | Autenticado | `id` inteiro seguro positivo | `200 Evento` próprio | 400, 404, 500 |
| 11 | `PUT /eventos/:id` | organizador | `id` seguro; EventoEntrada completo | `200 {mensagem:"Evento atualizado com sucesso!"}` | 400, 404, 500 |
| 12 | `DELETE /eventos/:id` | organizador | `id` seguro | `200 {mensagem:"Evento excluído com sucesso!"}` | 400, 404, 500 |
| 13 | `PATCH /eventos/:id/publicar` | organizador | `id` inteiro positivo; corpo ignorado | `200 {mensagem:"Evento publicado com sucesso!",status:"Ativo"}` | 400, 404, 500 |
| 14 | `GET /eventos/:id/custos` | organizador | `id` seguro | `200 Custo[]` | 400, 404, 500 |
| 15 | `PUT /eventos/:id/custos` | organizador | `id` seguro; `{custos:[{categoria,descricao,valor_estimado}]}` | `200 Custo[]` persistidos | 400, 404, 500 |
| 16 | `POST /participante/inscricoes` | participante | `{evento_id}` convertido com Number | `201 {mensagem:"Inscrição realizada com sucesso!",inscricao:{id,usuario_id,evento_id,status:"Confirmada"}}` | 400, 404, 409, 500 |
| 17 | `GET /participante/inscricoes` | participante | Nenhum | `200 Inscricao[]` próprias | 500 |
| 18 | `POST /cotacoes` | organizador | `{evento_id,prazo,observacoes?,itens:[{categoria,descricao,valor_estimado}]}` | `201 {mensagem:"Cotação publicada com sucesso!",cotacao:{id,evento_id,prazo,modalidade:"Fechada",observacoes,status:"Aberta",itens:ItemPublicado[]}}` | 400, 404, 409, 500 |
| 19 | `GET /cotacoes` | organizador | Nenhum | `200 Cotacao[]` dos eventos próprios | 500 |
| 20 | `GET /admin/cotacoes` | admin | Nenhum | `200 CotacaoAdmin[]` globais | 500 |
| 21 | `GET /fornecedor/cotacoes` | fornecedor | Nenhum | `200 Cotacao[]` abertas dentro do prazo | 500 |
| 22 | `POST /fornecedor/propostas` | fornecedor | `{cotacao_id,valor,condicoes_pagamento,detalhes_tecnicos}` | `201 {mensagem:"Proposta enviada com sucesso!",proposta_id}` | 400, 404, 500 |
| 23 | `GET /fornecedor/propostas` | fornecedor | Nenhum | `200 PropostaFornecedor[]` próprias | 500 |
| 24 | `GET /organizador/propostas` | organizador | Nenhum | `200 PropostaRecebida[]` dos eventos próprios | 500 |
| 25 | `GET /admin/propostas` | admin | Nenhum | `200 PropostaRecebida[]` globais | 500 |
| 26 | `PATCH /organizador/propostas/:id/status` | organizador | `id` inteiro positivo; `{status:"Aprovada"\|"Recusada"}` | `200 {mensagem:"Proposta aprovada com sucesso!" ou "Proposta recusada com sucesso!",proposta_id,status}` | 400, 404, 500 |
| 27 | `POST /solicitacoes-acesso` | Autenticado; somente participante após validar corpo | `{perfil_solicitado:"organizador"\|"fornecedor",justificativa}` | `201 {mensagem:"Solicitação enviada com sucesso!",solicitacao:{id,usuario_id,perfil_solicitado,justificativa,status:"pendente"}}` | 400, 403, 409, 500 |
| 28 | `GET /solicitacoes-acesso` | admin | Nenhum | `200 Solicitacao[]` globais | 500 |
| 29 | `PATCH /solicitacoes-acesso/:id` | admin | `id` inteiro positivo; `{status:"aprovado"\|"rejeitado"}` | `200 {mensagem:"Solicitação aprovada com sucesso!" ou "Solicitação rejeitada com sucesso!"}` | 400, 404, 409, 500 |

## Validações, propriedade, estado e ordenação

### Usuários e login

- Cadastro: nome string não vazia após trim; email string com validação
  `^[^\s@]+@[^\s@]+\.[^\s@]+$` após trim; senha string de pelo menos 8 unidades
  UTF-16 (`length`) e no máximo 72 bytes UTF-8. A mensagem fala em “8 a 72 bytes”,
  mas o mínimo implementado usa `length`. Só aceita perfil `participante`.
  Nome recebe trim; email recebe trim e lowercase; senha não recebe trim.
  Verifica email duplicado, faz bcrypt com custo 12 e insere; `ER_DUP_ENTRY`
  também vira 409. Campos da resposta são construídos, sem hash.
- Login: email string não vazia após trim e senha string, inclusive vazia.
  Não aplica regex de email nem tamanho mínimo da senha. Email é normalizado;
  usuário ausente ou bcrypt falso produzem o mesmo 401. Payload JWT contém
  `id, perfil` além dos claims temporais; resposta usa os dados consultados.
- `GET /usuarios`: `ORDER BY id DESC`, sem filtro de proprietário.
  `GET /perfil`: nova consulta por `req.usuario.id`, selecionando apenas
  `id,nome,email`; pode devolver 404 se o usuário sumir após autenticação.
- Controle em memória por processo/IP: login 10 tentativas/15 minutos;
  cadastro 5/hora; contagens independentes. Sucesso e validação rejeitada
  consomem cota; bloqueios retornam 429 antes de SQL/bcrypt e não estendem janela.
  `Retry-After` em segundos, arredondado para cima, mínimo 1. Usa `req.ip` com
  configuração padrão do Express; não confia diretamente em X-Forwarded-For.
  Até 10.000 IPs/rota; sem capacidade recusa novos IPs. Limpa expirados; reinício
  limpa tudo. Parsing acontece antes do limitador. Ver também [SEGURANCA.md](SEGURANCA.md).

### Eventos e custos

- EventoEntrada: `nome,data,horario,local,publico` obrigatórios;
  `categoria,descricao` opcionais, mas strings quando presentes.
  Nome/local strings não vazias após trim. Data string `YYYY-MM-DD` com
  `Date.parse` finito; **não** faz comparação de ida e volta nem bloqueia passado.
  Alguns dias impossíveis podem ser normalizados pelo JavaScript e chegar ao SQL.
  Horário `HH:mm` entre 00:00 e 23:59. Público é número inteiro positivo, sem
  coerção e sem teste de inteiro seguro. Categoria vazia/ausente vira `Corporativo`;
  descrição vazia/ausente vira `""`. Categoria/descrição não recebem trim.
- Cadastro fixa `usuario_id` autenticado e `Em planejamento`, ignorando valores
  desses campos no corpo. PUT exige os campos obrigatórios novamente; não muda
  status/proprietário. Não restringe edição/exclusão pelo status do evento.
- `GET /eventos`: `WHERE usuario_id = usuário atual ORDER BY id DESC` para qualquer
  perfil, inclusive admin (que só vê seus próprios eventos por essa rota).
  Detalhe, edição e exclusão usam `id AND usuario_id`; zero linhas vira 404,
  ocultando existência de evento alheio. PUT/DELETE dependem de `affectedRows`.
  Exclusão não trata dependências/cascatas no handler; erro do banco vira 500.
- Publicação é um UPDATE condicional por id, proprietário e
  `status = 'Em planejamento'`, alterando para `Ativo`. Zero linhas é 404 também
  para estado incompatível. Não verifica custos, cotações ou propostas.
- Admin lista todos com nome do organizador, `ORDER BY e.id DESC`.
  Participante lista só `status = 'Ativo'`, `ORDER BY data ASC, id ASC`, sem excluir
  datas passadas nem exigir inscrição. Não inclui `usuario_id` na projeção.
- GET de custos primeiro valida evento próprio; depois busca custos por evento,
  `ORDER BY id` (ASC). Evento existente sem custos retorna `[]`.
- PUT de custos substitui a lista inteira em transação: obtém conexão, begin,
  bloqueia evento próprio com `FOR UPDATE`, DELETE de todos os custos, INSERTs,
  SELECT ordenado por id, commit, resposta. `custos:[]` apaga tudo e é válido.
  Evento ausente/alheio faz rollback e 404; erro faz rollback e 500; finally libera.
- Cada item precisa ser objeto não-array, categoria/descrição strings não vazias
  após trim, máximo 100/255 pontos de código (`Array.from`). Valor string ou
  número finito; representação após trim deve corresponder a
  `^\d+(?:\.\d{1,2})?$`: sem sinal, vírgula ou notação exponencial textual.
  Aceita zero; remove zeros à esquerda; limita parte inteira normalizada a
  10 dígitos (máximo `9999999999.99`). Persiste string com duas casas, sem
  arredondar. IDs extras são ignorados; IDs dos custos podem mudar na substituição.

### Inscrições

- `evento_id` deve resultar em inteiro positivo. Busca evento `Ativo`; ausência
  ou evento não publicado é 404. Verifica inscrição por usuário e evento; qualquer
  registro encontrado, independentemente do status, produz 409. Trata
  `ER_DUP_ENTRY` do banco como 409, inclusive em corrida entre verificação e INSERT.
- INSERT usa usuário autenticado; não aceita usuário/status do corpo. Resposta
  constrói `Confirmada` e não relê linha inserida. Não há transação nesta rota.
- Listagem filtra `i.usuario_id` atual, junta dados do evento, ordena por
  `i.data_inscricao DESC` sem desempate adicional. Não filtra status da inscrição
  nem do evento na listagem.

### Cotações

- Publicação exige evento_id string/número convertido para inteiro seguro positivo;
  prazo string `YYYY-MM-DD`, data real confirmada por ida e volta ISO, não anterior
  ao dia atual **UTC** da aplicação. Observações opcionais precisam ser string,
  preservadas sem trim, default `""`. `itens` precisa ser array; cada item segue a
  normalização monetária de custos descrita acima.
- Transação: begin → lock do evento próprio → custos `ORDER BY id FOR UPDATE` →
  comparação com itens revisados → INSERT cotação → INSERTs dos itens → commit.
  Sem evento próprio: 404. Sem custos persistidos: 400. Custos persistidos inválidos:
  500. Divergência na quantidade, ordem ou conteúdo normalizado: 409. Array de
  itens vazio passa a validação inicial, mas não publica se houver custos
  (409), nem sem custos (400). IDs de itens enviados são ignorados.
- Cotação sempre `Fechada`/`Aberta`, independentemente do corpo; não verifica status
  do evento. Copia custos persistidos, preservando cotações anteriores. Não impede
  múltiplas publicações idênticas. Erro tenta rollback; falha de rollback força 500
  e tenta destruir conexão quando suportado; caso contrário libera no finally.
  Erro de release é apenas logado nessa rota. Não repete automaticamente a escrita;
  falha de commit tem resultado incerto, refletido na mensagem 500.
- Organizador: filtro `e.usuario_id`, `ORDER BY c.id DESC`; para cada cotação,
  adiciona itens `WHERE cotacao_id = ? ORDER BY id` (ASC).
- Fornecedor: mesmos campos e itens, mas filtro global `c.status = 'Aberta' AND
  c.prazo >= CURDATE()`, sem filtro por fornecedor/proprietário/modalidade ou status
  do evento; ordem `c.id DESC`. CURDATE é o dia do **banco**, que pode diferir do UTC.
- Admin: todas as cotações com `ORDER BY c.id DESC`; não carrega itens.

### Propostas

- Criação converte `cotacao_id` com Number para validar inteiro positivo, mas usa
  o **valor original** nos parâmetros SQL. Valor usa Number, deve ser finito e
  maior que zero; não exige duas casas ou limite DECIMAL no handler.
  Condições/detalhes strings não vazias após trim, persistidas com trim.
- Busca cotação `Aberta` com prazo `>= CURDATE()`. Não filtra modalidade nem status
  do evento. Insere fornecedor autenticado; não define status explicitamente
  (depende do default do banco). Não checa proposta duplicada, não abre transação
  e não mapeia duplicidade para 409. Retorna somente mensagem e proposta_id.
- Fornecedor lista por `p.fornecedor_id`, agrega categorias distintas dos itens;
  organizador lista por `e.usuario_id`; admin não filtra proprietário.
  Todas ordenam por `p.criada_em DESC, p.id DESC`.
- Avaliação aceita só `Aprovada` ou `Recusada` (maiúsculas exatas). UPDATE com JOIN
  filtra id da proposta, dono do evento e status anterior `Em avaliação`.
  Zero affectedRows: 404 para ausente, alheia ou já avaliada. Não altera cotação,
  não recusa outras propostas automaticamente e não verifica prazo na avaliação.
- Criação/avaliação desestruturam `req.body` sem fallback: se for ausente/null,
  uma exceção capturada retorna o 500 específico da rota, em vez de 400.

### Solicitações de acesso

- Criação valida perfil solicitado (`organizador`/`fornecedor`) e justificativa
  string não vazia após trim **antes** de exigir participante: corpo inválido pode
  retornar 400 até para admin. Corpo válido de outro perfil retorna 403 próprio.
- Busca qualquer pendência do usuário, sem distinguir perfil solicitado: 409 se
  existir. INSERT usa id autenticado/justificativa com trim; resposta constrói
  `pendente`. Não há transação nem tratamento específico de ER_DUP_ENTRY (vira 500).
- Admin lista todas, `ORDER BY s.criada_em DESC, s.id DESC`.
- Análise exige status minúsculo `aprovado`/`rejeitado`; obtém conexão, begin e
  SELECT da solicitação `FOR UPDATE`. Ausente: rollback/404. Já analisada:
  rollback/409. Aprovação atualiza perfil do usuário somente se ainda
  `participante`, exigindo exatamente uma linha afetada; senão rollback/409.
  Rejeição não atualiza perfil. Atualiza status da solicitação e faz commit;
  finally libera conexão. Falha comum tenta rollback e retorna 500.
  Falhas do próprio rollback/release não têm a proteção adicional da publicação
  de cotação e podem chegar ao handler final com 500 genérico.

## Catálogo de erros específicos

Cada texto abaixo é o valor de `erro`, sem alteração de acentos/capitalização.
Nos casos com mais de uma condição, a ordem segue as verificações do handler.

| Rota/operação | Código e mensagem |
| --- | --- |
| POST usuários | 400 `Informe nome, email válido, senha de 8 a 72 bytes e um perfil permitido.`; 409 `Email já cadastrado!`; 500 `Erro interno no cadastro.` |
| POST login | 400 `Email e senha são obrigatórios.`; 401 `Email ou senha incorretos.`; 500 `Erro interno no login.` |
| Limite login/cadastro | 429 `Muitas tentativas. Tente novamente mais tarde.` + header Retry-After |
| GET usuários | 500 `Erro interno ao listar usuários.` |
| GET perfil | 404 `Usuário não encontrado.`; 500 `Erro interno ao buscar perfil.` |
| GET eventos | 500 `Erro interno ao listar eventos.` |
| GET admin/eventos | 500 `Erro interno ao listar eventos do administrador.` |
| GET participante/eventos | 500 `Erro interno ao listar eventos disponíveis.` |
| POST eventos | 400 `Informe nome, data, horário, local e público válidos.`; 500 `Erro interno ao cadastrar evento.` |
| IDs de evento (detalhe, PUT, DELETE, publicação e custos) | 400 `ID do evento inválido.` |
| GET eventos/:id | 404 `Evento não encontrado.`; 500 `Erro interno ao buscar evento.` |
| PUT eventos/:id | 400 `Informe dados válidos para atualizar o evento.`; 404 `Evento não encontrado.`; 500 `Erro interno ao atualizar evento.` |
| DELETE eventos/:id | 404 `Evento não encontrado.`; 500 `Erro interno ao excluir evento.` |
| PATCH eventos/:id/publicar | 404 `Evento não encontrado, não pertence a você ou não está em planejamento.`; 500 `Erro interno ao publicar evento.` |
| GET custos | 404 `Evento não encontrado.`; 500 `Erro interno ao listar custos do evento.` |
| PUT custos | 400 `Informe a propriedade custos como um array.`; 400 `Informe categoria de até 100 caracteres, descrição de até 255 caracteres e valor estimado válido.`; 400 `O valor estimado deve ser não negativo e possuir no máximo duas casas decimais.`; 400 `O valor estimado não pode exceder 9999999999.99.`; 404 `Evento não encontrado.`; 500 `Erro interno ao salvar custos do evento.` |
| POST participante/inscricoes | 400 `ID do evento inválido.`; 404 `Evento não encontrado ou não publicado.`; 409 `Você já está inscrito neste evento.`; 500 `Erro interno ao realizar inscrição.` |
| GET participante/inscricoes | 500 `Erro interno ao buscar inscrições.` |
| POST cotações | 400 `Informe evento, prazo válido e itens da cotação.`; 400 `O prazo da cotação deve ser uma data válida e não pode estar no passado.`; 400 `Cadastre custos no evento antes de publicar a cotação.`; 404 `Evento não encontrado ou não pertence ao usuário.`; 409 `Os custos foram alterados. Consulte e revise a lista antes de publicar.`; 500 `Não foi possível confirmar a publicação. Consulte as cotações antes de tentar novamente.` |
| GET cotações / GET admin/cotacoes | 500 `Erro interno ao consultar cotações.` |
| GET fornecedor/cotacoes | 500 `Erro interno ao consultar cotações disponíveis.` |
| POST fornecedor/propostas | 400 `Preencha todos os campos corretamente.`; 404 `Cotação não encontrada, encerrada ou com prazo expirado.`; 500 `Erro interno ao enviar proposta.` |
| GET fornecedor/propostas / GET admin/propostas | 500 `Erro interno ao buscar propostas.` |
| GET organizador/propostas | 500 `Erro interno ao buscar propostas recebidas.` |
| PATCH organizador/propostas/:id/status | 400 `ID da proposta inválido.`; 400 `O status deve ser Aprovada ou Recusada.`; 404 `Proposta não encontrada, sem permissão ou já avaliada.`; 500 `Erro interno ao avaliar proposta.` |
| POST solicitações | 400 `Informe um perfil válido e uma justificativa.`; 403 `Somente participantes podem solicitar acesso.`; 409 `Você já possui uma solicitação pendente.`; 500 `Erro interno ao solicitar acesso.` |
| GET solicitações | 500 `Erro interno ao buscar solicitações.` |
| PATCH solicitações/:id | 400 `Informe uma solicitação e um status válidos.`; 404 `Solicitação não encontrada.`; 409 `Esta solicitação já foi analisada.`; 409 `O usuário não possui mais o perfil participante.`; 500 `Erro interno ao analisar solicitação.` |

## Cobertura e lacunas

Antes desta etapa, `seguranca.test.cjs` cobria limites de frequência, validação JWT,
perfil vindo do banco, projeção/filtro de detalhe de evento, sanitização de logs
e handler final. `cotacoes.test.cjs` cobria publicação, dinheiro, divergências,
rollback/commit e concorrência simulada com PUT de custos. `isolamento.test.cjs`
cobria adaptador MySQL/isolamento/startup; `db-postgres.test.cjs` cobria configuração
e segurança do pool Postgres com driver simulado. Essas duas últimas suítes não
comprovam contratos funcionais das rotas.

`tests/contratos.test.cjs` acrescenta regressões prioritárias executando os handlers
e middlewares reais em VM com dependências substituídas, JWT real, relógio fixo e
fila SQL estrita. Não lê `.env`, não carrega drivers/adaptadores/isolamento reais,
não abre sockets nem bancos. Assertivas de SQL verificam os filtros/ordens pedidos;
as linhas retornadas são fixtures, não uma emulação do motor SQL.

| Área | Cobertura prioritária acrescentada | Lacunas restantes após esta etapa |
| --- | --- | --- |
| Inventário/autorização | Exatos 29 pares; 401 sem token nas 26 protegidas; 403 para cada um dos outros três perfis em cada rota restrita | Bearer malformado em toda a matriz; usuário removido/erro de autenticação por rota; ramo defensivo sem req.usuario |
| Público/perfil | Raiz, normalização cadastro/login, custo bcrypt, ausência de senha/hash, projeção do perfil e desaparecimento entre consultas | Cadastro inválido por todos os tipos/limites UTF-8, duplicidade prévia/corrida; login sem usuário e senha vazia; todos os campos/claims de sucesso |
| Eventos | Cadastro/defaults/proprietário, validação prioritária, edição completa sem status, affectedRows 0/1, publicação condicional, exclusão, 404 de detalhe/custos | Datas normalizadas impossíveis/passadas, coerções incomuns/IDs não seguros nas rotas permissivas, todas as mensagens 400/404, DELETE com FK, todos os perfis permitidos nas rotas genéricas |
| Listagens | Filtros de dono/status/prazo, parâmetros, ORDER BY, arrays vazios, repasse sem envelope; itens por cotação e agregação de categorias no SQL | Projeções completas em todas as consultas; execução real de JOIN/GROUP_CONCAT, ordem em empates, nulos e tipos reais do driver |
| Custos | Consulta após propriedade; substituição vazia transacional; publicação concorrente já coberta na suíte anterior | PUT isolado com cada valor limítrofe, normalização/Unicode, falhas de DELETE/INSERT/SELECT/commit/rollback/release e conexão; GET sem custos de evento existente |
| Inscrições | ID inválido, evento ativo exigido, ausência/duplicidade prévia e ER_DUP_ENTRY, id autenticado e resposta Confirmada, listagem própria | Mensagens completas de rejeição, falhas intermediárias, corrida real/unicidade/defaults/FKs no banco |
| Cotações | Listas do organizador/fornecedor com itens e admin sem consultas extras; fluxo de publicação já coberto | Limites de UTC versus dia do banco, publicação no dia atual e múltiplas publicações, falhas por consulta nas listagens |
| Propostas | Disponibilidade, validação prioritária, trim/Number, valor com três casas, fornecedor do token, filtros/ordens, avaliação de ambos os status/affectedRows | Corpo ausente/null, coerções permissivas, proposta duplicada, falhas intermediárias e default do banco, corrida entre prazo/INSERT e avaliações concorrentes |
| Acesso | Ordem validação/perfil, pendência global, trim, aprovação/rejeição com lock/commit, rollback por ausente/analisada/perfil alterado/falha SQL | Todos os 400, ambos perfis solicitáveis em todos os ramos, falhas de conexão/begin/commit/rollback/release, concorrência real e corrida de criação |
| Erros/transporte | Sanitização e parsing por chamada direta ao handler na suíte de segurança | Teste HTTP real do Express/CORS/parsing/limites/404/HEAD/OPTIONS; erro SQL em cada handler e cada mensagem 500 |

Não há percentual de cobertura de linhas/branches medido; presença de um teste
por rota não significa todos os ramos cobertos. A suíte de mocks fixa escolhas
de SQL e respostas, mas não comprova integridade referencial, defaults, precisão
monetária persistida, timezone/serialização do driver nem garantias do banco.
Essas verificações permanecem para uma etapa futura com integração explicitamente
autorizada. Não houve conexão real nem migração nesta etapa.

Execução final: `npm.cmd test` no PowerShell, dentro de `PI Backend` (equivalente
a `npm test`), concluída em 29/10/2026: **138 testes aprovados, 0 falhas, 0
cancelados e 0 ignorados**. São 81 testes novos de contratos e 57 já existentes
(9 de cotações, 6 de Postgres, 32 de isolamento e 10 de segurança). Casos percorridos
em loops contam como um teste registrado no executor, não como testes adicionais.

Arquivos criados nesta etapa: `CONTRATOS.md` e `tests/contratos.test.cjs`.
Nenhum arquivo existente foi editado; a implementação das rotas permanece intacta.
