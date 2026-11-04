# Etapa 2 — capa e galeria de eventos, 04/11/2026

## Situação e preflight real

Código implementado localmente; **uploads de eventos bloqueados**. Nenhuma
migração, bucket, evento ou inscrição foi criado/alterado em produção.
O backend já em execução não foi reiniciado nesta implementação.

Projeto confirmado: `gnwybroqfvwosiqzsfla`. A comparação PostgreSQL e Storage
foi feita com TLS validado em transação REPEATABLE READ READ ONLY, seguida de
ROLLBACK. O vínculo REST confirmou o mesmo Project Reference. Evidências:

- `PI Backend/evidencias/eventos-imagens-preflight-6f7cc85c-60ae-4386-80df-1e55b2baa2cc.json`:
  schema, FKs, papéis e existência do bucket, consultado em storage.buckets.
- `PI Backend/evidencias/eventos-imagens-infra-20261104.json`: preflight reutilizável.

Não existem `public.eventos_imagens` nem o bucket `eventos-imagens`. As dependências
de usuários, eventos, inscrições, cotações, propostas e registro de contas de teste
estão presentes; privilégios necessários e marcador de gestão v1 foram conferidos.
Portanto a infraestrutura ainda não está pronta para ativação.

## Implementação

Uma capa (posição 0) e oito posições de galeria (1 a 8). Cada posição tem no máximo
uma reserva e uma imagem atual. O organizador escolhe a posição e um arquivo,
confere a prévia local e confirma explicitamente o envio/substituição. Remover
também exige confirmação. Um rascunho novo deve ser salvo para obter ID antes
de enviar imagens. Prévia é local e pode ser usada mesmo com uploads bloqueados.

O componente compartilhado está no formulário, na listagem do organizador e nos
detalhes autorizados. As capas aparecem nas listagens do organizador, participante,
fornecedor e administrador. Galerias permanecem nas consultas de detalhes. CSS
usa os tokens existentes, grades flexíveis, botões que quebram linha e controles
com rótulos; não há recorte, ordenação por arraste ou upload múltiplo implícito.

O backend reutiliza o codec sharp do perfil (política de capa), cliente Storage
dedicado, TTL de 120 segundos, parser binário limitado e protocolo de limpeza.
Perfil e eventos compartilham o limite de duas recepções/processamentos ativos.
São aceitos JPEG, PNG e WebP, até 10 MiB, lado de entrada até 8192 e 24 milhões
de pixels. Saída WebP de até 1920 × 1920, sem ampliação, animação ou metadados.
Não se confia em nome, MIME declarado, caminho, bucket ou dono enviados pelo cliente.

O navegador valida origem exata do projeto, evento, UUID, posições e TTL. URLs
assinadas ficam somente em memória, são descartadas antes da renovação a cada
100 segundos e não atravessam troca de evento/sessão. Object URLs das prévias são
revogadas ao descartar/trocar arquivo ou desmontar. Mudanças confirmadas invalidam
também a capa da listagem. Envios repetidos são travados; escritas incertas exigem
consulta e nunca são repetidas automaticamente.

## Autorização e estados

- Alterações: exclusivamente organizador proprietário, em Em planejamento ou Ativo.
- Cancelado e Encerrado: imagens somente para consulta; preservação do histórico.
- Organizador: consulta exclusivamente seus eventos. Administrador: consulta todos.
- Participante: eventos ativos com início futuro, ou histórico de evento ativo,
  cancelado/encerrado em que possui inscrição. Planejamentos privados ficam ocultos.
- Fornecedor: evento em planejamento/ativo com cotação aberta e prazo vigente,
  ou histórico de cotação para a qual possui proposta. Datas usam America/Sao_Paulo.

Autenticação vem do middleware existente. O repositório revalida perfil atual,
estado de conta descartável e propriedade dentro da transação. Ordem de locks:
usuário, conta de teste, evento e diário. A autorização ocorre antes do codec e
é repetida na reserva/confirmação/remoção. ID conhecido sozinho não libera imagens.
O administrador não recebe permissão de alteração de imagens de outros usuários.

## Reservas, retenção e limpeza

Reserva durável de 15 minutos antes do único upload com UUID v4 e upsert=false.
Confirmação idempotente troca a posição e agenda a imagem antiga atomicamente.
Falhas ou perda de resposta não provocam compensação destrutiva. A remoção cancela
também reservas pendentes, impedindo confirmação tardia.

O diário novo preserva evento_origem e caminho após eventual exclusão administrativa
do evento (FK ON DELETE SET NULL). A API normal continua sem exclusão física.
O worker agenda órfãos e reservas expiradas com 24 horas a partir da detecção.
Nada é removido fisicamente antes do prazo. Claim sob lock retira definitivamente
a possibilidade de confirmação, com lease/fencing de cinco minutos. Falha usa
backoff; tombstones são preservados e revisitados para capturar upload tardio.

