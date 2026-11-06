# Etapa 3 aplicada — 06/11/2026

**Atualização:** retomada e limpeza posteriormente autorizadas e concluídas;
estado atual em `eventos_capacidade.retomada.md`. A seção de preparação abaixo
registra o estado imediatamente posterior à migração.

Migração `eventos_capacidade.incremental.sql` aplicada integralmente **uma única
vez**, em sua transação original, no projeto `gnwybroqfvwosiqzsfla`.
COMMIT confirmado em `2026-11-06T17:16:56.004Z` (14:16:56 em São Paulo).
SHA-256 do SQL, sem alteração:
`e5fde4026e650955308e5063f7c07c3d61fbb1b0ae319f857e637534f0e0f20e`.

## Resultado comprovado

- Backup e manifesto preservados e com hashes conferidos antes e depois.
- Portas 3001/5173 livres; nenhum serviço iniciado durante a migração.
- Preflight oficial antes e depois; marcador passou de 1 para 3.
- Sete funções SECURITY INVOKER, sem EXECUTE para anon/authenticated e sem
  grant option para service_role; três triggers habilitados.
- Nova coluna integer nullable sem default, CHECK validada e índice pronto/válido.
- Prova em transação READ ONLY com service_role: marcador 3 e consulta de vagas
  com array vazio retornando `[]`.
- Seis eventos preservados, quatro Ativo e dois Em planejamento, todos com
  capacidade NULL; cinco inscrições preservadas, sem duplicidades ou excessos.
- Hashes das seis tabelas de negócio e hash completo dos eventos excluindo
  apenas a nova coluna iguais antes/depois. As 13 tabelas públicas foram também
  comparadas por contagem e SHA-256 de linhas completas, excluindo somente essa
  coluna de eventos: todas iguais.
- Metadados da Etapa 1, FKs, sequences, RLS, políticas e ACLs de tabelas preservados.
- Preflight da infraestrutura da Etapa 2 continua aprovado; uploads continuam
  desativados, sem alteração da configuração.
- Cinco registros de limpeza preservados. Metadados dos cinco objetos Storage
  e SHA-256 dos bytes de cada arquivo foram comparados antes/depois: idênticos.
  Os conteúdos foram lidos somente em memória; nenhuma cópia adicional foi salva.
- Nenhum teste de escrita em eventos/inscrições, exclusão, outra migração,
  alteração de credenciais, commit ou push.

Evidência:
`PI Backend/evidencias/eventos-capacidade-aplicacao-20261106.json`.
Preflight final autorizado:
`PI Backend/evidencias/eventos-capacidade-final-autorizado-20261106.json`.

## Retomada controlada preparada

Backend e supervisor continuam parados: a autorização desta etapa pediu preparar
a retomada após validar a migração. A fila elegível permanece intacta.

Para retomar, após encerrar formalmente a janela e autorizar o processamento da
fila existente:

1. Manter usuários sem interação até concluir a validação de leitura.
2. Em console acessível, no diretório `PI Backend`, executar `npm.cmd start`.
   Isso usa `node --use-system-ca server.js`, sem alterar ambiente ou guardas.
3. Confirmar startup normal, preflight de imagens e listener 3001. Não contornar
   eventual recusa das guardas de inicialização.
4. O runtime executa diagnóstico dry-run antes de agendar o supervisor a cada
   60 segundos. A retomada autoriza a limpeza dos cinco itens elegíveis conforme
   as regras existentes e a quarentena; pode haver exclusões após o primeiro
   intervalo. Não iniciar o backend apenas como teste sem considerar esse efeito.
5. Validar `GET /eventos/capacidades` autenticado com organizador: esperar
   `controleCapacidade: true`, ações da gestão disponíveis e `excluir: false`.
   Sem autenticação, esperar 401. Fazer somente leituras; não testar gravações
   ou exclusões em dados reais.
6. Após o backend estar validado, iniciar o frontend em `PI React` com
   `npm.cmd run dev`; conferir o consumo das capacidades e as telas de gestão.
7. Para interromper: Ctrl+C no console. O handler impede novas requisições,
   suspende o timer, aguarda operações em andamento e fecha o pool de imagens.
   Se a drenagem falhar, preservar o processo para diagnóstico; não forçar.

O repositório do backend reconhece marcadores 1 e 3; a versão 3 habilita
`controleCapacidade`. A exclusão física continua recusada pela gestão segura.
Não reiniciar versões antigas do backend e não reaplicar o SQL.

Validação local complementar da preparação: dez testes de capacidade e
encerramento gracioso passaram, sem falhas ou skips e sem acesso à produção.
