# Etapa 3 — preparação de produção, 05/11/2026

**Preflight técnico aprovado. Migração NÃO executada.** Backup atual com
restauração isolada comprovada em 05/11/2026: `eventos_capacidade.backup.md`.
A aplicação permanece condicionada à manutenção e autorização específica.
Janela local preparada em 05/11/2026: backend ausente e Vite parado por Ctrl+C;
portas 3001/5173 livres, preflight renovado e backup preservado sem repetição.
Ver `eventos_capacidade.janela.md`. Confirmação de escritores externos pendente.
Nenhum serviço foi pausado/iniciado neste preflight; uploads de eventos desativados.

## Revisão final e evidência

Revisados integralmente `eventos_capacidade.incremental.sql`,
`eventos_capacidade.preflight.sql`, `eventos_capacidade.verificacao.sql` e
`eventos_capacidade.etapa3.md`. Os três SQLs são idênticos, por SHA-256, aos usados
nos 62 testes locais aprovados com PostgreSQL 17. A documentação operacional foi
complementada com este resultado. Não foi necessário corrigir o incremental.

Evidência consolidada:
`PI Backend/evidencias/eventos-capacidade-preflight-producao-a42170ce-0ecb-4ddd-b53a-2a8383270e0b.json`.
Contém resultados completos do preflight, snapshot de verificação, definições de
funções, hashes dos arquivos, segurança, configurações, atividade e inventário.
Os hashes abaixo são comparação de conteúdo, não backup nem meio de restauração.

Projeto `gnwybroqfvwosiqzsfla`, confirmado por vínculo PostgreSQL configurado e
resposta REST com o mesmo Project Reference; TLS validado. Todas as consultas
em transações somente leitura, encerradas com ROLLBACK. Não foram chamadas RPCs
de escrita, nem testadas inscrições reais.

## Resultado do banco

- PostgreSQL 17.11, marcador 1 e isolamento padrão READ COMMITTED.
- Sem coluna, índice, restrição ou funções da Etapa 3 já instalados.
- Cinco funções da Etapa 1: corpos iguais ao SQL local, SECURITY INVOKER,
  search_path=pg_catalog e permissões restritas; dois triggers conhecidos ativos.
- Inscrições: UNIQUE(usuario_id,evento_id) validada e não diferível; zero duplicidades.
- Cinco inscrições, todas Confirmada, sem status desconhecido.
- Seis eventos: quatro Ativo, dois Em planejamento; todos ainda sem capacidade.
- FKs validadas, USAGE nas sequences, RLS/ACLs preservados. Configurações atuais
  e definições foram registradas, sem alterar defaults globais.

| Tabela | Registros | MD5 do conteúdo |
| --- | ---: | --- |
| eventos | 6 | `9aabdd7c6fb88f5f5ee7b8eb93ce425c` |
| inscricoes | 5 | `9c91bc2d70c1bd89e668c7cee5a4c796` |
| custos_evento | 2 | `822ceff85987cd77b9c1ef891216d96d` |
| cotacoes | 6 | `203f202d576b14836568c7479ea0520e` |
| itens_cotacao | 17 | `ba11711acc4770291f205a216e5f8a3d` |
| propostas | 6 | `3d8c5ad4845aa93a8804a4153515bbe3` |

Hash de eventos incluindo versão, chave/payload e datas de gestão, excluindo só
capacidade_maxima: `d8e50c0b779d2a8866a0181228e0f476`.
Os blocos integridade, estados, FKs e segurança coincidem também com a evidência
da ativação anterior da Etapa 1. Refazer o snapshot durante a janela: este registro
não impede alterações legítimas posteriores de usuários.

## Compatibilidade da Etapa 2

Preflight `scripts/preflight-eventos-imagens.cjs` executado somente em leitura:
todos os checks aprovados, incluindo colunas, restrições, índices, permissões e
dependências. `public.eventos_imagens` existe e está vazia (MD5
`d751713988987e9331980363e24189ce`). Bucket `eventos-imagens` existe: privado,
10485760 bytes, somente image/webp; sem objetos desse bucket no catálogo Storage.
O manifesto `config/ativacao-eventos-imagens.json` permanece ativo=false.
O código do preflight aceita os marcadores 1 e 3; nenhuma ativação é necessária
para aplicar a capacidade. Não executar a migração de imagens novamente.

