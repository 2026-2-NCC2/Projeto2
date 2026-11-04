# Portfólio profissional — cadastro textual independente das imagens

## Ativação textual local

A criação da tabela e a verificação dos privilégios em produção foram
confirmadas pelo responsável. A configuração local foi ajustada para
`PORTFOLIO_FORNECEDOR_ATIVO=true`, preservando as demais variáveis e credenciais.
Reiniciar o backend pelo comando habitual `npm.cmd start` na pasta PI Backend
para carregar essa configuração. Não iniciar uma segunda instância na mesma
porta: encerrar primeiro a instância normal anterior, se estiver ativa.

No React, fornecedor acessa **Portfólio profissional**; os quatro perfis
encontram **Consultar portfólio de fornecedores** no próprio perfil. O organizador
também pode consultar pelo fornecedor de uma proposta recebida. As ações
textuais foram verificadas somente com testes locais e transportes simulados;
nenhum item real foi criado, editado ou removido nesta ativação.
O seletor de imagens continua desabilitado, sem alteração das rotas bloqueadas.

## Implementação e reutilização

O fornecedor antes tinha Catálogo e rider indisponível. O menu existente agora
abre Portfólio profissional, preservando o destino fornecedor-catalogo. Cada item
tem título (1–120), descrição (1–2000) e categoria (1–80), todos obrigatórios.
Os campos iniciam vazios; não existem trabalhos, métricas ou empresas fictícios
na interface. Categorias são texto do fornecedor, sem catálogo demonstrativo.

Reutiliza usuarios para identidade e nome, JWT e perfil atual do banco, cliente
Supabase do backend, paginação e classes visuais existentes. dados_comerciais e
categorias_servicos continuam representando o cadastro geral da empresa: não
foram convertidos em trabalhos nem sobrescritos. Uma tabela dedicada evita que
a edição do perfil comercial apague trabalhos ou que dois formulários disputem
o mesmo JSONB.

Não depende de projeto Supabase novo, buckets ou homologação completa de imagens
para habilitar o cadastro textual. Nenhuma configuração privada foi modificada.

## Rotas e permissões

Todas exigem autenticação. Papel atual consultado pelo middleware existente,
sem confiar no perfil armazenado no navegador. Nenhuma exceção de escrita para
administrador:

| Método e rota | Regra |
| --- | --- |
| GET /portfolio?pagina=1 | Fornecedor consulta somente seus itens |
| POST /portfolio | Fornecedor cadastra título/descrição/categoria; dono vem do JWT |
| PATCH /portfolio/:uuid | Dono edita os três campos, com versão observada |
| DELETE /portfolio/:uuid | Dono remove, enviando somente a versão observada |
| GET /fornecedores?pagina=1 | Quatro perfis autenticados consultam IDs/nomes de fornecedores |
| GET /fornecedores/:id/portfolio?pagina=1 | Consulta somente leitura de fornecedor existente |

Os itens cadastrados são visíveis aos usuários autenticados, como informado no
formulário. Diretório expõe somente id/nome, sem email, telefone, senha ou dados
comerciais privados. Não há consulta anônima, publicação externa ou novos papéis.
Um usuário que deixe de ser fornecedor não aparece na consulta pública de
portfólio. Os registros permanecem preservados; não se altera o perfil de ninguém.

UUID v4 é criado pelo servidor. Dono, id, mídia, URL e campos extras no corpo
de cadastro/edição são recusados. UPDATE/DELETE filtram UUID, fornecedor_id do
usuário autenticado e versão, na mesma operação PostgREST. A versão incrementa
na edição: concorrência ou versão antiga retorna 409, sem sobrescrita silenciosa.
DELETE também confere versão. SDK não repete escritas automaticamente.

Paginação de 20 itens, ordenação estável e total explícito; sem truncamento
silencioso. Escritas têm o controle de frequência existente, 30/minuto por IP
neste processo. Não foi criado outro supervisor: leituras usam os nomes já
reconhecidos pelo supervisor existente; mutações continuam instrumentadas.

