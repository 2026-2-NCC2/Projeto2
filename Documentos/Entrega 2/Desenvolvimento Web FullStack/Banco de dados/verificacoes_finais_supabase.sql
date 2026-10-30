-- TrocaTicket: checklist final e consultas complementares da Etapa 4.
-- Fontes: auditoria_supabase.sql, diagnostico_defaults_supabase.sql,
-- trocaticket_supabase.sql (apenas DDL) e PI Backend/CONTRATOS.md.
-- Nenhuma consulta deste arquivo foi executada pelo agente no Supabase.
-- Executar manualmente, POR BLOCO, no projeto correto. Apenas leitura.
-- Nao le nomes, emails, senhas, hashes, justificativas ou registros individuais.
-- Consultas de dados retornam apenas contagens e extremos agregados de IDs.
-- Uma consulta gera texto SQL somente de leitura; copiar e executar separadamente.
-- Se houver erro ou visibilidade insuficiente, registrar pendencia e interromper.
-- Nao modificar papeis, permissoes, RLS ou sequencias para fazer a auditoria passar.
--
-- CONFIRMADO PELOS RESULTADOS REAIS INFORMADOS PELO USUARIO:
-- [x] Oito tabelas e 51 colunas presentes, tipos e obrigatoriedade correspondentes.
-- [x] Identidade BY DEFAULT e collation das colunas correspondentes.
-- [x] Diagnostico semantico dos defaults: 51 colunas e zero pendencias.
-- Isto nao comprova o estado dos objetos/dados abaixo.
--
-- CHECKLIST AINDA PENDENTE (guardar os resultados antes de encerrar):
-- [ ] Identidade do projeto/versao/fuso: auditoria original, bloco 01.
-- [ ] Tres enums com seus nove rotulos/ordem: original, bloco 04.
-- [ ] Oito PKs em id; duas unicas (email e usuario/evento): original, bloco 05.
-- [ ] Nove FKs com tabelas/colunas/acoes corretas e convalidated=true: bloco 05.
--     CASCADE: cotacoes.evento_id, custos_evento.evento_id,
--     itens_cotacao.cotacao_id, solicitacoes_acesso.usuario_id.
--     As outras cinco usam NO ACTION; sem diferimento declarado no dump.
--     Conferir tambem dependencias extras. Quantidade isolada nao prova equivalencia.
-- [ ] Indices validos/prontos e cobertura: original, blocos 06 e 07.
--     Dump: 8 indices explicitos + 8 PKs + 2 unicas = 18 indices.
--     Mais indices nao significam erro; faltas, predicados e expressoes exigem revisao.
--     As nove FKs devem ter o prefixo de indice previsto no dump.
-- [ ] Oito sequencias associadas, parametros e limites: original, bloco 08.
--     Complementar com B01 e com as oito consultas GERADAS por B02 abaixo.
--     last_value sozinho nao informa o proximo ID. Cache/escritores geram incerteza.
-- [ ] Versao efetiva da collation ICU e igualdade com a registrada: original, 09.
-- [ ] RLS/politicas coerentes com acesso via backend: original, 02 e 10.
--     Ausencia de politicas nao prova bloqueio se RLS estiver desabilitada.
--     O bloco 10 mostra resumo, nao a adequacao das expressoes. Revisar as regras
--     localmente no painel sem compartilhar literais privados ou executar funcoes.
-- [ ] Privilegios efetivos e acessos a colunas/sequencias: original, 11 a 15.
--     Avaliar anon/authenticated; o JWT proprio nao cria uma sessao Supabase Auth.
--     Secret key/service_role ignora RLS; nao substitui os filtros de propriedade.
--     ACLs de views e rotinas tambem exigem revisao: B08 e B09 abaixo.
-- [ ] Triggers extras revisados: original, bloco 16.
-- [ ] Integridade: B03 a B07, sem orfaos, duplicidade indevida ou valores invalidos.
-- [ ] Contagens reconciliadas com origem confiavel: B01. Contagens iguais nao provam
--     igualdade de conteudo, ausencia de arredondamento ou preservacao dos fusos.
--
-- PRECONDICOES E LIMITACOES:
-- Usar papel autorizado com visibilidade completa; SQL Editor pode usar postgres.
-- RLS pode ocultar linhas, afetando contagens e ate a aparencia de referencias orfas.
-- A leitura privilegiada nao comprova protecao das chamadas reais da Data API.
-- Verificar ACLs/politicas e rotinas; o teste funcional de API permanece futuro.
-- Dados antigos nao precisam ter prazo/data futuros ou perfil atual igual ao passado.
-- Itens de cotacoes sao snapshots: NAO exigir igualdade com custos atuais do evento.
-- Propostas repetidas/multiplas aprovadas nao sao proibidas pelos contratos atuais.
-- Mais de uma solicitacao pendente e alerta do fluxo atual, nao nova regra de banco.
-- Leituras concorrentes nao comprovam invariantes futuras nem atomicidade das rotas.
-- Nao calcular, consumir ou redefinir IDs atraves de funcoes de sequencia.
-- Referencias:
-- https://www.postgresql.org/docs/current/sql-createsequence.html
-- https://supabase.com/docs/guides/database/postgres/row-level-security
-- https://supabase.com/docs/guides/database/functions

