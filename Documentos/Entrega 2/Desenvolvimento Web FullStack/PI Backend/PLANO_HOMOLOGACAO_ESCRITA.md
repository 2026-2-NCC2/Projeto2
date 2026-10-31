# Plano de homologacao Express → Supabase: escritas descartaveis

Estado: EXECUTADO COM AUTORIZACAO, aprovado e limpo em 31/10/2026.
Resultado em `RESULTADO_HOMOLOGACAO_ESCRITA.md`; manifesto da run
`f779e63e398b4da5bfb473d218ec7121` preserva 21 IDs criados e zero residuos.
O restante documenta o plano autorizado; Supabase normal permanece bloqueado.

## Escopo e isolamento

- Exclusivamente projeto PI Backend, ref `gnwybroqfvwosiqzsfla`, processo novo
  em `127.0.0.1:3111`. MySQL permanece padrao; startup normal Supabase bloqueado.
- O inicializador atual e somente leitura e continua bloqueando escritas.
  Antes da execucao autorizada, preparar inicializador SEPARADO e transporte
  restrito, revisados e testados somente nos controles novos. Nao remover as
  barreiras atuais nem criar flag que libere o servidor normal.
- Allowlist de endpoints, operacoes SDK, RPCs, payloads e IDs do manifesto;
  demais operacoes recusadas. Cadastro limitado aos emails exclusivos da run;
  eventos e dependencias limitados aos atores novos. RPC de acesso so pode
  alterar usuarios descartaveis, mesmo quando o ator e o admin de teste existente.
- JWT HS256/1h exclusivo, middleware/perfil atual, bcrypt, propriedade e handlers
  existentes preservados. IDs de atores vem de req.usuario, nunca do payload.
- Contas existentes sao somente atores de autenticacao, sem alteracao de perfil,
  senha ou registros associados. O admin ja homologado pode aprovar os NOVOS
  usuarios; os demais atores da escrita serao novos e descartaveis.
- Nao repetir homologacao de leitura dos quatro perfis, auditorias, suites
  completas ou provas SQL de locks/rollback/concorrencia ja aprovadas. GETs
  restritos a observar os efeitos novos fazem parte da validacao de escrita.

## Endpoints: 12 operacoes que alteram dados

| Ordem | Endpoint | Ator / prova real nova | Sucesso |
|---|---|---|---|
| 1 | POST /usuarios | Publico; criar somente participantes novos, hash e email unico | 201 |
| 2 | POST /solicitacoes-acesso | Participante descartavel; pedido proprio, pendencia duplicada | 201; duplicada 409 |
| 3 | PATCH /solicitacoes-acesso/:id | Admin existente decide SOMENTE pedidos novos; aprovacao/rejeicao atomicas | 200; repetida 409 |
| 4 | POST /eventos | Organizador novo; dono obtido da sessao | 201 |
| 5 | PUT /eventos/:id | Organizador dono; editar somente evento novo | 200; alheio 404 |
| 6 | PUT /eventos/:id/custos | Dono; substituir conjunto pela RPC, conferir decimais/GET | 200 |
| 7 | POST /cotacoes | Dono; publicar snapshot revisado pela RPC | 201; revisao antiga 409 |
| 8 | POST /fornecedor/propostas | Fornecedor novo; cotacao nova aberta e prazo futuro | 201 |
| 9 | PATCH /organizador/propostas/:id/status | Dono da cotacao; aprovar/recusar propostas novas distintas | 200; repetida/alheia 404 |
| 10 | PATCH /eventos/:id/publicar | Dono; Em planejamento → Ativo; distinto de publicar cotacao | 200; repetida 404 |
| 11 | POST /participante/inscricoes | Participante novo; evento novo ativo, unicidade do par | 201; duplicada 409 |
| 12 | DELETE /eventos/:id | Dono; evento novo sem dependencias reservado para essa prova | 200; repetida 404 |

POST /login ja homologado nao integra o inventario de escritas. Usar apenas para
obter os tokens necessarios dos atores descartaveis. Nao inventar 409 para
duplicidade de propostas ou solicitacoes em corrida: preservar o handler atual.
Confirmar 400/401/403/404/409 apenas nos cenarios aplicaveis e mensagens atuais,
sem exigir o mesmo erro em todos os endpoints. Admin nao herda outros perfis.

