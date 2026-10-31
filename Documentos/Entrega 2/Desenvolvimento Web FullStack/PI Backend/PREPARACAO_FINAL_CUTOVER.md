# Rollback, congelamento global e delta final — 31/10/2026

Atualizacao posterior: `SUPERVISOR_CUTOVER.md` documenta a integracao inativa
efetivamente implementada, testes novos e inventario observado. Substitui as
pendencias historicas de implementacao abaixo. Inventario global nao confirmado;
MySQL indisponivel, acessos externos desconhecidos; freeze real nao executado.

Nenhum cutover, congelamento real ou alteracao de JWT executado.
Nenhuma conexao as bases principais nesta etapa. Somente backups existentes e
clones PostgreSQL/MariaDB sem rede, portas publicadas ou volumes persistentes.
Backups/restauracoes e testes anteriores nao foram novamente homologados.
A restauracao dos dumps foi apenas montagem dos fixtures do novo ensaio.

## Novo ensaio de rollback: aprovado nos oito dominios

`scripts/ensaio-oito-dominios.cjs` utiliza o planejador
`scripts/delta-cutover.cjs`. Evidencia publica:
`evidencias/rollback-oito-dominios-20261031.json`.
Relatorio detalhado privado e historico de containers permanecem junto aos
backups externos. Nenhum dado de usuario ou hash de senha foi exportado para Git.

| Dominio | INSERT | UPDATE | DELETE |
|---|---:|---:|---:|
| usuarios | 3 | 3 | 3 |
| eventos | 1 | 1 | 1 |
| custos_evento | 1 | 1 | 1 |
| cotacoes | 1 | 1 | 1 |
| itens_cotacao | 1 | 1 | 1 |
| propostas | 1 | 1 | 1 |
| inscricoes | 1 | 1 | 1 |
| solicitacoes_acesso | 1 | 1 | 1 |

As 30 operacoes ficticias foram confirmadas no clone PostgreSQL e refletidas
no clone MariaDB em uma transacao. Antes disso, os dez adicionais presentes
apenas no backup Supabase foram preservados no destinatario isolado. Os 52
registros anteriores permaneceram iguais, campo a campo, em ambas as pontas.

Verificacoes novas aprovadas:

- Insercoes na ordem de dependencias; exclusoes na ordem inversa; IDs e FKs
  preservados. Comparacao integral das oito tabelas apos o retorno.
- Falha deterministica antes do COMMIT desfez todas as operacoes dos oito
  dominios. Nenhum estado parcialmente atualizado permaneceu.
- Alteracao concorrente ficticia no destinatario impediu COMMIT parcial.
  Guardas com valores anteriores e ROW_COUNT recusam resultados inesperados.
- Reaplicacao do mesmo delta foi recusada sem alterar o estado final. Isso foi
  uma verificacao negativa deliberada; nao ha retry automatico apos timeout.
- AUTO_INCREMENT gerou identidade posterior aos IDs explicitos, sem colisao.
  O retorno nao reduz contadores. Sequences PostgreSQL originais nao mudam nas
  bases principais; nao se troca a sequencia de um provedor pela do outro.
- Valores monetarios sem float, timestamps UTC com precisao de segundos,
  null, Unicode, aspas, barra invertida e quebra de linha preservados.
  Precisao/fuso nao representaveis sao recusados; nenhuma truncagem silenciosa.
- Todos os IDs ficticios foram registrados. A destruicao dos clones removeu
  os registros descartaveis, sem DELETE nas bases principais.

Seis testes unitarios novos aprovados. Apenas o caso do delta final, cuja
fixture nao tinha FKs, foi corrigido e repetido; os demais passaram uma vez.
Nenhum teste anteriormente aprovado foi reexecutado.
Docker estava desligado no primeiro preparo; nenhum clone fora criado nessa
tentativa. O daemon foi iniciado para disponibilizar o ambiente isolado.

Ensaio adicional especifico: uma mudanca concorrente somente de caixa foi
recusada, usando comparacoes binarias nas guardas, apesar da collation CI.
Com os valores anteriores exatos, o mesmo planejamento foi confirmado.
Essa verificacao nova usou outro clone; nao repetiu o ensaio dos oito dominios.

O planejador recusa colisao de identidade/email, registros orfaos, colunas
inesperadas e perda de precisao. Nao desativa constraints nem usa UPSERT para
ocultar conflitos. Resultados incertos ou erros interrompem a operacao.
O modulo gera SQL para o ensaio; nenhum executor de escrita principal ou
comando de cutover foi disponibilizado. O gate de rollback na janela real
exige novo delta, schema compativel e ausencia de conflitos atuais.

