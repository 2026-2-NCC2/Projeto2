
BEGIN;
SET LOCAL client_encoding = 'UTF8';
SET LOCAL standard_conforming_strings = on;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL search_path = public, pg_catalog;

CREATE COLLATION public.trocaticket_general_ci
    (provider = icu, locale = 'und-u-ks-level1', deterministic = false);


CREATE TYPE public."solicitacoes_acesso_perfil_solicitado_enum" AS ENUM ('organizador','fornecedor');

CREATE TYPE public."solicitacoes_acesso_status_enum" AS ENUM ('pendente','aprovado','rejeitado');

CREATE TYPE public."usuarios_perfil_enum" AS ENUM ('organizador','fornecedor','participante','admin');

CREATE TABLE public."cotacoes" (
  "id" integer NOT NULL,
  "evento_id" integer NOT NULL,
  "prazo" date NOT NULL,
  "modalidade" varchar(50) COLLATE public.trocaticket_general_ci NOT NULL DEFAULT 'Fechada',
  "observacoes" text COLLATE public.trocaticket_general_ci DEFAULT NULL,
  "status" varchar(30) COLLATE public.trocaticket_general_ci NOT NULL DEFAULT 'Aberta',
  "criada_em" timestamptz(0) NOT NULL DEFAULT CURRENT_TIMESTAMP

);


CREATE TABLE public."custos_evento" (
  "id" integer NOT NULL,
  "evento_id" integer NOT NULL,
  "categoria" varchar(100) COLLATE public.trocaticket_general_ci NOT NULL,
  "descricao" varchar(255) COLLATE public.trocaticket_general_ci NOT NULL,
  "valor_estimado" decimal(12,2) NOT NULL

);


CREATE TABLE public."eventos" (
  "id" integer NOT NULL,
  "nome" varchar(100) COLLATE public.trocaticket_general_ci NOT NULL,
  "data" date NOT NULL,
  "horario" time(0) NOT NULL,
  "local" varchar(200) COLLATE public.trocaticket_general_ci NOT NULL,
  "categoria" varchar(100) COLLATE public.trocaticket_general_ci DEFAULT 'Corporativo',
  "publico" integer NOT NULL,
  "descricao" text COLLATE public.trocaticket_general_ci DEFAULT NULL,
  "status" varchar(50) COLLATE public.trocaticket_general_ci DEFAULT 'Em planejamento',
  "usuario_id" integer NOT NULL

);


