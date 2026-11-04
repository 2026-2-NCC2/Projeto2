# Capa e galeria de eventos — preparação bloqueada

## Situação atual

Os eventos existentes usam id, usuario_id (organizador), nome, data, horario,
local, categoria, publico, descricao e status. Não há campo ou tabela de mídia
de eventos nos contratos atuais. Custos, cotações, propostas e inscrições
continuam com os relacionamentos e endpoints existentes. Nenhuma consulta
remota foi executada para essa análise; foram revisados schema e código locais.

O novo candidato `PI Backend/eventos-imagens.cjs` é inerte e **não foi importado
ou montado em server.js**. Os novos caminhos não existem no servidor normal
(404); não há endpoint de upload ativo. Fotos/capas de perfil e suas rotas 503
permanecem intactas. Nenhuma variável de ambiente nova ou alteração de .env.

## Implementação preparada

- Uma capa na posição 0 e galeria com até oito posições fixas 1..8. Reposição
  substitui somente a posição escolhida; não há ordenação complexa/drag-and-drop.
- Reutiliza processarImagem do perfil com a política de capa: JPEG/PNG/WebP,
  até 10 MiB de entrada, lado máximo 8192, até 24 milhões de pixels; saída WebP
  até 1920x1920 sem ampliar, sem animação e sem metadados. A política de fotos
  de perfil não foi alterada. O cliente valida tamanho/MIME só como conveniência;
  a validação real continua no sharp do servidor.
- Um único bucket privado futuro, eventos-imagens; caminhos eventoId/UUID-v4.webp,
  sem nome do arquivo original, sem upsert e sem URLs públicas. Assinaturas de
  120 segundos, conferindo origem/caminho. Reutilizar o cliente Storage dedicado
  existente para limites de transporte, após aprovação do destino.
- SQL parametrizado no candidato: reserva durável, confirmação idempotente,
  substituição atômica, cancelamento/remoção e fila de limpeza. Locks na ordem
  usuário → evento → imagens, conferindo perfil atual e propriedade em cada
  mutação; statement_timeout=5s e lock_timeout=2s. Erro provoca rollback e
  mensagens sanitizadas. Nenhum retry cego ou compensação destrutiva.
- O organizador deve possuir o evento. Participante, fornecedor e administrador
  não podem alterar imagens, inclusive o administrador. Alterar o proprietário
  entre reserva e confirmação impede a confirmação pelo antigo dono; o novo
  dono também não pode adotar a reserva antiga.
- Leitura candidata: organizador vê somente os próprios eventos; administrador
  vê os eventos administrativos; participante vê eventos Ativo; fornecedor vê
  eventos com cotação Aberta e prazo vigente, como no mural. Não se usa GET
  /eventos/:id como endpoint genérico de imagens: essa rota hoje é do dono.
  Imagens de eventos privados não são disponibilizadas por conhecer seu ID.
- React tem componente único MidiaEvento: detalhes expansíveis, capa, galeria,
  textos alternativos e referrer-policy no-referrer. Organizador visualiza os
  controles desabilitados em Meus Eventos e Criar Evento; participante, fornecedor
  e administrador têm visualização somente leitura nos locais já autorizados.
  Nenhum componente novo faz fetch automaticamente. Os endpoints existentes
  continuam devolvendo o mesmo JSON e não precisam retornar imagens fictícias.
- Cliente candidato acessarImagensEvento recusa GET/PUT/DELETE por padrão.
  Se futuramente admitido, valida posições, limite de itens, sessão e URLs do
  evento correto. O componente atual não faz essa admissão nem chama o cliente.

## Banco e Storage necessários — não aplicar agora

`eventos_imagens.preparacao.sql` é um rascunho revisável, não uma migração
autorizada. Foi exercitado apenas dentro de PostgreSQL local descartável.

Propõe uma tabela nova public.eventos_imagens, funcionando como diário e
referência atual, sem adicionar colunas aos eventos ou mudar tabelas de perfil.
Inclui posição, UUID, dono, evento, metadados, estado, reserva, quarentena, leases
e tentativas. Índices únicos parciais permitem uma reserva e uma imagem atual por
evento/posição; CHECK limita as nove posições e os metadados. RLS ativo/forçado,
sem acesso direto anon/authenticated; CRUD limitado a service_role. Defaults
globais não são alterados e grants inesperados abortam.

A FK para eventos usa ON DELETE SET NULL. O evento pode continuar sendo excluído
pela rota existente; o diário e evento_origem/caminho permanecem para limpeza.
Linhas sem evento não entram nas consultas. Não há trigger, exclusão remota
automática ou cascata apagando evidências. A FK de usuário usa RESTRICT: futura
exclusão de conta exigirá protocolo de retenção/limpeza, como no perfil.

O bucket futuro eventos-imagens deve ser privado, aceitar somente image/webp e
limitar objetos a 10485760 bytes. Não reutilizar perfil-fotos/perfil-capas: isso
misturaria proprietários e contratos de limpeza. Nenhum bucket foi criado,
configurado ou consultado nesta etapa.

## Pendências obrigatórias antes da ativação

1. Aprovar o contrato e validar o rascunho SQL/grants/índices no ambiente
   autorizado, incluindo comparação dos privilégios de produção. Não aplicar
   apenas a tabela para tentar liberar a interface.
2. Preparar o adaptador de limpeza de eventos, reutilizando o protocolo do worker
   existente: dry-run, quarentena de 24 horas, leases/fencing, backoff e tombstones.
   Deve agendar reservas vencidas e linhas com evento_id=NULL, mesmo se ainda
   estiverem reservado/atual; conferir ausência de referência antes da remoção.
   Não passar essas linhas ao worker de perfil: ele valida outros buckets e IDs.
   Até existir esse adaptador, a fila de eventos não é processada e a funcionalidade
   não pode ser ativada. Não criar outro supervisor ou sistema de cutover.
3. Montar explicitamente o router candidato do evento, reutilizando autenticação,
   parser binário, limites HTTP/frequência e acompanhamento de persistência
   existentes. Contrato proposto: GET /eventos/:id/imagens e PUT/DELETE
   /eventos/:id/imagens/:posicao. Aceitar somente bytes e posição; jamais aceitar
   dono, caminho ou bucket vindos do navegador. Não enfraquecer os bloqueios de
   homologação ou os limites de rede existentes.
4. Integrar consultas de mídia na interface somente após autorização do evento;
   renovar URLs em memória e tratar expiração/erros sem reaproveitar URL de outro
   evento. Ligar seleção, confirmação, envio e remoção aos controles apenas depois
   da montagem backend aprovada. Permanecem desabilitados nesta entrega.
5. Homologar Storage real com imagens e contas exclusivamente descartáveis,
   proprietário/alheio, quatro perfis, concorrência, troca de dono, exclusão do
   evento durante upload, timeout após commit, expiração e limpeza física. Não
   usar fotos ou eventos reais nem repetir escritas incertas.
6. Conferir manualmente as cinco larguras e navegação por teclado. Os detalhes
   usam summary nativo; o foco dos modais administrativos inclui esse controle.

Sem projetos, buckets, migrações ou uploads reais nesta preparação. Não houve
alteração do mecanismo de migração nem criação de commits. Não usar o novo
candidato para contornar a homologação de imagens ainda pendente.
