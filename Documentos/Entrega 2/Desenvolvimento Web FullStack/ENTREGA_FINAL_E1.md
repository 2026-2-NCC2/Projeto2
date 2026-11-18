# E1 — Auditoria e preparação da entrega do TrocaTicket

Auditoria local de 17/11/2026, após F15. Este documento é o índice atual de
entrega; registros anteriores conservam as datas e resultados dos respectivos
lotes. Nenhum servidor principal, banco real ou Supabase foi acessado pelo E1.
Nenhuma alteração funcional foi realizada.

## Situação geral

O projeto compila e suas suítes locais passam. Há quatro portais integrados à
API, autenticação real e navegação por React Router. Isso não equivale a um
ensaio visual nem à aprovação das RPCs no PostgreSQL real nesta execução.

**Entrega acadêmica demonstrável com limites declarados; distribuição irrestrita
ainda pendente da revisão de credenciais e dumps. Não declarar pronto para uso
em produção.** Termos de Uso continuam em minuta, com cadastro condicionado à
aprovação e às capacidades existentes.

## Validações executadas

| Verificação | Comando / evidência | Resultado E1 |
| --- | --- | --- |
| React completo | `node --test tests/*.test.js`, em `PI React` | 989 aprovados, zero falhas/skips |
| Backend completo | `npm.cmd test`, em `PI Backend` | 1.781 testes: 1.758 aprovados, zero falhas, 23 skips |
| ESLint | `npm.cmd run lint`, em `PI React` | Aprovado |
| Build | `npm.cmd run build`, em `PI React` | Aprovado, sem aviso de chunk acima de 500 kB |
| Sintaxe Node | `node --check` nos arquivos atuais `.js`, `.cjs` e `.mjs` | 439 arquivos aprovados; JSX também processado por build/testes |
| Integridade do diff | `git diff --check` | Aprovado; avisos de conversão LF/CRLF não são erros de whitespace |
| Dependências instaladas | `npm.cmd ls --depth=0`, em ambas as pastas | Sem dependências diretas ausentes ou inválidas |
| Manifestos e lockfiles | Comparação de dependencies/devDependencies com packages[""] | Coerentes, lockfileVersion 3 |
| Docker Linux | `docker --context desktop-linux info --format '{{.OSType}}'` | Daemon indisponível: pipe Linux ausente; nenhuma configuração alterada |
| PostgreSQL real | Casos opcionais sem opt-in; Docker indisponível | Não executado, não aprovado por inferência |
| Visual / 200% / dispositivos | Nenhum navegador utilizado no E1 | Pendente de execução manual |

O build gerou entry JS de 394,75 kB (123,93 kB gzip) e CSS inicial de 87,34 kB
(15,86 kB gzip). O entry não é a soma de todos os imports/chunks. Portais continuam
sob demanda. Não foram medidos Core Web Vitals ou tempo real de interação.

### Justificativas dos 23 skips

- **8 históricos:** `propostas-fornecedor-rpc-comparacao.test.cjs`; comparação
  estrita anterior não exigida pelo contrato ICU aprovado. Não são testes aprovados.
- **15 integrações PostgreSQL opcionais:** A7 v1/v3 (2), A10 (1), contratações F8
  (1), ensaio conjunto A7+A10+F8 v1/v3 (2), backup V2 sintético (1), contas de
  teste/imagens (1), capacidade de eventos (1), gestão de eventos (1), eventos e
  imagens (1), SQL de imagens do perfil (1), transações de imagens (1), portfólio
  (1) e termos (1).

Nenhum opt-in PostgreSQL estava habilitado no processo. O teste de termos também
detecta a indisponibilidade do Docker. Asserções estáticas e mocks não comprovam
locks, rollback, privilégios, RLS ou concorrência em banco real. Resultados locais
de lotes anteriores não foram reexecutados nem transferidos para esta aprovação.

## Estrutura e funcionamento comprovados pelo código e testes

