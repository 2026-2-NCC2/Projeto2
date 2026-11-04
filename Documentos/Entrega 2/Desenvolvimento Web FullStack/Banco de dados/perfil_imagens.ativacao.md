# Fotos de perfil e capas — proposta e ativação manual

Status desta entrega: infraestrutura local, sem uploads ativos. Nenhum script SQL foi executado, bucket criado, arquivo enviado ou registro remoto alterado. Não houve leitura/alteração de credenciais. O React e sua identidade visual permanecem como estão.

## Integração verificada no código

- `PI Backend/server.js`: login com bcrypt; JWT próprio HS256, validade de uma hora. `autenticar` verifica assinatura, expiração e ID numérico positivo e consulta `buscarParaAutenticacao`; o perfil atual do banco prevalece sobre o claim. Os papéis são `participante`, `organizador`, `fornecedor` e `admin`.
- `PI Backend/db-supabase.cjs`, `config/banco.cjs` e `repositories/index.cjs`: cliente Supabase exclusivo do servidor, `SUPABASE_URL` e `SUPABASE_SECRET_KEY`, sem persistência de sessão nem refresh. A configuração existente aceita secret key moderna `sb_secret_...`. A fábrica seleciona MySQL/Supabase; não haverá fallback para imagens.
- O JWT do TrocaTicket não é um token Supabase Auth e o ID de `public.usuarios` é inteiro. Não usar `auth.uid()` como se representasse esse ID, nem enviar o JWT do Express ao SDK como credencial Supabase.
- O React usa o Bearer token nas requisições ao Express. Continuará assim, sem cliente privilegiado, credencial `VITE_*`, upload direto, signed upload URL ou URL pública.

O grafo solicitado em AGENTS.md não estava disponível entre as ferramentas desta sessão. A análise foi feita nas implementações e nos testes de autenticação, edição de perfil e perfil profissional.

## Limitações e permissões a resolver antes de ativar

Não foi feita consulta remota de buckets, políticas, quotas, grants ou disponibilidade do Storage. Os scripts de leitura permitem essa revisão manual, sem imprimir credenciais.

A chave secreta do backend ignora RLS. Logo, bucket privado e RLS não substituem a autorização do Express. Toda operação deve derivar o proprietário exclusivamente de `req.usuario.id`, sem exceção para administrador. Rejeitar identificadores, buckets, caminhos e URLs fornecidos pelo cliente. A leitura desta etapa também é somente da própria conta; exibir fotos de terceiros em eventos/listagens exigirá uma regra de leitura explícita em etapa futura.

Políticas permissivas amplas preexistentes de `storage.objects` podem abrir os novos buckets. Revisar todas, inclusive as que não mencionam esses nomes. Não acrescentar políticas `authenticated` baseadas em IDs do Express; não alterar/remover políticas existentes automaticamente. O responsável pelo projeto precisa excluir os buckets novos do alcance de regras amplas, se houver. Esse ajuste depende do preflight e não está incluído em SQL genérico.

Grants herdados ou default privileges adicionais também exigem revisão. O SQL revoga acesso de PUBLIC/anon/authenticated somente das duas tabelas novas e habilita RLS sem políticas de acesso direto. Ele concede CRUD a `service_role` nessas tabelas, sem alterar permissões de `usuarios` ou do Storage. É necessário um executor autorizado a criar tabelas/FKs e definir esses grants. Falta de permissão deve interromper a ativação; nunca tornar buckets públicos para contorná-la.