-- B01. Oito contagens/extremos de IDs, sem identificar pessoas ou expor registros.
-- Esperado: oito linhas, ids_nao_positivos=0. Tabela vazia tem min/max NULL.
-- Quantidades reais ainda devem ser comparadas com a origem da importacao.
SELECT 'usuarios' AS tabela, count(*) AS registros, min(id) AS menor_id, max(id) AS maior_id,
       count(*) FILTER (WHERE id <= 0) AS ids_nao_positivos FROM public.usuarios
UNION ALL
SELECT 'eventos', count(*), min(id), max(id), count(*) FILTER (WHERE id <= 0) FROM public.eventos
UNION ALL
SELECT 'cotacoes', count(*), min(id), max(id), count(*) FILTER (WHERE id <= 0) FROM public.cotacoes
UNION ALL
SELECT 'custos_evento', count(*), min(id), max(id), count(*) FILTER (WHERE id <= 0) FROM public.custos_evento
UNION ALL
SELECT 'inscricoes', count(*), min(id), max(id), count(*) FILTER (WHERE id <= 0) FROM public.inscricoes
UNION ALL
SELECT 'itens_cotacao', count(*), min(id), max(id), count(*) FILTER (WHERE id <= 0) FROM public.itens_cotacao
UNION ALL
SELECT 'propostas', count(*), min(id), max(id), count(*) FILTER (WHERE id <= 0) FROM public.propostas
UNION ALL
SELECT 'solicitacoes_acesso', count(*), min(id), max(id), count(*) FILTER (WHERE id <= 0) FROM public.solicitacoes_acesso
ORDER BY tabela;