| Área | Implementação existente | Limite operacional |
| --- | --- | --- |
| Entrada pública | Landing, Login, quatro perfis apresentados, 403/404 e transparência | Login depende da API; seleção visual do perfil não concede acesso |
| Participante | Explorar/buscar eventos, detalhes, inscrição, ingressos, perfil e privacidade | Inscrição exige capacidade, estado e vagas; gravação real não ensaiada no E1 |
| Organizador | Dashboard, filtros, criação/edição, custos, ticket/acréscimo, cotações e avaliação de propostas | Publicação e demais operações dependem das capacidades e propriedade; valores são estimativas |
| Fornecedor | Oportunidades, elaboração/envio e histórico de propostas, desempenho, portfólio e Meu perfil | Portfólio/imagens dependem da infraestrutura habilitada; contratos continuam indisponíveis |
| Administrador | Visão geral, solicitações individuais, usuários, eventos/painel, cotações, propostas e cinco relatórios | Não inclui criação administrativa ou mudança de perfil operacional |
| A7 | Tela, endpoint, auditoria/idempotência e SQL versionados | `ADMIN_EVENTOS_CRIACAO_ATIVA` ausente/false; não ativar |
| A10 | Gestão de perfil único, autorização/auditoria e SQL versionados | `ADMIN_PERFIS_GESTAO_ATIVA` ausente/false; não ativar |
| F8 | Formalização e ciclo de contratações implementados localmente | `CONTRATACOES_ATIVAS` ausente/false; não ativar; não é assinatura digital nem pagamento |

As três flags protegidas foram encontradas ausentes na configuração efetiva
local examinada, e o backend exige exatamente `true` para habilitá-las. Seus
instaladores também têm default false. Isso não certifica configurações de outro
processo já iniciado ou de implantação externa. Nenhuma flag foi modificada.

Evidências principais:

- `PI React/src/router/RouterAplicacao.jsx`, `router/contratos.js` e
  `hooks/useNavegacao.js`: createHashRouter, contratos de URL e useBlocker.
  A rota contêiner preserva o App; caminhos/seções inválidos geram 404, acesso
  não autorizado tem apresentação 403. Não há controlador paralelo de histórico.
- `PI React/tests/historicoNavegacao.test.js`: Router/DOM reais, acesso direto,
  restauração equivalente à montagem após F5, histórico, sessão, rascunhos e foco.
- `PI Backend/server.js`, `autenticar`/`permitirPerfis`: JWT HS256 validado e
  usuário/perfil atuais recuperados pelo servidor; seleção do Login não é autoridade.
- `PI React/src/utils/validarEvento.js` e `PI Backend/services/eventos.cjs`:
  início futuro em America/Sao_Paulo, mensagens próprias e edição histórica
  preservada. A proteção SQL final não foi revalidada em PostgreSQL no E1.
- Testes de `participanteVisual`, `organizadorVisual`, `fornecedorVisual`,
  catálogos/relatórios administrativos, recuperação F9 e acabamentos F11–F15:
  estados assíncronos, filtros, ações e regras estruturais responsivas.

## Problemas e pendências reais

| Prioridade | Evidência | Ação antes da entrega/divulgação |
| --- | --- | --- |
| Alta — distribuição | README da raiz, bloco de acesso aos perfis, contém e-mails e senhas em texto claro apresentados como teste | Retirar valores da documentação distribuída e usar canal privado; confirmar origem/validade sem testar credenciais no remoto. Se forem utilizadas em serviço ativo, tratar sua exposição com o responsável |
| Alta — distribuição | `Banco de dados/trocaticket.sql` e `trocaticket_supabase.sql`: cada dump contém 9 e-mails e 9 hashes bcrypt | Confirmar origem fictícia e autorização de distribuição ou preparar futuramente versão sanitizada. Não considerar hash como anonimização; nenhum dump foi modificado |
| Média — validação | 15 integrações PostgreSQL opcionais sem execução real | Executar futuramente em PostgreSQL 17 descartável, conforme opt-ins e isolamento documentados; não usar o banco compartilhado |
| Média — apresentação | Inspeção visual e ensaio conectado dos quatro perfis não realizados no E1 | Preencher o roteiro F10 com observações reais, inclusive 320px e zoom 200%; testar gravações apenas em ambiente sintético isolado autorizado |
| Média — documentação | README declara CC BY 4.0; backend declara ISC; o próprio README registra escopo pendente | Autores precisam confirmar o escopo; E1 não altera licenças nem atribuições |
| Média — operação | localhost principal usa API 3001 e Supabase compartilhado; startup pode executar rotinas de imagens/limpeza | Não chamar isso de demonstração offline ou de diagnóstico somente leitura; não iniciar/reiniciar o principal para a auditoria |
| Média — ativação futura | A7/A10/F8, retenção e recuperação pendentes | Manter bloqueios. Reutilizar revisão integrada e plano de ensaio; ativação exige decisão independente, não é requisito para apresentar os fluxos atuais |
| Baixa — documentação | Guias PI/F4/F5/F9/F10 registram contagens e builds de suas datas | Usar este documento como índice atual; os números anteriores são históricos, não resultados atuais |

