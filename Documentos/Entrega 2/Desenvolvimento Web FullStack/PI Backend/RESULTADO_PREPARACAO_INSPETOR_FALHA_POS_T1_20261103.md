# Correcao e recuperacao preparadas

Causa exata no codigo: a entrada restabelecer-controlador-apos-reinicio exigia modo RESTABELECIMENTO_POS_REINICIO. A rotina pos-T1 utiliza IMPLANTACAO_POS_T1 com motivo RESTABELECIMENTO_POS_T1. O predicado falso ocasionava CONTROLE_IDENTIDADE_RECUSADA. O stderr original nao foi inventado ou recuperado retrospectivamente.

Correcao somente em copia isolada. O inspetor aceita a combinacao pos-T1 apenas com conclusao/limpeza, diario, checkpoint, fingerprint e procedencia validos; tickets nulos, PID/pai/criacao/entrada canonica corretos, snapshot estavel e listener local exclusivo. Continua sem afirmar IPC genuino por JSON. FALHA nao e aceita como autoridade ativa.

Preparada recuperacao explicita da FALHA atual. Preserva os bytes completos da falha e do estado original, diario, tickets consumidos e checkpoint; cria id/epoch/tickets novos apos provas recentes. Reutiliza a ponte conhecida e os validadores existentes. Nao apaga FALHA, restaura metadados antigos ou repete T1/limpeza. Plano copiado/expirado, concorrencia, processos anteriores, dados divergentes ou falhas impedem aprovacao e nao geram retry automatico.

**59 testes aprovados: 39 Node novos, 16 PowerShell nativos simulados e quatro regressoes selecionadas. Zero falhas/SKIPs finais.** Incluem aceites pos-T1/legado, recusas invalidas, validacao real do codigo PowerShell com primitivas falsas, recuperacao e runtime com IPC genuino simulado. Suites anteriores completas nao foram repetidas.

O pacote propoe oito arquivos de codigo. Nao foi publicado. Selo da preparacao:
`7f51e2cc1e11ce5613e1ba142da6a7c7d37e7e5b31ac017b023ee251e6601a90`.

Pacote de admissao:
`d00cf587e3127dacb9550938be530fabd87bcab5842e2d6c79dea345008ca7ec`.

Verificador do pacote passou, assim como git apply --check. Os 30 hashes ativos e os manifestos anteriores permanecem intactos. A politica -text foi estendida apenas aos novos caminhos selados. Nenhuma configuracao global ou credencial foi alterada.

Respondedor existente PID **27672** confirmado nativamente, mantendo HTTP **503**. JWT/ambiente, checkpoint, diario e bytes originais pre-falha conservaram os hashes. A FALHA atual passou no novo validador puro, sem alteracao. Nenhum banco foi acessado, nenhum processo foi iniciado/encerrado, nenhuma recuperacao/readmissao real ocorreu. Sem T1, novas escritas de dados, backup novo, rollback, liberacao ou commit.

Pendem autorizacao para publicar o pacote e autorizacao da recuperacao controlada, com evidencias operacionais recentes. O novo gate nao libera funcionamento normal; smoke e liberacao ficam separados. Nova falha durante essa recuperacao encadeada exige analise especifica.

Procedimento: [README](preparacao-inspetor-falha-pos-t1-20261103/README.md). Evidencias: [resultado estruturado](preparacao-inspetor-falha-pos-t1-20261103/resultado-preparacao.json).
