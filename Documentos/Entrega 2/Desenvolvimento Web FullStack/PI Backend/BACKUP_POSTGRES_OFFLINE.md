# Backup PostgreSQL e restauração offline — A7.13

Estado: implementação validada com mocks e dois ciclos completos locais sintéticos
(A7.14). **Nenhum backup de dados reais ou conexão Supabase foi executado.**
Execuções futuras precisam de autorização específica. Novo evento permanece desativado.

## Contratos e compatibilidade histórica

- `scripts/backup-postgres-isolado.cjs`: `--v2` seleciona inventário/manifesto novos.
- `scripts/restaurar-postgres-isolado.cjs`: `--offline-v2` nunca lê .env, cria cliente
  PostgreSQL de origem ou consulta a origem. Rejeita mistura com modos históricos.
- `scripts/backup-postgres-offline.cjs`: implementação compartilhada e helpers puros;
  importar o módulo não executa backup, Docker ou leitura de credenciais.
- `scripts/catalogo-backup.cjs`: a exportação `catalogoSql` histórica foi preservada.
  As novas exportações são `inventarioSql` e `catalogoOfflineSql`.
- Fluxos antigos continuam disponíveis com **`--historico` explícito**, incluindo
  suas limitações. Não executar `--ensaio-retorno` para um ensaio offline: esse
  modo antigo consulta a origem. Chamadas antigas sem flag agora são recusadas.
- Manifestos V1 não são aceitos pela restauração V2. Não converter os arquivos
  manualmente: gerar novo backup autorizado. Helpers canonical/rowsHash/pgpass
  históricos mantêm suas assinaturas para os demais scripts.

## Cobertura implementada

O caminho de backup Supabase exige conexão TLS validada ao projeto único configurado e ao pooler de
sessão na porta 5432. Usa cliente `postgres:17` já instalado, fixado pelo digest
local, pg_dump custom sem excluir ownership ou ACLs e roles sem senhas de papéis.
Não baixa imagens. Endpoint Docker TCP/SSH é recusado; fixa socket npipe/unix local.

O manifesto V2 contém inventário de todos os schemas não sistêmicos, tabelas
ordinárias/particionadas/materialized views, estrutura, funções e procedures,
ownership, ACLs de relações/colunas/funções/schemas, RLS/FORCE, políticas, constraints,
índices, triggers, event triggers, defaults, sequences, extensões e memberships.
Dados de partições são verificados nas folhas usando ONLY, sem dupla contagem.
Foreign tables são recusadas: não se afirma cobertura de dados externos.

Linhas de negócio não são carregadas em memória no Node: a origem calcula hashes
SHA-256 de cada linha em representação JSONB e ordena com collation C. Um cursor
retorna no máximo mil hashes por lote. O destino envia apenas hashes por stdout,
consumidos como stream. Duplicatas são preservadas; contagens são strings decimais.
O servidor pode utilizar memória/disco para ordenar; não se trata de operação sem custo.
O manifesto estrutural é limitado pelo transporte a 64 MiB e roles a 8 MiB no restore.

O manifesto estrutural e os dados são capturados em REPEATABLE READ; o dump importa
o mesmo snapshot exportado. **Sequences, roles e alterações de DDL não são uma
garantia MVCC equivalente.** É obrigatória janela autorizada sem escritores, jobs,
DDL e alterações de roles; `--escritas-pausadas` é declaração do operador, não prova
nem mecanismo que pausa o sistema. A flag administrativa não bloqueia outros módulos.

A TOC do dump deve conter TABLE DATA de toda tabela ordinária inventariada,
inclusive gerenciada. Ausência reprova a geração do manifesto concluído. Tabelas
de extensão podem ser omitidas pelo pg_dump: nesse caso não ignorar a falha nem
adicionar exceções sem revisão de cobertura. Extensões/schemas gerenciados exigem
imagem de destino compatível; versão registrada não prova que o binário existe.

## Artefatos e segurança

Diretório novo/preparado fora do Git, sem redirecionamento por symlink/junction:

- Windows: ACL protegida, permitindo somente usuário atual, SYSTEM e Administradores.
- POSIX: sem permissões de grupo/outros. Arquivos novos são criados com modo 0600.
- Sem sobrescrever arquivos de backup existentes; nomes de artefatos são fixos e
  validados, sem travessia ou symlink. O diretório deve ser controlado pelo operador.
- Criar previamente `root-ca.crt` nesse diretório, obtido de fonte já confiável.
  Não baixar ou aceitar certificado apenas para fazer a conexão funcionar.
- A senha fica em arquivo temporário privado, não em argumento do processo. A cópia
  dentro do cliente Docker fica em tmpfs; o arquivo criado pelo script é removido
  no finally, inclusive após falha. Interrupção forçada exige inspeção manual restrita.
