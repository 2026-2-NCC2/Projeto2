# Recuperação INCERTA pós-T1: validação isolada

Estado operacional não modificado. HTTP 503 mantido. Nenhuma conexão a banco, recuperação real, admissão, liberação, T1, smoke completo, backup ou rotação JWT executada. A sessão 63384 permanece aberta. Os 167 testes anteriores não foram repetidos.

## Condições obrigatórias

A origem deve estar em INCERTA, congelada/selada, com controlador ATIVO e autoridade exclusiva, tickets consumidos e nenhum pendente. T1 deve estar CONCLUIDA, limpa, sem resultado incerto nem retry; diário, checkpoint, configuração, procedência original e encadeamento da recuperação FALHA devem ser íntegros. Os oito domínios exigem comparação integral atual e preservação dos dez adicionais; contagens não bastam.

A recusa precisa estar vinculada à tentativa específica, ao relatório/hash/nonce do gate e à causa reconstruída POS_T1_PROCEDENCIA_AUSENTE antes do envio liberar-escritas. Exige-se snapshot independente do estado anterior, com hash selado antes da tentativa. Não fabricar esse histórico mudando INCERTA para INICIADA em memória e chamando-o de snapshot histórico.

O selo legado pode ser antigo: serve somente para vincular o histórico, nunca como autorização atual. Hash/nonce inválidos são rejeitados. A autorização de recuperação vem de novo plano opaco, com prazo máximo de 30 segundos, evidências atuais e adapters legítimos obrigatórios para autoridade, histórico e IPC. Flags favoráveis ou JSON não substituem esses adapters.

O diagnóstico deve comprovar HTTP 503, identidades atuais, IPC exclusivo, zero requisições/escritas/persistências pendentes e zero incertezas operacionais. Distinguir essas incertezas reais do marcador sintético provocado pela fase INCERTA. Evidências e capturas atuais expiram em 30 segundos.

## Implementação isolada

`scripts/recuperacao-incerta-pos-t1.cjs` fornece um construtor inerte e um validador. Não existe CLI nem ligação com processos ou bancos reais. A projeção INICIADA é usada somente para validar o registro T1/dados e a procedência; não muda o estado real nem cria autoridade.

Execução simulada exige autorização específica, plano autêntico não consumido e trava exclusiva. Revalida estado e dados após a trava; arquiva/verifica o estado recusado integral; publica somente a recuperação da fase, preservando controlador, supervisor, epoch, tickets consumidos, checkpoint, JWT e T1. Invalida o smoke e remove o selo antigo da posição ativa. Novo gate é obrigatório antes de qualquer liberação.

Após publicar, reconfirma autoridade e IPC sob HTTP 503. Falha conserva congelamento e retorna INCERTA, sem rollback de dados. O plano é consumido antes da tentativa; falha não admite retry automático. Repetição do mesmo resultado concluído é somente leitura, com verificação do hash final.

## Testes executados

```powershell
node --test --test-isolation=none tests/recuperacao-incerta-pos-t1.test.cjs
```

39 cenários aprovados; zero falhas ou skips. Somente a nova suíte foi executada. Fixtures existentes foram reutilizadas sem executar suas suítes anteriores. Os testes usam memória, identidades fictícias e snapshots fictícios; não iniciam servidor ou banco.

Cobertura: recuperação válida mantendo autoridade e HTTP 503; snapshot/selo/nonce inválidos; snapshot tardio; recusa após envio; envio incerto; múltiplas tentativas; evidência/plano expirados; futuro; divergências nos dados/adicionais; T1/checkpoint/diário inválidos; escritores/jobs; mudanças posteriores; concorrência local e entre executores; falta de autorização; falsificação por JSON; falha de arquivo; falha IPC; idempotência e rejeição dos adapters de autoridade/histórico/IPC.

## Conferência somente leitura dos artefatos reais

- Estado observado: INCERTA, SHA256 `07686101372a1db91d167ff78903aa0c90c65d38ee80e6f215bc34956e54e8e0`.
- Checkpoint e diário conferem com os hashes vinculados ao estado. T1 permanece CONCLUIDA/cleanupVerified=true. Isso verifica os artefatos; não substitui uma nova reconciliação de banco, que não foi executada nesta etapa.
- O selo real é legado, sem versão v2 e sem estadoOrigemSha256. Seu relatório e timestamp foram vinculados na investigação anterior. Não o promover a selo v2 recalculando hashes.
- A busca nos JSON de primeiro nível do diretório privado SupervisorCutover e de evidencias não localizou snapshot independente INICIADA do mesmo controlador e da mesma renovação. Essa busca não prova inexistência em outros arquivos/diretórios; o snapshot necessário ainda não está disponível para o gate.
- O controlador carregado não oferece diagnóstico IPC limitado para INCERTA nem este novo executor. Um processo externo não pode adotar seu IPC ou declarar-se dono.

## Procedimento operacional e bloqueios

1. Manter HTTP 503 e a sessão do controlador. Não enviar novamente status/liberar pelo canal que exige INICIADA, nem editar o estado manualmente.
2. Localizar o snapshot anterior independente e sua vinculação temporal/hash. Se indisponível, interromper este procedimento: será necessário preparar um critério alternativo formal, com reconciliação atual, lacuna explícita e aceite específico. Esta implementação não aceita automaticamente essa exceção nem trata reconstrução como evidência histórica.
3. Preparar e testar a integração selada do diagnóstico/recuperação com o dono legítimo, incluindo a autoridade e o IPC autênticos. Não usar flags ou recibos serializados como capacidades. Não presumir que o executor injetável de teste seja um adapter operacional já implantado.
4. Após essas condições e autorização, montar um novo pacote de implantação com manifestos próprios, preservando os manifestos anteriores e os 33 hashes operacionais. Usar somente o protocolo de admissão/substituição selada aprovado para esse estado, mantendo um único dono e HTTP 503. Não usar o roteiro FALHA para INCERTA ou o roteiro antigo que exige T1=false.
5. Com o executor legitimamente admitido, exigir nova evidência operacional, reconciliação atual completa e plano exclusivo de recuperação; arquivar o estado recusado e executar uma única recuperação. Revalidar IPC, autoridade, T1 e HTTP 503. Não liberar nessa operação.
6. Para liberação posterior, exigir autorização, novo smoke isolado e novo gate, sem reaproveitar o selo histórico. Executar a liberação oficial uma vez e testar imediatamente o HTTP normal. Diante de falha, bloquear novas escritas e preservar evidências; nunca repetir T1 ou aplicar rollback automático.

**Parecer:** validador e executor abstrato aprovados isoladamente. A recuperação real ainda NÃO está pronta para autorização operacional: faltam a evidência anterior independente e a integração/admissão legítima dos adapters para INCERTA. Nenhum controle foi relaxado para aceitar o estado real incompletamente comprovado.
