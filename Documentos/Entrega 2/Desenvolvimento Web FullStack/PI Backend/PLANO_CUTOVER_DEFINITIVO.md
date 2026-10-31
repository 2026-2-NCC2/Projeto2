# Cutover definitivo MySQL → Supabase — plano, 31/10/2026

**Nao executar a troca ainda.** Leitura e escrita homologadas nos cenarios
documentados; origem atual reconciliada e dez adicionais classificados em
`RELATORIO_RECONCILIACAO_CUTOVER.md`. O usuario decidiu PRESERVAR os dez testes.
Preparacao atual em `PREPARACAO_OPERACIONAL_CUTOVER.md`: delta previo revalidado,
freeze/JWT preparados mas inativos; faltam backups/restauracao e gates finais.
Nenhum dado ou credencial
foi alterado nesta preparacao. Nenhum servidor iniciado ou commit criado.

## Evidencias e bloqueios atuais

Comparacao atual somente leitura:
`evidencias/cutover-reconciliacao-b806c01c-4001-4fdb-ae15-261200b583f5.json`.
Leitura preliminar anterior, sem origem disponivel:
`evidencias/cutover-reconciliacao-9e66eb93-f974-41c0-97e8-5d21d9e2a579.json`.
Origem historica: `../Banco de dados/trocaticket.sql`.
Artefato de importacao: `../Banco de dados/trocaticket_supabase.sql`.
Hashes dos arquivos constam no JSON; nenhum email ou hash de senha exportado.

- Os dois dumps coincidem nas oito tabelas: 9 usuarios, 5 eventos, 3 custos,
  3 cotacoes, 13 itens, 2 propostas, 2 inscricoes e 5 pedidos de acesso.
- Nove identidades historicas preservadas no Supabase pelo par ID/email
  normalizado. Sem colisao de ID, remapeamento, perfil divergente ou diferenca
  de hash bcrypt nessas nove identidades. Hash igual nao substitui validar a
  origem atualmente usada; hash diferente tampouco provaria senha diferente.
- Nos registros historicos presentes, nao foram encontrados campos divergentes
  pela comparacao implementada. Valores monetarios comparados sem float;
  datas/timestamps comparados como componentes de calendario, sem alegar
  equivalencia de instantes/fusos MySQL ainda desconhecidos.
- Destino PI Backend confirmado por HTTPS e `sb-project-ref`. Nao foram
  encontrados vinculos orfaos nas nove FKs entre as oito tabelas.
- O destino possui **10 registros adicionais ao dump de importacao**:

| Tabela | IDs adicionais | Quantidade |
|---|---|---:|
| usuarios | 10 | 1 |
| eventos | 12 | 1 |
| custos_evento | 7, 8 | 2 |
| cotacoes | 6 | 1 |
| itens_cotacao | 22, 23 | 2 |
| propostas | 3 | 1 |
| inscricoes | 3 | 1 |
| solicitacoes_acesso | 6 | 1 |

Esses IDs nao pertencem aos 21 IDs da rodada descartavel ja limpa. Foram
classificados como testes anteriores: quatro comprovados por evidencias de
criacao e seis vinculados ao evento de teste 12. O usuario autorizou preserva-los.
Nao excluir, sobrescrever, copiar inversamente ou chamar esses registros de
residuos para igualar contagens. Nenhum ajuste foi executado.

**Origem atual confirmada nesta rodada:** configuracao privada disponivel;
MySQL local lido por transacao READ ONLY com snapshot InnoDB. Seus 42 registros
estao presentes no Supabase, com nove identidades e perfis preservados, sem
orfãos ou vinculos com outra identidade. A diferenca visual em 12 timestamps
foi resolvida por comparacao de epoch: mesmos instantes, representacoes de fuso
diferentes. Nao aplicar deslocamento de horas aos dados.

Nao foi encontrada reconciliacao integral anterior certificada nos documentos
consultados. Assim, nao e possivel datar mudancas "desde a ultima reconciliacao".
A primeira leitura usou o dump identificado; a atual tambem consultou a origem
real, sem inventar checkpoint anterior. A coleta REST nao tem snapshot unico
entre tabelas/paginas; esta rodada nao autoriza o corte de trafego.

## 1. Reconciliacao final e criterios de liberacao

1. Identificar a instancia/base MySQL realmente usada pelo servidor principal,
   incluindo configuracao efetiva do processo, nao apenas um `.env` editado.
   Usar conexao explicitamente configurada e leitura consistente InnoDB.