- stdout/stderr não expõem conteúdo de tabelas nem erros brutos de drivers/restore.
  O manifesto, as definições e o dump são **sensíveis**: não publicar nem versionar.

O pacote inclui `database.dump`, `roles.sql` e `manifest-v2.json`. Os dois primeiros
têm SHA-256 e tamanho registrados; o manifesto é a referência privada e deve ser
protegido contra alteração. Checksums detectam corrupção, não autenticam um pacote
inteiro substituído. Preservar uma cópia de confiança do manifesto/checksums.

**Criptografia não é implementada pelo script.** Antes de autorizar backup real,
aprovar volume/destino criptografado e controle das chaves. ACL privada não cifra
o conteúdo. Definir retenção, responsável, acesso mínimo e descarte autorizado;
unlink de temporário não garante apagamento físico em disco/SSD.

Sem envio para serviços externos: o único acesso de rede previsto no backup futuro
é a leitura da origem autorizada. O restore usa container sem rede/portas e monta
somente dump/roles, em leitura. Não recebe .env nem CA/senha da origem.

**Exclusões:** bytes dos arquivos Storage, segredos/configuração da plataforma,
senhas de roles e dados de servidores externos. Metadados Storage eventualmente
no dump não representam backup dos arquivos. Auth/configuração e a plataforma
completa exigem revisão específica; o dump sozinho não comprova sua recuperação.

## Execução futura autorizada

Exemplos no PowerShell, a partir de `PI Backend`. `<diretorio-privado>` deve ser
substituído por caminho absoluto aprovado; não colocar credenciais no comando.

```powershell
# Somente depois de autorizar leitura dos dados e confirmar a pausa dos escritores:
node --use-system-ca scripts/backup-postgres-isolado.cjs '<diretorio-privado>' --v2 --backup-autorizado --escritas-pausadas

# Autorização separada para restauração exclusivamente descartável/offline:
node scripts/restaurar-postgres-isolado.cjs '<diretorio-privado>' --offline-v2 --restore-autorizado
```

Não executar os exemplos neste lote. O restore requer imagem local
`supabase/postgres:17.11.0.016` e extensões compatíveis; não baixa imagens nem usa
PostgreSQL existente. A imagem é resolvida para digest antes de criar o container.
O cluster usa tmpfs, usuário postgres, socket Unix e nenhum listener TCP. Roles
são restaurados antes do dump. A única adaptação de bootstrap retira a linha exata
CREATE ROLE supabase_admin, porque esse papel já criou o cluster. ALTER ROLE e
memberships permanecem; erros de permissão/extensão/papel reprovam o ensaio.

Antes de cada operação SQL de restauração, inspeciona nome/label, rede, portas,
usuário e mounts. Segurança divergente interrompe sem remover recurso não validado;
isso exige limpeza manual autorizada. Falha de run parcialmente criado usa nome
aleatório e inspeção para limpar somente o recurso correspondente. Falhas SQL não
são repetidas; só a sonda inicial SELECT 1 possui espera limitada de 30 segundos.

O restore executa pg_restore --exit-on-error --single-transaction. Compara depois
inventário, catálogo e hashes contra o manifesto, sem consultar origem. Diferenças
de renderização de expressões/ACLs/ambiente também reprovam, salvo o par exato de
casts equivalentes do CHECK public.eventos.eventos_ciclo_v1 já validado no helper
histórico e reutilizado na V2. Não normalizar ou
ignorar automaticamente. Comparar metadados sensíveis apenas em ambiente privado.
Não há relatórios de origem nem checkpoints históricos de oito domínios nesse modo.

## Critérios de aprovação e recuperação operacional

1. Backup termina com BACKUP_COMPLETO_GERADO, TOC completa e artefatos íntegros.
2. Restore offline termina com RESTAURACAO_OFFLINE_APROVADA, igualdade estrutural e
   de dados, sem falhas ignoradas e com container descartável removido.
3. Conferir preservação dos artefatos após restore e ausência de temporários.
4. Registrar imagem/versão usada, responsável, horário e evidência restrita. Apenas
   mocks aprovados não atendem aos critérios 1/2 para dados reais.
5. Aprovar separadamente cobertura de Storage, retenção, RPO/RTO e reconciliação
   de gravações posteriores; uma recuperação completa perde alterações após o backup.

Falha antes de COMMIT da futura migração: parar e ROLLBACK. Conexão perdida no
COMMIT: resultado incerto, verificar estado antes de reaplicar. Falha pós-COMMIT:
manter criação administrativa desligada, preservar auditoria e avaliar recuperação
autorizada. Não existe rollback SQL de desinstalação nem autorização para cascatas.

## Testes deste lote

```powershell
node --test --test-isolation=none tests/backup-postgres-offline.test.cjs tests/backups-isolados.test.cjs
```

