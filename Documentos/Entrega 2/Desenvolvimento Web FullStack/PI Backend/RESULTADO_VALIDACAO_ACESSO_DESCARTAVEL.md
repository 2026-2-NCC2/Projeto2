# Decisao de acesso — PostgreSQL descartavel, 30/10/2026

Execucao concluida com exit code 0: 10 grupos PASS em PostgreSQL 17.11 real.
RPC original preservada, sem falha local comprovada que exigisse correcao.
Nao houve conexao a bancos existentes, leitura de .env, alteracao de rotas,
autenticacao, provedor ou permissoes externas.

## Recursos e evidencias

Controlador existente reutilizado com `--acesso`; cenarios em
scripts/cenarios-acesso-descartavel.cjs. Este modo cria apenas usuarios,
solicitacoes, tres enums, indice, RPC e instrumentacao sinteticos. Nao instala
RPCs/tabelas de custos ou publicacao nem repete seus testes aprovados.

Manifesto completo:
`C:\Users\Lucas\PostgreSQLTest\tt-custos-pg-bc50c5a5f77a458b9a00a86156aa1256\manifesto.json`.
Na mesma pasta: acesso.sql, controlador.cjs, cenarios-acesso.cjs, postgres.log.
Manifesto registra hashes, imagem oficial/digest, identidade e resultados.

- Conteiner: e489c8d3ad5cfa0faaebfd3b890e1177a71200cf016b4f4d6c306d0c6dca8d9c.
- Cluster: 7702539095073161255; banco UUID exclusivo.
- Contexto desktop-linux/named pipe local, engine Linux, rede none, sem TCP ou
  portas publicadas. PGDATA tmpfs novo, sem volumes existentes.
- Unico bind: senha sintetica read-only, com ACL do arquivo novo Lucas/SYSTEM.
- Isolamento conferido antes da primeira consulta, identidade antes do DDL;
  guard de banco/cluster nas sessoes. Papeis NOLOGIN/NOSUPERUSER/NOBYPASSRLS.
- Stop/rm tiveram sucesso; removed=true. Senha sintetica removida. Evidencias
  mantidas, imagem em cache preservada; nenhum prune ou recurso alheio removido.

## Provas PostgreSQL diretas

| Verificacao | Evidencia |
|---|---|
| Compilacao e enums distintos | RPC original executada; aprovacoes para organizador e fornecedor com casts via text; status convertido para enum proprio |
| Solicitacao ausente | TA404 para ID INTEGER ausente e NUMERIC muito grande, sem overflow ou escrita |
| Solicitacao ja analisada | TA409 para repetir aprovacao ou tentar rejeitar depois de aprovada; estado preservado |
| Aprovacao condicional | Participante muda uma vez; usuario organizador recebe TA412 e pedido permanece pendente |
| Exatamente uma linha | Trigger sintetico BEFORE UPDATE retorna NULL, suprimindo update de participante; ROW_COUNT=0 provoca TA412 e nenhuma decisao. Mais de uma linha nao pode corresponder ao ID protegido por PK |
| Rejeicao | Todos os perfis atuais (participante/organizador/fornecedor/admin) preservados; resposta e status rejeitado corretos |
| Rollback | AFTER UPDATE de status levanta TX004 apos a atualizacao condicional de perfil; outra sessao confirma perfil participante e status pendente originais |
| Concorrencia no mesmo pedido | A aprova e segura commit; B tenta rejeitar, espera realmente pelo PID de A e recebe TA409 apos commit; apenas aprovacao persiste |
| Pedidos diferentes do mesmo usuario | A aprova organizador; B aprova fornecedor e espera pelo usuario. Apos commit A, UPDATE condicional de B reavalia perfil e recebe TA412; perfil organizador, pedido A aprovado e B pendente |

Sessoes concorrentes usaram READ COMMITTED e o corpo real da RPC. Espera
comprovada por pg_blocking_pids, sem usar sono como prova. Consulta externa
durante a espera viu estado anterior integral. Exit codes 0/3 corresponderam
a sucesso/erro SQL esperado. Nenhum retry automatico.

## Tres camadas diferentes de autorizacao

1. EXECUTE: tt_probe sem privilegio recebeu 42501. Grant temporario da funcao,
   somente neste cluster, permitiu atingir seu guard, que retornou TA403.
2. Regra SQL: service_role sintetico com ID de participante recebeu TA403;
   ID de admin sintetico permitiu decisoes. Isso comprova consulta do perfil,
   nao autentica a origem do parametro p_admin_id.
3. Backend HTTP: JWT, middleware administrativo e req.usuario.id confiavel nao
   foram exercitados. Chamada SQL direta nunca comprova identidade administrativa.

## Testes locais, limites e contagem

25 testes existentes do adaptador de decisao aprovados, zero falhas/SKIP nesse
recorte. Suite completa nao reexecutada. node --check nos controladores e
git diff --check aprovados. Nenhuma falha nova do controlador nesta execucao.
Hash SQL original antes/depois:
`5d015e60c32c2efc634fdf21674970ddb4617de050c8390bbb5ae507c6bf4e6f`.

Fixture minima nao comprova configuracao real, RLS/ACLs/chave do Supabase,
binding JSON NUMERIC por PostgREST, HTTP 404/409, schema cache, timeout ou perda
de resposta depois do commit. Mapeamento HTTP/no retry continua evidenciado
pelos testes simulados, separado das provas SQL reais.

Contagem reavaliada: 22/27 integrais, com as tres preparacoes transacionais agora
validadas em PostgreSQL direto. Nao persistem pendencias de compilacao/locks/
rollback descritas acima. solicitacoesAcesso.bloquearPorId ainda depende de
binding NUMERIC/erros e identidade/privilegios efetivos da integracao; perda de
resposta nao foi exercitada. Os criterios documentados de operacao Supabase
integral ainda nao se completaram. GET de custos integrado e GROUP_CONCAT
continuam pendentes; nao ha incremento por mera convencao ou por novos testes.

## Proximo incremento proposto, nao iniciado

Preparar e revisar uma stack PostgREST + PostgreSQL inteiramente descartavel:
rede interna exclusiva, sem saida para bancos reais, credenciais sinteticas,
imagem fixa e controle por manifesto. Revisar papeis authenticator/service_role,
EXECUTE e schema exposto somente no cluster novo. Se houver HTTP publicado,
vincular somente a loopback em porta exclusiva, validada antes.

Testar os adaptadores existentes por SDK com transporte real para essa stack,
sem mudar fabrica/provider/rotas principais: JSON NUMERIC, binding, respostas,
SQLSTATEs e status HTTP, commit/rollback por requisicao, timeout/perda de
resposta sem reenvio. JWT sintetico do gateway nao substitui o JWT proprio do
backend; testar futuramente o encadeamento confiavel de identidade separado.
Comecar pela decisao de acesso, sem retomar auditorias ja concluidas. Qualquer
provisionamento depende de autorizacao especifica; nenhuma stack foi iniciada.
