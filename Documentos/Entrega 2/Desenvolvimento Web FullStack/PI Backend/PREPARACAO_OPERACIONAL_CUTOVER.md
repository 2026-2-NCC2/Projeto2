# Preparacao operacional — NAO EXECUTADA, 31/10/2026

Atualizacao dos backups: `RESULTADO_BACKUPS_CUTOVER.md` e
`evidencias/backups-isolados-20261031.json` substituem o diagnostico historico
de backups abaixo. Ambos os bancos foram exportados e restaurados em clones
descartaveis; nenhum cutover, freeze real ou rotacao JWT foi executado.
Integracao de freeze preparada como helper e patch, ainda nao aplicada.

**Sem cutover, freeze real, rotacao de credenciais ou liberacao de startup.**
Os dez registros adicionais de testes ficam PRESERVADOS, conforme decisao do
usuario. Nenhum dado foi inserido, atualizado ou excluido nesta preparacao.

Resumo auditavel: `evidencias/cutover-preparacao-20261031.json`.
Delta revalidado: `evidencias/cutover-reconciliacao-d9c01871-854a-4419-939e-5655dbd6cf4f.json`.

## Delta previo e preservacao

Coleta atual: 31/10/2026, 05:16:28–05:16:32 UTC, 02:16 America/Sao_Paulo.
MySQL local em snapshot InnoDB READ ONLY e Supabase PI Backend por GET.

- Permanecem 42 registros comuns conciliados, nove identidades/perfis iguais,
  sem colisao de ID, diferenca de hash bcrypt, orfaos ou vinculos incorretos.
- Doze timestamps continuam equivalentes por epoch; representacao de fuso nao
  exige corrigir dados. Os resumos de comparacao coincidem com a rodada anterior.
- Permanecem os dez extras classificados, sem exclusao: usuario 10; evento 12;
  custos 7/8; cotacao 6; itens 22/23; proposta 3; inscricao 3; solicitacao 6.
- Destino esperado nesta preparacao: **52 registros**, nao 42. O delta final
  deve admitir esses dez adicionais deliberadamente preservados, sem importar
  ou apagar registros para simplesmente igualar contagens.
- Os 21 IDs da rodada descartavel anterior continuam ausentes.

Limites: nao ha freeze real nem snapshot unico entre provedores. Os dados
brutos anteriores dos dez extras nao foram exportados; igualdade dos resumos
nao prova igualdade de cada campo desses extras entre coletas. O backup e
checkpoint finais devem capturar integralmente os 52 registros e suas relacoes.
Esta revalidacao previa nao substitui o delta da janela congelada.

## Backups: verificacao atual

| Artefato localizado | Verificado | Situacao para cutover |
|---|---|---|
| Banco de dados/trocaticket.sql | 8 tabelas, 42 registros, 15088 bytes; SHA256 identico ao usado na reconciliacao | Referencia historica coerente; nao e checkpoint T0 e restauracao nao foi comprovada |
| Banco de dados/trocaticket_supabase.sql | 8 tabelas, 42 registros, 13127 bytes; SHA256 identico ao usado na reconciliacao; zero definicoes de funcoes no arquivo | Incompleto para o destino atual: faltam os dez adicionais e as RPCs nesse artefato |
| Arquivos de preparacao RPC/catalogo exportado | Corpos SQL e privilegios conferidos em etapas anteriores | Evidencia tecnica; nao equivalem a backup completo restaurado |

mysqldump existe em `C:\xampp\mysql\bin\mysqldump.exe`; nao foi executado.
pg_dump nao foi localizado no PATH nem nos caminhos PostgreSQL 16/17 consultados.
Nao ha parametros PG* completos nem diretorio de backup declarado no `.env`.
Backups gerenciados do Supabase nao foram verificados; nao inferir sua existencia.
Nao foi feita busca indiscriminada no computador ou criacao de exports sensiveis.

**Bloqueio:** obter backups atuais completos das DUAS pontas, em armazenamento
privado com acesso restrito, checksum e manifesto, e comprovar restauracao em
ambiente descartavel autorizado. Sem sobrescrever ou restaurar bancos reais.
O destino precisa incluir 52 registros, schema, constraints, sequences/estados,
funcoes/RPCs e permissoes aplicaveis; preservar os dez testes extras. Nao salvar
senhas, chaves ou hashes bcrypt soltos em logs/Git. Nenhum backup novo criado.

## Congelamento preparado, ainda nao instalado

