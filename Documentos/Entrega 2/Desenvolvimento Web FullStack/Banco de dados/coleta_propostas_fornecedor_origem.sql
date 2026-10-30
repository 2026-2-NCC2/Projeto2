-- PROCEDIMENTO FUTURO, NAO EXECUTADO. Somente leitura de metadados/sinteticos.
-- Executar apenas apos autorizacao, na MESMA conexao identificada do backend.
-- Conferir destino por host/porta/PID antes. Nao usar db.js/.env como atalho.
-- Sem SET NAMES/SET SESSION: nao modificar a configuracao a ser observada.
SELECT CONNECTION_ID() AS conexao_id, @@port AS porta, DATABASE() AS banco,
       @@session.group_concat_max_len AS limite_bytes,
       @@session.character_set_client AS charset_cliente,
       @@session.character_set_connection AS charset_conexao,
       @@session.character_set_results AS charset_resultados,
       @@session.collation_connection AS collation_conexao,
       c.CHARACTER_SET_NAME AS charset_coluna,
       c.COLLATION_NAME AS collation_coluna, c.COLUMN_TYPE AS tipo_coluna
FROM information_schema.COLUMNS AS c
WHERE c.TABLE_SCHEMA=DATABASE() AND c.TABLE_NAME='itens_cotacao'
  AND c.COLUMN_NAME='categoria';

-- Template para mysql2.query: vincular ? aos valores da fixture; ajustar numero
-- de UNION ALL ao numero de itens. Nao colar sem vincular parametros.
-- Usar esta collation SOMENTE se a consulta acima confirmar o DDL historico.
-- Para ausencia de itens, usar SELECT ... WHERE 1=0 na relacao sintetica.
SELECT categoria, HEX(categoria) AS categoria_hex, OCTET_LENGTH(categoria) AS bytes
FROM (SELECT GROUP_CONCAT(DISTINCT categoria SEPARATOR ', ') AS categoria
FROM (
  SELECT CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci AS categoria
  UNION ALL SELECT CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci
  UNION ALL SELECT CONVERT(? USING utf8mb4) COLLATE utf8mb4_general_ci
) AS sinteticos) AS agregado;
-- Imediatamente apos cada SELECT, na mesma conexao, antes de outra consulta:
SHOW WARNINGS;