Fotos de perfil: cinco registros em limpeza, sem prazo vencido ou lease vigente
no snapshot; três objetos perfil-fotos e dois perfil-capas. Nenhuma limpeza
manual foi solicitada; preservar seu diário, tombstones e quarentena de 24 horas.

## Escritores e manutenção

Inventário local salvo em
`PI Backend/evidencias/eventos-capacidade-escritores-20261105.json`.

- Porta 3001 livre: nenhum backend server.js identificado em execução na inspeção.
  Não iniciar backend antigo durante a janela. Se uma instância reaparecer,
  identificar sua origem e solicitar Ctrl+C no console acessível, aguardando
  encerramento gracioso, drenagem de HTTP/persistência/limpeza e fechamento do pool.
- Vite ativo na 5173, PID 34636. Não escreve diretamente no banco, mas serve
  clientes capazes de solicitar escritas. Suspender o uso da interface na janela;
  pode ser parado cooperativamente pelo console se necessário. Não é necessário
  terminar processos desconhecidos ou alterar regras de rede.
- O worker de limpeza fica dentro do backend, com timer de 60 segundos. Parar
  a instância também suspende novos ciclos e aguarda o atual. Não apagar leases,
  diário ou objetos para acelerar a manutenção; não iniciar worker alternativo.
- Nenhum serviço Windows ou tarefa agendada com referência identificável ao
  TrocaTicket/Projeto2/pm2/nodemon foi encontrado. O inventário não cobre todos
  os possíveis comandos indiretos, máquinas ou serviços externos.
- PostgreSQL: clientes observados ociosos, sem transações, locks ou espera nas
  tabelas envolvidas. Os workers gerenciados pg_cron/pg_net estavam presentes,
  mas cron.job, cron.job_run_details e net.http_request_queue não existem.
  Não foram identificados jobs/fila de aplicação nesses catálogos.
- PostgREST, pooler e monitoramento são componentes gerenciados; não encerrá-los.
  Pausar clientes, integrações, scripts, SQL Editors de escrita e qualquer outra
  instância portadora de service_role. A ausência pontual de atividade não prova
  que nenhum escritor externo possa iniciar trabalho: confirmar isso com o operador.

## Backup: histórico da pendência e resolução

**Atualização de 05/11/2026:** o impedimento abaixo foi resolvido pelo dump atual
e ensaio documentados em `eventos_capacidade.backup.md`, sob autorização do
usuário. Banco recuperável para o snapshot validado; bytes Storage não incluídos.
O texto seguinte registra a situação anterior e as opções consideradas.

Há dump histórico de **31/10/2026**, fora do repositório, com SHA-256 confirmado:
`a2d6a75b9379d0e6f6014793734e7e675b7f22a2d9210bed1b58604a179b6a9d`.
O manifesto registra BACKUP_COMPLETO_RESTAURADO e a evidência histórica confirma
restoreVerified=true. Entretanto, ele antecede gestão de eventos e imagens e não
comprova recuperação do estado atual. Outros diretórios locais identificados
também são do dia 31/10; evidências posteriores referenciam esses backups antigos.
Não foi obtido acesso à listagem de backups/PITR da plataforma por esta conexão SQL.
**Backup recuperável atual NÃO confirmado. Não aplicar enquanto pendente.**

Antes da aplicação, escolher uma alternativa e registrar projeto, data/hora/fuso,
identificador, status, ponto de recuperação e responsável pelo procedimento:

1. No Dashboard do projeto, Database > Backups, confirmar um backup concluído
   compatível com o estado atual; se PITR já estiver disponível, registrar os
   limites de recuperação e o instante anterior ao DDL. Não ativar add-ons ou
   alterar plano/configuração nesta preparação. Validar o procedimento de
   restauração fora da produção, quando disponível, e a perda de dados aceitável
   entre o ponto de recuperação e a janela.
