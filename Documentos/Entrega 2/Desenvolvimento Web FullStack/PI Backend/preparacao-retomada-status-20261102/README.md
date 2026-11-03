# Correcao do status atomico e da retomada

**72 cenarios novos aprovados, zero falhas. Retomada preparada para autorizacao operacional. Nenhuma publicacao real, admissao, smoke final, escrita em banco ou liberacao executada.**

Os arquivos desta correcao ficam nesta pasta externa aos diretorios do manifesto executavel. **Nenhum dos 27 arquivos ja aplicados foi alterado.** O pacote anterior permanece exatamente com SHA-256 f1bb2c679d5b040187ccdad6cecbb469cf82c897ed23fb7e985821aa83c00943.

## Causas comprovadas

No Windows PowerShell 5.1.26100.9711, a chamada `[IO.File]::Replace(origem,destino,$null)` converte o terceiro argumento para uma string vazia. Esse argumento representa o caminho opcional da copia anterior; string vazia e um caminho invalido. O resultado e System.ArgumentException antes da substituicao.

A reproducao usou arquivos ficticios no mesmo volume, sem tocar no diretorio privado real. A conversao para string apresentou IsNull=false e Length=0. A chamada com `[System.Management.Automation.Language.NullString]::Value` passou **null CLR real** e substituiu o arquivo corretamente, com as mesmas permissoes. Nao foi necessario criar backup de status ou alterar politicas globais.

O segundo problema estava na orquestracao: a ferramenta retornou exit_code=1, mas esse retorno nao gerou uma excecao JavaScript automaticamente. A etapa dependente foi chamada sem conferir o codigo. O CLI oficial recusou a admissao; ele nao foi a origem desse erro de sequenciamento.

## Correcao da publicacao

`status-atomico.ps1` recebe somente uma observacao real ja coletada no canal privado. Exige os seis campos originais: pedido, ok, controllerPid, supervisorPid, nonce e verificadoEm. Recusa campos extras, identificadores diferentes, horarios futuros, observacoes vencidas e JSON/BOM invalidos. Nao inventa nonce, pedido ou horario; nao prolonga a validade de 30 segundos.

A publicacao exige:

1. Diretorio privado e destino dentro dele, sem reparse points. Owner do usuario Windows atual, acesso permitido somente a esse usuario e SYSTEM. O estado pode herdar a ACL privada; sua ACL nao e modificada.
2. Hash esperado do estado original e comparacao SHA-256 do destino atual. Concorrencia usa arquivo CreateNew com FileShare.None; nao se toma ou remove lock preexistente.
3. Temporario exclusivo, na mesma pasta/volume, com ACL privada desde a criacao. Bytes UTF8 sem BOM, WriteThrough e Flush(true), hash e ACL conferidos antes do commit.
4. Nova verificacao do estado, prazo e hash do destino imediatamente antes do commit. Para substituir, usa File.Replace com NullString.Value; para criar destino ausente, rename exclusivo. Nao usa truncamento do destino, copia como fallback ou restauracao automatica.
5. Leitura posterior dos bytes, hash, ACL, estado e validade. Somente depois dessa confirmacao retorna ok=true e exit_code=0. A confirmacao e repetida pelo coordenador depois da revalidacao e imediatamente antes de invocar o CLI.

Publicadores cooperativos ficam serializados pelo lock. Um segundo escritor com hash esperado antigo e recusado, mesmo depois de liberar o lock. A repeticao dos mesmos bytes, ainda validos, pode ser reconhecida sem regravar o destino. Um pedido/nonce igual com horario alterado nao autoriza nova publicacao.

Falha antes do commit deixa o destino anterior intacto. Se houver interrupcao depois do commit, pode existir o arquivo novo completo, mas nao ha confirmacao positiva nem inicio do CLI. A retomada exige verificacao explicita; nao faz rollback do status nem retry automatico. Temporarios e locks removidos normalmente sao apenas os criados pela propria chamada. Artefatos orfaos ou de outro dono nao sao apagados automaticamente.

Essa protecao cobre concorrencia entre os publicadores que usam o protocolo. Nao promete impedir adulteracao por um operador privilegiado que ignore o lock. A observacao do canal antigo continua sendo evidencia operacional; nao vira uma capacidade de admissao ou um recibo WeakMap.

## Sequenciamento e estado parcialmente aplicado