Os testes automatizados usam arquivos sintéticos e mocks de PostgreSQL/Docker.
Com as regressões de backup-etapa3, catalogo-t1 e preparacao-cutover, foram
**42 aprovados, zero falhas e zero skips**.

Uma verificação adicional em PostgreSQL 17 descartável, sem rede/portas, confirmou
sintaxe do catálogo/inventário, flags RLS, vínculo de sequence e igualdade dos
hashes/cursor com numeric acima de 2^53. A primeira tentativa teve expectativa
incorreta de hashes iguais para IDs distintos; a expectativa foi corrigida e a
repetição passou, sem modificar o algoritmo. Ambos os containers foram removidos.
Não houve dump nem restauração reais nessa verificação.

Ao final do A7.13, o ciclo completo dump/restore ainda não havia sido executado.
A seção A7.14 abaixo registra sua execução sintética posterior. A criptografia
e o procedimento de pausa dos escritores dependem do operador; as flags não
implementam esses controles.

## Integração local completa — A7.14

Dois ciclos independentes foram executados em PostgreSQL 17 descartável com
pg_dump custom e pg_restore reais. Cada origem foi removida antes do restore.
O arquivo de integração é `tests/backup-postgres-integracao-local.test.cjs`.
Não usa .env, dotenv ou credenciais Supabase. O teste reprova uma tentativa de
carregá-los durante o backup. Diretórios fora do Git recebem ACL privada antes
do uso, e arquivos sintéticos são removidos ao final.

A origem exige nome aleatório tt-backup-source-UUID, label correspondente,
imagem local postgres:17 conferida por digest, filesystem somente leitura,
network=none e nenhuma porta publicada. A conexão de captura é uma sessão psql
persistente por Docker/socket Unix, mantendo a transação e o snapshot abertos.
Essa adaptação local não altera a exigência de TLS do caminho Supabase.

A primeira execução parou antes do dump porque a rede interna não publicou a
porta esperada. A origem passou a usar exclusivamente socket Unix e nenhuma
rede; as verificações de isolamento foram preservadas e ficaram mais restritas.

Resultados da execução completa: **10 testes aprovados, zero falhas/skips**,
incluindo dois ciclos e sete cenários negativos. A repetição completa após reforço
da identificação na limpeza também passou: 10/10, sem falhas/skips. Primeira execução:
37,5 s (ciclo 1 incluindo negativos) e 9,0 s (ciclo 2); repetição: 45,4 s e 13,5 s.
As regressões históricas e mocks finalizaram com **43 aprovados**, zero falhas/skips.
O catálogo e os dados restaurados foram iguais
ao manifesto. Fixture: quatro tabelas, sete registros, tabela vazia, Unicode,
NULL, duplicatas, numeric de alta precisão, sequência acima de 2^53, PK/FK/UNIQUE/
CHECK/índice, função/trigger/view/enum, pgcrypto, roles/owners/ACL/defaults e RLS
habilitado/forçado com política. Os testes históricos e mocks continuam separados.

Negativos reais: artefato ausente/adulterado e manifesto incompatível bloqueiam
antes do restore; estrutura ou contagem divergentes reprovam a comparação;
remoção de role necessária no destino e dump quebrado com checksum atualizado
fazem o pg_restore real falhar. Nenhuma asserção funcional foi relaxada.

Somente após autorização de integração local, executar a partir de PI Backend:

```powershell
$anterior = $env:TROCATICKET_BACKUP_V2_LOCAL
try {
  $env:TROCATICKET_BACKUP_V2_LOCAL='1'
  node --test tests/backup-postgres-integracao-local.test.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Integração V2 local reprovada.' }
} finally {
  if ($null -eq $anterior) {
    Remove-Item Env:TROCATICKET_BACKUP_V2_LOCAL -ErrorAction SilentlyContinue
  } else { $env:TROCATICKET_BACKUP_V2_LOCAL=$anterior }
}
```

As imagens devem existir localmente; não há pull automático. O destino continua
sem rede/portas, com artefatos montados somente leitura, sem env da origem e com
limpeza ao final. O teste usa apenas memória/tmpfs nos bancos; não cria volumes
nomeados. O volume declarado da imagem de origem é coberto por tmpfs e o destino
não declara volumes. A remoção da origem também solicita remoção de volumes
anônimos. Inspeção final não encontrou containers do ensaio.

**Aprovação sintética local não aprova backup/recuperação do Supabase real.** Ainda
faltam autorização de leitura dos dados reais, destino criptografado, janela sem
escritores, cobertura concreta de schemas/extensões gerenciados, Storage e configs,
RPO/RTO, retenção e procedimento de recuperação do projeto compartilhado. Recursos
gerenciados/PITR do plano não foram consultados nem presumidos.