2. Se não houver ponto adequado, autorizar um dump lógico atual por ferramenta
   já instalada, via conexão do projeto com TLS validado, sem expor senha em
   argumentos/logs. Guardar arquivo e manifesto em diretório privado fora do Git,
   registrar SHA-256 e restaurar exclusivamente em ambiente descartável isolado.
   Conferir schema, funções/ACLs, FKs, sequences, contagens e hashes com o snapshot.
   Não executar automaticamente o script histórico de restore: revisar antes
   suas dependências e compatibilidade com as tabelas/functions atuais.

Não criar nem restaurar backup em produção como teste. Um arquivo existente ou
um hash não prova recuperabilidade atual. Backups de banco incluem metadados do
Storage, não os bytes dos arquivos: considerar cópia separada caso o plano de
recuperação inclua imagens. Documentação oficial consultada:
https://supabase.com/docs/guides/platform/backups e
https://supabase.com/docs/guides/local-development/restoring-downloaded-backup.

## Procedimento exato a autorizar posteriormente

Autorização deve limitar-se ao projeto acima, ao backup/ensaio escolhido e à
migração única `eventos_capacidade.incremental.sql`, SHA-256
`e5fde4026e650955308e5063f7c07c3d61fbb1b0ae319f857e637534f0e0f20e`.

1. Confirmar backup recuperável atual. Reservar manutenção; suspender interações
   e escritores externos. Reconfirmar porta 3001, processos, transações, locks e
   limpeza. Não forçar parada nem matar sessões sem autorização específica.
2. Confirmar novamente Project Reference no projeto e executar o preflight inteiro,
   como postgres. Executar também a verificação e salvar o JSON ANTES com os
   escritores parados. Esperar marcador 1, funções compatíveis e ausência de v3;
   interromper em qualquer divergência, sem ajustar registros reais.
3. Executar todo o incremental, de BEGIN a COMMIT, **uma única vez**. Não retirar
   NOWAIT, permissões ou guardas. A migração bloqueia leituras/escritas em eventos
   e inscrições durante sua transação, com statement_timeout de 30 segundos por
   instrução e lock_timeout local de 5 segundos; não é prazo total de 30 segundos.
4. Em erro: ROLLBACK e verificar ausência de objetos parciais e preservação do
   inventário. Interromper e relatar. Em resposta perdida, inspecionar os objetos
   antes de qualquer repetição. Não corrigir dados, remover triggers ou reverter
   automaticamente o schema após um COMMIT confirmado.
5. Reexecutar verificação/preflight com escritores ainda parados: comparar os
   seis hashes/contagens, hash com metadados, estados, FKs, ACL/RLS e sequences.
   Confirmar seis capacidades NULL, nenhuma inscrição alterada, duplicidades e
   excesso zero, coluna integer nullable sem default, CHECK validada, índice
   válido/pronto, sete funções restritas e três triggers ativos (inscrição INSERT
   OR UPDATE). Conferir também a infraestrutura de imagens e uploads desligados.
6. Prova sem escrita:

```sql
BEGIN READ ONLY;
SET LOCAL ROLE service_role;
SELECT public.eventos_capacidades_v1() AS versao_gestao; -- esperado: 3
SELECT public.eventos_vagas_v3(ARRAY[]::integer[]) AS vagas; -- esperado: []
ROLLBACK;
```

7. Somente com todas as verificações aprovadas: iniciar backend compatível com
   v1/v3 em console acessível na 3001, retomar limpeza existente e recarregar o
   React atualizado. Validar GET autenticado /eventos/capacidades com controle
   de capacidade habilitado e exclusão física bloqueada. Fazer somente leituras
   e provas de autorização; nenhum teste de vagas/concorrência em registros reais.
   Manter uploads de eventos desligados. Reabrir tráfego após registrar o resultado.

Não foi executado nenhum desses passos de alteração/implantação nesta preparação.
Sem migração, backup novo, alteração de credenciais, RLS/políticas, commit ou push.