`retomar-operacional.ps1` e o unico ponto de entrada para a futura retomada. O padrao e **Modo Verificar**. Esse modo retorna antes de qualquer publicacao ou coordenacao e recusa a flag de autorizacao conflitante. Retomar exige simultaneamente Modo Retomar, AutorizarRetomada, referencia e SHA-256 da correcao.

O coordenador exige sucesso explicito de cada etapa: objeto unico, ok booleano true e exit_code inteiro zero. Excecao, resultado ausente/ambiguo, codigo diferente de zero ou confirmacao divergente interrompem a sequencia. Nao existe uma segunda chamada independente ao CLI depois de uma falha do helper.

Antes da publicacao ele adquire uma reserva exclusiva de retomada. A reserva impede dois coordenadores de iniciar candidatos simultaneamente. Permanece pertencendo ao invocador durante o processo em primeiro plano; nao e o lock de migracao nem permite remover locks antigos. O CLI oficial mantem suas proprias travas e gates.

O snapshot somente leitura confere os 27 hashes, o manifesto executavel completo, o pacote anterior, estado, diario, .env e checkpoint. Identidades nativas, criacao, parentesco, entrada e listener exclusivo/HTTP 503 tambem sao conferidos.

- APLICADO_AGUARDANDO_ADMISSAO: todos os arquivos ja tem os hashes finais; estado original INICIADA/ATIVO, congelado/selado, T1 concluida/limpa e dono antigo preservados. Prosseguir somente com autorizacao e observacao nova. **Nao aplicar patch novamente.**
- JA_ADMITIDO_NAO_RELANCAR: nao publica nem inicia outro candidato. Essa classificacao nao e aprovacao de autoridade IPC ou gate final; exige validacao pelo canal privado do dono corrente.
- Mistura de arquivos antigos/novos, hash diferente, fase incorreta, diario divergente, T1 incerta ou lock oficial pendente: interromper. Nao reparar arquivos, editar estado, iniciar processo adicional ou usar uma lane legada como fallback.

Depois de publicar, recolhe outro snapshot e compara estado/manifesto com os anteriores. Confere o recibo novamente. Somente entao chama uma unica vez o CLI oficial aprovado. Se esse processo falhar, conserva evidencias e termina; nao tenta outro candidato, smoke, T1 ou liberacao.

## Procedimento futuro autorizado

Manifesto desta correcao: manifest-correcao.json. SHA-256 aprovado:

**43ba0c318f92caee38d3ec38b41ff33057ec10525052935960324fde85074a33**

Conferir esse hash e os seis arquivos listados antes de executar a entrada. Nao alterar os 27 arquivos aplicados nem os manifestos anteriores para fazer verificacoes passarem.

### Somente verificar

Esta chamada foi executada nesta preparacao, com leitura de arquivos/identidades e GET publico 503, sem bancos ou mutacoes:

```powershell
powershell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "<CORRECAO>\retomar-operacional.ps1" -Modo Verificar
```

O resultado real foi APLICADO_AGUARDANDO_ADMISSAO, hashesVerified=27 e patchApplyRequired=false. Controlador 25144 e supervisor 15788 continuaram com as criacoes/parentescos esperados. Esses PIDs nao substituem uma revalidacao futura.

A revisao automatica inicialmente recusou uma chamada da entrada por risco de retomada/admissao. A fonte foi conferida, os ramos foram testados e o modo somente leitura ficou explicito. Uma nova avaliacao autorizou Modo Verificar, que foi executado sem contornar o bloqueio. Nao houve execucao do modo Retomar.

### Coletar uma observacao verdadeira

Na retomada autorizada, conferir controle dos escritores, identidades atuais, manutencao e o canal privado original ainda aberto. Enviar um pedido status com UUID inedito ao controlador legitimo. Salvar **a resposta real**, sem ANSI/eco do comando, como JSON UTF8 sem BOM, num arquivo novo no diretorio privado do supervisor. ACL protegida para usuario atual e SYSTEM. Nenhuma senha ou JWT deve entrar nesse arquivo.

Nao usar o status expirado ou o temporario deixado pela tentativa anterior. Nao editar verificadoEm ou nonce. O destino de publicacao pode continuar sendo o arquivo status-origem-implantacao-20261102-628b6c88.json; a observacao de entrada deve ser outro arquivo.

### Retomar sem reaplicar o patch

Somente depois de nova autorizacao operacional, usar uma sessao privada persistente com stdin/stdout herdados:

