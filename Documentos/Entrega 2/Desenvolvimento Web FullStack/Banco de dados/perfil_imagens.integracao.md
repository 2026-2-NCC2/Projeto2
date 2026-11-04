# Integração de imagens — preparada, bloqueada

Infraestrutura de produção informada pelo usuário em 04/11/2026: duas tabelas,
RLS forçado, grants revisados, buckets privados e ausência de políticas Storage.
Não houve consulta remota nesta implementação. **Não reaplicar o SQL incremental.**

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
- React: ImagensPerfil, compartilhado por PerfilPessoal nos quatro perfis.
  Foto/capa, validação local, envio binário ao Express, substituição, remoção e
  feedback. Instâncias normais permanecem desabilitadas e não consultam imagens.
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
