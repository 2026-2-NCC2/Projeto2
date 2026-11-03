# Interrompida antes da admissao

Controlador 25144 e supervisor 15788 revalidados. Criacao, parentesco, entrada e listener correspondem. IPC genuino confirmado antes/depois. HTTP 503 confirmado depois da interrupcao.

O primeiro precheck encontrou restricao WMI do sandbox. Reexecutado exclusivamente em leitura com permissao nativa, passou. Nenhuma restricao Windows ou politica global foi alterada.

Selo e 27 hashes iniciais aprovados. Oito dominios reconciliados em READ ONLY. Hashes completos permaneceram iguais ao checkpoint aprovado. Identidades, relacionamentos, catalogos, T1 concluida/limpa e dez adicionais preservados. Escritores/clientes/jobs concorrentes nao autorizados ausentes. TLS e integridade dos backups existentes conferidos. A lacuna historica continua nao comprovada; os controles atuais nao constituem lock global.

Foi aplicado somente o delta autorizado do CLI diagnostico. Git apply retornou zero. Contudo, a verificacao posterior recusou PACOTE_DISCO_DIVERGENTE. O snapshot alvo tambem recusou. Nenhum CLI de admissao foi iniciado.

## Causa comprovada desta interrupcao

`core.autocrlf=true`, sem atributo eol especifico para o arquivo. Git converteu as 30 linhas LF em CRLF. O candidato selado tem 4.386 bytes; o publicado tem 4.416. Normalizados somente os finais de linha, os conteudos sao identicos.

- Hash publicado: `11da7ca7308eafd4b26575e9c4b63ce37b9781e5ed09aacaa6ec04d774556c17`.
- Hash exigido: `9a69ecd0bb42678911909192f8c1e054dcdec56e8cea73d147259166fbb389db`.
- Manifesto atual: `bb2f4f558fc44f03df9e5065b1237fca9b55fc115d26096ccd2d8e2bf3ca9275`.
- Manifesto exigido: `cc81e1b48a48c1ac9c4a01994bb63dec37c664e53afe06144276dbd6f0676e64`.

Essa e a causa exata da recusa **pos-publicacao atual**, nao da recusa interna historica. A causa historica continua sem registro conclusivo. Nesta operacao houve zero tentativas de admissao; portanto nao existe nova recusa interna do supervisor para atribuir.

## Preservacao e pendencia

26 arquivos protegidos continuam identicos. Somente o CLI autorizado foi publicado, com a divergencia de finais de linha descrita. O processo antigo conserva seu codigo carregado. Nao houve hot reload, fence, ticket novo, substituicao ou nova autoridade. Estado, ambiente/JWT, diario T1 e checkpoint permaneceram byte a byte iguais. Nenhum backup ou dado foi alterado. Nenhuma publicacao privada de status. Sem T1, rollback, retirada do 503 ou commits.

Operacao interrompida, sem corrigir automaticamente o arquivo, alterar o selo ou repetir tentativa. Pende autorizacao para publicar exatamente os bytes selados do unico CLI, conferir o alvo completo e revalidar evidencias antes de nova decisao operacional. Nao mudar a configuracao global do Git nem aceitar hash normalizado como substituto do hash exato.

Nao foram repetidas suites aprovadas. Foram executadas as verificacoes operacionais descritas, incluindo reconciliacao atual, selo/hashes, aplicacao unica e verificacao posterior. Os 22 testes isolados anteriores continuam historicos; nao sao apresentados como nova aprovacao operacional.

Evidencias: [precheck](evidencias/precheck-integracao-1793679062237.json), [resultado estruturado](evidencias/retomada-integracao-interrompida-20261103.json).

**Manutencao preservada. Admissao nao executada.**
