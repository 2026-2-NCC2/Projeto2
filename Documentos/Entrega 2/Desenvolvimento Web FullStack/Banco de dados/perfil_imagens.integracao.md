# Integração de imagens — preparada, bloqueada

Infraestrutura de produção informada pelo usuário em 04/11/2026: duas tabelas,
RLS forçado, grants revisados, buckets privados e ausência de políticas Storage.
Não houve consulta remota nesta implementação. **Não reaplicar o SQL incremental.**

## Resolução TLS e preflight PostgreSQL — 04/11/2026

O diagnóstico confirmou Node com --use-system-ca ativo, sem TLS desabilitado.
O pooler apresentou Supabase Intermediate 2021 CA → Supabase Root 2021 CA; a
raiz não constava das CAs confiáveis locais do Node/Windows. Não era falha por
ausência da flag. A conexão de diagnóstico usou verify_return_error e validação
de hostname, sem autenticação nem adoção da cadeia recebida como confiável.

A CA pública foi obtida por HTTPS validado da origem apontada no código oficial
do Dashboard, conferida e salva em PI Backend/certificados. Sua procedência e
fingerprint estão em certificados/README.md. Configurado exclusivamente o caminho
PGSSLROOTCERT no .env privado; credenciais e demais variáveis preservadas. Nenhuma
alteração no Windows global nem na configuração remota de segurança.

Executado somente --somente-postgres: TLS autorizado, SET ROLE service_role,
RLS e FORCE RLS, CRUD mínimo, bloqueio anon/authenticated, ausência de extras/
grant options, ausência de políticas Storage, FK/índices e integridade das
referências aprovados; diário vazio. Transação READ ONLY finalizada com ROLLBACK.
REST e buckets não foram consultados novamente. O preflight PostgreSQL foi
aprovado. A ativação das rotas e o teste real descartável continuam pendentes
de autorização; nenhum upload, exclusão ou migração foi executado.

## Primeira tentativa de preflight — histórico, TLS posteriormente resolvido

Executado com autorização via scripts/preflight-imagens-producao.cjs
--somente-leitura. O script usa exclusivamente GET com origem fixa, identidade
sb-project-ref e timeout, e prepara transação PG READ ONLY encerrada por ROLLBACK.
Não importa o servidor, não ativa rotas e não registra credenciais/identidades.

Resultado: REST confirmou o projeto e a disponibilidade das duas tabelas/colunas
consultadas sem retornar registros (limit=0). Storage confirmou os dois buckets
privados, MIME image/webp e limites de 5/10 MiB. A conexão PostgreSQL foi recusada
com SELF_SIGNED_CERT_IN_CHAIN, antes de iniciar a transação ou consultar tabelas.
PGSSLROOTCERT não está configurado. A compatibilidade de host/usuário com o ref
foi validada localmente, mas a autenticação, SET ROLE, RLS, privilégios efetivos,
políticas Storage e integridade via PG continuam sem comprovação nesta execução.
O resultado global é reprovado; nenhuma rota ou interface foi habilitada.

Próximo passo: obter a CA correta por fonte confiável para a conexão PostgreSQL,
configurar seu arquivo local em PGSSLROOTCERT e repetir o mesmo preflight.
Não usar rejectUnauthorized=false, sslmode inseguro ou
NODE_TLS_REJECT_UNAUTHORIZED=0. A causa da cadeia não confiável precisa ser
resolvida; não confiar automaticamente em certificado apresentado pela conexão.

Depois de aprovado o preflight completo, ainda exigir autorização explícita para
montar o serviço no servidor, realizar o teste mínimo com conta descartável e
escrever/remover exclusivamente seus objetos/linhas de imagens. A ativação da
interface será posterior a essa validação. Não se exige nova migração ou bucket.

## Editor integrado de foto e capa — preparado, não ativado

