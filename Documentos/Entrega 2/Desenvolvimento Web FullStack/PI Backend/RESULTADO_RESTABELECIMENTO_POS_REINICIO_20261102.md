# Restabelecimento real concluido — 02/11/2026

**Gate de restabelecimento aprovado. HTTP 503 integral. Nenhum handoff entre controladores ou T1 executado.** Gate final T1 ainda nao aprovado; smoke novo permanece pendente.

## Identidades ativas

| Papel | PID atual | Identidade comprovada |
| --- | ---: | --- |
| MySQL XAMPP | 4492 | Executavel/configuracao originais; listener e conexao READ ONLY confirmados |
| Controlador persistente | 5696 | Pai 29448; criado 02/11/2026 14:43:18.552849 UTC; entrada nova de restabelecimento |
| Supervisor Supabase | 9804 | Pai 5696; criado 02/11/2026 14:44:07.860357 UTC; bootstrap privado e listener unico 127.0.0.1:3001 |

Os PIDs anteriores 29120/30276 estavam ausentes. Reinicio Windows comprovado em 02/11/2026, 14:18:01.500 UTC (11:18:01 BRT). Nao houve adocao de IPC nem encerramento de controlador preexistente.

MySQL nao tinha servico Windows registrado. A primeira tentativa destacada (PID 9224) nao permaneceu ativa e a conexao retornou ECONNREFUSED. Os indicadores do log nao apresentaram ERROR nas ultimas 35 linhas; nao comprovam a causa interna do encerramento. Confirmada sua ausencia, o mesmo executavel/my.ini foi iniciado em sessao persistente (PID 4492), com identidade nativa e listener conferidos antes da nova conexao READ ONLY. Sem reparos, alteracao de configuracao, usuarios ou senhas.

## Admissao e controles

A lane antiga INCERTA permaneceu restrita. Foi preparada/testada admissao inicial especifica para INICIADA apos reboot comprovado, conforme RESTABELECIMENTO_POS_REINICIO.md. Exige ausencia atual de todos os atores anteriores, checkpoint/configuracao autenticados, reconciliacao integral, escritores sob controle e ausencia de T1. Nao reinicia a migracao ou recuperacao INCERTA.

O candidato instalou stdin privado retomavel antes da admissao. Gerou duas capacidades novas, unicas, vinculadas a PID/pai/boot, validade de 30 segundos. Ambas consumidas/inutilizadas: slots nulos e dois hashes distintos no estado protegido. Nenhum ticket consumido foi reutilizado. A ponte 503 criada nesta admissao foi encerrada somente depois da admissao sem porta; o supervisor legitimo foi vinculado depois da porta livre.

Fase INICIADA preservada, congelado/selado verdadeiros. Identidades ativas atualizadas e smoke antigo invalidado para o novo processo. Historico anterior preservado em estadoBase; o gate comparou o historico da transicao, permitindo somente atualizacao de PID/boot e invalidacao do smoke. Checkpoint, janela, JWT e backups originais preservados. Nenhum lock remanescente.

O gate utilizou recibo IPC genuino em memoria e consulta real de status ao filho, com identidade nativa antes/depois. Outra consulta pelo stdin do proprio controlador retornou sucesso, mesmos PIDs e nonce novo, comprovando continuidade operacional retomavel. O JSON publico registra essa observacao; nao funciona como capacidade autenticada.

Inventario final: apenas o par admitido, MySQL XAMPP e ferramentas Codex/MCP identificadas; nenhum cliente MySQL adicional, tarefa do projeto ou outro listener do projeto. Ausencia historica de escritas nao foi comprovada; lacuna e aceite de risco residual permanecem registrados. Controle operacional nao equivale a lock global SQL/REST.

## Reconciliacao atual

Oito dominios conferidos integralmente em transacoes READ ONLY, com TLS Supabase verificado, controle dos escritores antes/depois, identidades, perfis, campos persistidos, relacionamentos e catalogos correspondentes ao checkpoint. **42 registros MySQL / 52 Supabase; nenhuma divergencia.**

Dez adicionais preservados, com conteudo integral equivalente ao checkpoint: usuarios 10; eventos 12; custos 7/8; cotacoes 6; itens 22/23; propostas 3; inscricoes 3; solicitacoes 6. Nenhum registro criado, editado ou excluido.

Hashes de `.env`/JWT e checkpoint identicos ao inicio. Artefatos de backup existentes tiveram tamanho/SHA conferidos, sem novos backups/restauracoes. Probe publico confirmou 503 depois do gate. Nenhum rollback ou commit.

## Testes e evidencias

74 cenarios distintos aprovados, zero falhas finais: 32 novos e 42 regressoes afetadas. Processos/IPC/bancos dos testes foram isolados ou simulados; somente depois ocorreu a admissao real autorizada. Nao houve repeticao integral dos 129 testes anteriores. Quatro JavaScript e dois PowerShell passaram na verificacao sintatica. A fixture VM foi corrigida para normalizar objetos entre contextos, conservando recibos genuinos.

- Evidencia operacional do controlador: `evidencias/restabelecimento-pos-reinicio-b8f5d9da-8fb8-4564-97a1-356d13add41d.json`.
- Confirmacao independente e continuidade: `evidencias/confirmacao-restabelecimento-20261102-1793630875142.json`.

## Proxima etapa

O objetivo de obter controlador legitimo com IPC retomavel foi atendido pela readmissao inicial, sem substituir um controlador vivo. O par atual deve permanecer ativo na sessao persistente. Nao encerrar stdin, reiniciar processos ou alterar codigo executavel durante a janela.

**Nao reinvocar a CLI original de substituicao:** ela exige ausencia de controleSelado existente. O registro atual representa autoridade valida; nao deve ser apagado ou tratado como falha para executar outro handoff. Uma substituicao adicional entre controladores ativos precisaria de adaptacao e validacao especificas; nao esta pronta nem foi executada.

A proxima etapa tecnica e executar smoke isolado e gate final no controlador atual, mantendo 503. Nao executar T1 ou liberar manutencao com base somente no gate de restabelecimento. A decisao sobre outro handoff deve considerar que a continuidade IPC anteriormente ausente ja foi resolvida.
