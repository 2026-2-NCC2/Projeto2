# Ativação de fotos e capas — 04/11/2026

Projeto validado: `gnwybroqfvwosiqzsfla`. Não foram executadas migrações ou
alterações de RLS, grants remotos e credenciais existentes nesta ativação.

O backend normal foi reiniciado com `config/ativacao-imagens.json` ativo. Antes
de escutar na porta 3001, valida a evidência dos testes e repete o preflight de
somente leitura: vínculo PostgreSQL/REST/Storage, TLS, buckets privados, limites,
MIME, permissões, RLS, índices e integridade. Falha recusa a inicialização.

O módulo `contasTeste` é obrigatório em `prepararIntegracaoImagens`; usa o mesmo
pool e Storage da integração. A fábrica Supabase instala a guarda de login/JWT
sem depender de flag. Requisições de imagem passam por autenticação antes do
parser binário e revalidam encerramento sob lock nas mutações. A interface comum
dos quatro perfis habilita edição somente quando `/perfil` anuncia a capacidade.

Evidência real sem segredos:
`PI Backend/evidencias/imagens-descartaveis-1cc18e01-666f-4fcf-b184-f2b19875059e.json`.
Duas contas novas foram cadastradas pelo POST normal, com identidade gerada e
conferida pelo módulo. Somente essas contas receberam escritas de teste. As duas
estão em `encerrando`, zero atividades, sem incertezas e quarentena válida.

Passaram testes reais de upload e substituição de foto/capa, reencodificação
WebP sem EXIF, remoção lógica, leitura assinada com TTL de 120 segundos, negativa
de URL pública, isolamento entre contas e negativa dos papéis anon/authenticated.
Login e JWT de contas encerradas foram negados novamente após o reinício do
backend normal. Expiração da URL não foi aguardada; seu TTL foi conferido.

Também passaram 63 testes de infraestrutura/transações/integração, 20 de imagens,
65 de regressão/inicialização e 32 de frontend. Build do frontend aprovado.
Os quatro papéis foram cobertos localmente; as duas contas remotas mantiveram
perfil participante, sem promoção artificial de permissões.

O worker inicia com dry-run e agenda tentativas a cada minuto nesta instância.
Leases e transações continuam coordenando concorrência. Não houve antecipação
de relógios/prazos nem exclusão física dos objetos em quarentena. A limpeza dos
objetos após 24h depende do backend em execução; purge final das contas continua
explícito pelo módulo interno, sem endpoint público e sem agendamento automático.
Nenhuma conclusão/exclusão de conta foi executada com sucesso nesta etapa.

URLs já assinadas podem continuar válidas por até 120 segundos. Requisições
comuns admitidas antes de um encerramento podem terminar, conforme o contrato
existente; novas autenticações são bloqueadas e imagens têm revalidação sob lock.

Para outra implantação do backend/frontend, distribuir o código, o manifesto e
a evidência juntos; não basta alterar o banco. Não há commit ou push nesta etapa.
