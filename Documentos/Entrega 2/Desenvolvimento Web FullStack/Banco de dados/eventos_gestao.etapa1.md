# Eventos — etapa 1, 04/11/2026

Estado atual: migração aplicada manualmente pelo responsável no projeto
`gnwybroqfvwosiqzsfla`. Verificação posterior e ativação do backend registradas
ao final deste documento. Não reaplicar a migração.

## Preflight real, somente leitura

Evidência: `PI Backend/evidencias/eventos-preflight-20261104.json`.
Projeto `gnwybroqfvwosiqzsfla`, vínculo REST/PostgreSQL conferido, TLS validado,
transação REPEATABLE READ READ ONLY encerrada com ROLLBACK. Nenhuma escrita remota.

O schema contém os dez campos de eventos do SQL base, com os mesmos tipos,
limites e nulabilidade; não contém colunas adicionais de gestão. FKs e índices
conferem com `trocaticket_supabase.sql`: proprietário, vínculos de inscrições,
unicidade usuário/evento e cascatas para custos/cotações. Existem quatro eventos
Ativo e dois Em planejamento. Não existem triggers de negócio nesses dois
objetos nem as RPCs novas. RLS já está habilitado em eventos e inscrições, sem
FORCE RLS e sem políticas; esta etapa não modifica essas configurações. O SQL
base, sozinho, não documenta toda a configuração de segurança já instalada.

## Contrato de estados

- Em planejamento → Ativo ou Cancelado.
- Ativo → Cancelado ou Encerrado.
- Cancelado e Encerrado são terminais; dados básicos ficam somente para leitura.
- Não existe reabertura, exclusão física pela API normal ou mudança de dono.
- Publicação exige início futuro. Horário e calendário usam America/Sao_Paulo.
- Encerramento manual exige que o horário de início já tenha sido atingido.
  O schema ainda não possui horário final: não se presume a duração do evento.
- Inscrições terminam no início, mesmo que um evento antigo continue Ativo.
- Após publicação, somente descrição pode mudar, mesmo sem inscrições. A regra
  conservadora protege também os casos em que inscrições surgem concorrentemente.
- Inscrições existentes mantêm seu status; a interface mostra separadamente o
  estado do evento. Não há cancelamento em massa ou reembolso implícito.

## Implementado sem migração

Validação de calendário real, horário HH:mm, campos obrigatórios, controles,
nome até 100, local até 200, categoria até 100, descrição até 10.000 caracteres e
público inteiro positivo no limite integer PostgreSQL. Público segue sendo
previsão, não estoque de ingressos.

O backend Supabase normal usa o modo seguro dos repositórios existentes.
`GET /eventos/capacidades` anuncia as operações disponíveis. Função ausente é
detectada explicitamente; erros de rede/permissão não liberam caminhos legados.

`PATCH /eventos/:id/cancelar` e `/encerrar` funcionam com o schema atual,
conferindo organizador/propriedade e comparando o snapshot completo no UPDATE.
Transição concorrente ou edição intermediária resulta em 409. Somente status é
alterado; filhos não são apagados. As comparações REST anteriores à migração seguem
a collation do banco; não equivalem a uma comparação literal de textos. Após a
migração usam RPC com controle de versão. Não manter escritores legados ativos
durante a liberação, pois não enviam a versão ou a chave de criação obrigatórias.

O DELETE de eventos no backend Supabase atualizado é recusado sem exclusão.
Consultas permanecem disponíveis; o catálogo de participantes omite eventos cujo
início já passou. Frontend diferencia os quatro estados, oferece cancelamento e
encerramento, bloqueia campos publicados/terminais e protege envios em andamento.

O adaptador MySQL isolado mantém os contratos legados para regressão; não é um
caminho alternativo de produção. O startup existente já recusa MySQL principal.

## Bloqueios até migração autorizada

Criação, edição, publicação e novas inscrições no backend Supabase atualizado
exigem a infraestrutura transacional nova. Sem ela retornam 503 e os controles
da interface permanecem desabilitados. Não há fallback REST para essas escritas.

O cadastro envia uma chave por rascunho e preserva a chave durante repetições na
mesma sessão da página. O banco registra a chave e o payload normalizado: mesma
chave/dados retornam o evento existente; mudança do payload com a mesma chave
retorna conflito. Após perda de resposta, consultar Meus Eventos antes de iniciar
outro cadastro, especialmente depois de recarregar/fechar a página.

## Migração revisada — aplicada em produção

`eventos_gestao.incremental.sql` adiciona versão, chave/payload de criação e datas
de publicação/cancelamento/encerramento. Registros anteriores recebem versão 1;
suas datas históricas desconhecidas permanecem NULL, sem backfill inventado.
Não muda nomes de status existentes, proprietário ou relações comerciais.

Adiciona índice de idempotência e CHECK de estados, além das RPCs de capacidade,
gestão e inscrição. Triggers impõem versões/transições e fazem novas inscrições
disputarem o mesmo lock de evento usado por cancelamento/encerramento. Funções
são SECURITY INVOKER, restritas ao backend; grants inesperados abortam a migração.
Não altera RLS, políticas, credenciais ou privilégios de tabelas existentes.

