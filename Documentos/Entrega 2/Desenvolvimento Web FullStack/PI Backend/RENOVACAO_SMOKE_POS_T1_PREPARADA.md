# Renovacao do smoke pos T1: preparacao

**161 testes aprovados; zero falhas. Implementacao em copia isolada, sem alterar o controlador vivo. Nenhuma renovacao real, escrita, liberacao ou commit.**

Causa: o gate limita o smoke a 15 minutos; o callback antigo proibe qualquer T1 registrada, inclusive concluida/limpa.

O comando proposto renovar-smoke-pos-t1 exige autorizacao explicita, diario original integro, limpeza comprovada, autoridade/IPC exclusivos, smoke privado novo e tres coletas atuais dos oito dominios/escritores. Preserva os dez adicionais e termina no gate completo de LIBERACAO, sem abrir HTTP. Planos T1 e tickets anteriores nao sao renovados ou reutilizados. Os prazos existentes permanecem.

Cobertura: 65 cenarios novos e 96 regressoes afetadas. Validados expiracao, concorrencia, falhas, evidencias adulteradas/ausentes, alteracoes em cada dominio, residuos, perda de IPC, preservacao do diario e bloqueio de nova T1. Nenhum banco real foi consultado durante os testes.

**Bloqueio operacional identificado:** a admissao/substituicao existente tambem exige ausencia de T1 e troca o supervisor. Nao suporta instalar o patch preservando legitimamente o diario vinculado ao supervisor atual. Essa trava nao foi removida. Antes de autorizar a renovacao real, preparar e testar uma ativacao compativel com T1 persistida. Nao reiniciar, aplicar hot reload, apagar T1 ou editar o diario para contornar.

O backend ativo e seu manifesto foram preservados. JWT, backups, checkpoint e estado privado nao foram alterados. Preservacao real atual dos dez adicionais nao foi novamente aferida nesta preparacao; o novo fluxo exige essa prova quando for autorizado.

Procedimento, limites, patch, hashes e saida dos testes: [README da preparacao](preparacao-smoke-pos-t1-20261102/README.md).

**Pronto como proposta tecnica testada. Ainda nao pronto para ativacao/renovacao operacional. HTTP 503 nao foi retirado.**