O cabeçalho reutiliza ImagemPerfil em modo integrado para foto e capa. A montagem
principal continua com habilitado=false: nenhum GET, PUT ou DELETE de imagens é
executado. O candidato habilitado oferece câmera/Adicionar/Alterar por hover,
foco de teclado e toque (controle sempre visível em dispositivos sem hover).
Clique abre seletor; arquivo validado gera URL blob somente local e abre prévia
com foco contido, Escape/Cancelar e retorno ao acionador. Salvar envia binário
ao Express; remover pede confirmação. URLs blob são revogadas ao descartar ou
desmontar; URLs assinadas existentes continuam somente em memória. Não há crop
nem upload implícito ao selecionar. Erro na consulta inicial mantém a edição
bloqueada, mesmo no candidato habilitado. Não há repetição automática de escrita.

instalarRotasImagens aceita opcionalmente a integração existente como terceiro
argumento, depois de o chamador validar destino e permissões. Sem argumento,
preserva 503. Dependência incompleta é recusada antes de montar rotas.
server.js e o inicializador isolado continuam sem esse argumento. Nenhuma flag
foi criada para liberar uploads sem validação. Não foi alterado o backend de
dados pessoais/profissionais nem o JWT.

### O que ainda exige autorização em produção

A inspeção local confirmou somente que SUPABASE_URL aponta ao projeto esperado
e que PGHOST/PGUSER identificam o mesmo ref, com os campos PG necessários
preenchidos. Isso não comprova conectividade, chave, permissões ou políticas
atuais. Nenhum segredo foi registrado e nenhuma conexão foi aberta.

Para ativar em produção, autorizar separadamente:

1. Preflight remoto somente leitura no projeto PI Backend: confirmar identidade
   REST/Storage, TLS e vínculo PG, SET ROLE service_role, privilégios nas tabelas
   de imagens e SELECT/UPDATE usuarios para locks, RLS forçado, limites/MIME dos
   buckets privados e ausência de acesso indevido por anon/authenticated. Não
   modificar schemas, políticas, buckets, credenciais ou registros.
2. Montagem do serviço já existente (pool PG explícito, cliente Storage dedicado
   e supervisor quando aplicável) e substituição das rotas 503 somente para
   imagens. Montar antes de parsers gerais, com os limites HTTP já preparados.
3. Teste real mínimo com conta exclusivamente descartável autorizada e arquivos
   sintéticos: criar reserva/objeto/slot, assinar leitura, substituir, remover
   e limpar somente os caminhos gerados nesse teste. Essas operações escrevem
   nas tabelas de imagens e no Storage de produção; não estão autorizadas por
   esta preparação. Não usar contas reais nem excluir usuários existentes.
4. Após aprovação, habilitar o componente do cabeçalho, definir a execução da
   limpeza existente (primeiro dry-run), validar visual/teclado e manter bloqueio
   se o preflight falhar. Nenhuma nova migração/bucket é prevista pela UI.

Até essa autorização e validação, a persistência privada está implementada e
testada com dependências simuladas, mas não comprovada com uploads reais.

## Estado e módulos

- `server.js` continua instalando somente `imagens/rotas.cjs`: JWT obrigatório,
  GET/PUT/DELETE autenticados retornam 503. Nenhuma flag de ambiente libera.
- `imagens/repositorio.cjs`: SQL parametrizado nas tabelas existentes, usando
  pool PG explícito. Cada transação faz SET LOCAL ROLE service_role; locks na
  ordem usuário → diário/slot; timeouts de statement/lock e rollback. Sem DDL.
- Reserva única durável antes do upload; confirmação idempotente. Rebaixa a
  imagem antiga antes de promover a nova, e troca o slot no mesmo commit.
  DELETE cancela reservas e referências na mesma transação. Timeout nunca
  dispara retry de escrita ou compensação destrutiva.
- `imagens/cliente-storage.cjs`: SDK dedicado, chave somente no servidor,
  fetch restrito à origem Storage, sem redirects, timeout de 30 segundos
  incluindo resposta e limite de resposta de 1 MiB; nenhuma criação de bucket.
- `storage.cjs`: caminhos UUID v4 do servidor, sem upsert, WebP e URL assinada
  de 120 segundos; valida origem e caminho quando montado pela integração.