O React aguarda confirmação, bloqueia envio duplo e mostra carregamento, erro,
indisponibilidade e vazio como estados distintos. Rascunho fica no formulário
em caso de erro; a opção de recarregar descarta esse rascunho explicitamente.
Resultado incerto/conflito bloqueia nova escrita até nova consulta; não há retry
automático. Nenhum item local é mostrado como registro salvo.

Consulta disponível sob demanda no perfil compartilhado dos quatro papéis e
nas propostas recebidas pelo organizador, usando o fornecedor_id real da
proposta. Diretório e portfólio de terceiros só carregam ao abrir a consulta.

## Banco necessário e ativação — nenhuma ação remota executada

O rascunho portfolio_fornecedor.preparacao.sql cria somente public.portfolio_itens:
UUID, fornecedor_id, título, descrição, categoria, versão e timestamps. Não
altera usuarios nem suas colunas/valores profissionais e não faz backfill.
Requer RLS ativo/forçado, sem privilégios diretos de anon/authenticated e CRUD
para service_role, com verificação de privilégios herdados/defaults inesperados.
Usa PostgreSQL 15–18 revisado. FK de fornecedor usa RESTRICT; futura exclusão de
conta deve tratar seus itens antes, não apagar o usuário por cascata.

Passos futuros, após autorização:

1. Revisar nomes livres, definição de usuarios.id, defaults/grants e rascunho
   SQL; não aplicar em tabelas homônimas com dados desconhecidos.
2. Aplicar manualmente apenas a alteração de schema aprovada. Conferir tabela
   nova vazia, constraints, índice e privilégios. Não editar dados existentes.
3. Somente então configurar PORTFOLIO_FORNECEDOR_ATIVO=true no backend escolhido
   e reiniciá-lo pelo procedimento normal. Esta etapa não foi executada. A
   fábrica prepara o repositório somente em DB_PROVIDER=supabase e reutiliza a
   conexão já selecionada; MySQL não tem fallback para essa funcionalidade.
4. Validar consultas e CRUD textual com itens descartáveis autorizados: dono,
   outro fornecedor, perfis somente leitores e versão desatualizada. Remover
   exclusivamente os itens desses testes após confirmar os resultados.
5. Conferir visual/teclado em desktop, tablet e celular; não habilitar Storage
   para concluir esta etapa textual.

Sem flag/repositório ou sem tabela, API retorna 503 e a interface explica a
pendência. Não existe ativação automática ao abrir a página ou rodar testes.
Não reaplicar a migração nem inserir dados para suprimir mensagens de erro.

## Associação futura de imagens

IDs UUID estáveis permitem associar mídia a cada item sem alterar seus textos.
O seletor de arquivo está desabilitado e o corpo HTTP aceita somente textos/
versão; não há URL, base64, file upload ou cliente Supabase no React.

Quando autorizado o trabalho de mídia, reutilizar processamento sharp e o
protocolo de reserva/confirmacão/limpeza já preparado. Será necessária uma
relação de diário de mídia específica de portfólio com FK ao item/dono e bucket
privado aprovado; não reutilizar tabelas ou buckets de perfil como se fossem de
portfólio. Não há bucket novo necessário para o CRUD textual.

Antes de permitir imagens, adaptar a remoção de itens para desvincular mídia e
agendar limpeza durável, manter tombstones para uploads tardios e conferir
propriedade tanto do item quanto do arquivo. Nenhuma exclusão automática de
arquivos por prefixo. Esse protocolo, o DDL de mídia e a ativação de upload não
foram implementados/autorizados nesta tarefa; controles permanecem bloqueados.

## Verificação local

Testes de rotas JWT/perfis, campos, proprietário, concorrência por versão,
filtros do adaptador Supabase, falha/schema ausente e confirmação de resposta.
React testa cadastro, edição, erros, consulta pública, envio duplo e bloqueio
de imagens. Transportes e registros sintéticos: nenhuma conexão Supabase,
upload ou migração executados. O SQL preparado ainda exige revisão/aprovação
de aplicação; esses testes não certificam os grants reais de produção.
