# RPC de custos — PostgreSQL descartavel, 30/10/2026

Execucao autorizada, concluida com exit code 0. PostgreSQL 17.11 real; nao
PostgREST/Supabase. Nenhuma conexao com bancos existentes. MySQL, rotas,
autenticacao, provedor, .env e RPC original preservados.

## Evidencias

Manifesto completo (inclui identidade, imagem/digest, hashes e 14 grupos PASS):
`C:\Users\Lucas\PostgreSQLTest\tt-custos-pg-68b18b8c500d4d27bc475c1a3287cedb\manifesto.json`.
Na mesma pasta: postgres.log, rpc.sql e controlador.cjs executados.
O manifesto confirma removed=true; stop/rm retornaram sucesso. Senha sintetica
removida. Imagem oficial mantida no cache; nenhum prune ou recurso existente
removido. Pastas de evidencias anteriores mantidas, com falhas documentadas.

- Contexto desktop-linux, named pipe local e engine Linux verificados.
- Conteiner `556804df9ff15cc7cdec39d2c24125d0260f7fd9ccf7127e08dc0cc0f7329d99`.
- Cluster `7702537349726171175`, banco UUID exclusivo, PGDATA tmpfs novo.
- Sem rede/TCP/portas publicadas/volumes preexistentes; somente senha nova
  montada read-only. Recursos limitados e clientes via socket UNIX interno.
- Identidade conferida antes do DDL; guarda de cluster/banco nas sessoes.
- Hash RPC original: `5e148d4043bc4a0c257f192ae4733a2fc3665955e70baeb9442bf9d69612339a`.
  Conferido novamente ao final, sem mudanca.

## Resultado real

14 grupos aprovados: isolamento; compilacao/IDs/ordem/decimais/releitura;
propriedade/perfil/EXECUTE; validacao integral/Unicode/escala; vazio preservando
outro evento; rollback apos segunda insercao; rollback por falha na releitura;
seis cenarios concorrentes; identidade final. Casos comuns em autocommit,
persistencia conferida em outra sessao. Valores textuais exatos de 0.00 a
9999999999.99, incluindo 0.10/0.20; entradas invalidas rejeitadas sem alterar
custos. IDs originais preservados nos rollbacks; lacunas de sequencia permitidas.

Concorrencia READ COMMITTED: PUT/PUT em dois eventos, espera comprovada por
pg_blocking_pids, estado anterior visivel antes do commit e lista final integral
do segundo escritor. PUT/sonda e sonda/PUT tambem passaram, incluindo conjunto
vazio, bloqueando evento antes de custos por ID. Sao sondas do protocolo:
NAO executaram RPC de publicacao, INSERT de cotacao ou comparacao 409.

Falha de releitura instrumentada: role sintetico NOBYPASSRLS, trigger marca GUC
apos INSERT, politica SELECT levanta TX002 na releitura final; estado anterior
restaurado. Isso prova rollback desse corpo SQL, nao a politica real do Supabase.

## Falhas corrigidas no controlador

1. PATH local do processo incluiu o auxiliar oficial docker-credential-desktop.
2. Sonda FOR UPDATE precisava UPDATE em custos: concedido somente ao papel novo,
   depois dos testes comuns da substituicao, sem alterar permissoes existentes.
3. Concatenacao de marcador da sonda recebeu cast explicito de JSONB para text.
4. Controlador passou a aguardar saida das duas sessoes, evitando EPIPE na limpeza.

As tentativas anteriores foram encerradas e seus conteineres removidos conforme
manifestos. A ultima execucao completa passou sem essas falhas. Nenhuma correcao
no corpo da RPC foi necessaria.

## Verificacoes locais e limites

- 64 testes existentes de custos (transacao/GET) passaram; zero falhas/SKIP.
- node --check aprovado; git diff --check aprovado (avisos LF/CRLF apenas).
- Suite completa nao reexecutada neste incremento; nao extrapolar os 64 testes.
- PostgreSQL direto nao comprova binding HTTP, papel da chave privada, RLS/ACLs
  reais, JWT/gateway, timeout apos commit ou SDK/PostgREST integrado.
- GET independente real/paginado ainda nao foi exercitado; mocks continuam
  separados das evidencias SQL reais. Nenhum teste de publicacao efetiva.

## Contagem reavaliada

22/27 permanece: custos.listarPorEvento agora tem provas SQL reais de releitura,
precisao e rollback, mas o criterio documentado inclui binding/privilegios e
equivalencia do GET independente integrado. custos.bloquearEventoDoUsuario e
compartilhado com publicacao, cujo fluxo real ainda nao foi validado. As sondas
nao completam essa operacao nem cotacoes.bloquearCustosDoEvento. Acesso e
GROUP_CONCAT continuam fora deste incremento. Nao ha operacao integral adicional
a contabilizar ainda; Etapa 5 aberta.

Proximo incremento: propor stack descartavel PostgREST/Supabase, com autorizacao
propria, para validar GET/RPC/binding/erros e timeout. Sem ativacao de rotas reais.