Componente inerte: `config/congelamento-escritas.cjs`, funcao
`criarBarreiraDeEscritas`. Nenhum require foi acrescentado ao servidor.
Instanciar/testar a integracao somente apos autorizacao, antes dos parsers e
handlers, e controlar internamente pelo supervisor local de cada processo.
Nao criar endpoint publico para ligar/desligar manutencao.

Comportamento preparado:

1. Estado inicial permite requests normalmente, sem alterar contratos ativos.
2. `congelar()` passa a recusar novas operacoes potencialmente mutantes com 503
   e Retry-After. GET/HEAD/OPTIONS e POST exatamente em /login continuam leitura.
3. `aguardarDrenagem()` aguarda escritas admitidas anteriormente. Resposta 5xx,
   desconexao antes do finish ou timeout conservam a barreira e impedem PASS.
   Close de socket nao e prova de rollback da transacao.
4. `liberar()` recusa pendencias/incertezas. Nao ha limpeza automatica dos
   contadores de resultados incertos; reconciliar antes de qualquer reinicio.

A barreira cobre SOMENTE o processo integrado. Antes do freeze real, inventariar
e suspender todos os demais escritores: outras replicas, jobs, importadores,
SQL manual e clientes diretos. Obter confirmacao operacional. A consulta atual
nao encontrou listeners locais 3001/3107/3111, mas isso nao comprova ausencia
de escritores externos. Nenhum processo foi parado ou trafego bloqueado agora.

Gate de freeze: todas as entradas controladas, todas as replicas com barreira,
zero escritas pendentes e zero resultados incertos; depois capturar T0, backups
finais e delta por leitura, preservando os dez extras. Qualquer resultado
incerto mantem manutencao e exige reconciliacao, sem repetir escritas.

## Rotacao JWT preparada, nenhuma chave gerada

`scripts/preparar-rotacao-jwt.cjs --verificar` confirmou referencias principal e
de homologacao configuradas e distintas, sem mostrar seus valores.
O helper `validarNovaChave` rejeita reutilizacao de qualquer referencia e
entradas fora do formato novo previsto. Geracao criptografica e troca ficam
reservadas a autorizacao posterior; validacao de formato nao prova entropia.

Na janela autorizada, gerar segredo principal novo com crypto.randomBytes(48)
em base64url, diferente do atual e do de homologacao. Nao executar geracao no
terminal com impressao do valor. Armazenar privadamente e aplicar em todas as
replicas apos drain, antes do trafego Supabase. Manter HS256, claims e 1h;
nao aceitar segredos antigos como fallback. Exigir novo login e verificar
recusa dos JWTs antigos/homologacao antes de consultas de persistencia.

Para rollback, usar OUTRO segredo novo, sem restaurar uma chave antiga ou a
chave usada na ativacao Supabase. Nenhuma API key de banco foi rotacionada.

## Rollback: gate obrigatorio

- **Antes de T1, primeira escrita real no Supabase:** manter manutencao,
  encerrar instancia nova, restaurar configuracao/artefato MySQL aprovados e
  usar JWT novo. Confirmar MySQL T0 antes de liberar; manter os dez testes
  preservados no Supabase, sem copia inversa automatica.
- **Depois de T1:** nao trocar simplesmente DB_PROVIDER. Congelar escritores,
  preservar destino e snapshots e reconciliar INSERTs, UPDATEs e DELETEs de
  volta, respeitando identidades/FKs e dados confirmados. MAX(id)/created_at
  nao cobrem alteracoes e exclusoes; nao ha CDC/reversao validada neste plano.
- Sem reversao comprovada, manter manutencao e decidir correcao adiante no
  Supabase. Nao restaurar backup descartando operacoes novas. Acordar RTO/RPO
  e testar recuperacao antes de prometer retorno sem perda.

## Testes e estado final

Seis testes NOVOS passaram: barreira inativa, leitura durante freeze simulado,
drain, desconexao/5xx, timeout e validacao JWT sem mutacao de referencias.
Somente respostas/requests em memoria; nenhum servidor ou banco usado neles.

Nao foram aplicados o componente de congelamento ou o patch de startup.
JWTs, .env, credenciais e dados permanecem sem alteracoes pelo agente.
DB_PROVIDER padrao continua MySQL; Supabase normal continua bloqueado.

**Pendencias antes da autorizacao de execucao:** backups atuais e restauracao,
estrategia de retorno/RTO/RPO comprovados, integracao/supervisao do freeze,
inventario de escritores e delta final T0. Geracao/troca JWT, liberacao do
startup e smoke tests pertencem a janela de cutover, ainda nao autorizada.