-- B02. Descobre nomes REAIS das oito sequencias e gera oito SELECTs adicionais.
-- A geracao NAO executa o SQL retornado. Conferir oito linhas/nenhuma sequencia ausente.
-- Copiar cada celula sql_de_leitura e executar separadamente no mesmo SQL Editor.
-- Os SELECTs gerados leem last_value/is_called e max(id), sem consumir IDs.
-- Permissao de leitura da sequencia pode ser necessaria; nao conceder automaticamente.
-- CACHE diferente de 1 exige investigacao; podem existir IDs reservados em sessoes.
-- Mesmo CACHE=1 nao elimina corridas. So interpretar o candidato em periodo sem
-- escritores concorrentes confirmado pelo responsavel; nao encerrar processos aqui.
-- ACIMA_DO_MAXIMO_NESTA_LEITURA e evidencia pontual, nao garantia futura.
WITH tabelas(tabela) AS (
  VALUES ('usuarios'),('eventos'),('cotacoes'),('custos_evento'),
         ('inscricoes'),('itens_cotacao'),('propostas'),('solicitacoes_acesso')
), associadas AS (
  SELECT tabela,
         pg_catalog.to_regclass(pg_catalog.pg_get_serial_sequence(pg_catalog.format('public.%I',tabela),'id')) AS sequencia_oid
  FROM tabelas
)
SELECT a.tabela, seq.oid::regclass AS sequencia,
       CASE WHEN seq.oid IS NULL THEN 'SEQUENCIA AUSENTE; INVESTIGAR'
            ELSE 'COPIAR E EXECUTAR O SELECT GERADO' END AS orientacao,
       CASE WHEN seq.oid IS NOT NULL THEN pg_catalog.format($leitura$
WITH ids AS (
  SELECT max(id)::numeric AS maior_id FROM public.%1$I
), estado AS (
  SELECT last_value::numeric AS ultimo_valor, is_called FROM %2$I.%3$I
), parametros AS (
  SELECT seqincrement::numeric AS incremento, seqcache AS cache,
         seqcycle AS ciclica, seqmin::numeric AS minimo, seqmax::numeric AS maximo
  FROM pg_catalog.pg_sequence WHERE seqrelid = %4$L::regclass
), leitura AS (
  SELECT ids.*, estado.*, parametros.*,
         CASE WHEN is_called THEN ultimo_valor + incremento ELSE ultimo_valor END AS candidato_teorico
  FROM ids CROSS JOIN estado CROSS JOIN parametros
)
SELECT %1$L AS tabela, maior_id, ultimo_valor, is_called, incremento, cache, ciclica,
       minimo, maximo, candidato_teorico,
       CASE WHEN incremento <> 1 OR ciclica THEN 'INVESTIGAR_PARAMETROS'
            WHEN cache <> 1 THEN 'INVESTIGAR_CACHE_E_SESSOES'
            WHEN candidato_teorico < minimo OR candidato_teorico > maximo THEN 'CANDIDATO_FORA_DOS_LIMITES'
            WHEN maior_id IS NOT NULL AND candidato_teorico <= maior_id THEN 'CANDIDATO_NAO_SUPERA_MAIOR_ID'
            ELSE 'ACIMA_DO_MAXIMO_NESTA_LEITURA' END AS resultado
FROM leitura;
$leitura$, a.tabela, ns.nspname, seq.relname, pg_catalog.format('%I.%I',ns.nspname,seq.relname)) END AS sql_de_leitura
FROM associadas a
LEFT JOIN pg_catalog.pg_class seq ON seq.oid = a.sequencia_oid
LEFT JOIN pg_catalog.pg_namespace ns ON ns.oid = seq.relnamespace
ORDER BY a.tabela;

-- B03. As nove relacoes do esquema; esperado: nove contagens de orfaos iguais a 0.
SELECT 'eventos.usuario_id -> usuarios.id' AS relacao, count(*) AS orfaos
FROM public.eventos f WHERE NOT EXISTS (SELECT 1 FROM public.usuarios p WHERE p.id = f.usuario_id)
UNION ALL
SELECT 'cotacoes.evento_id -> eventos.id', count(*)
FROM public.cotacoes f WHERE NOT EXISTS (SELECT 1 FROM public.eventos p WHERE p.id = f.evento_id)
UNION ALL
SELECT 'custos_evento.evento_id -> eventos.id', count(*)
FROM public.custos_evento f WHERE NOT EXISTS (SELECT 1 FROM public.eventos p WHERE p.id = f.evento_id)
UNION ALL
SELECT 'inscricoes.usuario_id -> usuarios.id', count(*)
FROM public.inscricoes f WHERE NOT EXISTS (SELECT 1 FROM public.usuarios p WHERE p.id = f.usuario_id)
UNION ALL
SELECT 'inscricoes.evento_id -> eventos.id', count(*)
FROM public.inscricoes f WHERE NOT EXISTS (SELECT 1 FROM public.eventos p WHERE p.id = f.evento_id)
UNION ALL
SELECT 'itens_cotacao.cotacao_id -> cotacoes.id', count(*)
FROM public.itens_cotacao f WHERE NOT EXISTS (SELECT 1 FROM public.cotacoes p WHERE p.id = f.cotacao_id)
UNION ALL
SELECT 'propostas.cotacao_id -> cotacoes.id', count(*)
FROM public.propostas f WHERE NOT EXISTS (SELECT 1 FROM public.cotacoes p WHERE p.id = f.cotacao_id)
UNION ALL
SELECT 'propostas.fornecedor_id -> usuarios.id', count(*)
FROM public.propostas f WHERE NOT EXISTS (SELECT 1 FROM public.usuarios p WHERE p.id = f.fornecedor_id)
UNION ALL
SELECT 'solicitacoes_acesso.usuario_id -> usuarios.id', count(*)
FROM public.solicitacoes_acesso f WHERE NOT EXISTS (SELECT 1 FROM public.usuarios p WHERE p.id = f.usuario_id)
ORDER BY relacao;

