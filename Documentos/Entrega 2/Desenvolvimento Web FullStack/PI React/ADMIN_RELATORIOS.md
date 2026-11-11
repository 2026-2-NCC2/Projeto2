# Relatórios administrativos — A8.2 e A8.3

`#/admin?secao=relatorios` oferece Eventos, Usuários, Solicitações de acesso,
Cotações e Propostas.
O seletor monta apenas um relatório por vez. Trocar o tipo desmonta a consulta
anterior, cancela sua resposta e inicia o novo relatório sem filtros. Atualizar
mantém os filtros do relatório selecionado. F5 restaura a seção, inicialmente em
Eventos; filtros e tipo selecionado não são persistidos na URL ou no storage.

## Dados e cálculos

- Eventos: GET /admin/eventos; estado, categoria, organizador e data de realização.
- Usuários: GET /usuarios; perfil e busca por nome/e-mail. Não há período de cadastro.
- Solicitações: GET /solicitacoes-acesso; estado, perfil solicitado e data do pedido.
- Cotações: GET /admin/cotacoes; estado, modalidade, evento e período, com escolha
  explícita entre criação e prazo. Modalidade e estado são campos independentes.
- Propostas: GET /admin/propostas; estado, evento, fornecedor e data de criação.
  Valor comercial por registro, formatado com o utilitário monetário existente,
  preservando os centavos dos decimais textuais. Não há soma financeira.

Total consultado conta todos os registros recebidos e validados. Quantidade filtrada,
distribuições e tabela usam o mesmo conjunto após os filtros combinados. Não há
limitação adicional de mil registros no React; a paginação completa já pertence aos
repositórios do backend. Registros incompletos ou IDs duplicados provocam erro sem
indicadores. Loading, 401/403, falhas e período inválido não são apresentados como zero.

As datas de realização seguem a parte de calendário do contrato existente de Eventos,
como nos catálogos. Datas dos pedidos são instantes convertidos para America/Sao_Paulo.
O prazo da cotação também é data de calendário. Criação de cotações e propostas usa
America/Sao_Paulo e exige instante com fuso explícito. Nenhuma dessas datas representa
aprovação ou recusa. Filtros de evento/fornecedor usam IDs presentes no próprio relatório,
sem consultas adicionais; nomes iguais continuam distinguíveis pelo ID no seletor.
A interface identifica explicitamente a semântica de cada período. Esta implementação
não revalida a fidelidade histórica dos instantes migrados nem o fuso do servidor.

As consultas REST não fornecem snapshot transacional entre páginas; contagens não
representam uma fotografia histórica nem garantem ausência de mudanças concorrentes.
Agrupamentos preservam os estados/perfis retornados, inclusive valores desconhecidos;
categoria ausente aparece como Não informada.

## Privacidade e limites

Todos os dados passam pelos serviços autenticados existentes. Nenhuma API ou permissão
foi adicionada. E-mails aparecem apenas na tabela de Usuários e na busca autorizada,
nunca nos indicadores. Solicitações não exibem e-mail ou justificativa nos relatórios.
Não há persistência dos conjuntos no navegador, exportação, CSV, gráficos, indicadores
financeiros, produtividade, datas de decisão ou séries históricas. Valores das propostas
não representam pagamentos, faturamento ou receita; a interface exibe esse aviso.

A configuração e o bloqueio da criação administrativa A7.2 não foram alterados.
O custo de rede/memória é proporcional
à lista completa do tipo selecionado; agregações no servidor exigem autorização futura.

## Verificação

Testes em tests/adminRelatorios.test.js: grupos, filtros, datas/fusos, listas de 2.001
registros, respostas incompletas, loading, erros/401/403, vazio, recarga e estrutura
responsiva em 1920, 1366, 768, 390 e 360px. Suites de layout/histórico/URL verificam
menu ativo, foco contextual, F5 e Voltar/Avançar. Testes estáticos e renderização simulada
não substituem inspeção visual em navegador ou validação de dados reais.
