# TrocaTicket — instruções limpas de entrega (E2)

Documento técnico proposto para acompanhar a entrega da pasta Desenvolvimento
Web FullStack. Não contém credenciais e não aprova licenças ou autoria em nome
dos integrantes. Consulte [SANEAMENTO_E2.md](SANEAMENTO_E2.md) antes de distribuir:
o README raiz e os dois dumps originais ainda exigem decisão.

## Tecnologias e estrutura

- `PI React`: React, Vite, React Router 7/data HashRouter, componentes por perfil,
  hooks, serviços, validações, estados assíncronos e páginas públicas 403/404.
- `PI Backend`: Node.js/Express, JWT, autorização no servidor, serviços e
  repositórios. Supabase é o modo principal documentado; adaptadores e scripts
  locais históricos não implicam troca automática de provedor.
- `Banco de dados`: SQL versionado e diagnósticos. Não executar arquivos em
  ordem alfabética nem importar dumps de origem desconhecida.

Pré-requisito: Node.js 24 e npm. Em cada pasta npm, instalar com `npm.cmd ci`
e os lockfiles fornecidos; instalação e downloads não foram executados no E2.

```powershell
# Partindo desta pasta:
Set-Location 'PI Backend'
npm.cmd ci
Set-Location '..\PI React'
npm.cmd ci
```

## Execução: escolher o ambiente corretamente

**Principal:** API em `http://localhost:3001` e frontend em
`http://localhost:5173/#/inicio`. O backend pode usar o Supabase compartilhado;
não é modo offline ou isolado. Requer configuração privada autorizada,
manifestos/guardas compatíveis e serviços disponíveis. Não fornecer segredos
no frontend, README, slides ou pacote de entrega.

Somente após essas pré-condições, em terminais separados:

```powershell
# Terminal na pasta PI Backend:
npm.cmd start
```

```powershell
# Terminal na pasta PI React:
npm.cmd run dev -- --host localhost --port 5173 --strictPort
```

O startup principal não é diagnóstico somente leitura; pode iniciar rotinas de
imagens. Não executar para contornar guardas, falhas ou falta de autorização.
E2 não iniciou serviços e não validou a conexão real.

**Inspeção isolada:** seguir [VALIDACAO_MANUAL_F10.md](VALIDACAO_MANUAL_F10.md),
incluindo prévia confirmação da identidade da API sintética local. A configuração
Vite isolada não lê `.env` e não usa API 3001:

```powershell
# Na pasta PI React:
npm.cmd run dev -- --config vite.isolated.config.js --mode isolado
```

O endereço é `http://127.0.0.1:5174/#/inicio`, com proxy para a API local isolada
3107. Isso não cria backend/dados e não autoriza usar um processo desconhecido.
Sem ambiente sintético comprovado, testar apenas páginas públicas e registrar
os demais fluxos como pendentes. Não substituir o serviço por mocks para simular
uma demonstração operacional.

## O que apresentar

| Perfil | Implementação existente | Limite |
| --- | --- | --- |
| Participante | Explorar/detalhar eventos, inscrições, ingressos, perfil e privacidade | Inscrição depende de capacidade, estado e disponibilidade |
| Organizador | Eventos, custos, ticket/acréscimo, cotações e propostas | Estimativas não representam cobrança ou receita; operações exigem propriedade e capacidade |
| Fornecedor | Oportunidades, envio/histórico de propostas, portfólio e Meu perfil | Portfólio/imagens dependem da infraestrutura; contratos não estão operacionais |
| Administrador | Dashboard, solicitações individuais, consultas, painel de evento e cinco relatórios | Criação administrativa e gestão de perfis permanecem bloqueadas |

Manter `ADMIN_EVENTOS_CRIACAO_ATIVA`, `ADMIN_PERFIS_GESTAO_ATIVA` e
`CONTRATACOES_ATIVAS` ausentes/false. A7/A10/F8 são implementações locais
preparadas, não funcionalidades ativadas. Não apresentar pagamentos, assinatura
digital ou relatórios financeiros inexistentes. Cadastro continua condicionado
às capacidades e à aprovação dos termos em minuta.

## Verificação local

```powershell
# Na pasta PI Backend, sem iniciar servidor principal:
npm.cmd test
```

```powershell
# Na pasta PI React (não há script npm test):
node --test tests/*.test.js
npm.cmd run lint
npm.cmd run build
```

Para servir o build, em vez do servidor de desenvolvimento:
`npm.cmd run preview -- --host localhost --port 5173 --strictPort`.
Não abrir `dist/index.html` por file:// e não executar preview e dev na mesma porta.

Baseline do E1, não uma nova execução completa no E2: React 989 aprovados;
backend 1.758 aprovados e 23 skips; ESLint/build/sintaxe/diff aprovados.
Skips não aprovam PostgreSQL: oito casos históricos e 15 integrações opcionais.
Docker Linux e inspeção visual estavam indisponíveis nessa revisão.

## Referências e pendências

- [E1 — resultados e checklist](ENTREGA_FINAL_E1.md).
- [E2 — riscos e decisões](SANEAMENTO_E2.md) e
  [inventário candidato](DISTRIBUICAO_E2.json), ainda não aprovado para publicação.
- [Demonstração presencial](DEMONSTRACAO_TROCATICKET.md),
  [roteiro visual](VALIDACAO_MANUAL_F10.md) e
  [registro de resultados reais](REGISTRO_VISUAL_F10.md).

Use contas sintéticas autorizadas, obtidas por canal privado, em sessões
independentes por perfil. Não projete segredos. Inscrições, salvamentos e envios
devem ser demonstrados apenas no ambiente isolado autorizado. O escopo ISC/CC BY
4.0 e a declaração de IA continuam dependentes dos autores; este guia não altera
as declarações existentes.