-- B04. Duplicidades: so retorna contagens de grupos, nunca IDs ou emails.
-- Esperado: inscricoes duplicadas=0. Pendencias simultaneas exigem revisao do fluxo.
-- Unicidade de email deve ser comprovada pela restricao/indice validados do bloco 05
-- original; nao e necessario ler ou agrupar valores pessoais para essa verificacao.
SELECT 'inscricoes repetidas por usuario/evento' AS verificacao,
       count(*) AS grupos, COALESCE(sum(quantidade - 1),0) AS linhas_excedentes
FROM (
  SELECT count(*) AS quantidade FROM public.inscricoes
  GROUP BY usuario_id, evento_id HAVING count(*) > 1
) repetidas
UNION ALL
SELECT 'mais de uma solicitacao pendente por usuario', count(*), COALESCE(sum(quantidade - 1),0)
FROM (
  SELECT count(*) AS quantidade FROM public.solicitacoes_acesso
  WHERE status::text COLLATE pg_catalog."C" = 'pendente'
  GROUP BY usuario_id HAVING count(*) > 1
) pendentes;

-- B05. Dinheiro: esperado 0 em cada linha, sem exibir valores ou totais financeiros.
-- Custos/itens aceitam zero; propostas exigem valor > 0 segundo o handler atual.
-- Numeric(12,2) ja pode ter arredondado entradas; essa perda nao e detectavel aqui.
SELECT 'custos_evento.valor_estimado' AS campo,
       count(*) FILTER (WHERE valor_estimado IS NULL OR valor_estimado < 0
         OR valor_estimado > 9999999999.99
         OR valor_estimado::text IN ('NaN','Infinity','-Infinity')) AS invalidos
FROM public.custos_evento
UNION ALL
SELECT 'itens_cotacao.valor_estimado',
       count(*) FILTER (WHERE valor_estimado IS NULL OR valor_estimado < 0
         OR valor_estimado > 9999999999.99
         OR valor_estimado::text IN ('NaN','Infinity','-Infinity'))
FROM public.itens_cotacao
UNION ALL
SELECT 'propostas.valor',
       count(*) FILTER (WHERE valor IS NULL OR valor <= 0 OR valor > 9999999999.99
         OR valor::text IN ('NaN','Infinity','-Infinity'))
FROM public.propostas;

-- B06. Campos obrigatorios do fluxo: apenas quantidade de registros a revisar.
-- btrim cobre vazios/espacos comuns; nao substitui toda a validacao Unicode da API.
-- Nao consulta os campos pessoais de usuarios nem o conteudo de propostas na saida.
SELECT 'custos com categoria/descricao vazia' AS verificacao,
       count(*) FILTER (WHERE categoria IS NULL OR descricao IS NULL
         OR btrim(categoria) = '' OR btrim(descricao) = '') AS registros_a_revisar
FROM public.custos_evento
UNION ALL
SELECT 'itens publicados com categoria/descricao vazia',
       count(*) FILTER (WHERE categoria IS NULL OR descricao IS NULL
         OR btrim(categoria) = '' OR btrim(descricao) = '') FROM public.itens_cotacao
UNION ALL
SELECT 'propostas com campos obrigatorios vazios',
       count(*) FILTER (WHERE condicoes_pagamento IS NULL OR detalhes_tecnicos IS NULL
         OR btrim(condicoes_pagamento) = '' OR btrim(detalhes_tecnicos) = '') FROM public.propostas
