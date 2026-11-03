# Implantacao selada da renovacao pos T1

**Preparacao concluida: 296 testes Node e dez cenarios PowerShell com primitivas falsas; 306 aprovados, zero falhas ou SKIPs. Pronto para autorizacao operacional condicionada aos controles abaixo. Nenhuma implantacao, renovacao real, escrita de dados ou liberacao executada.**

Este pacote e cumulativo sobre o backend atualmente admitido. Inclui a renovacao anterior, validada em 161 testes, e a admissao compativel com T1 concluida. Nao aplicar primeiro o patch anterior e depois este. Os manifestos anteriores foram preservados como evidencia historica.

## Incompatibilidades resolvidas

Existiam quatro impedimentos independentes:

- O preflight de substituicao e a admissao de autoridade exigiam ausencia de T1.
- O fence PowerShell de encerramento tambem rejeitava qualquer T1.
- O diario aprovado vinculava a execucao ao PID/instancia originais; a troca do supervisor nao podia reescrever essa procedencia.
- A perda de entrada/IPC podia marcar ate uma T1 concluida como INTERROMPIDA no estado, divergindo do diario original.

Foram mantidas as lanes anteriores, inclusive suas recusas a uma substituicao T1 pelo procedimento legado. A nova lane exige autorizacao especifica e evidencia completa de T1 concluida/limpa. A primeira T1 da lane anterior continua funcionando sem exigir procedencia de uma substituicao que ainda nao aconteceu.

## Procedencia e evidencia preservadas

O diario permanece byte a byte, com seus IDs, PID/instancia de execucao, operacoes, hashes, tres provas e limpeza. Nenhum campo artificial e adicionado ao diario. A fase permanece INICIADA; checkpoint, JWT, backups e os dez adicionais nao sao alterados.

O novo registro de admissao guarda uma copia base64 **dos bytes originais do estado anterior completo**, vinculada por SHA-256. Inclui o controle anterior, todos os tickets consumidos e todas as referencias de evidencias. O conteudo T1 desse arquivo precisa coincidir integralmente com a T1 corrente. Nenhum arquivo de evidencia anterior e sobrescrito.

Uma procedencia separada registra controlador/supervisor originais, janela, checkpoint, configuracao, hash do diario, hash do estado anterior, manifestos anterior/novo, autorizacao e hashes dos dados reconciliados. O novo destino e vinculado depois de conhecido seu PID/pai/boot, sem alterar a origem da T1.

Essa procedencia e vinculada aos contextos autenticos produzidos pelo consumo de novos tickets. JSON, PID observado, contagens iguais ou um campo T1=false nao substituem admissao legitima. O gate final aceita o diario de origem somente quando a procedencia, a autoridade corrente, o novo IPC genuino e a reconciliacao atual forem validos.

## Autoridade e sequencia controlada

1. Candidato instala stdin privado antes da admissao, sem autoridade nem listener. Confere codigo aprovado, estado, identidades nativas, observacao recente do canal antigo, escritores, backups existentes, diario e reconciliacao completa dos oito dominios.
2. Consome um plano opaco de uso unico dentro da janela valida. Adquire o lock exclusivo e repete o preflight atual antes de qualquer parada. Falha antes do fence nao concede autoridade ao candidato.
3. Persiste o fence com nova identidade/epoch de controle e a evidencia anterior intacta. O contexto antigo deixa de ser valido; o novo ainda nao foi admitido. Nao existe sobreposicao de autoridade.
4. Encerra exclusivamente o supervisor antigo identificado; comprova sua saida antes de encerrar o controlador antigo identificado. O callback compilado do controlador antigo ja verifica o PID do dono corrente: apos esse fence ele retorna sem tocar na T1. A entrada antiga precisa permanecer aberta ate a parada planejada.
5. Confirma ausencia dos anteriores, instala uma ponte 503 conhecida e faz nova reconciliacao READ ONLY, com diario e catalogos conferidos. Divergencias interrompem a admissao.
6. Emite tickets novos, separados e de uso unico para controlador e supervisor. Prazo maximo de 30 segundos, vinculados a PID/pai/boot/epoch. Conserva os hashes consumidos anteriores. Leitura pos-parada precisa continuar recente.
7. Admite o candidato e seu filho real, inicialmente sem porta. Reconfere o diario antes de cada admissao. O startup protegido reconhece esse contexto Supabase; nao usa a configuracao MySQL como alternativa.
8. Encerra somente a ponte identificada, confirma porta livre, vincula o supervisor legitimo em 127.0.0.1:3001 e confirma status/IPC de ida e volta. A saida e CONTROLE_SELADO_ATIVO, com smokeNovoObrigatorio=true; HTTP continua 503.

