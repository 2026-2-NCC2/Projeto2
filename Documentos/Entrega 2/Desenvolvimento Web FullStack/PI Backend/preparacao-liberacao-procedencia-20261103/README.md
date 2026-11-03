# Correção isolada da liberação pós-T1

Nenhuma implantação, recuperação, liberação, conexão a banco ou novo smoke real foi executado nesta investigação. Manter aberta a sessão 63384 do controlador. Código operacional e manifestos anteriores não foram modificados.

## Causa comprovada por reconstrução

`config/comandos-controlador.cjs` converte exceções não classificadas em `CONTROLE_OPERACAO_RECUSADA`; o recibo da tentativa não guardou a exceção original. Não há mensagem interna registrada que possa ser apresentada como log histórico. A condição interna foi reconstruída pelo caminho determinístico do código e reproduzida sobre uma cópia em memória do estado real, sem gravá-lo.

1. A renovação aprovou 26 requisições e o primeiro gate, verificado em 1793732171929.
2. A liberação fez outra coleta e aprovou outro gate. O estado persistiu `gateSelado.verificadoEm=1793732208129`, ligado ao SHA do novo relatório. Portanto, a validade do primeiro plano não foi reutilizada: um segundo gate efetivamente passou.
3. `transicao-controlada.cjs` publicou a fase `LIBERAR` e chamou `pedir('liberar-escritas')`.
4. Antes de enviar IPC, `controlador-supervisor.cjs` chamou `validarControlador`. A autoridade pós-T1 chamou `conferirProcedenciaT1`, que exigia exclusivamente `fase==='INICIADA'`.
5. Com `LIBERAR`, essa asserção produziu `POS_T1_PROCEDENCIA_AUSENTE`. O envio ao supervisor foi recusado antes de acontecer. O wrapper `exclusivo` persistiu `INCERTA`, congelado e selado. O erro chegou ao mapeamento genérico do canal.

A mesma procedência real passou com INICIADA e falhou com LIBERAR na reprodução. Não foi necessário alterar PID, JWT, checkpoint ou diário. Expiração, divergência de dados e autorização não explicam essa recusa posterior à publicação; o IPC foi bloqueado pela validação local da autoridade, não por um timeout observado.

## Correção candidata

Somente três arquivos diferem da origem:

- `config/procedencia-t1-selada.cjs`: aceita LIBERAR somente com selo v2 de finalidade LIBERACAO, prazo limitado a 30 segundos, nonce e hashes válidos, diário vinculado e hash do estado anterior integral. As demais verificações da procedência continuam obrigatórias. INCERTA permanece rejeitada.
- `config/transicao-controlada.cjs`: emite o selo somente após conferir o plano opaco autêntico do gate e a drenagem. Não transforma um JSON em autorização e não amplia prazos.
- `config/comandos-controlador.cjs`: mantém o código externo e informa `causaInterna` somente para identificadores técnicos permitidos; não transmite mensagens arbitrárias, stacks ou segredos.

O selo normaliza apenas a fase para INICIADA e remove o próprio `gateSelado` ao calcular o hash. Todos os demais campos continuam vinculados. Não constitui um mecanismo para recuperar INCERTA nem para repetir T1.

## Testes isolados

Executados nesta cópia, com fixtures fictícias e sem bancos ou servidores reais:

```powershell
node --test --test-isolation=none tests/liberacao-procedencia-pos-t1.test.cjs tests/implantacao-pos-t1.test.cjs tests/gate-final-selado.test.cjs tests/continuidade-comandos.test.cjs tests/renovacao-smoke-pos-t1.test.cjs
```

Resultado: 167 aprovados, zero falhas, zero skips. Inclui 19 cenários novos: liberação pós-T1 entre autoridade e supervisor, selo ausente/antigo/expirado/futuro, TTL ampliado, nonce/hash inválidos, diário/PID/checkpoint/epoch/T1 divergentes, INCERTA rejeitada, plano forjado, gate autêntico, falha IPC sem repetição e diagnóstico sem segredos. A execução inicial com isolamento por subprocesso recebeu `spawn EPERM`; a execução sem subprocesso do runner passou. Isso não altera o isolamento fictício das dependências.

Verificador anterior: 33 hashes confirmados, inclusive os 30 anteriores. Os 101 arquivos de config/scripts operacionais permaneceram iguais ao inventário inicial.

## Procedimento seguro para uma etapa futura

1. Obter autorização específica de implantação e recuperação; reconfirmar identidades por criação/entrada/pai, controle exclusivo, porta 3001 e HTTP 503. Não reutilizar apenas os números de PID históricos.
2. Revalidar os hashes do código operacional e deste pacote. Não copiar arquivos em processos ativos sem o protocolo de substituição selada. Preservar todos os manifestos anteriores; o patch requer um novo manifesto explícito, nunca a alteração dos hashes antigos.
3. Revalidar, somente por leitura, os oito domínios, os dez adicionais, o diário T1 concluído/limpo, JWT, checkpoint e integridade dos backups existentes. Registrar novamente a lacuna histórica e o risco aceito. Não gerar backups, repetir T1 ou rotacionar JWT.
4. Para recuperar INCERTA, exigir evidência específica desta tentativa: estado anterior completo, publicação do gate, prova de que a recusa ocorreu antes do envio `liberar-escritas`, identidades e ausência de persistências incertas. Arquivar o estado recusado integral antes de qualquer mudança autorizada. Não editar fase manualmente ou falsificar continuidade.
5. O controlador atualmente carregado não oferece uma recuperação pós-T1 dessa INCERTA. Os roteiros antigos de recuperação pressupõem ausência de T1 ou estado INICIADA/FALHA. **Não reutilizá-los ignorando suas precondições.** A adaptação/admissão desse caminho exige preparação e testes próprios antes da operação. Esta correção resolve LIBERAR, não implementa essa recuperação.
6. Somente pelo adaptador pós-T1 validado e autorizado: substituir os processos necessários mantendo autoridade exclusiva, tickets novos e HTTP 503; conservar o diário original e os hashes protegidos; exigir estado INICIADA/PRONTA_SMOKE sem incertezas operacionais. Uma falha impede nova tentativa automática.
7. Após recuperação, com autorização: renovar smoke/evidências, obter novo gate e executar uma única liberação oficial. O selo v2 só será emitido nessa operação. Verificar imediatamente login, autenticação, permissões e consultas HTTP públicas. Se falharem, bloquear novas escritas pelo controle oficial, preservar evidências e interromper sem rollback automático.

**Pendência operacional:** preparar e validar o adaptador específico de recuperação INCERTA pós-T1 e sua implantação selada. Não existe comando autorizado para executá-lo nesta etapa. Não afirmar que o sistema está pronto para liberação enquanto essa pendência existir.
