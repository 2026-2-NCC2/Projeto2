# Validação da portabilidade — 2026-11-03

Implementação fundamentada no encerramento administrativo já documentado em
`resultado-encerramento-administrativo-20261103.json`. Critério:
`RECONCILIACAO_ATUAL`. A ausência histórica de escritas permanece não comprovada;
a lacuna histórica e a ausência de snapshot independente anterior continuam
explicitamente reconhecidas. Esta validação não produz novas provas históricas.

## Resultados

- Backend: `npm test`, 1.445 casos, 1.437 aprovados, zero falhas, oito skips
  históricos já existentes sobre equivalência estrita e contrato ICU.
- Cobertura inclui manifesto inválido/ausente/ilegível, projeto divergente,
  rotação de credenciais, MySQL/provedor ausente recusados, diretório privado
  ausente, arquivo local ausente em diretório existente, JSON/schema inválidos,
  erros de acesso, INCERTA, fases incompletas, congelamento e selagem.
- Procedimentos de admissão selada, migração, recuperação e rollback foram
  exercitados somente pelos testes com adaptadores simulados. Nenhum desses
  procedimentos foi executado contra o ambiente real.
- Frontend: `npm run build` e `npm run lint`, ambos aprovados.
- `git diff --check` aprovado.
- `node server.js` iniciou normalmente na porta 3001 no computador acessível
  nesta sessão, sem estado de transição local. Não houve acesso remoto a outro
  computador nem verificação independente de que este equipamento pertence à faculdade.
- Saúde: `GET http://127.0.0.1:3001/`, HTTP 200 e mensagem esperada.
- Supabase: `GET /rest/v1/eventos?select=id&limit=1`, HTTP 200, resposta em array
  e header `sb-project-ref=gnwybroqfvwosiqzsfla`. Nenhum registro foi exibido.
- A primeira tentativa de leitura Supabase no Node encontrou
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. A leitura passou usando `--use-system-ca`.
  O servidor foi reiniciado com `NODE_OPTIONS=--use-system-ca` e o comando
  `node server.js`; as duas leituras voltaram a passar. A verificação TLS
  permaneceu habilitada. O ajuste é do terminal e está descrito em `INSTALACAO.md`.
- Os processos de servidor iniciados para esta validação foram encerrados ao final.
- Banco, tabelas, registros e credenciais não foram alterados. Nenhuma migração,
  recuperação ou rollback real foi executado. Nenhum commit foi criado.

## Arquivos desta implementação

Todos os caminhos abaixo são relativos a `PI Backend`:

- `config/ativacao-supabase.json` (novo)
- `config/startup-controlado.cjs`
- `config/estado-supervisor.cjs`
- `tests/startup-portabilidade.test.cjs` (novo)
- `tests/banco-provider.test.cjs`
- `tests/contratos.test.cjs`
- `tests/cotacoes.test.cjs`
- `tests/custos-repository.test.cjs`
- `tests/cutover-transicao-final.test.cjs`
- `tests/handlers-persistencia.test.cjs`
- `tests/helpers/http-autenticacao.cjs`
- `tests/helpers/persistencia.cjs`
- `tests/isolamento.test.cjs`
- `tests/seguranca.test.cjs`
- `tests/solicitacoes-acesso-repository.test.cjs`
- `scripts/validar-startup-portavel-leitura.cjs` (novo)
- `INSTALACAO.md` (novo)
- `evidencias/validacao-portabilidade-20261103.md` (este relatório)

As alterações de frontend que já estavam presentes no início da sessão foram
preservadas. As ferramentas MCP do grafo não estavam disponíveis; a análise foi
feita no código e nos testes.
