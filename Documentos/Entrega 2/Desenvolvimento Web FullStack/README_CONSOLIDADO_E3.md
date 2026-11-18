# TrocaTicket — proposta de README da entrega final

PI Web FullStack · Entrega 2 · proposta E3 de 17/11/2026.
Este arquivo pode ocupar o nome `README.md` **somente em uma cópia de entrega
futuramente aprovada**. Não substitui o README original nem altera o histórico.
Não contém credenciais ou dados de acesso aos perfis.

## Apresentação e créditos

TrocaTicket conecta participantes, organizadores, fornecedores e administradores
em fluxos de eventos, inscrições, estimativas de custos, cotações e propostas.
Não implementa pagamentos, revenda ou assinatura digital de contratos.

Créditos registrados no README original, preservados como referência, sem
atribuição nova ou aprovação em nome de terceiros: Carlos Eduardo da Silva;
Lucas Pelliciotti Cintra Da Silva; Guilherme Harada Morato; Guilherme Fernandes
Alexandre de Carvalho. Confirmar com os responsáveis a versão final dos créditos.
O checklist de três revisores não autoriza remover um dos titulares registrados.

## Estrutura proposta

```text
TrocaTicket-entrega/
  README.md                    # cópia aprovada deste documento
  PI React/                    # fontes, recursos utilizados, testes e configs
  PI Backend/                  # API, serviços, repositórios, testes e scripts
  Banco de dados/              # SQL revisado, sem os dois dumps históricos
  PROPOSTA_ENTREGA_E3.md        # limites, decisões e checklist
  DISTRIBUICAO_E3.json          # inventário revisável, não é empacotador
  ...                          # guias listados no inventário
```

Configurações e evidências indispensáveis ainda dependem de aprovação. Esta
estrutura não é um pacote criado nem garante execução independente do ambiente
operacional. Preservar caminhos relativos e arquivos `.gitattributes` necessários;
não renormalizar arquivos selados para contornar validações.

## Tecnologias e arquitetura

- Frontend: React/Vite, React Router 7 com `createHashRouter`, componentes por
  perfil, hooks, serviços, estados assíncronos e validações acessíveis.
- Backend: Node.js/Express, JWT e autorização baseada no usuário atual do
  servidor. A escolha visual de perfil no Login não concede permissões.
- Persistência principal documentada: PostgreSQL/Supabase. Adaptadores locais
  históricos e suítes sintéticas não significam funcionamento offline completo.
- SQL incremental, preflights e ensaios locais versionados, sem aplicação
  automática. Não executar SQL em ordem alfabética.

As rotas por hash preservam acesso direto, F5, Voltar/Avançar e confirmações de
rascunho. Exemplos de navegação sem dados privados: `/#/entrar`,
`/#/participante?secao=perfil`, `/#/admin?secao=usuarios`.
Há distinção entre sessão ausente/expirada, acesso negado (403) e endereço ou
seção inexistente (404). Autorização efetiva continua no backend.

## Instalação

Pré-requisitos: Node.js 24, npm e lockfiles revisados. Para o modo principal,
também são necessários configuração privada autorizada, guardas compatíveis e
serviços disponíveis. Não há pacote npm na pasta intermediária.

```powershell
# Partindo da pasta deste documento:
Set-Location 'PI Backend'
npm.cmd ci
Set-Location '..\PI React'
npm.cmd ci
```

Não atualizar dependências durante a apresentação. `npm ci` e os comandos de
execução abaixo são instruções futuras; não foram executados pelo E3.

## Escolher o ambiente antes de iniciar

### Principal — exige autorização e configuração privada

Localhost não isola o banco. A API principal pode acessar o projeto Supabase
compartilhado entre desenvolvimento e testes, identificado como produção no
código. O startup também pode executar preflights e rotinas de imagens/limpeza.
Não iniciar para testar credenciais ou contornar bloqueios.

O responsável fornece privadamente as variáveis exigidas pelo ambiente, incluindo
`DB_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `JWT_SECRET`, além das
dependências de imagens quando habilitadas. Não versionar `.env`, copiar segredos
para `VITE_*`, remover guardas ou substituir evidências por aprovações fictícias.
Variáveis do processo prevalecem sobre o `.env`; revisar o ambiente efetivo.

Somente após as pré-condições, usar terminais separados:

```powershell
# Na pasta PI Backend:
npm.cmd start
```

```powershell
# Na pasta PI React:
npm.cmd run dev -- --host localhost --port 5173 --strictPort
```

API: `http://localhost:3001`. Interface: `http://localhost:5173/#/inicio`.
Não aceitar porta alternativa silenciosa: o CORS principal exige essa origem.
Uma resposta HTTP da raiz da API comprova apenas o processo HTTP, não a
conectividade do banco nem a autorização dos quatro perfis.