Toda operação de gestão verifica perfil atual e conta descartável em encerramento,
trava usuário antes de evento e exige versão nas mudanças de registros existentes.
Conflito de versão retorna 409; não se reenvia automaticamente uma escrita incerta.
O schema não implementa lotes, vendas, capacidade de inscrições ou pagamentos.

O JWT é autenticado no Express. As funções SQL não verificam JWT nem usam auth.uid():
confiam somente no backend autorizado a executar como service_role. O ator é
derivado de req.usuario, nunca de um ID arbitrário fornecido no corpo HTTP. No SQL,
perfil atual, propriedade, versão e estado são conferidos novamente. As funções
são SECURITY INVOKER e não concedem acesso a anon/authenticated.
O search_path das funções fica restrito a pg_catalog, com todas as tabelas
qualificadas por public, evitando interferência de funções homônimas em public.
As datas da chave de criação são normalizadas em ISO sem depender de DateStyle.

Revisão de liberação: comparações estruturais dos publicados usam collation C,
incluindo caixa e acentos. Edição de descrição preserva literalmente os outros
campos legados (categoria NULL, espaços e segundos). Chave/payload da criação,
metadados históricos e versão não podem ser substituídos pelo chamador; o próprio
trigger atualiza versão e datas. A UI normaliza campos nulos apenas para o formulário,
sem gravar essa normalização nas colunas estruturais dos eventos publicados.

A migração verifica USAGE nas sequences e privilégios existentes, e recusa triggers
de negócio não revisados. Não corrige permissões nem defaults automaticamente.
Adquire locks exclusivos com NOWAIT: tabela ocupada aborta imediatamente. Durante
a transação os locks bloqueiam leituras e escritas nessas tabelas; é necessária
uma breve janela de manutenção. statement_timeout=30s é por instrução, não prazo
total em PostgreSQL 15/16. Em 17/18 há também transaction_timeout=30s. O timeout
de inatividade em transação é 15s; os ajustes são locais e não persistem após COMMIT.

## Validação e liberação futura

Testes essenciais locais cobrem validação, proprietário, bloqueios sem migração,
idempotência concorrente, versão antiga, restrição de edição publicada, transições,
inscrição em evento passado/finalizado e disputa inscrição/cancelamento. O SQL
foi aplicado somente a PostgreSQL Docker descartável com dados sintéticos.

A liberação exige parada dos escritores antigos, aplicação única, verificação
dos dados e permissões e inicialização somente do backend atualizado. A edição
dos arquivos não atualiza uma instância já em execução. A parada e a aplicação
posteriores à revisão estão registradas em `eventos_gestao.parada.md` e na
evidência de ativação indicada abaixo.

Custos, cotações, propostas e suas rotas existentes foram preservados. Esta etapa
define as regras dos dados básicos de evento e de novas inscrições; não redesenha
o ciclo comercial dos fornecedores, estoque ou cobrança.

## Aplicação pelo SQL Editor — somente após autorização

Roteiro mantido como registro do procedimento. A migração já foi aplicada;
não repetir o passo de aplicação.

1. Confirmar no Dashboard o Project Reference `gnwybroqfvwosiqzsfla`. O nome do
   banco `postgres`, sozinho, não identifica o projeto. Usar o papel `postgres`.
2. Reservar uma janela curta, parar/drenar todas as instâncias escritoras antigas
   e impedir seu reinício automático. Ter o backend/frontend atualizados prontos
   para implantação. Não é necessário alterar RLS, chaves ou configurações do projeto.
3. Executar integralmente `eventos_gestao.verificacao.sql` e salvar/exportar o JSON.
   Esperado: seis eventos (quatro Ativo e dois Em planejamento), arrays vazios
   para colunas/funções/triggers novos, nenhuma restrição/índice da migração,
   service_role_usage=true nas duas sequences e PostgreSQL 15 a 18. Se os dados
   ou objetos divergirem, interromper para revisão; não normalizar registros reais.
4. Em uma consulta nova, executar TODO `eventos_gestao.incremental.sql`, de BEGIN
   até COMMIT, uma única vez. Não executar apenas um trecho nem retirar guardas.
   NOWAIT recusado indica atividade concorrente: executar ROLLBACK se necessário,
   identificar a sessão e aguardar sua conclusão normal, sem terminá-la à força.
   Qualquer outro erro exige ROLLBACK e diagnóstico. Se perder a conexão/resposta,
   verificar os objetos instalados antes de qualquer nova tentativa.
5. Reexecutar `eventos_gestao.verificacao.sql`, ainda com os escritores parados.
   Os blocos integridade (contagens E hashes), estados, chaves_estrangeiras e
   seguranca_tabelas devem coincidir com o JSON anterior. Hash é uma conferência
   de conteúdo, não substitui backup. Os seis registros devem aparecer em
   legados_com_metadados_iniciais; suas datas históricas continuam NULL.
