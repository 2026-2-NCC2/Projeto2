# Exclusao de evento corrigida

Caminho: React `src/App.jsx:aoExcluirEvento` chama `src/services/eventos.js:excluirEvento`, que envia DELETE /eventos/:id. O handler permite organizador e o repositorio filtra simultaneamente id e usuario_id do JWT. Nenhuma identidade do corpo substitui o proprietario.

Falha real reproduzida com dados exclusivamente descartaveis: inscricao vinculada gera PostgreSQL 23503/fk_inscricao_evento. A rota devolvia HTTP500 e o log generico `Falha em DELETE /eventos/:id.`. O frontend mostra a mensagem recebida; nao havia defeito comprovado no fetch. O Console do navegador permanece indisponivel pela protecao anterior; nao foi contornado nem apresentado como observado.

Correcao limitada a server.js: 23503 agora retorna 409 com `Nao e possivel excluir um evento com inscricoes ou propostas vinculadas.` e registra codigo fixo sem SQL, credenciais ou dados pessoais. Outros erros continuam 500. Evento ausente/alheio continua 404; perfis nao autorizados continuam 401/403. Nao foram alterados FKs, cascatas, RPCs, tabelas, design, React ou mecanismo de migracao. Eventos com inscricoes/propostas continuam protegidos, conforme as regras existentes.

Nove testes isolados especificos aprovados. Integracao real temporaria na porta3108: quinze requisicoes, login de tres usuarios ficticios, criacao de dois eventos, inscricao ficticia, reproducao 500 antes da correcao, 409 apos correcao preservando vinculos, DELETE alheio404, participante403, exclusao pelo dono200 apos retirar SOMENTE a inscricao ficticia, repeticao de evento ausente404. Comparacao integral dos oito dominios antes/depois confirmou que todos os registros preexistentes permaneceram identicos.

Primeira preparacao encontrou limitador de login429 na instancia normal. Os tres usuarios descartaveis IDs15/16/17 foram removidos por ID e marcador exatos. Nao se alterou o limitador. A limpeza usou igualdade porque LIKE e incompativel com a collation nao deterministica existente; nenhuma collation foi alterada.

Segunda execucao: usuarios18/19/20, eventos17/18, inscricao6; todos descartaveis, todos removidos. Zero residuos. IDs sao historicos de fixtures ja eliminadas; nunca usa-los para excluir novamente.

Evidencias detalhadas: exclusao-descartavel-e050fb87-fe54-4460-a441-2d68f1e5d73c.json e exclusao-descartavel-94ccfa82-9b19-42fd-9c15-47105db3cc2f.json. Nenhum token ou senha persistido nos relatorios.

Instancia temporaria encerrada. Backend normal reiniciado com a correcao na porta3001 e HTTP200 verificado. Nenhum commit criado. Validacao visual do alerta React pode ser feita manualmente, sem tentar excluir eventos reais para teste.
