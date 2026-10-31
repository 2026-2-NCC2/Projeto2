# Incremento 4 — autenticacao, autorizacao e contratos HTTP

Estado: validacao local com persistencia simulada. MySQL continua ativo; o
bloqueio de startup Supabase em `config/banco.cjs` permanece intacto.

## O que os testes executam

`tests/autenticacao-http.test.cjs` utiliza Express real, em 127.0.0.1 e porta
efemera exclusiva de cada fixture. Os servidores sao encerrados ao terminar.
Os handlers de `server.js`, a fabrica, os repositorios e os servicos sao reais.
Bcrypt executa hash/compare de senhas inteiramente ficticias com custo 12.
JWT proprio usa HS256, segredo sintetico e expiracao de uma hora.

Somente os transportes de persistencia sao simulados: execute/query MySQL e
fetch HTTPS do SDK Supabase. Nenhum .env, banco real ou RPC real e acessado.
As escritas dos cenarios de cadastro/avaliacao/decisao alteram somente objetos
em memoria. O teste nao comprova locks, rollback SQL ou permissoes reais.

O bypass da trava de startup existe exclusivamente no loader VM do teste.
Nao existe flag de ambiente ou alteracao no codigo de producao para libera-la.
Os testes anteriores continuam conferindo a recusa real de DB_PROVIDER=supabase.

## Cobertura acrescentada

- Login completo, normalizacao de email, senha incorreta, usuario ausente,
  validacoes, cadastro com hash real e ausencia de senha/hash nos JSONs.
- JWT expirado, assinatura incorreta, algoritmo diferente/none e ID invalido:
  401 antes da persistencia. Token valido com usuario removido: 401.
- Usuario e perfil consultados no provedor selecionado a cada requisicao;
  alteracao de perfil apos decisao passa a valer com o mesmo JWT.
- Perfis, propriedade de eventos, listagens de cotacoes/propostas, avaliacao
  condicional e administracao de solicitacoes; ausencia e conflitos preservados.
- Paridade de status, mensagens, campos, datas e decimais nos contratos HTTP
  selecionados entre MySQL e Supabase.
- O SDK recebe exclusivamente a chave sintetica de servidor em apikey e
  Authorization. Nunca recebe o JWT do usuario; sessoes do SDK nao persistem,
  nao renovam tokens e nao sao detectadas por URL. Requisicoes concorrentes
  preservam suas identidades sem alterar os headers de autenticacao do SDK.
- Falha/aborto de transporte retorna erro sanitizado; timeout de decisao
  responde 500 sem repetir a RPC. IDs divergentes em resposta de autenticacao
  Supabase falham fechados, sem autenticar outro usuario.

Nenhum defeito funcional foi encontrado nos cenarios acrescentados. Nao houve
alteracao do contrato publico, JWT, bcrypt, rotas, configuracao, RPCs ou bancos.
O aviso de Promise entre realms do router foi tratado somente no harness HTTP.

Resultado de `npm test` neste incremento: **892 testes, 884 aprovados,
zero falhas e oito SKIP historicos**. Os 26 testes HTTP novos passaram.
Sintaxe dos dois arquivos novos e `git diff --check` aprovados. A primeira
execucao HTTP encontrou EACCES no loopback; a execucao com permissao adicional
concluiu os testes, sem alterar permissoes do Windows ou acessar bancos.

## Risco confirmado: tokens legados e colisao de IDs

O token atual contem id/perfil, iat/exp, sem identificar o provedor. O perfil
do claim nao autoriza a operacao: o middleware consulta o perfil atual no banco.
Isso evita privilegios desatualizados, mas nao resolve identidades divergentes.

O teste de caracterizacao emite um JWT no MySQL sintetico e o apresenta ao
Supabase sintetico com o mesmo segredo e ID, mas outra conta. A resposta e 200
com a identidade do destino. Esse resultado documenta um risco, nao aprova a
seguranca da troca. No estado atual, o startup Supabase bloqueado impede essa
ativacao no servidor normal.

**Bloqueante para ativacao:** reconciliar os vinculos de identidade (usuarios e
registros relacionados) e invalidar as sessoes legadas na troca. Um plano futuro
pode usar rotacao autorizada do JWT_SECRET, acompanhada de novo login, sem mudar
o formato publico da API. Rotacao nao foi executada nem substitui reconciliacao
de identidades/dados. Reiniciar o processo sem invalidar tokens nao basta.

## Pendencias de homologacao

1. Reconciliar identidades e definir invalidacao das sessoes antes do cutover.
2. Autorizar separadamente uma execucao Express com Supabase real; a guarda
   atual nao foi removida. Validacoes SDK/RPC anteriores nao comprovam esse app.
3. Conferir login, perfil, autorizacao e contratos HTTP contra o destino real,
   incluindo divergencias de fuso/instantes importados ja documentadas.
4. Manter o risco das ACLs padrao e a revisao de cada objeto novo sob controle;
   os testes locais nao alteram nem certificam permissoes do destino.

Nenhuma auditoria SQL ou validacao HTTPS ja aprovada foi repetida neste incremento.