CREATE TABLE public."inscricoes" (
  "id" integer NOT NULL,
  "usuario_id" integer NOT NULL,
  "evento_id" integer NOT NULL,
  "data_inscricao" timestamptz(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" varchar(30) COLLATE public.trocaticket_general_ci NOT NULL DEFAULT 'Confirmada'

);


CREATE TABLE public."itens_cotacao" (
  "id" integer NOT NULL,
  "cotacao_id" integer NOT NULL,
  "categoria" varchar(100) COLLATE public.trocaticket_general_ci NOT NULL,
  "descricao" varchar(255) COLLATE public.trocaticket_general_ci NOT NULL,
  "valor_estimado" decimal(12,2) NOT NULL

);


CREATE TABLE public."propostas" (
  "id" integer NOT NULL,
  "cotacao_id" integer NOT NULL,
  "fornecedor_id" integer NOT NULL,
  "valor" decimal(12,2) NOT NULL,
  "condicoes_pagamento" text COLLATE public.trocaticket_general_ci NOT NULL,
  "detalhes_tecnicos" text COLLATE public.trocaticket_general_ci NOT NULL,
  "status" varchar(30) COLLATE public.trocaticket_general_ci NOT NULL DEFAULT 'Em avaliação',
  "criada_em" timestamptz(0) NOT NULL DEFAULT CURRENT_TIMESTAMP

);


CREATE TABLE public."solicitacoes_acesso" (
  "id" integer NOT NULL,
  "usuario_id" integer NOT NULL,
  "perfil_solicitado" public."solicitacoes_acesso_perfil_solicitado_enum" NOT NULL,
  "justificativa" text COLLATE public.trocaticket_general_ci NOT NULL,
  "status" public."solicitacoes_acesso_status_enum" NOT NULL DEFAULT 'pendente',
  "criada_em" timestamptz(0) NOT NULL DEFAULT CURRENT_TIMESTAMP

);


CREATE TABLE public."usuarios" (
  "id" integer NOT NULL,
  "nome" varchar(100) COLLATE public.trocaticket_general_ci NOT NULL,
  "email" varchar(150) COLLATE public.trocaticket_general_ci NOT NULL,
  "senha" varchar(100) COLLATE public.trocaticket_general_ci NOT NULL,
  "perfil" public."usuarios_perfil_enum" NOT NULL DEFAULT 'organizador'

);


INSERT INTO public."cotacoes" ("id", "evento_id", "prazo", "modalidade", "observacoes", "status", "criada_em") VALUES
(1, 1, '2026-11-15', 'Fechada', 'Enviar proposta comercial completa, incluindo impostos e condições de pagamento.', 'Aberta', '2026-10-23 23:10:17'),
(3, 1, '2026-10-29', 'Fechada', 'Apresentar proposta comercial completa, incluindo impostos e condições de pagamento.', 'Aberta', '2026-10-27 03:22:29'),
(4, 8, '2026-10-29', 'Fechada', 'Apresentar proposta comercial completa, incluindo impostos e condições de pagamento.', 'Aberta', '2026-10-27 17:36:08');


INSERT INTO public."custos_evento" ("id", "evento_id", "categoria", "descricao", "valor_estimado") VALUES
(4, 9, 'Segurança', 'dsa', 10.00),
(5, 9, 'Segurança', 'dsa', 10.00),
(6, 9, 'Segurança', 'dsa', 10.00);


INSERT INTO public."eventos" ("id", "nome", "data", "horario", "local", "categoria", "publico", "descricao", "status", "usuario_id") VALUES
(1, 'Congresso Internacional de Tecnologia 2026', '2026-11-20', '10:00:00', 'São Paulo Expo', 'Tecnologia', 800, 'Congresso internacional sobre inovação e inteligência artificial.', 'Ativo', 1),
(6, 'Festival de Tecnologia e Inovação 2026', '2026-11-20', '14:00:00', 'Expo Center Norte - São Paulo', 'Tecnologia', 500, 'Evento voltado à tecnologia, inteligência artificial, programação e inovação, com palestras, workshops e networking.', 'Ativo', 1),
(7, 'Evento Teste de Permissão', '2026-11-20', '19:00:00', 'São Paulo', 'Corporativo', 100, 'Evento para testar a permissão de organizador.', 'Em planejamento', 4),
(8, 'Testeeee', '2026-11-20', '10:00:00', 'São paulo', 'Corporativo', 500, '', 'Ativo', 1),
(9, 'Summit Corporativo de Inovação & Tecnologia 2026', '2026-11-18', '09:00:00', 'Centro de Convenções Rebouças - São Paulo - SP', 'Corporativo', 600, 'Evento corporativo focado em inovação, tecnologia e integração entre equipes.', 'Em planejamento', 1);


INSERT INTO public."inscricoes" ("id", "usuario_id", "evento_id", "data_inscricao", "status") VALUES
(1, 8, 6, '2026-10-27 17:51:54', 'Confirmada'),
(2, 8, 1, '2026-10-27 18:15:19', 'Confirmada');


INSERT INTO public."itens_cotacao" ("id", "cotacao_id", "categoria", "descricao", "valor_estimado") VALUES
(1, 1, 'Áudio', 'Sistema de som profissional para congresso', 8000.00),
(2, 1, 'Iluminação', 'Iluminação profissional para palco', 5000.00),
(3, 1, 'Segurança', 'Equipe de segurança para o evento', 4000.00),
(9, 3, 'Áudio & Som', 'Som / PA Principal', 8000.00),
(10, 3, 'Iluminação & Vídeo', 'Painel de LED e Iluminação Cênica', 12000.00),
(11, 3, 'Estrutura & Palco', 'Montagem de Palco & Cenografia', 4500.00),
(12, 3, 'Segurança & Brigada', 'Equipe de Segurança e Credenciamento', 3500.00),
(13, 3, 'Limpeza & Facilities', 'Equipe de Limpeza & Conservação', 2000.00),
(14, 4, 'Áudio & Som', 'Som / PA Principal', 8000.00),
(15, 4, 'Iluminação & Vídeo', 'Painel de LED e Iluminação Cênica', 12000.00),
(16, 4, 'Estrutura & Palco', 'Montagem de Palco & Cenografia', 4500.00),
(17, 4, 'Segurança & Brigada', 'Equipe de Segurança e Credenciamento', 3500.00),
(18, 4, 'Limpeza & Facilities', 'Equipe de Limpeza & Conservação', 2000.00);


INSERT INTO public."propostas" ("id", "cotacao_id", "fornecedor_id", "valor", "condicoes_pagamento", "detalhes_tecnicos", "status", "criada_em") VALUES
(1, 1, 3, 16500.00, '50% na assinatura e 50% após o evento', 'Fornecimento de áudio, iluminação e equipe técnica para o Congresso Internacional de Tecnologia 2026.', 'Aprovada', '2026-10-27 02:46:18'),
(2, 1, 3, 17500.00, '50% na assinatura e 50% após desmontagem', 'Fornecimento de áudio, iluminação e equipe técnica para o congresso.', 'Recusada', '2026-10-27 02:49:06');


INSERT INTO public."solicitacoes_acesso" ("id", "usuario_id", "perfil_solicitado", "justificativa", "status", "criada_em") VALUES
(1, 4, 'organizador', 'Gostaria de organizar eventos corporativos e utilizar o TrocaTicket para gerenciar cotações e fornecedores.', 'aprovado', '2026-10-25 13:56:01'),
(2, 6, 'fornecedor', 'Gostaria de oferecer serviços de buffet, decoração e equipamentos para eventos cadastrados no TrocaTicket.', 'rejeitado', '2026-10-25 14:18:34'),
(3, 6, 'organizador', 'Gostaria de organizar eventos corporativos utilizando a plataforma TrocaTicket.', 'aprovado', '2026-10-26 16:50:15'),
(4, 7, 'fornecedor', 'Gostaria de oferecer serviços de buffet, decoração e equipamentos para eventos cadastrados no TrocaTicket.', 'rejeitado', '2026-10-26 17:44:45'),
(5, 9, 'organizador', 'teste', 'pendente', '2026-10-28 03:49:03');


INSERT INTO public."usuarios" ("id", "nome", "email", "senha", "perfil") VALUES
(1, 'Lucas', 'lucas.mysql@teste.com', '$2b$12$ibC8YnYuQ1PmBBPe6ZM77.3MjSUKLtV134W3o/uE9bTSCl8Ff38qm', 'organizador'),
(2, 'Usuario Teste', 'usuario.teste.segundo@example.com', '$2b$12$HDQIuBa8sg4sAAmFcYzR0O0a35OLFpWqHDu.usJZAOtl2uLrIgG4m', 'organizador'),
(3, 'Fornecedor Teste', 'fornecedor.teste@trocaticket.com', '$2b$12$u50uGfVbYSg7GpbDO2/FkOdWRf/FJA7NXlSDAJLys.QsJ0Mn7lPHS', 'fornecedor'),
(4, 'Participante Teste', 'participante.teste@trocaticket.com', '$2b$12$HyRota9eibXAYqosHvtSQuUqLvwgxdrbIseXBO9IOaUaVsXdTFY9K', 'organizador'),
(5, 'Administrador Teste', 'admin.teste@trocaticket.com', '$2b$12$ov9cUTQpi01hkcj7HwdtOOkfg5MuR23/Stwgs.nCErdMWzq0k0BIS', 'admin'),
(6, 'Participante Teste 2', 'participante2@trocaticket.com', '$2b$12$nMuxC0.KD75p7IfwSV0Kg.uuiBmgk2v56Y/aJK/MTV0aFwJFtnhmy', 'organizador'),
(7, 'Participante Teste 3', 'participante3@trocaticket.com', '$2b$12$yPDokIlsQ.mKN.rmz45P..sHUEofFGnykwx7bWwuqT40.luFeifQy', 'participante'),
(8, 'Participante Teste', 'participante.teste2@trocaticket.com', '$2b$12$nmKSGjUUjaXGScdCk4G97ubh54YuZ7lPyDWlqRIKCi8pfr2okVQXu', 'participante'),
(9, 'testepedido', 'testepedido@gmail.com', '$2b$12$JIIvHl6KlAJCpWMQz.vYCe.Hym1uL/ZjQoWpFWduYYjQWkL6GW492', 'participante');


CREATE INDEX "fk_cotacao_evento" ON public."cotacoes" ("evento_id");

ALTER TABLE public."cotacoes" ADD PRIMARY KEY ("id");

CREATE INDEX "idx_custos_evento_evento_id" ON public."custos_evento" ("evento_id");

ALTER TABLE public."custos_evento" ADD PRIMARY KEY ("id");

CREATE INDEX "fk_evento_usuario" ON public."eventos" ("usuario_id");

ALTER TABLE public."eventos" ADD PRIMARY KEY ("id");

CREATE INDEX "fk_inscricao_evento" ON public."inscricoes" ("evento_id");

ALTER TABLE public."inscricoes" ADD PRIMARY KEY ("id"),
  ADD CONSTRAINT "uq_inscricao_usuario_evento" UNIQUE ("usuario_id","evento_id");

CREATE INDEX "fk_item_cotacao" ON public."itens_cotacao" ("cotacao_id");

ALTER TABLE public."itens_cotacao" ADD PRIMARY KEY ("id");

CREATE INDEX "fk_propostas_cotacao" ON public."propostas" ("cotacao_id");

CREATE INDEX "fk_propostas_fornecedor" ON public."propostas" ("fornecedor_id");

ALTER TABLE public."propostas" ADD PRIMARY KEY ("id");

CREATE INDEX "usuario_id" ON public."solicitacoes_acesso" ("usuario_id");

ALTER TABLE public."solicitacoes_acesso" ADD PRIMARY KEY ("id");

ALTER TABLE public."usuarios" ADD PRIMARY KEY ("id"),
  ADD CONSTRAINT "email" UNIQUE ("email");

ALTER TABLE public."cotacoes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 6);

ALTER TABLE public."custos_evento" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 7);

