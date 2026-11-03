# Status atomico e sequenciamento corrigidos

**72 cenarios novos aprovados; zero falhas. Retomada preparada para autorizacao operacional. Nenhuma nova implantacao ou admissao executada.**

Causa reproduzida: o binder do PowerShell 5.1 converteu o argumento $null de File.Replace em string vazia, gerando caminho de backup invalido. NullString.Value passou null CLR real e resolveu a substituicao em arquivos descartaveis, sem backup ou mudanca de politica global.

O lancamento indevido ocorreu porque a orquestracao ignorou exit_code=1. O novo invólucro externo exige sucesso explicito de publicacao, leitura posterior, ACL, estado e revalidacao antes de chamar o CLI oficial. Falha ou retorno ambiguo impede a chamada. Uma reserva exclusiva impede dois lancadores concorrentes.

Atualizacao usa temporario privado no mesmo volume, flush, lock exclusivo, comparacao de hash e rename/Replace atomico, sem truncamento ou rollback. Reconhece repeticao identica sem regravar; recusa expiracao, replay alterado, CAS divergente e locks alheios.

Verificacao real somente leitura aprovada: APLICADO_AGUARDANDO_ADMISSAO, 27 hashes finais conferidos, controlador 25144/supervisor 15788 com identidades preservadas e HTTP 503. O patch nao precisa ser reaplicado. Diario T1, estado privado, JWT e checkpoint conservaram seus hashes. Nenhum dos 27 arquivos foi modificado.

Os novos helpers ficam fora do manifesto executavel existente. O modo padrao e Verificar; a retomada exige Modo Retomar, flag explicita, referencia e hash do pacote. A entrada foi testada com efeitos falsos; apenas Verificar foi executado contra os processos atuais.

Ainda sera necessario recolher observacao IPC verdadeira e recente, validar escritores e reconciliar os dados na operacao autorizada. Os bancos nao foram acessados nesta preparacao. A lacuna historica permanece registrada. A correcao nao retira manutencao nem executa smoke/liberacao automaticamente.

[Procedimento operacional e evidencias](preparacao-retomada-status-20261102/README.md).