2. Executar o comparador `scripts/reconciliar-cutover-leitura.cjs --somente-leitura`.
   Ele nao inicia servidores, nao altera dados, nao autentica usuarios e nao
   exporta senhas/hashes. Oito tabelas, IDs, conteudo, unicidade de emails,
   credenciais por igualdade em memoria e relacionamentos sao comparados.
3. Resolver cada divergencia por decisao documentada de identidade/registro.
   Nunca juntar pessoas somente por PK, nome, email aproximado ou contagem.
   Email normalizado auxilia o pareamento, mas nao prova identidade sozinho.
   Toda remarcacao de ID deve preservar eventos, propostas, inscricoes e pedidos.
4. Confirmar fuso efetivo MySQL, semantica DATETIME/TIMESTAMP e representacao
   esperada pela API. Nao adicionar/descontar horas silenciosamente.
5. Na janela AUTORIZADA, suspender todos os escritores MySQL e Supabase
   (API, jobs, importadores e SQL manual), drenar requisicoes e registrar T0.
   Nao manter dois provedores aceitando escrita. Nenhum freeze foi feito agora.
6. Obter snapshots finais das duas pontas. Aplicar SOMENTE deltas aprovados, em
   ordem de dependencias, sob autorizacao de alteracao de dados. Preservar os
   adicionais do destino ate sua classificacao. Reconciliar novamente apos
   sincronizar; nao modificar dados nesta fase de planejamento.

Gate de dados: zero colisao de identidade, zero orfao, zero diferenca nao
classificada e nenhuma escrita concorrente. IDs, valores, datas e perfis
equivalentes segundo as decisoes documentadas. Conferir sequences contra os
maiores IDs; lacunas sao normais, nao resetar/reutilizar IDs da homologacao.

## 2. Invalidacao de JWTs antigos — preparada, nao executada

O token atual nao identifica o provedor. Reusar a chave principal entre bancos
pode autenticar outra identidade com o mesmo ID, mesmo consultando o perfil
atual no banco. Reiniciar processos ou aguardar expiracao nao e invalidacao
imediata suficiente.

- Na janela autorizada, gerar NOVO JWT_SECRET principal criptograficamente
  aleatorio, exclusivo da ativacao, diferente do atual e do HOMOLOG_JWT_SECRET.
  Nao copiar o segredo de homologacao: isso manteria tokens de teste validos.
- Substituir a chave privada somente no ambiente efetivo de todos os processos
  principais, depois do drain e antes do primeiro trafego no destino. Reiniciar
  todas as replicas com configuracao consistente. Nao aceitar chave anterior
  como fallback ou manter validacao dupla.
- Preservar HS256, claims publicos, expiracao de 1h, bcrypt e formato HTTP.
  Autorizacao continua pelo perfil atual consultado no banco.
- Exigir novo login. Confirmar 401 para token MySQL anterior e token da
  homologacao, ANTES da persistencia; token novo autentica a identidade correta.
- Em rollback, usar outra chave NOVA. Nao restaurar o segredo antigo, pois
  ressuscitaria sessoes MySQL antigas; nao reutilizar a chave do Supabase.

Nenhuma chave foi gerada, exibida ou alterada agora. A API key Supabase nao
substitui JWT_SECRET; nao rotacionar credenciais de banco por conveniencia.

## 3. Liberacao planejada do startup normal

Ponto exato: `config/banco.cjs`, funcao `validarInicializacaoBanco`.
Ela valida a configuracao e depois recusa todo provider Supabase com
DB_PROVIDER_NOT_IMPLEMENTED. Essa recusa AINDA esta presente.

Proposta revisavel, NAO APLICADA:
`fixtures/cutover-startup.proposta.patch`.

- Trocar a recusa incondicional por validacao da origem exata do PI Backend.
  Continuar recusando projeto errado, URL/chave invalidas e TLS desabilitado.
- Manter MySQL como default quando DB_PROVIDER nao esta definido.
  Modo MariaDB isolado permanece exclusivamente MySQL.
- A fabrica `repositories/index.cjs` ja seleciona os sete repositorios e os
  tres servicos; ramo Supabase usa db-supabase.cjs e nao importa db.js/mysql2.
  Nao precisa ligar db-postgres.js nem usar PG* no runtime REST.
- Alterar DB_PROVIDER=supabase apenas no ambiente principal efetivo autorizado,
  com SUPABASE_URL e SUPABASE_SECRET_KEY principais do projeto esperado e
  JWT_SECRET novo. As variaveis principais atuais tem formato esperado; ainda
  verificar a chave principal real no preflight de ativacao. Nenhum valor copiado.