ALTER TABLE public."eventos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 11);

ALTER TABLE public."inscricoes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 3);

ALTER TABLE public."itens_cotacao" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 22);

ALTER TABLE public."propostas" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 3);

ALTER TABLE public."solicitacoes_acesso" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 6);

ALTER TABLE public."usuarios" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (START WITH 10);

ALTER TABLE public."cotacoes" ADD CONSTRAINT "fk_cotacao_evento" FOREIGN KEY ("evento_id") REFERENCES public."eventos" ("id") ON DELETE CASCADE;

ALTER TABLE public."custos_evento" ADD CONSTRAINT "fk_custos_evento_evento" FOREIGN KEY ("evento_id") REFERENCES public."eventos" ("id") ON DELETE CASCADE;

ALTER TABLE public."eventos" ADD CONSTRAINT "fk_evento_usuario" FOREIGN KEY ("usuario_id") REFERENCES public."usuarios" ("id");

ALTER TABLE public."inscricoes" ADD CONSTRAINT "fk_inscricao_evento" FOREIGN KEY ("evento_id") REFERENCES public."eventos" ("id"),
  ADD CONSTRAINT "fk_inscricao_usuario" FOREIGN KEY ("usuario_id") REFERENCES public."usuarios" ("id");

ALTER TABLE public."itens_cotacao" ADD CONSTRAINT "fk_item_cotacao" FOREIGN KEY ("cotacao_id") REFERENCES public."cotacoes" ("id") ON DELETE CASCADE;

ALTER TABLE public."propostas" ADD CONSTRAINT "fk_propostas_cotacao" FOREIGN KEY ("cotacao_id") REFERENCES public."cotacoes" ("id"),
  ADD CONSTRAINT "fk_propostas_fornecedor" FOREIGN KEY ("fornecedor_id") REFERENCES public."usuarios" ("id");

ALTER TABLE public."solicitacoes_acesso" ADD CONSTRAINT "solicitacoes_acesso_ibfk_1" FOREIGN KEY ("usuario_id") REFERENCES public."usuarios" ("id") ON DELETE CASCADE;

COMMIT;