O fence nativo confere identidade duas vezes e preserva handle do processo alvo. Para T1, exige tambem validacao somente leitura em Node do diario/procedencia/configuracao. Confere o hash do estado inicial, depois do validador e imediatamente antes do encerramento. Leitura explicita UTF8 preserva hashes de estados com caracteres acentuados. Processos desconhecidos nao sao encerrados.

Os novos handlers de perda de controle revogam a autoridade, mantendo a manutencao, mas nao convertem uma T1 comprovadamente concluida/limpa em uma nova operacao incerta. T1 incompleta continua seguindo as recusas anteriores. Nao ha retry de escrita, limpeza repetida ou rollback automatico.

## Limites importantes

**A substituicao e do par, nao uma transferencia transparente da conexao IPC.** Ha um intervalo controlado sem IPC entre a saida do par antigo e a admissao do novo. Nesse intervalo nenhuma autoridade pode operar. A continuidade e comprovada antes/depois por identidades, estado preservado, ausencia dos anteriores e novo IPC real.

A troca exclusiva de sockets pode provocar breve ECONNREFUSED enquanto se troca o listener pela ponte e depois pelo supervisor. Os listeners ativos respondem 503; nunca se abre trafego normal. Se a exigencia operacional for resposta 503 sem qualquer interrupcao de socket, este procedimento nao satisfaz essa exigencia: interromper e planejar uma arquitetura apropriada antes de executar.

O arquivo de status antigo e uma **observacao operacional fornecida pelo operador pelo canal privado existente**, nao uma prova criptografica de continuidade nem uma capacidade de admissao. Nao e convertido em recibo WeakMap. Sua confianca depende da coleta real nesse canal, identidade nativa, prazo de 30 segundos e controle do operador local. Os novos tickets, contextos e recibos IPC sao obtidos legitimamente no novo par.

A lacuna historica de escritas paralelas continua nao comprovada. O aceite anterior permanece; nao e transformado em prova historica positiva. As verificacoes atuais de escritores constituem controle operacional, sem lock global imposto pelos bancos.

Perda inesperada do par antigo antes do fence, reboot, queda do operador, evidencia invalida ou falha depois do fence exigem interrupcao e analise. A nova lane nao adota candidatos orfaos e nao oferece retomada automatica de uma implantacao pos-T1 parcialmente concluida. Nao usar a lane legada de recuperacao para contornar essa recusa.

## Procedimento futuro: somente com autorizacao

### 1. Conferir as condicoes reais

Revalidar os PIDs atuais por entrada completa, criacao e parentesco; listener unico; status pelo mesmo stdin persistente do controlador; ausencia de escritor nao autorizado, jobs/clientes e sessoes concorrentes. Conferir T1 CONCLUIDA, limpeza, diario, checkpoint/configuracao e manifestos. Nenhum PID/documento antigo constitui prova atual.

Guardar os resultados operacionais sem segredos. O status deve vir de um pedido novo, realmente enviado ao controlador atual:

```json
{"acao":"status","pedido":"<UUID_INEDITO>"}
```

Somente a resposta verdadeira, ok=true, do canal existente pode ser usada. Nao inventar nonce, pedido ou horario. Salvar a resposta em arquivo novo dentro do diretorio privado do supervisor, fora do Git, com UTF8 sem BOM e ACL privada existente. Nao incluir JWT, senha ou conteudo do .env. A coleta pode precisar ser renovada legitimamente enquanto as leituras do candidato ocorrem; se vencer, interromper em vez de editar verificadoEm.