UNION ALL
SELECT 'eventos sem nome/local/publico valido',
       count(*) FILTER (WHERE nome IS NULL OR local IS NULL OR btrim(nome) = ''
         OR btrim(local) = '' OR publico IS NULL OR publico <= 0) FROM public.eventos;

-- B07. Datas finitas e horario compatibilizavel com o formulario atual.
-- Esperado: 0 em cada linha. Datas/prazos passados nao sao tratados como corrupcao.
-- Nao comprova igualdade de fusos/instantes com o banco de origem.
SELECT 'eventos.data' AS campo, count(*) FILTER (WHERE data IS NULL OR NOT pg_catalog.isfinite(data)) AS registros_a_revisar
FROM public.eventos
UNION ALL
SELECT 'eventos.horario 24h', count(*) FILTER (WHERE horario IS NULL OR horario >= TIME '24:00:00') FROM public.eventos
UNION ALL
SELECT 'cotacoes.prazo', count(*) FILTER (WHERE prazo IS NULL OR NOT pg_catalog.isfinite(prazo)) FROM public.cotacoes
UNION ALL
SELECT 'cotacoes.criada_em', count(*) FILTER (WHERE criada_em IS NULL OR NOT pg_catalog.isfinite(criada_em)) FROM public.cotacoes
UNION ALL
SELECT 'inscricoes.data_inscricao', count(*) FILTER (WHERE data_inscricao IS NULL OR NOT pg_catalog.isfinite(data_inscricao)) FROM public.inscricoes
UNION ALL
SELECT 'propostas.criada_em', count(*) FILTER (WHERE criada_em IS NULL OR NOT pg_catalog.isfinite(criada_em)) FROM public.propostas
UNION ALL
SELECT 'solicitacoes_acesso.criada_em', count(*) FILTER (WHERE criada_em IS NULL OR NOT pg_catalog.isfinite(criada_em)) FROM public.solicitacoes_acesso;

-- B08. Views e materializadas publicas: acesso indireto tambem exige revisao.
-- Nao consulta a view nem mostra sua definicao ou dados armazenados.
-- security_invoker=false em view comum pode usar direitos do dono e contornar RLS.
-- Nenhuma linha significa ausencia desses objetos em public, nao ausencia em outros
-- schemas expostos pela Data API. Conferir schemas expostos no painel, somente leitura.
SELECT c.relname AS objeto, c.relkind AS tipo, pg_catalog.pg_get_userbyid(c.relowner) AS dono,
       COALESCE(c.reloptions @> ARRAY['security_invoker=true'],false) AS security_invoker,
       r.rolname AS papel, pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT') AS leitura_permitida
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
  AND r.rolname IN ('anon','authenticated','service_role')
ORDER BY c.relname, r.rolname;

-- B09. Rotinas publicas e EXECUTE efetivo: nenhuma funcao e invocada aqui.
-- Nao mostra codigo, parametros default ou valores privados.
-- SECURITY DEFINER + acesso anon/authenticated exige revisao local cuidadosa.
-- Nem toda rotina pertence ao TrocaTicket: identificar quais podem acessar suas
-- tabelas. Nome/ACL nao provam seguranca do corpo, dependencias ou SQL dinamico.
-- Schemas adicionais expostos na API precisam de revisao equivalente.
SELECT fn.oid::regprocedure AS rotina, fn.prokind AS tipo,
       fn.prosecdef AS security_definer, pg_catalog.pg_get_userbyid(fn.proowner) AS dono,
       r.rolname AS papel, pg_catalog.has_function_privilege(r.oid,fn.oid,'EXECUTE') AS execucao_permitida
FROM pg_catalog.pg_proc fn
JOIN pg_catalog.pg_namespace n ON n.oid = fn.pronamespace
CROSS JOIN pg_catalog.pg_roles r
WHERE n.nspname = 'public' AND fn.prokind IN ('f','p')
  AND r.rolname IN ('anon','authenticated','service_role')
ORDER BY fn.oid::regprocedure::text, r.rolname;