```text
powershell -NoProfile -ExecutionPolicy RemoteSigned -File "<CORRECAO>\retomar-operacional.ps1" -Modo Retomar -AutorizarRetomada -CorrecaoSha256 43ba0c318f92caee38d3ec38b41ff33057ec10525052935960324fde85074a33 -ObservacaoFile "<PRIVADO>\observacao-origem-<UUID>.json" -StatusFile "<PRIVADO>\status-origem-implantacao-20261102-628b6c88.json" -ReferenciaAutorizacao "<REFERENCIA_NAO_SECRETA>"
```

Os marcadores devem ser resolvidos localmente. Nao destacar o controlador nem fechar a sessao. O recibo STATUS_VERIFICADO_ANTES_DO_LANCADOR e apenas uma confirmacao de metadados, **nao uma admissao aprovada**. Aguardar o resultado oficial e a verificacao do novo IPC.

Se o candidato precisar de observacoes mais recentes durante seu preflight READ ONLY, coletar outra resposta verdadeira pelo canal antigo. Usar o publicador abaixo; ele nao inicia Node, nao admite processos e nao interfere no inventario do candidato. O hash esperado vem do ultimo recibo confirmado ou de uma leitura atual do destino:

```text
powershell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "<CORRECAO>\publicar-status.ps1" -AutorizarPublicacao -CorrecaoSha256 43ba0c318f92caee38d3ec38b41ff33057ec10525052935960324fde85074a33 -ObservacaoFile "<PRIVADO>\observacao-origem-<OUTRO_UUID>.json" -StatusFile "<PRIVADO>\status-origem-implantacao-20261102-628b6c88.json" -ExpectedDestinationHash "<HASH_ATUAL_CONFIRMADO>"
```

Um unico operador/publicador deve coordenar essas observacoes. Lock ocupado, CAS divergente, dado expirado ou resultado incerto exigem parar e analisar, sem tentar outro hash automaticamente. Quando o fence legitimo alterar o estado, o publicador recusa o estado antigo; parar de atualizar a origem antiga. Nao fechar o canal antigo antecipadamente para provocar a substituicao.

A admissao oficial continua exigindo evidencias recentes, escritores sob controle e reconciliacao atual dos oito dominios/dez adicionais. Depois dela, renovacao do smoke, novo gate e eventual liberacao continuam sendo etapas separadas/autorizadas. Este invólucro nao as executa. Nao repetir T1, limpeza, delta, backups ou rotacao JWT.

## Testes e limites da preparacao

**43 cenarios reais de filesystem/concorrencia e sequenciamento isolados; oito ramos da entrada com efeitos externos falsos; 21 classificacoes puras Node. Total 72, zero falhas/SKIPs.**

Os testes de filesystem usaram exclusivamente arquivos ficticios dentro desta pasta. Validaram atomicidade, ACL, UTF8, lock entre runspaces, CAS, interrupcoes antes/depois do commit, recibos invalidos, status vencido, replay, estado alterado e reserva exclusiva de lancamento. Os testes da entrada nunca iniciaram o CLI ou consultaram processos reais. O preload Node proibe sockets, subprocessos e arquivos privados; somente a classificacao pura foi executada nele.

Comandos dos testes, nesta pasta:

```powershell
powershell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File tests/status-atomico.test.ps1
powershell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File tests/entrada-segura.test.ps1
node --require ./tests/isolamento-sem-efeitos.cjs --test --test-isolation=none tests/snapshot-retomada.test.cjs
powershell -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File tests/verificar-pacote.ps1
```

RemoteSigned foi usado somente no processo filho. Nenhuma politica global foi alterada, nem se solicitou Unrestricted ou privilegios de auditoria. As alteracoes de ACL dos testes ocorreram somente nos arquivos ficticios; a publicacao real nao foi testada no diretorio privado.

Os 306 testes anteriores nao foram repetidos. Os oito dominios/dez adicionais nao foram novamente consultados nesta tarefa: a verificacao real atual dos bancos permanece obrigatoria na retomada. A lacuna historica continua reconhecida, sem prova positiva de ausencia de escritas historicas.

Evidencias: [manifesto](manifest-correcao.json), [resultado](resultado-preparacao.json), [filesystem/sequencia](resultado-status.txt), [entrada](resultado-entrada.txt), [Node](resultado-node.tap), [verificacao somente leitura](verificacao-somente-leitura.json).

**Correcao pronta para autorizacao da retomada. Par antigo e manutencao preservados. Sem admissao, smoke final, publicacao real, escrita em banco, rollback ou commit.**
