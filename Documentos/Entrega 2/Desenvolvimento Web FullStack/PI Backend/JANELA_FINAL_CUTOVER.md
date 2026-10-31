# Janela final local — preparacao, 31/10/2026

**Atualizacao: implementacao e simulacoes concluidas em `ETAPA_FINAL_PREPARADA.md`.**
Os bloqueios tecnicos descritos abaixo sao o registro anterior, agora tratado.
Execucao real continua condicionada a autorizacao e aos gates da janela.
Nao houve congelamento, ativacao Supabase, rotacao JWT ou escrita de dados.
Roteiro preparado para revisao, sem horario automatico e sem comandos disparados.

## Confirmacao operacional recebida

O proprietario confirmou que o TrocaTicket funciona exclusivamente em seu
computador, pelo VS Code, sem deploys ou hospedagens externas sob seu controle.
Essa declaracao fecha a pendencia anterior de cobertura externa do projeto.
Nao e necessario continuar buscando ambientes que o responsavel declarou
inexistentes. A base dessa conclusao e declaracao do responsavel mais evidencias
locais, nao uma afirmacao de descoberta tecnica universal da Internet.

Inventario operacional: `fixtures/inventario-cutover-local.confirmado.json`.
Escritores externos nesse JSON significam externos ao processo Express, embora
locais ao computador. Nao representam hospedagens remotas.

## Verificacao atual dos escritores

- MySQL XAMPP ativo, PID 19348, porta 3306. READ ONLY: nenhum cliente de
  aplicacao, nenhuma transacao externa, event_scheduler OFF e nenhum evento SQL.
- Nenhum Express/homologacao/tunel do projeto observado; nenhum listener
  3001/3107/3111, tarefa agendada atribuivel ou cliente SQL adicional observado.
  VS Code esta aberto. Processos Node observados sao ferramentas Codex/MCP.
- Supabase: PostgREST, pgbouncer e supabase_admin estavam idle, sem transacoes.
  Nenhum cron ativo nem fila pg_net configurada. Sessoes administrativas foram
  preservadas; nao devem ser encerradas para tentar comprovar drenagem.
- Existem integracoes MANUAIS capazes de escrever: Express, roteiro de
  homologacao de escrita e limpeza por manifesto, validacao SQL descartavel,
  editor SQL e clientes REST. A mera existencia nao e bloqueio de inventario;
  sua execucao deve permanecer suspensa durante a janela.
- Scripts que escrevem diretamente por REST/SQL podem contornar a barreira
  HTTP. Nao inicia-los na janela; o controle operacional desses escritores
  continua sendo exigido pelo gate, mesmo sem processos ativos nesta coleta.

Evidencias: `escritores-locais-confirmados-20261031.json` e
`escritores-bancos-confirmados-20261031.json`, em `evidencias/`.
As coletas sao snapshots e nao substituem as evidencias recentes da janela.

## Bloqueios tecnicos identificados antes da execucao

1. **Transicao e liberacao do supervisor ainda nao implementadas.** O supervisor
   atual oferece congelar, selar e drenar. Seu controlador/CLI nao oferecem
   admissao autorizada de uma instancia substituta, abertura somente leitura
   para smoke tests ou liberacao final de escritas. Reinicio sob marcador
   congelado gera nova identidade e incerteza permanente por projeto. Selagem
   bloqueia inclusive login/GET. Portanto, trocar o processo/provedor e depois
   liberar trafego ainda nao tem um caminho controlado e testado.
   Isso nao invalida os testes anteriores de bloqueio/drenagem; e uma etapa
   adicional necessaria ao ciclo de cutover, que antes ficou reservado.
2. **Startup normal Supabase continua bloqueado.** A proposta
   `fixtures/cutover-startup.proposta.patch` passou agora em `git apply --check`,
   sem aplicacao. Isso confirma apenas encaixe textual; nao comprova o runtime
   principal nem substitui testes especificos da futura liberacao.

Antes de abrir a janela real, preparar e testar APENAS esses incrementos:
admissao planejada da instancia nova depois de drenar/encerrar a anterior,
leitura/login com escritas ainda bloqueadas e liberacao final explicitamente
autorizada apos gates. Falha, boot desconhecido ou resultado incerto devem
conservar a barreira. Nao editar/apagar o marcador para contornar o supervisor.
Nao liberar startup Supabase nesta etapa.

## Roteiro reservado a autorizacao futura

| Etapa | Acao futura | Gate para prosseguir |
|---|---|---|
| Pre-janela | Concluir transicoes do supervisor e validar proposta de startup com fakes/isolamento | Apenas novos testes necessarios aprovados; configuracao principal ainda MySQL |
| Abertura | Reservar VS Code para a operacao; suspender comandos SQL/REST, homologacoes e limpezas; iniciar unica instancia sob supervisor | Inventario operacional atualizado com boot ID real e escritores locais controlados |
| Freeze | Congelar, selar e drenar | Zero requests, persistencia pendente, escritores ativos e resultados incertos |
| T0 | Backups atuais privados e coleta READ ONLY das duas pontas | Checkpoints completos, delta/catalogos/identidades/relacoes iguais; dez adicionais preservados |
| Troca controlada | Rotacionar JWT e admitir instancia Supabase pela transicao autorizada | Processo antigo drenado/encerrado; projeto PI Backend correto; nenhuma conexao MySQL no novo processo |
| Smoke | Permitir somente leitura/login na instancia nova | JWT antigos recusados; identidades, perfis e GET corretos; novas escritas ainda bloqueadas |
| Liberacao | Abrir escritas somente apos autorizacao e gates | Primeira escrita real T1 identificada; fixture/limpeza somente se autorizadas |

Nao repetir as baterias de homologacao ja aprovadas. Qualquer falha ou timeout
mantem manutencao e exige confirmar estado por leitura, sem retry de escrita.
O tempo decorrido nunca libera o trafego automaticamente.

## Retorno seguro

Antes de T1: conservar ambas as bases e dez extras, confirmar MySQL em T0 e
executar somente o retorno autorizado; nao ressuscitar segredos JWT antigos.
Depois de T1: preservar Supabase, capturar delta integral com DELETEs e relacoes,
usar o procedimento inverso aprovado e conferir igualdade antes de reabrir
MySQL. Nunca apenas trocar DB_PROVIDER de volta descartando novas operacoes.

Backups/restauracoes e rollback dos oito dominios permanecem aprovados. Novos
backups T0 e delta final sao gates da futura janela, nao testes repetidos agora.
Nenhum dado, segredo JWT ou credencial foi modificado nesta preparacao.
