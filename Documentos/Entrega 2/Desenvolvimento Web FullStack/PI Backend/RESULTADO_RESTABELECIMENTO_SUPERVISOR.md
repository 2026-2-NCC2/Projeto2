# Restabelecimento selado — 01/11/2026

Restabelecimento autorizado concluido. Gate v2 aprovado. Recuperacao de INCERTA nao executada.

## Processos verificados

- MySQL local: PID 20660.
- Controlador persistente: PID 34428; conserva IPC com o supervisor.
- Supervisor legitimamente admitido: PID 31664, pai 34428, criado em 01/11/2026 as 16:25:45 BRT.
- Respondedor descartavel PID 33472 encerrado exclusivamente apos admissao sem porta.
- Listener unico: 127.0.0.1:3001, PID 31664. GET /perfil devolve HTTP 503.

Os PIDs acima registram esta observacao. Qualquer proxima etapa deve revalidar PID, criacao, pai, entrada, porta e estado; nao reutiliza-los como comprovacao permanente.

## Evidencias

- PRE-v2: `evidencias/operacional-v2-4d57a797-aae0-47a6-98e3-1d61bc1ac628.json`.
- Reconciliacao v2 com supervisor admitido: `evidencias/reconciliacao-formal-leitura-ba3a611d-5da8-4592-9411-1d9d1ed12fc2.json`.
- Execucao e aprovacao do gate: `evidencias/restabelecimento-real-d2a51942-6908-4c5e-ac5a-e94dd4b2d3c4.json`.

Oito dominios conferidos por consultas READ ONLY: 42 registros MySQL identicos aos correspondentes Supabase; 52 registros totais no destino. Dez adicionais preservados. Identidades, perfis, hashes de senha, campos persistidos, relacionamentos e catalogos consistentes com o checkpoint. Nenhuma divergencia observada.

Controle operacional dos escritores confirmado antes/depois: sem clientes MySQL adicionais, transacoes concorrentes, jobs, fila HTTP ou processos locais nao autorizados identificados. Sessoes Supabase administrativas verificadas; nenhuma encerrada. Verificacao nativa final confirmou listener unico e ausencia de clientes locais MySQL.

A ausencia historica de escritas permanece NAO comprovada. A aprovacao usa equivalencia atual e aceitacao explicita do risco residual; nao transforma a lacuna em evidencia positiva nem equivale a bloqueio global SQL/REST. A janela exclusiva deve continuar.

## Estado preservado e pendencias

INCERTA, congelamento e selagem preservados. Registro historico original mantido; apenas identidade ativa e registro separado de restabelecimento foram atualizados pelo procedimento autorizado. JWT/.env, checkpoint e integridade dos backups existentes preservados. Nenhuma escrita de dados, nova rotacao, backup, rollback ou commit executado.

O controlador deve permanecer ativo para conservar IPC. Nao iniciar outro backend. Nao liberar HTTP normal.

Proximas etapas exigem autorizacao: revalidar evidencias e controles atuais, recuperar INCERTA, executar smoke final corrigido e decidir liberacao da manutencao. Evidencias possuem validade limitada; o gate deve ser novamente satisfeito no momento da recuperacao.
