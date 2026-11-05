# Backup anterior à Etapa 3 — 05/11/2026

**Backup criado e restauração comprovada. Migração da Etapa 3 não executada.**
Projeto confirmado: `gnwybroqfvwosiqzsfla`.

## Artefatos privados preservados

Diretório autorizado, fora do Git:
`C:\Users\Lucas\BackupsTrocaTicket\backup-etapa3-20261105`.

- `banco-completo.dump`: dump custom completo, schema/dados, 475401 bytes.
- `roles-sem-senhas.sql`: papéis/memberships sem senhas de conexão dos papéis.
- `manifesto.json`: snapshot, versões, inventário e hashes de validação.
- `storage-arquivos-nao-incluidos.json`: inventário privado dos caminhos Storage;
  identifica arquivos excluídos do dump, sem divulgar caminhos nos relatórios.

SHA-256 do dump:
`55774f5a08fe0fef8f0cbf217af408e3efc8d951c6ed1a852558e994b11cdcc6`.

ACL de destino verificada **antes da cópia** e novamente em cada arquivo final:
somente Lucas e SYSTEM. Nenhum compartilhamento adicional identificado. Os
artefatos contêm dados sensíveis reais, inclusive hashes/tokens já existentes
no banco, conforme autorização específica. Não foram acrescentadas senhas de
conexão, JWT_SECRET ou senhas dos papéis PostgreSQL ao dump/relatórios.

Conservar backup e manifesto até autorização explícita de exclusão. Não foram
alterados os backups históricos. O inventário Storage é parte dos artefatos de
recuperação e permanece igualmente privado.

## Execução e isolamento

Ferramentas oficiais `pg_dump` e `pg_restore` 17.11 já disponíveis no Docker,
sem instalação ou download. Origem PostgreSQL 17.11; TLS verify-full, certificado
validado e confirmação de projeto por REST/configuração vinculada.

Snapshot exportado em REPEATABLE READ READ ONLY, compartilhado com pg_dump.
Dados, hashes e catálogo foram lidos nesse snapshot. pg_dumpall usou somente
roles-only/no-role-passwords. Credencial de conexão foi passada por stdin para
um arquivo transitório em tmpfs do cliente, sem senha na linha de comando ou
arquivo permanente do host. A conexão de origem terminou com ROLLBACK.

Restauração no PostgreSQL 17 da imagem Supabase já instalada, para disponibilizar
as extensões correspondentes. Contêiner sem rede, sem portas publicadas, rootfs
somente leitura, usuário postgres, dados em tmpfs e dumps montados somente para
leitura. A imagem oficial postgres:17 forneceu o cliente de dump; a imagem
supabase/postgres:17.11.0.016 forneceu o servidor do ensaio.

Foram restaurados schema, dados, owners e ACLs aplicáveis, incluindo os papéis
necessários. O bootstrap local supabase_admin não é o usuário de conexão postgres
da origem; essa diferença de contexto foi conferida separadamente da integridade.
Nenhuma função de negócio de escrita, tarefa de limpeza ou migração foi disparada
na origem ou no clone. Foram feitas apenas as escritas inerentes ao restore no clone.

## Validações aprovadas

- 53 tabelas, 328 registros: contagens e SHA-256 de todas as linhas coincidentes,
  preservando tipos, valores, duplicidades e dados sensíveis sem os divulgar.
- 13 tabelas públicas, 67 registros de aplicação.
- Catálogo público: dez funções, dois triggers, 38 índices, 75 restrições e oito
  sequences; configuração, owners/permissões aplicáveis, RLS/políticas e metadados
  comparados. As cinco extensões e versões também coincidiram.
- Snapshot de eventos: seis eventos (quatro Ativo/dois Em planejamento), cinco
  inscrições, dois custos, seis cotações, 17 itens e seis propostas preservados.
  Hashes, versão/metadados de gestão, FKs, ACLs e sequences conferidos.
- Prova READ ONLY como service_role: marcador 1 e leitura da tabela eventos_imagens.
- Etapa 2: tabela de imagens vazia, infraestrutura de banco restaurada, nenhum
  upload ativado. Dados e schema das Etapas 1 e 2 podem ser recuperados pelo dump.

Uma diferença de deparse foi identificada em eventos_ciclo_v1: na origem, cast de
ARRAY varchar[] para text[]; após restore, casts equivalentes por elemento. Não
foi alterada nenhuma restrição para fazer o teste passar. O comparador aceita
somente esse par exato de expressões, preservando COLLATE C, lista de estados e
NOT NULL. Onze casos (NULL, quatro estados válidos e variações inválidas) foram
avaliados no clone e retornaram resultados idênticos. As demais comparações são
exatas. O teste local recusa mudanças de estado, collation, nome ou nulabilidade
sob essa normalização. As primeiras tentativas foram encerradas com limpeza;
o mesmo dump original foi reutilizado até concluir o diagnóstico e a validação.

Cinco testes locais dos helpers/comparador passaram; schema/dados reais foram
validados no clone, não usados em testes destrutivos ou de concorrência.

## Storage e limites de recuperação

O dump contém storage.buckets/storage.objects e seus metadados, **não os bytes
dos arquivos**. Há cinco objetos fora do dump: três no perfil-fotos e dois no
perfil-capas. O bucket eventos-imagens não tem objetos. Os caminhos estão apenas
no inventário privado. Para recuperação integral dos arquivos após perda do
Storage, é necessária cópia separada dos bytes, com autorização própria.

O backup é lógico do banco e dos papéis sem senhas; não é cópia de configurações
da plataforma Supabase, credenciais de serviço, segredos externos ou arquivos
Storage. Não fornece PITR nem garante dados gravados após seu snapshot. Antes
do DDL, reconfirmar manutenção e integridade; se houver novas escritas que
precisem entrar no ponto de recuperação, atualizar o backup antes de prosseguir.

## Limpeza e prontidão

Todos os clones/contêineres usados pelo ensaio foram removidos, inclusive os de
tentativas interrompidas. Ausência confirmada por nome/label. Credenciais tmpfs,
dados restaurados, trust bundle temporário e diagnóstico transitório removidos.
Restaram somente os quatro artefatos privados listados acima. A remoção lógica
não é garantia de apagamento forense em SSD/swap, conforme plano aceito.

O impedimento de backup recuperável do banco está resolvido para esse snapshot.
Podemos avançar para a janela de manutenção, com nova confirmação de escritores
e preflight. A migração permanece dependente de autorização específica.
Não houve alteração de dados/credenciais/TLS/RLS/políticas da origem, ativação
de uploads, commit ou push.

Evidência sanitizada no workspace:
`PI Backend/evidencias/eventos-capacidade-backup-validado-20261105.json`.
O manifesto integral, o dump e o inventário de arquivos permanecem fora do Git.