O README da raiz não documenta por completo o Router/404, os bloqueios atuais nem
o roteiro isolado mais recente. Também sugere aceitar a porta informada pelo Vite,
mas o CORS principal exige localhost:5173. Usar `--strictPort`, conforme o guia de
demonstração. A revisão do README raiz fica pendente; ele não foi editado no E1.
A declaração de IA em PDF não foi revalidada neste lote: confirmar com os autores
se o texto/modelo e as atribuições correspondem ao uso efetivo, sem inferi-los.

Não foi reproduzida falha funcional na suíte executada. Isso não comprova ausência
de falhas no navegador, na infraestrutura ou em dados reais.

## Segurança e organização dos arquivos

- Varredura de **755 arquivos textuais atuais** versionados/não rastreados não
  ignorados nesta pasta, mais revisão separada do README raiz. Não é auditoria
  do histórico Git, de binários, de todos os PDFs ou de segredos em execução.
- Não foram encontrados blocos de chave privada, JWTs literais ou URLs de banco
  com senha nos padrões pesquisados. Tokens com formato de provedor apareceram
  em fixtures de testes; isso não elimina as pendências de credenciais do README
  e dados dos dumps nem certifica ausência absoluta de segredos.
- `.env` privado do backend, `node_modules` e `dist` são ignorados pelo Git.
  Não incluir essas pastas/arquivos ao montar um ZIP manual. Os SQLs históricos
  estão versionados e não ficam protegidos apenas por existir `.gitignore`.
- Nenhum arquivo temporário `.log`, `.tmp`, `.bak` ou arquivo sob `arquivo/`
  foi identificado na lista de entrega não ignorada. Diretório vazio ou arquivo
  histórico não significa lixo. Nenhum arquivo foi excluído.
- Dependências diretas têm referências no código/testes/ferramentas. Não foi
  comprovada dependência dispensável; mysql2 e pg têm usos em adaptadores,
  infraestrutura e ensaios históricos. Nenhum manifesto/lockfile foi alterado.
- Melhoria opcional posterior: `server.js` (1.188 linhas), `App.jsx` (687),
  `PortalParticipante.jsx` (616) e `PortalFornecedor.jsx` (526) ainda concentram
  responsabilidades. A separação em componentes/hooks/serviços existe; refatoração
  ampla agora acrescentaria risco e não é condição para a demonstração.
- O grafo de código estava desatualizado em relação ao HEAD; lacunas indicadas
  por ele foram confrontadas com fontes/testes atuais, não tratadas como fatos.

## Instalação e validação reproduzível

Node 24 e npm; nesta auditoria: Node 24.21.0, npm 11.19.0. Instalações presentes:
React/React DOM 19.3.0, React Router 7.18.5, Vite 8.3.0, Express 5.3.0 e cliente
Supabase 2.118.0. Os intervalos de versão e lockfiles continuam preservados.

Executar em cada diretório, a partir desta pasta:

```powershell
# Instalação futura, com rede e lockfiles revisados; não executada no E1.
Set-Location 'PI Backend'
npm.cmd ci
# Voltar à pasta deste documento e instalar também em PI React:
Set-Location '..\PI React'
npm.cmd ci
```