- TROCATICKET_HOMOLOGACAO deve estar ausente. Nao iniciar producao pelo roteiro
  descartavel nem reusar o contexto privado da homologacao.

O patch sozinho NAO ativa o provedor. Quando autorizado, implementar/testar a
alteracao antes de publicar: startup MySQL default, Supabase correto, projeto
errado, configuracao/TLS invalida e modo isolado. Testar ausencia de pool MySQL
no ramo Supabase. Atualizar expectativas que hoje exigem a recusa antiga.

## 4. Ordem operacional do cutover futuro

1. Autorizar janela, responsavel por decisao/retorno e gates de dados/rollback.
2. Preparar backups recuperaveis das duas pontas e configuracoes privadas.
   Testar restauracao em ambiente descartavel; nao exportar credenciais em logs.
3. Entregar e validar a alteracao minima de startup, sem trocar o trafego.
4. Congelar escritores, drenar, registrar T0 e executar reconciliacao final.
   Aplicar apenas sincronizacao previamente aprovada; confirmar gate de dados.
5. Rotacionar JWT principal e configurar provider/credenciais principais.
   Iniciar uma instancia controlada, mantendo entrada externa em manutencao.
6. Executar smoke tests finais abaixo. Falha ou resultado incerto mantem
   manutencao e dispara o ramo de rollback apropriado, sem retries cegos.
7. Liberar trafego somente apos PASS e registrar a primeira escrita real T1.
   Observar erros, latencia, autenticacao e integridade sem dados sensiveis.
   Nenhum trafego ou processo foi alterado nesta preparacao.

## 5. Smoke tests finais, sem repetir as baterias anteriores

- Configuracao efetiva/projeto corretos; segredo novo distinto; nenhuma
  conexao ou modulo MySQL no processo principal Supabase.
- Tokens antigos das duas origens recusados; login novo nos quatro perfis,
  GET /perfil e uma consulta permitida por perfil, identidade e permissoes.
- JSON, status, decimais e datas relevantes dos registros reconciliados.
- Uma pequena fixture NOVA, sob autorizacao de escrita, testa a entrada normal
  recem-liberada: evento, custos/RPC, publicacao e releitura independente.
  Manifesto de IDs e limpeza restrita, com zero residuos. Nao repetir os 12
  endpoints completos, concorrencia SQL ou auditorias sem nova alteracao/falha.
- Validar CORS, porta e URL publica atuais, sem modificar frontend por rotina.

Neste incremento foram executados apenas quatro testes novos do comparador,
todos aprovados. A proposta de startup nao foi aplicada ou testada como runtime.

## 6. Rollback seguro: dois momentos diferentes

**Antes da primeira escrita real no Supabase (antes de T1):** manter manutencao,
encerrar somente a instancia nova, restaurar o artefato/configuracao MySQL
aprovados e usar outra chave JWT nova. Confirmar que o MySQL ainda representa
T0, sem deltas pendentes, antes de liberar trafego. Backups/configuracoes
devem estar disponiveis antes do corte, sem revelar segredos.

**Depois de qualquer escrita real no Supabase:** nao basta mudar DB_PROVIDER
para mysql. Isso descartaria ou divergiria operacoes novas. Suspender escritores,
preservar Supabase e snapshots, extrair/reconciliar o delta inverso e so liberar
MySQL quando nenhuma operacao confirmada for perdida. Sem dual-write improvisado.

As oito tabelas nao oferecem updated_at universal/CDC validado neste plano.
MAX(id), created_at ou horario de corte NAO detectam todas as alteracoes e
exclusoes. Preparar snapshots/diff de linhas ou captura de mudancas confiavel,
incluindo DELETEs, IDs e vinculos; testar a reversao em descartavel antes de
prometer RPO zero. Se a reversao nao for comprovavel, permanecer em manutencao
e decidir correcao adiante no Supabase, em vez de restaurar backup perdendo dados.

Em timeout, confirmar estado por leitura antes de qualquer reenvio. Preservar
evidencias e nao confundir erro HTTP com rollback SQL. Definir previamente a
janela, RTO e RPO aceitaveis; ainda nao foram acordados ou comprovados.

## Decisao final

**Plano preparado; ativacao ainda nao liberada.** Os dez testes serao preservados.
Pendem reconciliacao sob freeze e serializacao HTTP temporal,
backups/restauracao e estrategia de retorno apos T1. A autorizacao seguinte
deve distinguir preparacao/teste do patch e execucao da janela com alteracoes
de dados e credenciais. Nenhuma dessas alteracoes ocorreu agora.
