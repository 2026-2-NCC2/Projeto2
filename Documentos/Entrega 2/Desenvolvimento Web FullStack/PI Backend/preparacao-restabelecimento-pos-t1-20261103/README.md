# Restabelecimento pos-T1 preparado

**50 testes aprovados, zero falhas/SKIPs. Correcao apenas em copia isolada. Nenhum restabelecimento real, implantacao, smoke, banco ou T1 executado.** Os 27 hashes ativos continuam aprovados. Estado, diario, ambiente/JWT e checkpoint conservaram hashes.

## Causa

A lane de reboot existente exige ausencia de T1 e controleSelado. A ponte 503 tambem rejeita INICIADA com T1 registrada. O estado real tem T1 CONCLUIDA, limpeza validada e controle historico ATIVO, mas perdeu processos/contextos com o reinicio. Nao e correto apagar esse historico ou mudar a fase para reutilizar a lane antiga.

## Correcao e controles

A nova lane usa `--restabelecer-pos-t1-selado`, com autorizacao propria. A lane antiga permanece inalterada e continua recusando T1. A origem real atual passou no validador puro da nova lane; isso nao equivale a admissao operacional.

Reutilizados o protocolo de substituicao selada, bootstrap pausado, procedencia T1, validacao de diario/limpeza, reconciliacao de oito dominios/dez adicionais, verificadores nativos, gate IPC, tratamento de falhas e diagnostico objetivo ja preparados. Nao foram criados tickets alternativos nem relaxados os validadores de autoridade.

A nova prova exige reboot posterior ao relatorio, a conclusao da T1 e a criacao dos processos historicos. Exige ausencia nativa dos PIDs anteriores, candidato nascido depois do boot, porta livre e ausencia de escritores/jobs/clientes concorrentes. As verificacoes sao repetidas antes do fence. Nao fabrica resposta IPC de processos mortos nem reutiliza sua autoridade.

O diario e confrontado byte a byte com seu hash e registro original. Exige CONCLUIDA, cleanupVerified=true, unknownResult=false, retryCount=0, tres verificacoes/operacoes coerentes e ausencia dos IDs descartaveis. Catalogos, dados e relacionamentos sao comparados ao checkpoint; somente avancos de sequencias previstos pela T1 sao normalizados, sem alterar o banco.

O novo controle guarda os bytes completos do estado anterior em base64 e preserva seu hash. Conserva diario, historico de tickets consumidos, checkpoint, janela, fase INICIADA e configuracao. Incrementa epoch e emite tickets independentes, aleatorios, de uso unico e ate 30 segundos, vinculados a PID/pai/boot. Usa WeakSet/WeakMap genuinos ja existentes. Apenas as identidades ativas mudam apos admissao legitima; PID/instancia originais da T1 permanecem no diario.

Para reutilizar as capacidades/procedencia validadas, o registro usa modo IMPLANTACAO_POS_T1 com motivoOperacao RESTABELECIMENTO_POS_T1. Isso nao executa o fluxo antigo de implantacao: nao encerra nem substitui controladores vivos. Os dois PIDs antigos precisam estar ausentes. As provas nativas inicial/revalidada e seus hashes ficam preservados para auditoria.

Primeiro instala ponte exclusivamente 503, sem Express, .env ou bancos. Importa o backend novo sem porta, somente depois dos tickets genuinos. Encerra exclusivamente a propria ponte identificada, confirma porta livre e vincula 127.0.0.1:3001. O listener do supervisor continua em manutencao. Como no procedimento original, existe breve intervalo sem socket durante a troca; nenhum trafego normal e liberado.

Falhas antes do fence nao concedem autoridade. Depois do fence, revogam tickets/contextos proprios, preservam T1 concluida/limpa e mantem/procuram restabelecer somente a ponte conhecida. Listener desconhecido nao e encerrado. Locks abandonados nao sao removidos. Nao ha retry automatico, T1, limpeza repetida ou rollback.

O gate especifico exige novo IPC genuino, identidades atuais, tickets consumidos/inutilizados e outra leitura completa. Retorna HTTP 503 e newSmokeRequired=true. Nao aprova o gate final de liberacao. O smoke antigo e invalidado para o novo processo. A lacuna historica de escritas permanece reconhecida, sem ser convertida em prova positiva de continuidade.

Escopo: o estado atual, sem procedencia de readmissao anterior. Estado parcial/FALHA, processo anterior ainda vivo ou reboot subsequente sobre uma nova procedencia exigem analise propria; esta lane nao os promove automaticamente.

## Pacote e bytes