- `imagens/http.cjs`: router candidato não montado no servidor principal.
  Autentica antes do parser, usa somente req.usuario.id; nenhuma exceção para
  admin. Recusa query de proprietário/caminho, JSON, multipart e compressão.
  Recebe binário com limite de 5/10 MiB; sharp continua verificando assinatura,
  pixels, dimensões, animação e metadados antes de reservar/enviar.
- Limites locais: 60 requisições/minuto e 6 escritas/minuto por conta e IP;
  mapa limitado a 10 mil chaves, duas recepções/processamentos simultâneos e
  15 segundos para receber o corpo. Não confia em X-Forwarded-For.
- `imagens/integracao.cjs` recebe pool/cliente/origem e opcional supervisor
  existente. Se houver supervisor, acompanha leitura/escrita e limpeza com
  executarPersistencia, sem alterar seu mecanismo ou estado. Fornecer o
  supervisor real na futura montagem. Nenhum módulo carrega .env ou conecta
  sozinho. Nada foi adicionado à fábrica normal de persistência nesta etapa.
- React: ImagensPerfil agora apresenta o cabeçalho compartilhado dos quatro
  perfis: capa horizontal decorativa roxa, avatar circular sobreposto e nome/email
  reais. Não exibe cartões de upload nem linguagem técnica de homologação.
  Não consulta imagens enquanto as rotas permanecerem bloqueadas. O componente
  candidato ImagemPerfil foi preservado: validação, envio binário ao Express,
  substituição, remoção e feedback continuam disponíveis apenas para integração
  futura autorizada. A edição pessoal, comercial e de redes sociais permanece
  nos componentes e contratos existentes, com permissões inalteradas.
  O componente ImagemPerfil aceita habilitado=true somente na montagem isolada
  dos testes/homologação futura. Não há flag VITE_ de ativação em produção.
  URLs apenas em memória, renovação por GET em 110 segundos, referrer-policy
  no-referrer e descarte via desmontagem ao trocar conta/sair. Mutação falha
  bloqueia novo envio até consulta manual bem sucedida; nenhum retry de escrita.

## Limpeza

`integracao.limpar()` é dry-run: contagens do diário, sem Storage. A execução
exige chamada explícita `limpar({ executar: true, limite: 10 })`, nunca no
startup. Não está agendada. Limite entre 1 e 100, sem lotes concorrentes no
mesmo objeto de integração; múltiplos processos usam locks/leases do banco.

Reserva vencida é cancelada e entra em quarentena de 24 horas. Objetos antigos
ou desvinculados também aguardam 24 horas. O worker revalida ausência de slot,
marca limpando com lease de cinco minutos antes de acessar Storage e não
reativa objetos. Confirmações são cercadas pelo lease recebido. Falha agenda
backoff; lease vencido pode ser retomado. Tombstones permanecem e são revisitados
diariamente para capturar upload tardio; caminhos nunca são reutilizados.

Não existe varredura destrutiva de objetos sem diário. Um inventário desses
objetos exige revisão separada; não excluir por prefixo ou idade. DELETE retorna
desvinculação confirmada, não promete exclusão física instantânea. URL já
emitida pode funcionar até expirar. Não apagar histórico ou usuários com RESTRICT.

## Pré-requisitos e ativação segura futura

### Bloqueios concretos após a reorganização visual

- Código: server.js e o inicializador isolado continuam montando as rotas 503;
  prepararIntegracaoImagens não está ligado ao servidor normal. Falta uma
  montagem autorizada do router candidato com o pool e cliente Storage validados,
  o supervisor existente quando aplicável, e a conexão da UI de imagens ao novo
  cabeçalho. Não basta mudar uma variável de ambiente. Não há upload ativo.
- Configuração: o ambiente separado exige IMAGENS_HOMOLOG_* completos, contas
  autorizadas e JWT próprio. Validar que PG, REST e Storage pertencem ao mesmo
  projeto; TLS, query_timeout, limites e SET ROLE precisam funcionar. A existência
  dessas configurações não foi confirmada com conexões nesta revisão.
- Banco: o responsável já confirmou tabelas, RLS forçado e CRUD service_role em
  produção. Não há nova migração exigida pela alteração visual. Falta validar no
  destino dos testes o schema e as permissões de transação, inclusive locks em
  usuarios. Não reaplicar a migração de produção.