Fontes oficiais: [buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals), [controle de acesso e bypass por chave de serviço](https://supabase.com/docs/guides/storage/security/access-control), [leitura com URL assinada](https://supabase.com/docs/guides/storage/serving/downloads).

## Buckets propostos

Criar **manualmente no Dashboard**, somente na etapa autorizada de ativação:

| Bucket | Visibilidade | Limite por objeto | MIME permitido no Storage |
| --- | --- | --- | --- |
| `perfil-fotos` | Privado | 5 MiB / 5.242.880 bytes | `image/webp` |
| `perfil-capas` | Privado | 10 MiB / 10.485.760 bytes | `image/webp` |

O bucket recebe apenas a saída reprocessada em WebP. A entrada do Express aceita JPEG, PNG e WebP reais. Nome: `<usuario_id>/<UUID-v4-do-servidor>.webp`; nenhuma parte do nome original é usada. Sempre `upsert: false`; cada substituição cria outro caminho, nunca sobrescreve o anterior. Não criar os buckets via inicialização, migração ou teste.

## Banco proposto

`perfil_imagens.incremental.sql` cria duas tabelas novas, sem modificar colunas nem dados de `usuarios`:

- `perfil_imagens`: até dois slots por usuário (`foto` e `capa`), apontando para um objeto do diário. Sem linha significa ausência de imagem; sem backfill.
- `perfil_imagens_objetos`: UUID, proprietário, tipo, bucket, caminho, MIME final, bytes, dimensões, estado, prazos e tentativas. Também registra a intenção antes do upload, para recuperar quedas do processo e respostas incertas. Não guarda binários, Base64, URLs ou credenciais.

A FK composta impede que um slot aponte para objeto de outro usuário/tipo. Os CHECKs restringem nomes e metadados. Não há cascade: excluir uma conta com imagens exigirá limpar referências e objetos primeiro, para preservar o inventário. A migração é transacional e aborta se houver estruturas homônimas; não é uma migração de conversão nem deve ser reaplicada cegamente. `atualizado_em` deverá ser atualizado explicitamente nas transações futuras.

As tabelas, sozinhas, não garantem todas as transições entre diário e referência. Nesta etapa **não há repositório de produção nem RPCs transacionais de imagens**. Antes de ativar, implementar e revisar os contratos abaixo via RPC restrita a `service_role` ou conexão PostgreSQL transacional validada. Não simular transação com chamadas REST separadas.

## Código preparado e limite desta etapa

- `PI Backend/imagens/politica.cjs`: limites, tipos, validação de proprietário e nomes aleatórios.
- `processar.cjs`: usa sharp para verificar assinatura e formato detectado, decodificar, aplicar orientação, reduzir e reencodar sem metadados.
- `storage.cjs`: adaptador com cliente injetado; upload sem sobrescrita, assinatura por 120 segundos e remoção por caminho validado. Não cria clientes/buckets, não lê ambiente e não está ligado à fábrica atual.
- `servico.cjs`: protocolo de reserva, substituição, leitura, desvinculação e limpeza com dependências injetadas; exercitado com persistência e Storage simulados.
- `rotas.cjs`: instalado no Express existente, usa `autenticar` e retorna sempre 503. Não recebe/decodifica arquivos e não importa serviço/Storage/sharp. Não existe flag capaz de habilitar uploads nesta entrega.
- `tests/perfil-imagens.test.cjs`: fixtures criadas em memória, codec real e transporte simulado. Não acessa banco/Storage remoto nem usa arquivos pessoais.

O sharp foi acrescentado a `package.json` e `package-lock.json`. As dependências foram instaladas com scripts de instalação desabilitados; o binário usado pelo codec foi validado nos testes locais. Verificar compatibilidade do Node e da plataforma no ambiente de implantação antes da ativação.

## Validação de arquivos

| Regra | Foto | Capa |
| --- | --- | --- |
| Bytes de entrada/saída, máximo | 5 MiB | 10 MiB |
| Largura e altura de entrada, máximo por eixo | 4.096 px | 8.192 px |
| Pixels de entrada, máximo | 16 milhões | 24 milhões |
| Maior eixo da saída, máximo | 512 px | 1.920 px |

As dimensões devem ser positivas. Não há ampliação nem recorte automático; proporções são preservadas. O enquadramento visual poderá ser definido com a interface futura. Rejeitar conteúdo não raster permitido, imagem corrompida/truncada, SVG, GIF, AVIF e arquivos animados/multipágina, incluindo WebP/APNG. MIME, extensão e nome enviados pelo navegador não provam o formato. Uma assinatura válida sem decodificação completa também não basta.

A reencodificação gera WebP de qualidade 82, aplica orientação e elimina EXIF/GPS, ICC, IPTC e XMP. Não usar `keepMetadata`/`withMetadata` na saída. A saída tem limite de bytes conferido novamente. O processamento usa `limitInputPixels`, rejeição de warnings e timeout de 10 segundos na transformação. Documentação: [entrada sharp](https://sharp.pixelplumbing.com/api-constructor/), [metadados](https://sharp.pixelplumbing.com/api-input/), [saída](https://sharp.pixelplumbing.com/api-output/).

Antes da ativação HTTP, acrescentar limite do corpo por tipo, timeout de recebimento, limite de requisições por usuário/IP, limite de dois processamentos simultâneos por instância e fila limitada. O limite de pixels não substitui limites de memória/CPU do processo. Dimensionar pelo ambiente e recusar excesso com 429/503, sem fila ilimitada.

## Contrato HTTP planejado

Mesmo contrato para os quatro perfis; não há parâmetro de usuário.

| Método e caminho | Comportamento futuro |
| --- | --- |
| `PUT /perfil/imagens/foto` ou `/capa` | Um arquivo no corpo binário; valida/reprocessa, reserva, envia, confirma referência. 200 com UUID da operação; cliente consulta GET em seguida. |
| `GET /perfil/imagens/foto` ou `/capa` | 200 com `imagem: null` ou URL temporária, validade e versão/operação atual. Nunca retorna chave privilegiada. |
| `DELETE /perfil/imagens/foto` ou `/capa` | Desvincula e agenda exclusão; 202, inclusive se já ausente. Não prometer exclusão física imediata. |

Na ativação futura, colocar autenticação e controle de frequência antes do parser binário (`express.raw`, limite próprio por tipo). Aceitar somente corpo binário com `Content-Type: application/octet-stream`, `image/jpeg`, `image/png` ou `image/webp`; o conteúdo real decide a validade. Rejeitar JSON, Base64, multipart, `Content-Encoding` comprimido e propriedades de identidade/caminho na query. Não é necessário multer para este contrato. Limitar corpo tanto no proxy quanto no Express; `Content-Length` não substitui contagem dos bytes recebidos. Manter `Cache-Control: no-store` nas respostas de leitura e `Referrer-Policy: no-referrer` na interface futura.

Erros previstos: 400 tipo/contrato inválido; 401 JWT ausente/inválido/expirado/conta inexistente; 403 autorização; 409 reserva concorrente ou versão alterada; 413 bytes; 415 formato; 422 decodificação/dimensões/animação; 429 frequência; 503 dependência indisponível/resultado incerto. Não registrar buffers, credenciais, headers de autenticação, mensagens brutas do SDK ou URLs assinadas.

URLs assinadas são credenciais temporárias de leitura: quem tiver a URL pode utilizá-la durante sua validade, sem reenviar o JWT. Não persistir em banco/localStorage; manter em memória, renovar mediante GET autenticado e descartar no logout/troca de sessão. TTL proposto: 120 segundos. Remover/substituir impede novas assinaturas da referência antiga; uma URL já entregue pode continuar válida até expirar ou até a remoção efetiva do objeto. Não prometer revogação instantânea.

## Contratos transacionais a implementar antes da ativação

Todas as mutações devem bloquear a linha de `usuarios` com `FOR UPDATE`, depois o slot/diário, sempre nessa ordem. Isso também serializa a primeira imagem, quando o slot ainda não existe. Todas as consultas e mutações devem filtrar ID do usuário e tipo. Comparar o perfil/conta atual quando necessário e não confiar em identidade recebida do HTTP.

1. `buscar(usuarioId, tipo)`: JOIN do slot com diário; devolver somente objeto `atual`, do mesmo dono/tipo. Se houver inconsistência, falhar fechado, sem gerar assinatura.
2. `reservar(ref)`: criar diário `reservado`, com UUID do servidor e metadados reprocessados, antes de qualquer upload. Se houver reserva ativa, responder 409. Não modificar a referência atual. Guardar/validar a versão observada para confirmação. Nesta proposta a serialização e a proibição de confirmar reserva cancelada impedem adoção tardia.
3. `confirmar(usuarioId, tipo, operacao)`: conferir reserva vigente e mesma conta/tipo; tornar o objeto anterior `limpeza` com prazo de quarentena, o novo `atual`, e trocar/criar o slot na mesma transação. Atualizar timestamps. Repetição da mesma operação já atual é idempotente; reserva expirada, em limpeza ou removida jamais pode voltar a atual. Não fazer retries cegos de upload/commit.
4. `desvincular(usuarioId, tipo)`: cancelar também qualquer reserva pendente do slot, marcando-a para limpeza; desvincular o atual e agendá-lo no mesmo commit. O cancelamento impede upload concorrente de restaurar a imagem após DELETE. Não chamar Storage enquanto segura o lock do banco. Repetição sem slot é sucesso.
5. `reivindicarLimpeza()`: reconciliar reservas expiradas e selecionar tarefas vencidas com locks e `SKIP LOCKED`; revalidar ausência em **todas** as referências; marcar `limpando` com lease antes de liberar locks. Uma tarefa em limpeza nunca pode ser confirmada/adotada. Não confiar só na idade ou no prefixo do objeto.
6. `concluirLimpeza(operacao)` / `adiarLimpeza(operacao)`: registrar estado final ou nova tentativa com backoff e erro sanitizado; preservar tombstone do caminho e recuperar lease expirado. Não apagar o histórico necessário à reconciliação.

O serviço local expressa esse protocolo, mas os mocks não provam atomicidade PostgreSQL. Testes de transações, locks e RLS em homologação descartável são pré-requisitos de ativação, incluindo PUT/PUT, PUT/DELETE, DELETE/PUT, queda antes/depois do upload e timeout após commit.

## Substituição, remoção e arquivos órfãos

Sequência: validar → reservar intenção → upload em caminho novo → confirmar troca e fila de limpeza em transação → limpar antigo assincronamente. Se o upload falhar ou perder a resposta, manter intenção e imagem antiga. Se o commit perder a resposta, consultar operação/slot: o arquivo novo pode estar em uso; nunca removê-lo por compensação imediata. O usuário deve consultar o perfil antes de repetir.

Na remoção, o slot fica vazio após o commit; falha do Storage mantém tarefa durável e não restaura a referência. Um worker pode repetir remoção de objeto já ausente. Exclusão no Storage deve ser exclusivamente pela API `remove`; nunca `DELETE FROM storage.objects`.

Proposta inicial: reserva de 15 minutos; quarentena de 24 horas para órfãos/objetos substituídos, cobrindo TTL de leitura e operações de upload em trânsito. Configurar timeout total de upload menor que a reserva antes de ativar. Prazo vencido sozinho não prova que um upload terminou: cancelar definitivamente a confirmação no diário, aguardar janela de segurança e repetir inventário após a limpeza para capturar upload tardio. Caminhos nunca são reutilizados. Tombstones permitem detectar e remover reaparecimentos sem risco de adoção futura.

O worker não está agendado nem conectado nesta entrega. A futura rotina de inventário deverá ser paginada, limitada aos dois buckets, com relatório/dry-run por padrão. Objetos sem diário exigem quarentena e revisão; não apagar automaticamente por formato de nome. A limpeza efetiva exige revalidação transacional imediatamente antes da reivindicação e registro auditável de operação, dono, tipo e resultado. Não tocar em outros buckets, imagens atuais ou arquivos desconhecidos. Não há varredura/exclusão remota nesta etapa.

## Sequência manual de ativação

1. Revisar esta proposta e os diffs locais. Manter rotas 503; nenhuma alteração em `.env` é necessária nesta fase. Preservar evidência do número de usuários antes/depois e definições existentes, com backup conforme o processo do projeto.
2. Em ambiente de homologação controlado, executar manualmente `perfil_imagens.preflight.sql`. Confirmar tipo/PK de `usuarios.id`, nomes livres, permissões e políticas. Resolver restrições antes de continuar. Não executar migração se houver dúvidas.
3. Quando autorizada a mudança de schema, aplicar manualmente `perfil_imagens.incremental.sql`. Repetir o preflight. Confirmar que só existem estruturas novas vazias, com RLS/grants esperados, e que o número/dados dos usuários não mudou. Se houver erro, a transação deve ser revertida integralmente.
4. Criar manualmente os dois buckets privados no Dashboard, com os limites/MIME da tabela. Não habilitar políticas de acesso direto. Executar manualmente `perfil_imagens.storage-verificacao.sql` e revisar regras amplas, quotas e permissões.
5. **Etapa futura de código obrigatória:** implementar/revisar RPCs/repositório transacional e testes de concorrência reais; integrar os módulos preparados à persistência Supabase existente, ao supervisor/cutover e ao modo de homologação. Adicionar parser binário, limites, timeouts, autorização HTTP e worker com dry-run. Substituir conscientemente o bloqueio 503. Apenas criar schema/buckets ou definir variável não ativa esta entrega.
6. Rodar os testes locais; depois, somente com autorização específica, validar uploads/remoções em homologação descartável, com imagens sintéticas e contas de teste dos quatro papéis. Verificar negação de operações diretas anon/authenticated, conta alheia inclusive admin, MIME falso, animação, excesso de bytes/pixels, expiração de URL, falhas e concorrência. Validar que a chave nunca aparece no bundle React, JSON ou logs.
7. Implementar a interface futura preservando componentes, cores, tipografia e placeholders atuais; renovação de URLs em memória, feedback de erro e descarte no logout. Não incluir emojis. Habilitar produção apenas após homologação, limites e processo de limpeza aprovados; não realizar esse passo nesta entrega.

Reversão operacional: restaurar o bloqueio 503 e interromper worker/novos uploads. Preservar tabelas, diário, buckets e objetos para reconciliação; não executar DROP nem apagar objetos automaticamente. URLs emitidas anteriormente podem valer até o TTL. Não rotacionar credenciais como parte desta funcionalidade.

## Validação local desta entrega

Comando executado em `PI Backend`:

```text
node --test tests/perfil-imagens.test.cjs tests/perfil-profissional.test.cjs tests/perfil-edicao.test.cjs tests/autenticacao-http.test.cjs
node --test tests/banco-provider.test.cjs tests/handlers-persistencia.test.cjs tests/cutover-transicao-final.test.cjs
```

Resultado: 71 testes de imagens/perfis/JWT e 59 testes de inicialização/persistência/cutover aprovados (130 no total). Incluem codec real com imagens sintéticas em memória, rejeição de WebP animado/APNG/truncamento, remoção de metadados, bloqueio HTTP para os quatro perfis, referências estrangeiras e falhas simuladas de upload/commit/remoção. As listas fechadas de módulos nos testes de inicialização foram ajustadas para aceitar somente o novo módulo de rotas bloqueadas; as travas de startup permanecem intactas. Não equivale a validação de permissões remotas, execução de SQL ou integração real com Storage. Os SQLs foram revisados estaticamente; precisam ser validados manualmente no ambiente autorizado.
