# Etapa 3 — capacidade e inscrições

Implementação local; nenhuma migração ou escrita remota está autorizada por este documento.

## Modelo e compatibilidade

- eventos.publico continua sendo público estimado, usado inclusive na viabilidade financeira.
- capacidade_maxima é integer nullable: NULL significa sem limite configurado, 1..2147483647 representa limite de inscrições confirmadas. Zero, negativos e frações são rejeitados.
- Todos os eventos existentes recebem NULL, sem copiar publico, reclassificar estados, apagar inscrições ou atualizar seus metadados/versionamento.
- Novos eventos também podem ficar sem limite mediante escolha explícita no formulário. Limpar o campo remove o limite, após salvar. A regra de impedir redução abaixo da ocupação vale para limites numéricos.
- Apenas status exatamente Confirmada ocupa vaga. Cancelada libera a vaga; o par usuário/evento permanece único independentemente de status. Não há nova rota de cancelamento/reativação nesta etapa, mas o trigger protege alterações SQL.
- O preflight e a migração recusam status desconhecidos para revisão humana. Não convertem dados.
- Campos omitidos por clientes antigos preservam a capacidade existente. As chaves de criação existentes mantêm seu payload; um replay deve repetir o mesmo payload original, inclusive presença/ausência de capacidade.
- Banco com marcador 1 mantém a Etapa 1, sem mostrar configuração de capacidade. Marcador 3 habilita os recursos. Enviar capacidade antes da migração retorna 503, sem escrita legada. MySQL não implementa a Etapa 3 e rejeita esse campo.

## Garantia transacional

A RPC inscrever_evento_v1 continua sendo a operação de escrita. O trigger BEFORE INSERT OR UPDATE de inscrições bloqueia o usuário e depois a linha do evento com FOR UPDATE, verifica perfil, disponibilidade, duplicidade e conta Confirmada antes de inserir/reativar. O lock fica até COMMIT/ROLLBACK. Inscrições de usuários diferentes para o mesmo evento esperam o mesmo lock. A constraint UNIQUE(usuario_id,evento_id) é a defesa final contra duplicidade.

Edição da capacidade usa gerir_evento_v1: verifica proprietário e versão, bloqueia o mesmo evento e valida o limite contra a ocupação antes de salvar. O trigger original da Etapa 1 incrementa a versão uma única vez e mantém estados/horários e campos protegidos. Capacidade e descrição são editáveis em eventos ativos futuros; os demais campos continuam congelados. Cancelados/encerrados continuam imutáveis.

As operações que alteram ocupação/capacidade exigem READ COMMITTED. Após aguardar o lock, a contagem usa snapshot novo; REPEATABLE READ/SERIALIZABLE são recusados para não aceitar contagem antiga. Timeouts/deadlocks abortam a operação; o backend não repete automaticamente nem recorre a INSERT sem RPC. Confirmar o resultado consultando inscrições antes de repetir.

Os triggers também protegem escritores diretos com triggers habilitados. A rotina não altera RLS, políticas, ACLs de tabelas, TLS, credenciais ou .env. Funções novas são SECURITY INVOKER com search_path=pg_catalog e EXECUTE apenas para service_role/proprietário. A migração valida grants inesperados e aborta tudo se houver divergência.

A RPC de leitura eventos_vagas_v3 calcula capacidade, confirmados, saldo e lotação em um snapshot por lote (200 eventos). Não expõe identificadores de inscritos. A listagem de eventos e os lotes não formam um snapshot global: a disponibilidade exibida é informativa; a inscrição sempre revalida no banco. Sem limite, saldo=null e lotado=false. Falhas/inconsistências de leitura são propagadas, sem inventar vagas.

## Ativação autorizada futura