### 2. Verificar e aplicar o pacote autorizado em disco

Este pacote ainda NAO esta aplicado. Conferir hashes de origem e SHA-256 do pacote/patch. O manifesto anterior calculado deve coincidir com o admitido no estado atual. O manifesto novo deve corresponder exatamente ao codigo revisado.

- Manifesto/pacote: manifest-alteracoes.json.
- SHA-256 do pacote: **f1bb2c679d5b040187ccdad6cecbb469cf82c897ed23fb7e985821aa83c00943**.
- Patch cumulativo: alteracoes-implantacao-pos-t1.patch.
- SHA-256 do patch: **aec96b064c03873b9204e75e27250b428162a92acd53e983012ff3533a311269**.

Executar Git na raiz Projeto2 e verificar o patch com --directory="Documentos/Entrega 2/Desenvolvimento Web FullStack/". Executar a verificacao no subdiretorio sem esse tratamento pode ignorar todos os hunks e produzir um falso sucesso. A aplicacao real exige autorizacao e manutencao confirmada; nao foi feita nesta preparacao.

A aplicacao em disco acontece sob 503 e controle dos escritores, antes de iniciar o candidato atualizado. Nao e hot reload ou injecao: o codigo ja carregado no par antigo continua igual. Nao atualizar manualmente seu manifesto admitido. Operacoes antigas que conferem o manifesto passam a recusar a divergencia; o status somente leitura do canal existente deve continuar disponivel ate o fence. Nao invocar operacoes antigas de T1, smoke ou liberacao durante essa janela.

Se houver aplicacao parcial, hash divergente, perda do status ou qualquer resultado incerto, manter manutencao e parar. Nao restaurar codigo/dados automaticamente, nao reiniciar o par por conveniencia e nao alterar metadados para fazer o manifesto coincidir.

### 3. Iniciar o candidato atualizado

Usar entrada absoluta oficial, uma sessao privada persistente com stdin/stdout herdados e a configuracao .env existente. Nao destacar o controlador, fechar stdin ou iniciar servidor normal separado.

```text
node "<PI_BACKEND>\scripts\substituir-controlador-selado.cjs" --implantar-correcao-pos-t1-selada --autorizar-implantacao-pos-t1 --pacote "<PREPARACAO>\manifest-alteracoes.json" --pacote-sha256 f1bb2c679d5b040187ccdad6cecbb469cf82c897ed23fb7e985821aa83c00943 --status-origem "<DIRETORIO_PRIVADO>\status-origem-<UUID>.json" --autorizacao "<REFERENCIA_NAO_SECRETA>"
```

Os marcadores de caminho devem ser resolvidos localmente. Nao usar --recuperar-substituicao-selada nem --aceitar-legado-sem-ipc para essa operacao. A nova lane tem aceite especifico, preserva a decisao de risco anterior e nao repete recuperacao, migracao, backups, delta ou JWT.

O candidato exige observacao recente do canal antigo, dados/escritores recentes e package SHA exato. A autorizacao deve existir antes de iniciar a emissao/consumo do plano; nao aguardar outra decisao humana depois da emissao. Se o plano ou evidencias vencerem, nao reutilizar o plano nem tickets; interromper e revalidar sob nova decisao operacional.

### 4. Conferir a admissao e renovar o smoke

Exigir CONTROLE_SELADO_ATIVO, novo PID/pai/boot/epoch, apenas um controlador com autoridade e um listener 127.0.0.1:3001, IPC genuino e HTTP 503. Conferir estado anterior preservado, bytes/hash do diario original e ausencia dos PIDs antigos. Nenhuma T1 ou limpeza e repetida.

Somente depois da admissao validada e da autorizacao correspondente, enviar ao novo controlador:

```json
{"acao":"renovar-smoke-pos-t1","pedido":"<NOVO_UUID>","autorizarRenovacao":true,"run":"<RUN_T1_ORIGINAL_CONCLUIDA>","referenciaAutorizacao":"<REFERENCIA_NAO_SECRETA>"}
```

