# Contas descartáveis de imagens

Atualização 04/11/2026: tabela aplicada manualmente e validada em produção pelo
usuário. Integração com guarda obrigatória e autenticação Supabase automática
instaladas. Testes reais de duas contas aprovados em
`PI Backend/evidencias/imagens-descartaveis-1cc18e01-666f-4fcf-b184-f2b19875059e.json`.
As contas estão em encerramento; objetos aguardam a quarentena real, sem redução
dos prazos. A inicialização normal exige evidência aprovada e repete o preflight.
O texto abaixo registra a preparação e o contrato original; a flag de guarda
não é mais necessária. `service_role` não recebe DELETE no registro interno.

A migração já foi aplicada pelo usuário; não reaplicar. O SQL versionado foi
ajustado para negar DELETE no registro interno. Duas contas descartáveis foram
criadas com autorização e encerradas após os testes; nenhuma conta real foi
alterada. As credenciais novas permanecem no arquivo privado ignorado pelo Git.

## Identificação e cadastro

O módulo interno PI Backend/imagens/contas-teste.cjs não oferece endpoint público
nem recebe um ID arbitrário para marcar uma conta existente como descartável.
`cadastrar({ cadastrarNormal, guardarCredencial })` gera um UUID, nome/e-mail
únicos e senha aleatória; exige gravação privada antes de uma única tentativa
do cadastro normal POST /usuarios, com perfil participante. O chamador deve
gravar a senha apenas no .env local, sem logs, e fornecer o transporte normal
autorizado. Não se insere usuário diretamente pelo módulo.

Somente resposta 201 com ID e identidade exatos permite registrar a marca interna.
Confere os valores persistidos sob lock antes do INSERT no registro. Devolve
somente ID e UUID do registro, nunca senha/hash/token. Não se adota usuário por
prefixo, nome ou domínio. Resposta de cadastro incerta interrompe: reconciliar
somente o e-mail gerado, sem repetir POST ou apagar conta pela aparência.
Se o cadastro ocorreu mas o registro falhou, guardar a evidência privada e
interromper; essa conta não pode ser purgada automaticamente pelo módulo.

## Instalação futura obrigatória

1. Autorizar e revisar a tabela nova public.contas_teste_imagens. Não altera
   usuarios, tabelas de imagens, defaults globais ou políticas existentes.
   A tabela tem RLS forçado e acesso backend; não contém senhas. Sua ausência
   não deve ser contornada. Não há migração automática no startup.
2. Verificar privilégios necessários: CRUD no registro, SELECT/UPDATE/DELETE
   em usuarios para locks e exclusão exata, acesso às tabelas de imagens,
   catálogo de FKs, SELECT storage.objects e listagem privada pelo cliente
   Storage do mesmo projeto. O código não concede privilégios remotamente.
3. Depois da tabela, reiniciar o backend normal atualizado. A fábrica passa
   obrigatoriamente a proteção ao
   repositório Supabase de usuários; login e autenticação JWT consultam a marca
   e recusam contas encerrando/excluídas. Falha de consulta bloqueia autenticação.
   Usuários sem marca não são alterados. A proteção não depende de flag.
4. Construir `criarCicloContasTeste({pool,clienteStorage})` com dependências
   já validadas e passar o mesmo objeto como `contasTeste` a
   `prepararIntegracaoImagens`. Não montar um caminho de upload sem essas guardas.
   A construção recusa guardas ausentes. O router principal só é montado após
   preflight aprovado; a interface depende da capacidade anunciada pelo backend.
5. Somente então autorizar/criar as duas contas e executar os testes reais.
   Não inferir ativação a partir da existência de arquivos de preparação.

## Encerramento, concorrência e limpeza

Cada mutação de imagem das contas registradas incrementa atividade durável
antes de processar/enviar e decrementa ao terminar. Queda deixa contador pendente;
falha deixa incerta=true. Nenhum timeout/tempo decorrido limpa esses bloqueios.
Não há API automática para apagar a incerteza; exige reconciliação separada.

`encerrar(id,registro)` trava primeiro usuarios, depois o registro, marca encerrando,
desvincula slots e agenda reservas/imagens atuais para limpeza na mesma transação.
Repetição não reinicia o processo. Novos logins/JWT são recusados com a guarda
instalada. Reservar/confirmar/desvincular revalidam a marca no mesmo lock do usuário;
uma requisição já admitida não pode confirmar imagem após encerramento.
Outras requisições já autenticadas antes do encerramento podem ainda terminar;
dependências que deixarem impedem a exclusão, sem cascata.

A quarentena tem pelo menos 24h desde o encerramento e desde o término de
atividades em voo; considera também o vencimento das reservas. O código não
antecipa prazos. O worker existente respeita limpeza_apos e leases, sem outro
agendador. Upload que termine tarde fica sem slot; qualquer incerteza mantém
o encerramento bloqueado para reconciliação e o diário continua preservado.

`concluir(id,registro)` só atua em identidade registrada exata: encerrando,
quarentena vencida, zero atividades, nenhuma incerteza, todos os objetos removidos
e nenhum lease. Lista somente os dois prefixos exatos dessa conta (não apaga por
prefixo), exige resposta vazia sem erro, e confirma ausência em storage.objects.
Uma falha de listagem não equivale a ausência de arquivos.

Sob lock do usuário e dos objetos, inspeciona todas as FKs de todos os schemas.
Qualquer filho externo bloqueia a exclusão, inclusive se a FK declarar CASCADE.
FK composta/desconhecida também bloqueia. O slot deve estar vazio. Arquiva o
diário somente se também não existirem dependências adicionais desse diário
ou triggers de exclusão não revisados nas tabelas apagadas. Arquiva o
diário completo no registro independente; somente depois remove as linhas de
imagens do ID e o usuário com ID+e-mail exatos. A atualização para excluida, o
arquivo e os DELETEs são transacionais. Qualquer erro desfaz a etapa inteira.

O registro não tem FK para usuarios: sobrevive como histórico/tombstone após
excluir a conta. Não é purgado automaticamente e não contém credenciais. Uma
segunda conclusão retorna excluida, sem novas exclusões. Os arquivos só são
apagados pelo worker existente, respeitando a quarentena.

## Testes locais

`TROCATICKET_SQL_ISOLADO=1 node --test --test-isolation=none tests/contas-teste-imagens.test.cjs`
na pasta PI Backend. PostgreSQL 17 Docker descartável com credenciais sintéticas,
porta aleatória em loopback e Storage simulado. Relógios são alterados somente
na fixture, nunca por parâmetros do fluxo real. Nenhum .env privado é lido.

Cobertura: marca/cadastro confirmado, rejeição de identidade preexistente,
autenticação fechada, idempotência, quarentena, upload em voo, commit tardio,
concorrência, leases, Storage incerto/não vazio, dependência CASCADE, arquivo
durável e proteção de terceiros. Testes locais não certificam Storage remoto.