- Manifesto de admissao: `manifest-admissao.json`.
- SHA-256: `63db2f155e9fe8c3fb11f98615d1f2e960f01d5f8b2f8ef945fcab386d2e3bb4`.
- Patch: `restabelecimento-pos-t1.patch`.
- SHA-256: `620dc59e69452442cbb9b2667394388e922dd37f4be77977a0d62c730136652f`.
- Base em disco: `cc81e1b48a48c1ac9c4a01994bb63dec37c664e53afe06144276dbd6f0676e64`.
- Alvo futuro: `e8ca559e9852521be559643aa88de6ff4bb36f5b4c71920ab4e63ed21bee78da`.

Cinco arquivos de codigo diferem na copia: preflight novo, protocolo, runtime, ponte e CLI de reboot. Nenhum deles foi publicado. O manifesto cumulativo cobre os 27 anteriores e os tres arquivos adicionais dessa lane. Mantem manifestBefore igual ao codigo historicamente admitido; plano-implantacao distingue essa referencia da base atual em disco.

Fixtures alteradas e testes novos ficam somente na copia. Nao sao implantados. Os testes ativos incluidos no manifesto anterior conservam seus hashes originais.

Manifestos anteriores nao foram recalculados. Estendida somente a politica .gitattributes do backend para preservar bytes dos novos caminhos/pacote. Nao alterada configuracao global. A copia nao contem .env ou credenciais. O patch passou em git apply --check, sem aplicacao real.

## Proxima operacao, somente mediante autorizacao

1. Conferir selo SHA-256 da preparacao e todos os arquivos. Revalidar processos, MySQL, listener/porta, reboot, checkpoint e diario. Ausencia de processo por PID antigo isoladamente nao constitui identidade atual.
2. Autorizar a publicacao dos cinco arquivos aprovados. Conferir hashes de base. Usar a raiz Projeto2 e `git -c core.autocrlf=false apply --directory="Documentos/Entrega 2/Desenvolvimento Web FullStack" <PATCH>`. O parametro vale somente para esse comando; nao muda configuracoes persistidas. Antes usar --check. Conferir todos os hashes-alvo e o manifesto completo depois. Qualquer divergencia interrompe; nao recalcular o selo nem reaplicar pacote antigo.
3. Somente depois de autorizacao operacional, abrir sessao persistente com stdin/stdout herdados, usando a entrada absoluta oficial, nao o caminho dentro de candidato:

```text
node "<PI_BACKEND>\scripts\restabelecer-controlador-apos-reinicio.cjs" --restabelecer-pos-t1-selado --autorizar-restabelecimento-pos-t1 --aceitar-lacuna-historica --autorizacao "<REFERENCIA_NAO_SECRETA>" --pacote "<PREPARACAO>\manifest-admissao.json" --pacote-sha256 63db2f155e9fe8c3fb11f98615d1f2e960f01d5f8b2f8ef945fcab386d2e3bb4
```

4. Conservar essa sessao. Exigir RESTABELECIMENTO_POS_T1_APROVADO, gate especifico, IPC novo, novas identidades, autoridade exclusiva e 503. Enviar somente status com UUID inedito para verificar continuidade. Nao fechar stdin, destacar processo ou reutilizar tickets. Em falha, guardar etapa/codigo/arquivo/linha e parar.
5. Smoke novo, nova implantacao, T1 e liberacao permanecem separados. Este procedimento nao os executa. Nao precisa repetir backups, delta, JWT ou escritas de homologacao. As reconciliacoes READ ONLY internas continuam obrigatorias para evidencias recentes.

## Testes isolados

45 novos e cinco regressoes selecionadas, total 50. Incluem inicio selado/503, diario e checkpoint adulterados, limpeza ausente, PID reutilizado/presente, boot/provas vencidos, dados divergentes, adicional alterado, TLS, tickets invalidos/expirados/consumidos, plano copiado, dois candidatos, ACK incorreto, falhas em cada etapa, perda de canal e recibo IPC fabricado. Simulacoes nao acessam bancos, processos ou sockets reais; usam as fixtures existentes e preload de isolamento. A CLI tambem foi testada quanto ao diagnostico antes de IO privado.

Comandos desde candidato:

```powershell
node --require ../../preparacao-retomada-status-20261102/tests/isolamento-sem-efeitos.cjs --test --test-isolation=none tests/reinicio-pos-t1.test.cjs tests/runtime-reinicio-pos-t1.test.cjs
node --require ../../preparacao-retomada-status-20261102/tests/isolamento-sem-efeitos.cjs --test --test-isolation=none --test-name-pattern="implantacao pos T1 preserva|planos expirados copiados|candidatos concorrentes|INCERTA T1 ou controle existente|ponte 503 T1 registrada" tests/implantacao-pos-t1.test.cjs tests/admissao-apos-reinicio.test.cjs
```

Nenhuma suite completa anterior foi repetida. Resultado: `resultado-preparacao.json`. **Pronto para autorizacao da publicacao e do restabelecimento controlado, condicionado aos controles reais recentes. Nenhuma recuperacao operacional foi executada nesta preparacao.**