## Fixtures locais preparadas

Modelo inerte: `fixtures/homologacao-escrita.modelo.json`. Placeholders nao sao
credenciais nem IDs reais. Resolver RUN_ID aleatorio, datas futuras e senhas
novas somente na execucao autorizada; guardar credenciais fora de logs/Git.

- Quatro usuarios: O_A, O_B, F_A e P_A, cadastrados como participantes.
  Aprovar O_A/O_B para organizador e F_A para fornecedor via os endpoints de
  acesso. P_A permanece participante; rejeitar seu pedido de mudanca de perfil.
- Quatro pedidos de acesso: tres aprovacoes e uma rejeicao; testar pendencia
  duplicada e decisao repetida sem criar dados extras.
- Tres eventos: E_FLUXO (O_A), E_ALHEIO (O_B, teste de propriedade) e E_EXCLUIR
  (O_A, sem dependencias). Nome, descricao e justificativas com marcador da run.
- Custos em E_FLUXO, uma cotacao, duas propostas (aprovar uma, recusar outra)
  e uma inscricao de P_A. Registrar TODOS os IDs devolvidos ou observados,
  inclusive custos substituidos e itens gerados pela RPC.
- Quatro cadastros validos + uma tentativa duplicada = cinco tentativas por IP
  na janela de uma hora. Nao desligar o rate limit de cadastro para o teste.
  Respeitar tambem dez logins por 15 minutos; evitar logins redundantes.

Manifesto de execucao: projeto/runId, IDs por tabela, vinculos entre eles,
identidade dos atores (IDs, sem tokens), etapas, status HTTP e limpeza. Nunca
registrar senhas, hashes, chave Supabase, JWTs ou listas de usuarios existentes.
Nao escolher IDs fixos, reusar contas atuais ou alterar sequencias.

## RPCs: evidencia ja existente, sem repeticao

Conferencia local dos arquivos e dos relatos, sem executar SQL:

| RPC | Estado comprovado | Falta na nova homologacao |
|---|---|---|
| substituir_custos_evento(bigint,bigint,jsonb) | PostgreSQL descartavel: 14 grupos PASS, atomicidade, rollback e locks | Binding Express/SDK/PostgREST, ator confiavel, persistencia e contrato 200/erros |
| publicar_cotacao(bigint,bigint,text,text,text,jsonb) | PostgreSQL descartavel: 11 grupos PASS, snapshot, rollback e concorrencia | Integracao HTTP 201/409 e vinculacao ao evento novo |
| decidir_solicitacao_acesso(bigint,numeric,text) | PostgreSQL descartavel: 10 grupos PASS, perfil/status atomicos | Admin do middleware, NUMERIC textual, HTTP 200/409 e efeitos apenas nos novos usuarios |
| avaliar_proposta(numeric,bigint,text) | Fonte local de UPDATE condicional unico, SECURITY INVOKER; nao consta prova SQL real equivalente nos relatos consultados | Confirmar instalacao/permissoes e integracao nova 200/404; nao declarar previamente validada |

Hashes SHA256 dos tres corpos com prova SQL continuam iguais aos relatos:

- Custos: `5e148d4043bc4a0c257f192ae4733a2fc3665955e70baeb9442bf9d69612339a`.
- Publicacao: `200eac57222fae6b0e3259835551107c99df5f5be9f7a53b918b6e58e41850b0`.
- Acesso: `5d015e60c32c2efc634fdf21674970ddb4617de050c8390bbb5ae507c6bf4e6f`.

As tres usam SECURITY INVOKER e search_path vazio; nao alterar seus corpos ou
GRANTs para conseguir um PASS. A RPC listar_propostas_por_fornecedor continua
sendo leitura e nao e uma quinta RPC de escrita.

