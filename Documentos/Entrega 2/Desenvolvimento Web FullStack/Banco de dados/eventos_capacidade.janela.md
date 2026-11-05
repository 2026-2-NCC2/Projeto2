# Janela de manutenção preparada — 05/11/2026

Migração **não executada**. Janela local pronta para receber autorização;
confirmação de suspensão de escritores externos permanece pendente.

Evidência pré-migração:
`PI Backend/evidencias/eventos-capacidade-janela-20261105-183fb0bf-cac8-4f79-88a6-c4128e2b9a24.json`.
Inventário local:
`PI Backend/evidencias/eventos-capacidade-janela-processos-20261105.json`.

## Backup preservado, sem repetição

Dump, papéis sem senhas, manifesto e inventário privado de Storage continuam
presentes no destino aprovado, fora do Git. SHA-256 de cada um coincide com a
evidência da restauração validada; o manifesto privado não foi modificado.
Não foi criado outro dump nem executado outro restore nesta preparação.
Hash do dump: `55774f5a08fe0fef8f0cbf217af408e3efc8d951c6ed1a852558e994b11cdcc6`.
O backup cobre o banco; os cinco arquivos Storage continuam fora do dump,
conforme `eventos_capacidade.backup.md`.

## Processos locais suspensos

- Backend já estava ausente; nenhum listener na porta 3001.
- Vite PID 34636 na 5173 identificado pelo executável, comando, workspace e
  data de criação. Conferida a cadeia npm/cmd e os processos do seu console.
- Ctrl+C cooperativo enviado ao console conferido. Vite saiu normalmente;
  não foi usado Stop-Process, taskkill ou finalização forçada.
- As portas 3001/5173 e a ausência de processos conhecidos da aplicação foram
  observadas três vezes, durante aproximadamente 20 segundos, sem reinício.
  Não iniciar npm start/npm run dev enquanto aguardamos a autorização.
- Processos Node alheios à aplicação não foram encerrados. Não foram alterados
  serviços, tarefas, regras de rede ou configurações do sistema/Supabase.

O worker de limpeza de imagens acompanha o backend: está suspenso durante a
manutenção e deverá retomar com a inicialização normal após a migração aprovada.
Os cinco registros do diário, tombstones e prazos de quarentena foram preservados;
no snapshot não havia leases vigentes nem limpezas vencidas. Nenhuma limpeza
manual foi disparada. Uploads de eventos permanecem ativo=false.

## Preflight renovado somente leitura

Projeto `gnwybroqfvwosiqzsfla` confirmado por REST e configuração PostgreSQL
vinculada. TLS validado. Executados integralmente o preflight em READ ONLY com
ROLLBACK e a verificação em REPEATABLE READ READ ONLY, também com ROLLBACK.

- Marcador 1; nenhum objeto da Etapa 3 instalado; SQLs iguais aos testados.
- Cinco funções restritas e dois triggers habilitados, compatíveis com o backup.
- Zero duplicidades; FKs, sequences, RLS e ACLs preservados.
- Hash completo de eventos, incluindo metadados da Etapa 1, igual ao backup:
  `d8e50c0b779d2a8866a0181228e0f476`.
- As 13 tabelas públicas foram comparadas com as contagens/SHA-256 do backup:
  todas iguais. Catálogo público também igual (funções, triggers, índices,
  restrições, permissões/políticas, colunas e sequences).
- Clientes PostgreSQL observados ociosos, sem transações e sem locks nas tabelas
  envolvidas. Configurações e sessões resumidas estão na evidência, sem SQL de
  usuários, dados pessoais ou credenciais.

| Tabela | Registros | MD5 |
| --- | ---: | --- |
| eventos | 6 | `9aabdd7c6fb88f5f5ee7b8eb93ce425c` |
| inscricoes | 5 | `9c91bc2d70c1bd89e668c7cee5a4c796` |
| custos_evento | 2 | `822ceff85987cd77b9c1ef891216d96d` |
| cotacoes | 6 | `203f202d576b14836568c7479ea0520e` |
| itens_cotacao | 17 | `ba11711acc4770291f205a216e5f8a3d` |
| propostas | 6 | `3d8c5ad4845aa93a8804a4153515bbe3` |

Estados: quatro Ativo e dois Em planejamento. As cinco inscrições são Confirmada.
O schema de imagens de eventos continua preservado e sem registros/objetos.

## SQL exato e autorização pendente

`eventos_capacidade.incremental.sql`:
`e5fde4026e650955308e5063f7c07c3d61fbb1b0ae319f857e637534f0e0f20e`.
O incremental, o preflight e a verificação são byte a byte as versões validadas
nos testes locais. A documentação foi atualizada; não foi alterado o incremental.

Não há impedimento técnico identificado no snapshot atual. A autorização de
execução deve confirmar o projeto, o arquivo/hash, aplicação integral única em
transação e a suspensão dos escritores externos. Antes de aplicar, repetir as
guardas de atividade/portas e conferir que o snapshot não ficou desatualizado.
Falha/divergência exige interrupção e diagnóstico, sem corrigir dados reais.

## Escritores externos fora do controle desta sessão

Não foram identificadas escritas externas em andamento. Isso é observação
pontual, não bloqueio de admissão nem prova de ausência de clientes futuros.
Podem existir outras máquinas, backends hospedados, integrações/Edge Functions,
scripts com credenciais existentes, chamadas PostgREST/Storage ou sessões SQL
Editor/psql. O operador deve confirmar sua suspensão durante a janela.

PostgREST, pooler e monitoramento gerenciados permanecem disponíveis: não foram
encerrados nem modificados. Os workers pg_cron/pg_net aparecem no inventário,
mas as tabelas de jobs/histórico e fila HTTP consultadas não existem. Não há
trabalho de aplicação identificável nesses catálogos. A inspeção local anterior
não encontrou serviços/tarefas relacionados ao projeto; isso não inventaria
infraestrutura externa.

Se o operador confirmar que não há escritores externos ativos e mantiver a
manutenção, a janela pode receber a autorização de migração. Nenhuma migração,
alteração de credenciais/RLS/políticas/dados reais, commit ou push foi realizada.
