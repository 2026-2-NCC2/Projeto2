# Arquivo historico do TrocaTicket

Organizacao conservadora: somente os tres relatorios intermediarios abaixo foram movidos. Nao havia referencias de entrada aos seus nomes nos fontes, testes, documentacao ou evidencias pesquisados. Seus links para evidencias foram ajustados; as evidencias permaneceram no local original.

- [Readmissao canonica](relatorios/RESULTADO_READMISSAO_CANONICA_20261103.md)
- [Readmissao pos-T1](relatorios/RESULTADO_READMISSAO_POS_T1_REAL_20261103.md)
- [Restabelecimento pos-T1](relatorios/RESULTADO_RESTABELECIMENTO_POS_T1_20261103.md)

Origem dos tres arquivos: `PI Backend/`. Resultados finais, contratos, seguranca, schemas, RPCs, scripts, manifestos e evidencias continuam nos caminhos anteriores.

As pastas `PI Backend/preparacao-*` foram mantidas porque contem codigo copiado, caminhos relativos e manifestos. Outros relatorios citados nos inventarios historicos tambem foram mantidos. Essas preparacoes, node_modules e dist ficam ocultos somente no Explorer do VS Code pela configuracao `.vscode/settings.json`; Git e execucao nao foram configurados de outra forma.

Removidos: build regeneravel `PI React/dist/` e os dois logs stderr vazios `controlador-restabelecimento-20261101.stderr.log` e `recuperacao-smoke-selado-20261101.stderr.log` em `PI Backend/evidencias/`.

Todos os assets foram preservados: a validacao visual independente permanece indisponivel pela protecao do navegador. Nenhum banco, JWT, checkpoint ou backup foi alterado.