6. Conferir seis colunas novas; cinco funções com security_definer=false,
   anon=false, authenticated=false, service_role=true e service_role_grant_option=false;
   dois triggers habilitados (O); restrição validada; índice único válido/pronto.
   Não chamar gerir_evento_v1 ou inscrever_evento_v1 com usuários/eventos reais
   para tentar validar a instalação.
7. Executar somente a prova de leitura abaixo. Esperado: versao_gestao=1.

```sql
BEGIN READ ONLY;
SET LOCAL ROLE service_role;
SELECT public.eventos_capacidades_v1() AS versao_gestao;
ROLLBACK;
```

8. Implantar/reiniciar apenas a versão atualizada do backend, atualizar a interface
   e conferir GET /eventos/capacidades autenticado. As operações de gestão e novas
   inscrições devem ser anunciadas disponíveis; DELETE continua indisponível.
   Conflitos de versão retornam 409 e pedem nova consulta. Uma divergência na
   verificação mantém a aplicação fechada para diagnóstico, sem rollback destrutivo.

Testes desta revisão: seis eventos sintéticos com a mesma distribuição de estados,
RLS e collation ICU da base; preservação integral de eventos e filhos; ausência de
USAGE; defaults indevidos; rollback; recusa imediata de lock; negação das três RPCs
para anon/authenticated; replay após edição; nova chave legítima; adulteração de
metadados; caixa/acento; campos nulos/segundos legados; estados; concorrência e
segunda aplicação. Na revisão, o SQL foi exercitado somente no Docker;
a aplicação manual em produção e sua verificação posterior ocorreram depois.

## Ativação verificada em produção — 04/11/2026

Evidência completa:
`PI Backend/evidencias/eventos-ativacao-c6e750f6-bcb1-48e1-b7b0-ce8c029d144b.json`.

Projeto reconfirmado por REST e configuração PostgreSQL vinculada, com TLS
validado. A consulta de verificação foi executada em transação somente leitura,
encerrada com ROLLBACK, antes de iniciar o backend. Contagens e hashes das seis
tabelas coincidem integralmente com o preflight salvo antes da migração:
seis eventos, cinco inscrições, dois custos, seis cotações, 17 itens de cotação e
seis propostas. Estados (quatro Ativo, dois Em planejamento), FKs e segurança
das tabelas permanecem iguais. Nenhuma escrita de negócio foi usada para provar
a instalação.

Confirmadas seis colunas, seis registros com metadados iniciais, cinco funções
SECURITY INVOKER com search_path restrito e permissões revisadas, dois triggers
habilitados, restrição validada e índice único válido/pronto. O marcador SQL
retornou 1 como service_role em READ ONLY, com ROLLBACK.

Backend atualizado iniciado na porta 3001, PID 31196, com console visível e
acessível para Ctrl+C. O encerramento gracioso local está carregado nessa
instância: bloqueia novas admissões, aguarda HTTP, persistência e limpeza e
fecha o pool sem finalizar à força por timeout. O preflight de imagens e o
dry-run de limpeza passaram no startup; o agendamento permanece a cada 60 s.
A quarentena de 24 horas foi preservada.

Um ciclo automático posterior ao startup foi observado nas estatísticas SQL
existentes (contador da consulta do worker de 107 para 108), sem disparo manual
de limpeza. A integridade e o diário foram reconferidos depois desse ciclo e
permaneceram iguais.

GET /eventos/capacidades autenticado retornou 200 com criar, editar, publicar,
inscrever, controleVersao, cancelar e encerrar habilitados, e excluir=false.
O número da versão foi comprovado pelo marcador SQL; a resposta HTTP mantém
seu contrato de flags. JWTs diagnósticos curtos ficaram somente em memória,
com IDs/perfis existentes lidos do banco, sem alterar contas ou credenciais.
Requisições reais de validação usaram exclusivamente GET.

Passaram provas de ausência de token, token inválido e usuário inexistente
(401), perfil sem permissão administrativa (403), leitura própria (200),
isolamento de outro organizador (404), listagem administrativa dos seis eventos
e catálogo de participantes limitado a eventos ativos com início futuro.
Criação, edição, publicação e transições continuam condicionadas ao proprietário,
versão, estado e horário; não foram exercitadas em eventos reais. A exclusão
física pela API está bloqueada pelo adaptador seguro, confirmado em teste local.

Compatibilidade React conferida pelo serviço servido no Vite, oito testes
essenciais de frontend, lint e build. Trinta e seis testes essenciais de backend
passaram; o teste SQL Docker não foi repetido nesta ativação. A consulta de
integridade foi repetida após as leituras HTTP: dados e diário de cinco objetos
de imagens permaneceram iguais. Não houve nova migração, mudança de RLS,
credenciais, commit ou push.

Gerenciamento básico de eventos liberado nesta instância. Recarregar a interface
para obter as capacidades atuais. Imagens de eventos podem seguir como próxima
etapa, aproveitando a infraestrutura de imagens existente; lotes, vendas e
pagamentos continuam fora do escopo desta liberação.