Antes da primeira escrita, confirmar por leitura a identidade do projeto,
assinaturas/definicoes e privilegios efetivos das quatro RPCs instaladas e FKs
relevantes a limpeza. Fonte local nao comprova estado implantado. Reutilizar
evidencia do destino ja disponivel quando existir; se faltar acesso confiavel
aos metadados, interromper sem DDL, GRANT, chamada de escrita de sondagem ou
instalacao automatica. Nao repetir a bateria SQL previamente aprovada.

## Ordem e criterios de aprovacao

1. Validar destino, segregacao de segredos, manifesto vazio, porta exclusiva,
   transporte restrito, ausencia de MySQL, disponibilidade das RPCs e viabilidade
   da limpeza. Identificar a run sem expor segredos.
2. Criar quatro participantes; conferir 201 e duplicidade de email 409.
   Criar/aprovar/rejeitar pedidos somente desses usuarios. Reusar JWTs emitidos
   antes da decisao para provar autorizacao pelo perfil atual do banco.
3. Criar e editar os tres eventos; propriedade cruzada somente entre O_A/O_B.
   E_FLUXO ainda inativo deve recusar inscricao com 404.
4. Substituir custos e reler; preservar valores textuais exatos. Fazer revisao
   de custos obsoleta retornar 409 sem cotacao nova; publicar com revisao atual
   e conferir uma unica cotacao com seus itens, sem fragmentos parciais.
5. Criar duas propostas novas; aprovar/recusar separadamente, repetir avaliacao
   para 404. Publicar E_FLUXO; inscrever P_A e confirmar duplicidade 409.
6. Por dominio, um caso de token ausente/perfil inadequado/propriedade alheia
   com payload valido de fixture deve ser recusado ANTES de mutacao. Comparar
   estado dos registros da run antes/depois, sem varrer dados existentes.
7. Excluir E_EXCLUIR pelo endpoint, conferir 200 e segunda tentativa 404.
   Reconciliar o manifesto e executar a limpeza planejada abaixo.

Aprovar somente com status/mensagens/campos historicos, propriedade correta,
decimais e datas coerentes, persistencia observada por requisicao independente,
atomicidade dos resultados e ausencia de alteracoes fora da run. Medir chamadas
SDK e identidade do projeto; nenhum retry automatico de escrita.

Em 5xx, timeout ou perda de resposta: interromper, marcar resultado incerto e
reconciliar por leitura dos IDs/chaves exclusivos da run antes de qualquer
reenvio ou limpeza. Nao repetir POST supondo rollback e nao chamar timeout de
prova de rollback. Injecao de falhas, triggers ou novos testes concorrentes no
destino real nao integram este plano; provas SQL ja existentes sao preservadas.

## Limpeza, incluida na futura autorizacao

Sem endpoints de exclusao para todas as entidades: a limpeza exigira rotina
administrativa separada, limitada por tabela e IDs do manifesto. Isso deve ser
implementado e revisado antes da primeira escrita, nao improvisado ao final.

Ordem de exclusao proposta, respeitando FKs:
`propostas → inscricoes → itens_cotacao → cotacoes → custos_evento →
solicitacoes_acesso → eventos → usuarios`.

Antes de cada exclusao, conferir projeto, IDs exatos, vinculos e marcadores.
Prefixo/nome/email sozinho nunca autoriza DELETE em lote. Conferir descendentes
e referencias externas antes de cascatas: se houver registro nao pertencente a
run, suspender e relatar, sem apaga-lo. Nao confiar cegamente em cascatas do
arquivo SQL local; propostas/inscricoes possuem FKs restritivas nesse arquivo.

Conferir por leitura que todos os IDs novos desapareceram, incluindo custos
substituidos e filhos de RPCs. Nao remover o admin existente, contas previamente
homologadas ou evidencias; nao restaurar perfis alterando usuarios antigos.
Lacunas em sequences sao normais e nao devem ser corrigidas. Encerrar processo,
confirmar porta livre e emitir resumo sem segredos, com residuos/erros se houver.

## Autorizacao e encerramento

Autorizacao explicita recebida para controles, fixtures, 12 endpoints e limpeza.
Rodada concluida com processo encerrado. O inicializador separado nao libera
Supabase no startup normal. Nova rodada ou ativacao exige autorizacao propria.