- Storage: os dois buckets privados de produção foram confirmados anteriormente.
  Falta verificar o destino separado autorizado, seus limites/MIME, acesso
  privilegiado e negativa anon/authenticated. Não criar buckets automaticamente.
- Limpeza: o serviço durável já existe, mas não está agendado; definir sua execução
  explícita, primeiro dry-run, e validar leases/quarentena antes de ativar imagens.
- Testes: faltam testes reais autorizados no destino separado de upload,
  substituição, remoção, concorrência, falhas e limpeza, além de inspeção visual
  e teclado. Testes locais não comprovam funcionamento remoto do Storage.

Os passos abaixo continuam necessários; nenhum foi executado por esta alteração
de frontend. A capa decorativa e o ícone padrão não representam imagens enviadas.

1. Manter produção bloqueada. Confirmar os resultados manuais de infraestrutura
   e aprovar ambiente de homologação com dados sintéticos. Não usar produção
   para testar uploads nem recriar tabelas/buckets existentes.
2. Preparar um pool PostgreSQL com TLS verificado, timeout de conexão e
   query_timeout de 10 segundos. Reutilizar a configuração existente e validar
   explicitamente que PG e SUPABASE_URL identificam o mesmo projeto de
   homologação. Confirmar SET ROLE service_role e SELECT/UPDATE em usuarios
   necessários aos locks. Não alterar privilégios/credenciais automaticamente.
3. Construir cliente dedicado e prepararIntegracaoImagens com a origem exata
   e supervisor existente. Não passar JWT do Express ao SDK. O acesso direto PG
   é necessário porque não foram criadas RPCs/migrações adicionais.
4. Montar criarRouterImagens apenas no inicializador de homologação em loopback,
   depois das barreiras existentes, antes de express.json. Nunca montar junto
   às rotas bloqueadas na mesma instância. Limites do proxy devem acompanhar
   Express; remover buffering ilimitado, validar timeout total e concorrência.
   Se houver réplicas, limites locais não equivalem a rate limit global.
5. Homologar com usuários descartáveis dos quatro perfis e imagens sintéticas:
   consultar/enviar/substituir/remover, dono alheio inclusive admin, URLs
   expiradas, MIME forjado, animações, bytes/pixels excessivos, PUT/PUT,
   PUT/DELETE/PUT, falhas/timeouts após upload e commit, lease perdido e
   limpeza. Verificar diário, slots, hashes, ausência de órfãos indevidos e
   negativa de acesso direto anon/authenticated. Não repetir escritas incertas.
6. Fazer inspeção visual/teclado nas cinco larguras e conferir descarte das URLs
   ao sair/trocar usuário. A homologação deve montar a UI candidata habilitada
   explicitamente, sem habilitar o bundle principal.
7. Somente após aprovação e autorização específica: substituir a montagem 503
   pelo router validado, habilitar a UI, configurar um único agendamento
   explícito da limpeza (primeiro dry-run) e validar consultas e métricas.
   Nenhuma dessas ações foi executada nesta etapa.

Se houver falha, bloquear novas operações de imagens e preservar diário,
referências e objetos para reconciliação. Não fazer rollback destrutivo,
rotacionar JWT ou alterar a configuração da migração.

## Testes direcionados (sem Supabase)

- Backend: perfil-imagens.test.cjs, perfil-imagens-http.test.cjs,
  perfil-imagens-integracao.test.cjs, perfil-imagens-transacoes.test.cjs.
- A suíte transacional exige TROCATICKET_SQL_ISOLADO=1 e imagem local
  postgres:17. Cria contêiner exclusivo com porta aleatória publicada somente
  em 127.0.0.1, credencial sintética, dados descartáveis e sem .env. Aplica
  apenas o schema existente dentro da fixture local e remove seu contêiner.
- Frontend: imagensPerfil.test.js, perfilEdicao.test.js e
  perfilProfissional.test.js; serviços e respostas simulados. Não equivale a
  inspeção visual real nem a homologação de Storage remoto.