## Congelamento global: preparado, inativo

Integracao local continua em helper e patch nao aplicado:
`config/integrar-congelamento.cjs` e
`fixtures/cutover-freeze-integracao.proposta.patch`.
Nao ha endpoint HTTP publico ou variavel que acione automaticamente o freeze.

`config/preparacao-global-cutover.cjs` avalia evidencias sem enviar comandos.
`fixtures/inventario-congelamento.exemplo.json` inicia incompleto e bloqueado.
O inventario real ainda precisa identificar cada replica e cada escritor.
Nao se pode afirmar congelamento global apenas a partir do middleware Express.

Protocolo reservado a janela autorizada:

1. Confirmar inventario completo e responsavel: todas as replicas Express,
   jobs, importadores, SQL manual e clientes diretos. Controlar reinicios
   automaticos e deploys durante a janela. Remover placeholders somente com
   evidencia de ausencia ou identidade efetiva dos escritores.
2. Instalar a integracao inicialmente inativa antes dos parsers/handlers em
   cada replica; supervisor identifica host/PID/boot ID. Reinicio ou replica
   desconhecida invalida as evidencias anteriores. Preservar contratos normais.
3. Na autorizacao do freeze real, impedir novos escritores externos e novas
   escritas HTTP em todas as replicas. GET/HEAD/OPTIONS e POST /login podem
   continuar, desde que nao tenham efeitos de escrita.
4. Aguardar requisicoes mutantes admitidas e operacoes de persistencia ate
   terminar. Nao matar conexoes/transacoes como substituto de drenagem. Close,
   5xx ou timeout deixam estado incerto; nao liberar nem repetir a escrita.
5. Supervisor coleta por replica: congelado=true, escritasPendentes=0,
   resultadosIncertos=0, operacoesPersistenciaPendentes=0. Conferir tambem os
   escritores/transacoes na persistencia. Jobs/clientes devem estar suspensos,
   sem transacoes pendentes e sem reinicio automatico.
6. Avaliador global exige todas as evidencias, instancias corretas e idade
   maxima de 30 segundos. Ausencia, divergencia ou incerteza bloqueia a coleta.
   O avaliador valida evidencias fornecidas; nao autentica supervisores nem
   descobre escritores ocultos. Essa integracao operacional continua pendente.

## Delta final: verificador preparado, coleta real nao executada

`scripts/verificar-delta-final.cjs` somente compara snapshots em memoria.
Nao carrega .env, conecta a bancos, altera dados ou libera startup.

Na janela autorizada, manter o freeze enquanto se gera o checkpoint T0 e se
coletam snapshots completos em transacoes READ ONLY. MySQL: REPEATABLE READ,
timezone UTC, tabelas InnoDB. Supabase: projeto PI Backend fixo, TLS verificado,
REPEATABLE READ READ ONLY e timezone UTC. Registrar inicio/fim de cada coleta
e reavaliar o gate global durante/depois da coleta. Se superar 30 segundos,
renovar evidencias e repetir somente leituras; nao repetir escritas.

O verificador exige capturas dentro da janela valida, igualdade com os novos
checkpoints T0, identidades/IDs/perfis/credenciais bcrypt comparados em memoria,
todos os campos e relacionamentos nas oito tabelas e exatamente os dez extras
autorizados, preservados integralmente. Nao presume 42/52 fixos se surgirem
registros legitimos reconciliados antes do T0. Adicionais desconhecidos,
ausencias, divergencias ou alteracao dos dez extras bloqueiam a troca.
Revalidar tambem catalogo/RPCs/ACLs/sequences contra o checkpoint, usando o
catalogo de backup ja preparado. Relatorio publico: somente contagens,
categorias de divergencia e IDs autorizados, nunca rows ou hashes de senhas.

## Bloqueios restantes

- Inventario real e controle de todos os escritores ainda nao confirmados.
- Aplicacao da integracao inerte e supervisor das replicas/persistencia ainda
  pendentes, inclusive instrumentacao do contador de operacoes de persistencia
  do supervisor; o patch continua sem aplicacao ao servidor.
- Freeze/drain reais, backups T0 e delta final exigem a janela autorizada.
- JWT e liberacao do startup Supabase continuam reservados ao cutover autorizado.

MySQL permanece padrao. Supabase continua bloqueado no startup normal.
Nenhuma alteracao no frontend, credenciais, bases principais ou commits.
