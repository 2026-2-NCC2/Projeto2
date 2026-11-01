# Recuperacao e smoke isolado — 01/11/2026

**Recuperacao controlada e smoke real somente leitura aprovados. Funcionamento normal NAO liberado.**

## Evidencias atuais e risco aceito

O gate v2 foi revalidado por consultas READ ONLY completas, sem executar o orquestrador de delta, criar backups ou alterar o checkpoint. Reconciliacao atual aprovada: 42 registros comuns identicos, 52 registros Supabase, dez adicionais preservados. Identidades, perfis, campos persistidos, relacionamentos e catalogos conferidos. Contagens isoladas e T1=false nao foram usados como aprovacao suficiente.

Evidencias:

- Revalidacao inicial: `evidencias/gate-recuperacao-autorizada-bba145ca-6122-47e5-a9b6-6b143f21427e.json`.
- Reconciliacao recente: `evidencias/reconciliacao-formal-leitura-06934441-8467-4354-b4c3-0d540945ca7e.json`.
- Execucao real e aceite: `evidencias/recuperacao-smoke-selado-d669e2e4-3cb3-42e2-8636-5da0d8926db9.json`.

Aceite explicitamente registrado no relatorio e na decisao persistida de recuperacao: equivalencia atual; lacuna historica reconhecida; risco residual aceito; controle operacional sem lock global SQL/REST aceito. **Ausencia historica de escritas permanece NAO comprovada.** Nao houve mudanca persistida observada entre as verificacoes, nem divergencia atual do checkpoint; isso nao exclui alteracoes transitorias revertidas entre observacoes.

## Recuperacao executada

Supervisor anterior PID 31664 e controlador anterior PID 34428 tiveram identidade nativa reconferida. Somente o supervisor conhecido foi encerrado; confirmou-se sua saida e porta livre. Depois foi encerrado exclusivamente seu controlador conhecido, com handle nativo, criacao/pai/entrada reconferidos e guard exigindo filho ausente, porta livre e recuperacao ENCERRANDO. Nao foram encerradas sessoes administrativas ou processos desconhecidos.

Novo supervisor PID **30276**, controlador persistente PID **29120**, criado em 01/11/2026 as **16:39:29 BRT**. Admissao pelo ticket privado de uso unico, mesma janela/configuracao/checkpoint/JWT. Fase **INICIADA**, recuperacao **PRONTA_SMOKE**, marcador de smoke isolado aprovado, congelado=true e selado=true. Zero pendencias/incertezas ao concluir.

Verificacao nativa final: listener unico **127.0.0.1:3001**, PID 30276, pai 29120, entrada conhecida. GET /perfil publico devolve **503**. MySQL PID 20660 permanece ativo, sem clientes locais adicionais; nenhuma tarefa ou outro escritor nao autorizado identificado. PIDs sao referencias desta observacao e precisam de nova verificacao na proxima etapa.

## Smoke privado e manutencao integral

A escolha do usuario foi manter HTTP 503 integral. Nao se chamou abrirSmoke/abrirLeitura nem liberarEscritas.

Foi preparado e testado um transporte efemero em 127.0.0.1, porta aleatoria, com capacidade criptografica mantida exclusivamente em memoria e comando por IPC herdado. A capacidade nao e JWT, credencial de banco ou header aceito pela porta principal. Somente requests marcados internamente atravessam a selagem; o gate exige o processo/boot correto, fase INICIADA, recuperacao PRONTA_SMOKE, selagem, congelamento e drenagem. Toda escrita continua recusada antes das rotas/parsers. O transporte foi encerrado antes de devolver o resultado, sem expor porta, capacidade, tokens ou credenciais.

**26 requisicoes reais aprovadas, quatro perfis, zero falhas:** login, JWT HS256/identidade/perfil/expiracao, recusa dos dois JWT antigos, GET /perfil pelo contrato id/nome/email, consultas essenciais por papel, autorizacao administrativa e recusas 401/403. Seis probes de escrita recusados com 503, sem executar persistencia ou criar registros.

O mesmo Express e os repositorios Supabase do processo admitido atenderam o smoke. A verificacao de cache confirmou ausencia de db.js, mysql2 e repositorios MySQL no backend. O inventario confirmou ausencia de conexao MySQL do backend. O startup principal protegido seleciona Supabase; um boot independente durante manutencao continua recusado por projeto. O startup autonomo apos CONCLUIDA nao foi executado.

Verificacoes formais antes/depois do smoke reconferiram conteudo e escritores. JWT/.env, checkpoint, backups e os dez adicionais preservados. Nenhuma escrita de dados, fixture, limpeza, rollback, nova rotacao JWT ou commit.

## Testes da adaptacao

100 cenarios distintos afetados aprovados: 20 do transporte/smoke/IPC/bootstrap isolados, 52 da recuperacao/gate, 14 do supervisor e 14 do helper de encerramento com primitivas nativas falsas. Os testes nao acessaram bancos reais. O runner Node precisou de --test-isolation=none devido a spawn EPERM no sandbox; nao foi alterada politica global. Uma fixture PowerShell normalizou o proprio caminho e passou. Nenhuma falha pendente.

## Pendencias para retirar manutencao

**Ainda nao estao atendidos todos os criterios operacionais de liberacao.**

1. O gate final existente em config/transicao-controlada.cjs exige LEITURA e um callback de smoke aberto; a recuperacao termina INICIADA/selada com evidencia de smoke privado. Preparar e testar uma transicao legitima de liberacao que consuma essa evidencia e controles atuais, sem editar a fase manualmente ou abrir trafego para contornar o gate.
2. O controlador atual conserva IPC, mas nao expoe comando externo de liberacao. Preparar a continuidade legitima do controle para a autorizacao final; nao adotar IPC, injetar codigo, habilitar debugger ou encerrar processos silenciosamente.
3. A primeira escrita essencial T1 do roteiro original nao foi executada: foi preservado o bloqueio integral solicitado. A homologacao anterior das 12 escritas continua como evidencia anterior, sem ser reapresentada como um novo smoke de escrita desta instancia.
4. Revalidar identidade, validade das evidencias e controle operacional na proxima etapa; manter SQL/REST/jobs suspensos. Lacuna historica continua registrada. A retirada da manutencao exige autorizacao explicita.

Nao executar novamente o roteiro completo da janela, backups, rotacao ou recuperacao automaticamente. Nao iniciar outra instancia concorrente. Preservar o controlador atual e HTTP 503 ate novo procedimento autorizado.
