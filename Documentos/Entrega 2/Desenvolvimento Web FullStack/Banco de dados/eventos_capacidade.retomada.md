# Retomada concluída — 06/11/2026

Backend em `http://localhost:3001` e React em `http://localhost:5173`, mantidos
em sessões persistentes de console com saída acessível e Ctrl+C disponível.
Sessões operacionais: backend 9438, frontend 39220. As primeiras tentativas de
processos desacoplados não permaneceram ativas; foram substituídas pelas sessões
persistentes e as leituras foram repetidas com sucesso. Não houve nova migração.

Backup e manifesto preservados com os SHA-256 anteriormente comprovados.

## Limpeza especificamente autorizada

Antes de iniciar, os cinco registros foram comparados com o snapshot e os
caminhos/buckets validados; estavam elegíveis, sem leases e sem referências
atuais. O supervisor existente foi iniciado pelo fluxo normal, com preflight,
diagnóstico dry-run e timer de 60 segundos. Não houve exclusão manual ou forçada.

Resultado final: cinco objetos removidos do Storage; cinco registros preservados
no diário com estado `removido`, zero erros, zero leases e os cinco tombstones
com próxima verificação após nova quarentena de 24 horas. Nenhuma imagem atual
foi removida. O supervisor continua ativo, respeitando as regras existentes.

## Leituras e autorização

- GET autenticado `/eventos/capacidades`: 200, `controleCapacidade: true`, ações
  da gestão disponíveis, controle de versão ativo e `excluir: false`.
- Sem token e com identificador inexistente em token diagnóstico: 401.
- Participante acessando `/admin/eventos`: 403.
- GET administrativo: seis eventos, quatro Ativo e dois Em planejamento,
  capacidade e vagas restantes NULL, lotado false, total de cinco confirmados.
- GET organizador: somente eventos do proprietário selecionado.
- GET participante: quatro eventos ativos disponíveis.
- Verificação oficial completa igual ao resultado posterior à migração:
  marcador 3, sete funções, três triggers, dados e relacionamentos preservados.
- GET de capacidades de imagens: consultar/alterar false; configuração de
  uploads de eventos permanece desativada.
- React respondeu 200 para HTML e módulos principais, incluindo capacidades,
  componente de vagas e serviço apontando para a porta 3001. CORS das chamadas
  ao backend permite a origem 5173. Não foi realizada inspeção visual de navegador.

As verificações usaram somente GET e leituras PostgreSQL. Tokens diagnósticos
foram gerados apenas em memória, com expiração de dois minutos, usando a
configuração existente; não houve alteração de credenciais ou dados de usuários.
Nenhum teste de criação/edição/inscrição/exclusão em eventos reais foi executado.

Evidências sem dados pessoais ou credenciais:

- `PI Backend/evidencias/eventos-capacidade-retomada-20261106.json`
- `PI Backend/evidencias/eventos-capacidade-limpeza-retomada-20261106.json`
- `PI Backend/evidencias/eventos-capacidade-frontend-retomada-20261106.json`

Sem alteração de migrações, credenciais, políticas ou configurações de segurança,
sem ativação de uploads de eventos, commit ou push.