Para servir o build, usar no lugar do servidor de desenvolvimento:

```powershell
# Na pasta PI React:
npm.cmd run build
npm.cmd run preview -- --host localhost --port 5173 --strictPort
```

Não abrir `dist/index.html` por file://. Manter o servidor ativo para carregar os
módulos sob demanda. Não executar preview e dev simultaneamente na mesma porta.

### Inspeção local isolada — não cria um backend de demonstração

Seguir [VALIDACAO_MANUAL_F10.md](VALIDACAO_MANUAL_F10.md) e confirmar previamente
a identidade da API local isolada. Na pasta `PI React`:

```powershell
npm.cmd run dev -- --config vite.isolated.config.js --mode isolado
```

Interface em `http://127.0.0.1:5174/#/inicio`, proxy para a API isolada 3107.
Essa configuração não lê `.env`, não usa a API 3001 e não prepara dados.
Não usar processo desconhecido na porta 3107. Sem backend sintético comprovado,
limitar-se às páginas públicas e registrar os demais fluxos como não executados.
Não apresentar mocks de testes como demonstração operacional.

## Funcionalidades e limites

| Perfil | Fluxos implementados e testados localmente | Condição operacional |
| --- | --- | --- |
| Participante | Busca/detalhes de eventos, inscrições, ingressos, perfil e privacidade | Inscrição depende de capacidade, situação, disponibilidade e sessão válidas |
| Organizador | Dashboard, eventos, validação de início futuro em Brasília, custos, ticket/acréscimo, cotações e propostas | Exige propriedade/capacidades; valores são estimativas, não receita ou pagamentos |
| Fornecedor | Oportunidades, propostas enviadas, desempenho, portfólio e Meu perfil | Portfólio e imagens dependem da infraestrutura; contratos permanecem bloqueados |
| Administrador | Indicadores reais, solicitações individuais, consultas de usuários/eventos/cotações/propostas, painel e cinco relatórios | Sem criação administrativa ou gestão de perfis operacional |

A7, A10 e F8 permanecem desativados. Manter `ADMIN_EVENTOS_CRIACAO_ATIVA`,
`ADMIN_PERFIS_GESTAO_ATIVA` e `CONTRATACOES_ATIVAS` ausentes/false. SQL e código
preparados não equivalem a migração aplicada ou autorização para ativação.
Cadastro e privacidade preservam os avisos existentes; os termos continuam em
minuta. Não apresentar conformidade jurídica ou disponibilidade irrestrita.

Utilizar apenas contas sintéticas autorizadas, obtidas por canal privado. Não há
contas/senhas padrão neste documento. Abrir sessões independentes por perfil e
não projetar segredos, tokens ou cabeçalhos de autenticação. Ações de gravação
na apresentação exigem ambiente sintético isolado autorizado.

## Testes e validação

```powershell
# Na pasta PI Backend, sem iniciar server.js:
npm.cmd test
```

```powershell
# Na pasta PI React (não há script npm test):
node --test tests/*.test.js
npm.cmd run lint
npm.cmd run build
```

Baseline E1: React 989 aprovados; backend 1.758 aprovados e 23 skips, sem falhas.
ESLint/build e 439 verificações de sintaxe Node foram aprovados naquele lote.
São resultados datados, não nova execução completa no E3 ou prova de funcionamento
na máquina do avaliador. Os skips são oito casos históricos e 15 integrações
PostgreSQL opcionais; não representam aprovação SQL. E3 executa somente
verificações estáticas, sem bancos reais, migrações, ZIP ou distribuição.

Inspeção visual real, 320px e zoom 200% permanecem pendentes de execução manual.
Ver [REGISTRO_VISUAL_F10.md](REGISTRO_VISUAL_F10.md). Não converter testes de
regras CSS ou mocks em aprovação visual ou integração PostgreSQL real.

## Segurança, licenças e entrega

Os dumps históricos, README raiz com credenciais, `.git/`, configurações privadas,
backups, logs e caches ficam fora da proposta de pacote. Isso não apaga versões
anteriores ou elimina exposição no histórico. Rotação/revogação e eventual
tratamento do histórico dependem dos responsáveis e de autorização separada.

O README original apresenta CC BY 4.0; os metadados do backend apresentam ISC.
O escopo entre código/documentação continua pendente. Este texto não concede
licença, altera titulares nem aprova declaração de IA. Preservar avisos de
terceiros e confirmar o PDF/modelo com os autores antes da liberação.

Referências: [proposta e aprovações E3](PROPOSTA_ENTREGA_E3.md),
[inventário E3](DISTRIBUICAO_E3.json), [auditoria E1](ENTREGA_FINAL_E1.md),
[saneamento E2](SANEAMENTO_E2.md) e
[roteiro de demonstração](DEMONSTRACAO_TROCATICKET.md).