A renovacao recolhe tres conjuntos atuais de evidencias, reconcilia os oito dominios e os dez adicionais, verifica zero residuos da T1 e executa outro smoke privado de 26 requisicoes/quatro perfis. Seu gate LIBERACAO deve passar com novo recibo autentico. Smoke anterior ou igualdade de contagens nao autorizam abertura.

O gate exige que a renovacao seja posterior a esta admissao. Os prazos continuam 15 minutos para o inicio do smoke e 30 segundos para provas atuais. Emitir/consumir um plano T1 novo permanece proibido com T1 registrada. A renovacao aprovada nao retira 503; liberar-selado exige autorizacao separada e outro gate completo imediatamente antes da abertura.

## Validacao realizada nesta preparacao

- 296 cenarios Node: novas admissoes, gates, runtime/CLI com IO falso, bootstrap em VM, preservacao byte a byte, procedencia, exclusividade, expiracao, tickets consumidos, PID/pai/boot invalidos, concorrencia, falhas em cada etapa, porta desconhecida, IPC genuino/JSON recusado, diario adulterado, oito dominios e os dez adicionais. Inclui as regressoes afetadas da renovacao/T1 e da admissao legada/reboot.
- Dez cenarios PowerShell com TODAS as primitivas nativas falsas: supervisor/controlador/ponte, recusas do validador, estado alterado, PID reutilizado, fase/congelamento incorretos, UTF8 e lane sem T1. Nenhum processo real foi consultado/encerrado pelo teste.
- Sintaxe: 25 JavaScript e dois PowerShell.
- Patch verificado contra os caminhos reais corretos e aplicado apenas em segunda copia isolada; os 27 hashes finais coincidiram.
- Manifesto executavel ativo conferido contra a autoridade admitida; 177 arquivos de origem permaneceram identicos. .env/JWT, checkpoint e bytes do estado privado preservados, T1 CONCLUIDA/limpa, estado congelado/selado. Nenhuma conexao real aos bancos nesta preparacao.

O preload Node recusa sockets, listeners, subprocessos e arquivos privados; todo estado/IPC/banco usado pelos testes e ficticio. A preservacao atual real dos oito dominios/dez adicionais nao foi novamente aferida aqui; ela sera exigida operacionalmente antes da admissao e depois no gate final. Evidencia simulada nao substitui essa verificacao.

Arquivos: [manifesto](manifest-alteracoes.json), [resultado](resultado-preparacao.json), [TAP Node](resultado-testes.tap), [PowerShell](resultado-powershell.txt), [patch](alteracoes-implantacao-pos-t1.patch). Dependencias auxiliares de simulacao foram copiadas sem arquivos .env/dumps/certificados privados; continuam ignoradas. O pacote mantem a mesma resolucao de node_modules do backend.

Comando Node executado nesta pasta:

```powershell
node --require ./tests/isolamento-sem-efeitos.cjs --test --test-reporter=tap --test-isolation=none tests/implantacao-pos-t1.test.cjs tests/runtime-implantacao-pos-t1.test.cjs tests/perda-controle-pos-t1.test.cjs tests/substituicao-controlador-selada.test.cjs tests/runtime-substituicao-integrada.test.cjs tests/bootstrap-substituicao.test.cjs tests/admissao-apos-reinicio.test.cjs tests/renovacao-smoke-pos-t1.test.cjs tests/operacoes-pos-substituicao.test.cjs tests/continuidade-comandos.test.cjs tests/gate-final-selado.test.cjs tests/t1-controlada.test.cjs tests/ciclo-validade-t1.test.cjs
```

PowerShell foi executado com RemoteSigned somente no processo filho, usando tests/fence-implantacao.mock.ps1. Nenhuma politica global foi modificada.

**Pronto para autorizar a implantacao controlada, com os limites de indisponibilidade e confianca operacional explicitados. Implantacao, renovacao real, gate operacional e retirada de manutencao continuam pendentes. Nenhum commit criado.**