```powershell
# Em PI Backend, sem iniciar server.js:
npm.cmd test
```

```powershell
# Em PI React (não há script npm test):
node --test tests/*.test.js
npm.cmd run lint
npm.cmd run build
```

Backend não possui script de lint/build: é Node/CommonJS; houve validação de
sintaxe e testes. SQL foi lido e coberto por verificações estáticas; não houve
execução de migração ou validação sintática/transacional em PostgreSQL real.

Para abrir apenas a interface sem apontar à API principal, seguir
[VALIDACAO_MANUAL_F10.md](VALIDACAO_MANUAL_F10.md): configuração Vite isolada,
`npm.cmd run dev -- --config vite.isolated.config.js --mode isolado`, loopback
5174 e proxy para API isolada 3107. Essa configuração não cria o backend nem
dados de demonstração e exige conferir previamente a identidade do processo 3107.
Sem backend sintético confirmado, limitar-se às páginas públicas e registrar
as demais verificações como não executadas.

O modo principal de [DEMONSTRACAO_TROCATICKET.md](DEMONSTRACAO_TROCATICKET.md)
usa backend `npm.cmd start`/3001 e frontend
`npm.cmd run dev -- --host localhost --port 5173 --strictPort`. Exige configuração
privada e Supabase autorizado. Esses comandos não foram executados no E1.

## Checklist objetivo e apresentação

- [x] Testes locais, sintaxe, ESLint, build e diff aprovados.
- [x] A7/A10/F8 preservados desativados; nenhuma migração/backup/deploy realizado.
- [ ] Revisar credenciais do README e origem/distribuição dos dumps antes de
  compartilhar repositório ou pacote de entrega.
- [ ] Confirmar licenças, autores e declaração de IA; não trocar modelo por inferência.
- [ ] Conferir o pacote a partir de arquivos revisados: incluir fontes, lockfiles,
  instruções e SQLs autorizados; excluir configurações privadas e artefatos locais.
- [ ] Confirmar ambiente e contas sintéticas; não usar os dumps questionados
  para criar a demonstração antes dessa revisão.
- [ ] Executar [roteiro F10](VALIDACAO_MANUAL_F10.md) e preencher
  [registro visual](REGISTRO_VISUAL_F10.md): desktop, 768px, 390/375/320px,
  zoom 200%, menus, textos longos, foco, modais, F5 e Voltar/Avançar.
- [ ] Ensaiar a apresentação com internet/serviços necessários e sessões
  independentes por perfil. Não expor senhas, tokens ou cabeçalhos de rede no projetor.

Sugestão de apresentação para Lucas, Cadu e Guilherme: abrir Landing/Login e
mostrar os quatro perfis; Participante explora/detalha eventos e consulta seus
ingressos; Organizador apresenta evento, custos e ticket/acréscimo; Fornecedor
consulta cotações/propostas; Administrador mostra solicitações, filtros e cinco
relatórios. Para cada ação de gravação, usar somente o ambiente sintético
autorizado; caso indisponível, apresentar o formulário sem confirmar e explicar
o limite. Não chamar estimativa de receita, proposta de pagamento ou contratação
de assinatura digital. A7/A10/F8 são preparações locais, não recursos operacionais.

As integrações de banco, backup/recuperação real, retenção e ativação seguem os
documentos de [revisão integrada](Banco%20de%20dados/revisao_integrada_A7_A10_F8.md)
e [ensaio conjunto](Banco%20de%20dados/ensaio_integrado_A7_A10_F8.md), sem execução
automática. Gráficos, CSV e refatorações adicionais são evoluções opcionais.

## Alterações do E1

Criado este relatório e acrescentado aviso de atualização ao guia F5. Nenhuma
fonte, teste, dependência, SQL, flag ou configuração foi alterada. Antes do E1
havia 31 arquivos modificados e 25 não rastreados neste escopo; após estes dois
ajustes documentais há 32 modificados e 26 não rastreados, zero excluídos e zero
staged. Todos os lotes anteriores foram preservados. Não houve commit ou push.
