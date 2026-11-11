# Visão geral administrativa

A entrada `#/admin` abre a Visão geral. Solicitações permanece em
`#/admin?secao=contas`; Painel de evento continua uma seção independente.

## Dados utilizados

- `GET /solicitacoes-acesso`: contagem de registros com status `pendente`.
- `GET /admin/eventos`: quantidade de eventos, incluindo todos os estados.
- `GET /usuarios`: quantidade de contas, incluindo todos os perfis.

São consultas administrativas existentes, autenticadas e restritas pelo backend.
Os repositórios Supabase percorrem as páginas das listas e verificam sua
completude. Não foram criados endpoints ou modificadas permissões.

As consultas são independentes e não representam um snapshot transacional
conjunto. As contagens não têm filtro temporal e não são atualizadas em tempo
real. O botão Atualizar resumo refaz as três consultas; reabrir a seção também
faz novas consultas. Falhas não são convertidas em zero. Erros 401/403 ocultam
os indicadores e atalhos do resumo.

## Limitações deliberadas

Cotações e Propostas possuem atalhos, sem consultas adicionais no dashboard.
Não há séries históricas, indicadores financeiros, gráficos, notificações,
busca global ou Relatórios. Os dados existentes não justificam esses indicadores
neste lote. A tela não realiza operações administrativas de escrita.

## Validação local

Executar em PI React:

```powershell
node --test tests/adminVisaoGeral.test.js tests/adminLayout.test.js tests/administrador.test.js tests/adminNavegacao.test.js tests/adminCatalogos.test.js tests/adminHarmonizacao.test.js tests/estruturaResponsiva.test.js tests/useFocoModal.test.js tests/navegacaoUrls.test.js tests/historicoNavegacao.test.js tests/autenticacaoNavegacao.test.js tests/useNavegacao.test.js tests/painelEventoAdmin.test.js
npm.cmd run lint
npm.cmd run build
```

Os testes de CSS verificam regras estruturais em 1920, 1366, 768, 390 e 360px;
não substituem inspeção visual em navegador.