1. Disponibilizar PostgreSQL descartável 15–18 e executar os testes SQL reais, incluindo concorrência, edição versus inscrição e permissões. Não usar URLs de produção nos testes.
2. Revisar os SQLs e confirmar o projeto no Dashboard. Fazer backup verificável. Parar/drenar todos os escritores, inclusive jobs, integrações e versões antigas do backend.
3. Executar eventos_capacidade.preflight.sql como postgres. Esperar marcador 1, isolamento read committed, UNIQUE validada não diferível, somente os triggers conhecidos das etapas anteriores e status Confirmada/Cancelada. Comparar definições de funções da Etapa 1 com a versão local; divergências exigem revisão. Confirmar integridade e permissões antes de continuar.
4. Salvar o JSON de eventos_capacidade.verificacao.sql ANTES. Obter autorização explícita para aplicar a migração no projeto confirmado.
5. Aplicar eventos_capacidade.incremental.sql uma única vez. Locks NOWAIT/timeout fazem abortar sem esperar indefinidamente; falhas exigem ROLLBACK antes de nova tentativa. Não remover bloqueios, triggers ou dados para fazê-la passar. Segunda aplicação é recusada.
6. Salvar o mesmo JSON DEPOIS antes de retomar escritores: integridade, estados, FKs, segurança_tabelas e sequências devem ser iguais; todos os legados sem limite; duplicidades=0; acima_da_capacidade=0; coluna integer nullable sem default, CHECK validada e índice pronto/válido. Confirmar marcador 3 pelo preflight. Esperar 7 funções inventariadas, 3 triggers habilitados; inscrições deve proteger INSERT OR UPDATE. Anon/authenticated sem EXECUTE e service_role sem grant option.
7. Implantar o backend/frontend desta etapa na mesma janela. Backend anterior só reconhece marcador 1 e não deve permanecer ativo após a migração. Homologar exclusivamente com contas/eventos descartáveis autorizados: última vaga concorrente, duplicidade, redução de limite, propriedade/versão, estados/horário e exibição em ambos os portais.
8. Liberar tráfego apenas após evidências. Escolher capacidade para eventos reais exige decisão e autorização do proprietário; nenhuma atualização em massa está preparada.

## Reversão e limites

Falha dentro da migração transacional desfaz o DDL. Após ativação, manter o backend compatível e interromper novas escritas ao investigar falhas; não remover a coluna/triggers nem voltar ao backend antigo automaticamente, pois isso retiraria proteção de eventos já limitados. Restauração deve ser planejada separadamente com backup e autorização.

Etapa 2 permanece com uploads bloqueados. O preflight de imagens aceita marcadores 1 e 3; nenhuma flag de upload foi alterada. Sem pagamentos, lotes, QR Code ou check-in.

## Validação local

Consultar o relatório final da execução. Os testes SQL usam Docker postgres:17 --pull=never, porta aleatória em 127.0.0.1, senha aleatória e banco criado pelo teste, sem ler .env. Ativar com TROCATICKET_CAPACIDADE_SQL_LOCAL=1 ao executar node --test tests/eventos-capacidade-sql.test.cjs em PI Backend. Sem Docker/PostgreSQL local, o teste fica explicitamente ignorado: mocks e build não comprovam concorrência nem integridade PostgreSQL.


## Resultado desta execução — 04/11/2026

- Regressão direcionada backend: 111 testes, 108 passaram, zero falhas e 3 suítes SQL ignoradas (Etapas 1, 2 e 3).
- Frontend: 27 testes passaram, zero falhas, cobrindo vagas, formulário, bloqueio de inscrição na lista/detalhes, gestão e imagens.
- Após o ajuste final no mapeamento PostgreSQL 23505 para duplicidade, os 7 testes específicos do backend foram repetidos com sucesso.
- npm.cmd run lint e npm.cmd run build em PI React passaram após a última alteração de interface.
- O backend não possui script lint/build; sua validação foi feita pelos testes Node. Não houve teste visual em navegador.
- PostgreSQL, psql e Docker não foram encontrados no PATH nem nas instalações locais verificadas. A suíte de concorrência foi preparada e ignorada; SQL incremental, preflight e verificação NÃO foram executados em PostgreSQL. Sintaxe/DDL, locks, permissões e integridade PostgreSQL ainda exigem validação real.
- Os testes de transporte usam respostas simuladas; não comprovam concorrência do banco. A suíte opcional contém cenários de última vaga, duplicidade, escrita direta, reativação, redução, corrida inscrição/edição, compatibilidade, replay, isolamento e permissões.
- As ferramentas MCP do grafo não estavam disponíveis nesta sessão. A análise foi feita em fontes e testes.
- Nenhuma conexão com produção, migração remota, escrita de eventos/inscrições reais, alteração de .env, TLS, credenciais, RLS ou políticas, ativação de upload, commit ou push foi realizada.
