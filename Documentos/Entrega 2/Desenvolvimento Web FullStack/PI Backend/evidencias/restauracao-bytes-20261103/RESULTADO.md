# Bytes selados restaurados

Somente `scripts/substituir-controlador-selado.cjs` sofreu conversao. Git acrescentou 30 bytes CR, alterando LF para CRLF. Foram restaurados exatamente os 4.386 bytes do candidato validado, com comparacao previa do selo, manifesto, fonte e destino. A substituicao usou temporario exclusivo, flush e publicacao na mesma pasta.

**27/27 hashes aprovados contra o manifesto imutavel do pacote autorizado** `preparacao-integracao-retomada-20261103/manifest-alteracoes.json`, SHA-256 `79dbdba60a38ef83fa9013ec429cc3f916eda0ef3b7b32d8ccee2ae3ab648179`. Nao se alterou manifesto nem hash esperado. O verificador original retornou APLICADO_NAO_REAPLICAR. O manifesto antigo anterior ao diagnostico continua preservado, sem confundir suas referencias com o pacote autorizado atual.

Criado `PI Backend/.gitattributes`: `-text` nos 27 arquivos e nas quatro pastas dos pacotes selados relacionados. Isso impede conversao automatica do Git e preserva tanto LF quanto CRLF quando fizerem parte dos bytes originalmente selados. Nenhuma configuracao global ou de sistema foi alterada. Nao houve renormalizacao em massa, git add ou commit.

Tres testes especificos passaram, zero falhas: atributos dos 27 arquivos e pacote; git apply em repositorio ficticio com autocrlf=true preservando o hash LF exato; hash-object preservando uma fixture originalmente CRLF. Nenhum commit foi criado no teste. A fixture foi removida exclusivamente dentro da pasta verificada. Suites anteriores nao foram repetidas.

Comparacao antes/depois de 492 arquivos versionados/nao ignorados do backend: somente o CLI esperado mudou; nenhum arquivo anterior foi excluido. Adicoes restritas a .gitattributes e evidencias/teste desta tarefa. Ambiente/JWT, estado, diario T1 e checkpoint conservaram seus hashes. Os pacotes selados permaneceram intactos. Nenhum acesso a banco, modificacao de dados/backups, rollback ou admissao.

## Bloqueio operacional atual

A verificacao nativa somente leitura confirmou **porta 3001 sem listener**, sem os antigos processos 25144 e 15788. Nao foi possivel confirmar HTTP 503. Nenhum processo foi iniciado, encerrado ou admitido nesta tarefa; nenhuma manutencao foi retirada.

Os arquivos estao prontos, mas **a admissao nao esta operacionalmente pronta**. E necessario restabelecer legitimamente os processos e a manutencao, mediante autorizacao especifica, e revalidar IPC, escritores e evidencias recentes. Nao iniciar servidor normal ou adotar processos para contornar essa ausencia.

Evidencia estruturada: [resultado.json](resultado.json). Teste: [lf-crlf.test.ps1](lf-crlf.test.ps1).
