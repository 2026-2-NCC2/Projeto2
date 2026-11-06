# Conferência final — 06/11/2026

**Atualização posterior:** o operador autorizou preservar a fila pendente e a
migração foi aplicada e validada. Resultado atual em
`eventos_capacidade.aplicacao.md`. O texto abaixo registra a interrupção anterior.

O operador confirmou ausência de usuários e de outros backends/integrações
conhecidos e autorizou especificamente a migração no projeto
`gnwybroqfvwosiqzsfla`.

**Migração não executada.** A execução foi interrompida antes de qualquer DDL
porque a guarda operacional de limpeza apresentou uma diferença em relação ao
snapshot anterior, seguindo a instrução de informar divergências antes de prosseguir.

## Verificações aprovadas

- Portas 3001 e 5173 livres, sem processos locais identificados da aplicação.
- Diretório privado do backup com acesso somente a Lucas e SYSTEM.
- Dump, roles, manifesto e inventário privado de Storage preservados, com os
  quatro SHA-256 iguais aos registrados na restauração comprovada.
- Projeto confirmado por configuração PostgreSQL e cabeçalho REST; TLS validado.
- Preflight oficial executado integralmente somente em leitura.
- Verificação oficial: marcador 1, seis eventos, cinco inscrições, estados,
  integridade, metadados, funções, triggers, FKs, sequences e segurança iguais
  ao snapshot anterior. Nenhum objeto da Etapa 3 instalado.
- As 13 tabelas públicas e o catálogo público coincidem com o backup validado.
- Sem outras transações ou locks observados nas tabelas envolvidas.
- Preflight da infraestrutura da Etapa 2 aprovado; uploads de eventos desativados.
- Incremental, preflight e verificação são as versões testadas. Incremental:
  `e5fde4026e650955308e5063f7c07c3d61fbb1b0ae319f857e637534f0e0f20e`.

## Diferença operacional

O diário de imagens permanece com cinco registros, sem leases ativos. Os cinco
registros agora estão elegíveis para limpeza (`estado='limpeza'` e
`limpeza_apos <= clock_timestamp()`); antes não havia registros vencidos.
As linhas e seus hashes continuam idênticos: mudou a elegibilidade pelo decurso
do tempo, não os dados. Isso não demonstra falha de integridade nem falha do SQL
de capacidade, mas torna falsa a guarda anterior de ausência de limpeza vencida.

Nenhuma limpeza foi disparada e o backend permanece parado. A quarentena e o
diário não foram alterados. É necessário decidir operacionalmente sobre a fila
pendente antes de retomar a aplicação da migração. Não iniciar o backend apenas
para limpá-la sem considerar que seu supervisor pode executar exclusões elegíveis.

Evidência completa, sem dados pessoais ou credenciais:
`PI Backend/evidencias/eventos-capacidade-final-20261106.json`.
Não houve nova migração, escrita em dados reais, alteração de configuração,
credenciais ou políticas, ativação de uploads, novo backup, commit ou push.