Não há supervisor ou timer novo: perfil e eventos compartilham o ciclo existente
de 60 segundos, o dry-run obrigatório e a drenagem no encerramento gracioso.
O diário de perfil, seus buckets e seus prazos não são modificados por esse módulo.
A FK de usuários é RESTRICT: contas com histórico de eventos/imagens não podem
ser purgadas automaticamente; o histórico exige tratamento explícito de retenção.

## SQL preparado, não aplicado

`eventos_imagens.preparacao.sql` cria somente a tabela nova, restrições e índices.
Não altera registros, colunas ou triggers de eventos, nem RLS/políticas existentes.
RLS e FORCE RLS são configurados apenas na tabela nova, sem políticas públicas.
service_role recebe SELECT/INSERT/UPDATE; DELETE e grant options são negados.
O worker preserva registros do diário. Defaults globais não são alterados.

Estados, bucket e MIME usam collation C. Há FK para evento/usuário, unicidade de
objeto, CHECK de nove posições/UUID/caminho/metadados, índices parciais para reserva
e imagem atual e índices de limpeza, usuário/evento e órfãos. Transação única com
lock_timeout=5s e statement_timeout=30s. Uma aplicação apenas; objeto existente ou
privilégio inesperado aborta e exige diagnóstico, sem corrigir dados automaticamente.
A criação das FKs pode aguardar locks nos pais: reservar manutenção curta.

## Roteiro futuro — exige autorização, não executar agora

1. Aprovar o SQL incremental e a criação do bucket, separadamente da ativação.
   Confirmar projeto e salvar `eventos_gestao.verificacao.sql` para comparar os
   eventos e relações antes/depois, mantendo escritores parados na aplicação SQL.
2. Aplicar integralmente o SQL uma única vez, como postgres, de BEGIN a COMMIT.
   Em erro, conferir ROLLBACK e interromper; não reaplicar após resposta perdida
   sem inspecionar objetos. Não executar outras migrações.
3. Criar bucket `eventos-imagens`, privado, limite 10485760 bytes e somente
   `image/webp`. Não criar políticas de acesso direto ou usar buckets de perfil.
4. Executar `node --use-system-ca scripts/preflight-eventos-imagens.cjs --somente-leitura`
   em PI Backend. Todos os checks e pronto devem ser true; comparar também os
   hashes do gerenciamento de eventos com o snapshot anterior.
5. Autorizar uma validação controlada exclusivamente com organizador e evento
   descartáveis, sem mudar usuários reais ou reutilizar as contas já encerradas.
   O cadastro/elevação de perfil e a retenção de eventos associados precisam ser
   revisados antes disso: o fluxo atual de contas descartáveis foi homologado
   para participantes e não é autorização para promover/purgar organizadores.
   Testar Storage real, privacidade, dono/alheio, substituição, remoção e limpeza;
   até lá, os testes locais usam PostgreSQL descartável e Storage simulado.
6. Somente após aprovação dessa validação, registrar evidência revisada no padrão
   `evidencias/eventos-imagens-descartaveis-UUID.json` e autorizar o manifesto
   `config/ativacao-eventos-imagens.json`. Ele está ativo=false. Flag isolada,
   evidência divergente ou preflight incompleto recusam a inicialização.
7. Reiniciar a versão atualizada com console acessível, preservando encerramento
   gracioso. Conferir GET autenticado `/eventos/imagens/capacidades`, antes de
   liberar os controles. Não tentar liberar a funcionalidade mudando o frontend.

## Verificação local desta implementação

Testes sintéticos cobrem dono/alheio/quatro perfis, conta encerrando, terminais,
histórico, concorrência, limite de nove posições, confirmação tardia/idempotente,
referências cruzadas, reserva antes de Storage, erros incertos sem retry,
órfãos/quarentena/lease/tombstone, permissões e rollback de reaplicação. O preflight
foi testado contra o SQL aplicado em Docker e recusa bucket público.
Testes HTTP verificam bloqueio sem infraestrutura, autenticação, MIME, bytes,
query/posição, frequência e ausência de cache. Testes React cobrem prévia sem
upload, confirmação, trava de clique repetido, remoção e sessão alterada.

Resultado: 31 testes do fluxo/SQL aprovados, incluindo o PostgreSQL descartável;
regressões de perfil/processamento/HTTP/encerramento aprovadas; 272 testes React
aprovados, lint e build aprovados. O teste SQL da Etapa 1 não foi repetido.
Foram atualizados mocks de componentes/capacidades e um teste antigo da interface
que ainda esperava exclusão física, substituído por preservação nas transições.

Não houve testes de escrita, uploads, exclusões, migrações, alterações de
credenciais/políticas ou criação de eventos em produção, commit ou push.
