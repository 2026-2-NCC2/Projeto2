# Pronto para autorizacao controlada

Causa: a lane de reboot e a ponte de manutencao rejeitavam T1 existente. O controle persistido ATIVO nao representa autoridade viva depois do reinicio. A correcao criou uma lane explicita para o estado atual, sem apagar esse historico e sem relaxar a lane antiga.

Preparacao exclusivamente isolada em `preparacao-restabelecimento-pos-t1-20261103/candidato`. Reutiliza tickets/bootstrap/procedencia, gate IPC, reconciliacao e diagnostico existentes. Exige T1 concluida/limpa, diario original, reboot posterior a T1, ausencia nativa dos antigos, escritores controlados e evidencias atuais. Preserva bytes do estado anterior, checkpoint, diario, epoch/historico de tickets; cria autoridade nova somente por tickets genuinos. Supervisor e ponte permanecem 503. Falhas nao autorizam retry, T1, rollback ou liberacao.

**50 cenarios aprovados: 45 novos e cinco regressoes selecionadas; zero falhas/SKIPs.** Cobrem inicializacao selada, tickets invalidos/expirados/consumidos, concorrencia, falhas, IPC fabricado, integridade e diagnostico anterior a admissao. Verificacao adicional confirmou selo valido e recusa de selo invalido. Patch passou em --check; nao foi aplicado.

Selo SHA-256 da preparacao (`manifest-preparacao.json`):
`abf0e63544f74e2e00bf98d1c5dc5dd8f7107f6b812a147575b86cc88ec9682e`.

Pacote de admissao (`manifest-admissao.json`):
`63db2f155e9fe8c3fb11f98615d1f2e960f01d5f8b2f8ef945fcab386d2e3bb4`.

Cinco arquivos de codigo propostos; nenhum publicado. Fixtures sao somente de teste e nao entram no delta. Os 27 hashes ativos continuam aprovados contra o pacote anterior imutavel. Estado, ambiente/JWT, diario e checkpoint conservaram hashes. Git recebeu apenas regras -text adicionais para os novos caminhos selados; nenhuma configuracao global foi alterada.

Nao houve conexao real aos bancos, inicio/encerramento de processos, readmissao, smoke, T1, escrita de dados, backup novo, rollback, liberacao ou commit. HTTP 503 foi comprovado somente nas simulacoes desta tarefa; o ambiente real nao foi restabelecido.

Pronto para autorizar a publicacao exata do pacote e o restabelecimento controlado, sob nova verificacao operacional. Nao autoriza a admissao da implantacao anterior nem liberacao do sistema. Estado parcial/FALHA ou origem com procedencia de readmissao anterior continuam recusados e exigem analise propria.

Procedimento e comandos: [README](preparacao-restabelecimento-pos-t1-20261103/README.md). Evidencias: [resultado estruturado](preparacao-restabelecimento-pos-t1-20261103/resultado-preparacao.json).
