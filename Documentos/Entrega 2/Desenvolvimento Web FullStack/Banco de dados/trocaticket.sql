-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Tempo de geração: 29/10/2026 às 21:40
-- Versão do servidor: 10.4.32-MariaDB
-- Versão do PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Banco de dados: `trocaticket`
--

-- --------------------------------------------------------

--
-- Estrutura para tabela `cotacoes`
--

CREATE TABLE `cotacoes` (
  `id` int(11) NOT NULL,
  `evento_id` int(11) NOT NULL,
  `prazo` date NOT NULL,
  `modalidade` varchar(50) NOT NULL DEFAULT 'Fechada',
  `observacoes` text DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'Aberta',
  `criada_em` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `cotacoes`
--

INSERT INTO `cotacoes` (`id`, `evento_id`, `prazo`, `modalidade`, `observacoes`, `status`, `criada_em`) VALUES
(1, 1, '2026-11-15', 'Fechada', 'Enviar proposta comercial completa, incluindo impostos e condições de pagamento.', 'Aberta', '2026-10-23 23:10:17'),
(3, 1, '2026-10-29', 'Fechada', 'Apresentar proposta comercial completa, incluindo impostos e condições de pagamento.', 'Aberta', '2026-10-27 03:22:29'),
(4, 8, '2026-10-29', 'Fechada', 'Apresentar proposta comercial completa, incluindo impostos e condições de pagamento.', 'Aberta', '2026-10-27 17:36:08');

-- --------------------------------------------------------

--
-- Estrutura para tabela `custos_evento`
--

CREATE TABLE `custos_evento` (
  `id` int(11) NOT NULL,
  `evento_id` int(11) NOT NULL,
  `categoria` varchar(100) NOT NULL,
  `descricao` varchar(255) NOT NULL,
  `valor_estimado` decimal(12,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `custos_evento`
--

INSERT INTO `custos_evento` (`id`, `evento_id`, `categoria`, `descricao`, `valor_estimado`) VALUES
(4, 9, 'Segurança', 'dsa', 10.00),
(5, 9, 'Segurança', 'dsa', 10.00),
(6, 9, 'Segurança', 'dsa', 10.00);

-- --------------------------------------------------------

--
-- Estrutura para tabela `eventos`
--

CREATE TABLE `eventos` (
  `id` int(11) NOT NULL,
  `nome` varchar(100) NOT NULL,
  `data` date NOT NULL,
  `horario` time NOT NULL,
  `local` varchar(200) NOT NULL,
  `categoria` varchar(100) DEFAULT 'Corporativo',
  `publico` int(11) NOT NULL,
  `descricao` text DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Em planejamento',
  `usuario_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `eventos`
--

INSERT INTO `eventos` (`id`, `nome`, `data`, `horario`, `local`, `categoria`, `publico`, `descricao`, `status`, `usuario_id`) VALUES
(1, 'Congresso Internacional de Tecnologia 2026', '2026-11-20', '10:00:00', 'São Paulo Expo', 'Tecnologia', 800, 'Congresso internacional sobre inovação e inteligência artificial.', 'Ativo', 1),
(6, 'Festival de Tecnologia e Inovação 2026', '2026-11-20', '14:00:00', 'Expo Center Norte - São Paulo', 'Tecnologia', 500, 'Evento voltado à tecnologia, inteligência artificial, programação e inovação, com palestras, workshops e networking.', 'Ativo', 1),
(7, 'Evento Teste de Permissão', '2026-11-20', '19:00:00', 'São Paulo', 'Corporativo', 100, 'Evento para testar a permissão de organizador.', 'Em planejamento', 4),
(8, 'Testeeee', '2026-11-20', '10:00:00', 'São paulo', 'Corporativo', 500, '', 'Ativo', 1),
(9, 'Summit Corporativo de Inovação & Tecnologia 2026', '2026-11-18', '09:00:00', 'Centro de Convenções Rebouças - São Paulo - SP', 'Corporativo', 600, 'Evento corporativo focado em inovação, tecnologia e integração entre equipes.', 'Em planejamento', 1);

-- --------------------------------------------------------

--
-- Estrutura para tabela `inscricoes`
--

CREATE TABLE `inscricoes` (
  `id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `evento_id` int(11) NOT NULL,
  `data_inscricao` timestamp NOT NULL DEFAULT current_timestamp(),
  `status` varchar(30) NOT NULL DEFAULT 'Confirmada'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `inscricoes`
--

INSERT INTO `inscricoes` (`id`, `usuario_id`, `evento_id`, `data_inscricao`, `status`) VALUES
(1, 8, 6, '2026-10-27 17:51:54', 'Confirmada'),
(2, 8, 1, '2026-10-27 18:15:19', 'Confirmada');

-- --------------------------------------------------------

--
-- Estrutura para tabela `itens_cotacao`
--

CREATE TABLE `itens_cotacao` (
  `id` int(11) NOT NULL,
  `cotacao_id` int(11) NOT NULL,
  `categoria` varchar(100) NOT NULL,
  `descricao` varchar(255) NOT NULL,
  `valor_estimado` decimal(12,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `itens_cotacao`
--

INSERT INTO `itens_cotacao` (`id`, `cotacao_id`, `categoria`, `descricao`, `valor_estimado`) VALUES
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

-- --------------------------------------------------------

--
-- Estrutura para tabela `propostas`
--

CREATE TABLE `propostas` (
  `id` int(11) NOT NULL,
  `cotacao_id` int(11) NOT NULL,
  `fornecedor_id` int(11) NOT NULL,
  `valor` decimal(12,2) NOT NULL,
  `condicoes_pagamento` text NOT NULL,
  `detalhes_tecnicos` text NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'Em avaliação',
  `criada_em` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `propostas`
--

INSERT INTO `propostas` (`id`, `cotacao_id`, `fornecedor_id`, `valor`, `condicoes_pagamento`, `detalhes_tecnicos`, `status`, `criada_em`) VALUES
(1, 1, 3, 16500.00, '50% na assinatura e 50% após o evento', 'Fornecimento de áudio, iluminação e equipe técnica para o Congresso Internacional de Tecnologia 2026.', 'Aprovada', '2026-10-27 02:46:18'),
(2, 1, 3, 17500.00, '50% na assinatura e 50% após desmontagem', 'Fornecimento de áudio, iluminação e equipe técnica para o congresso.', 'Recusada', '2026-10-27 02:49:06');

-- --------------------------------------------------------

--
-- Estrutura para tabela `solicitacoes_acesso`
--

CREATE TABLE `solicitacoes_acesso` (
  `id` int(11) NOT NULL,
  `usuario_id` int(11) NOT NULL,
  `perfil_solicitado` enum('organizador','fornecedor') NOT NULL,
  `justificativa` text NOT NULL,
  `status` enum('pendente','aprovado','rejeitado') NOT NULL DEFAULT 'pendente',
  `criada_em` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `solicitacoes_acesso`
--

INSERT INTO `solicitacoes_acesso` (`id`, `usuario_id`, `perfil_solicitado`, `justificativa`, `status`, `criada_em`) VALUES
(1, 4, 'organizador', 'Gostaria de organizar eventos corporativos e utilizar o TrocaTicket para gerenciar cotações e fornecedores.', 'aprovado', '2026-10-25 13:56:01'),
(2, 6, 'fornecedor', 'Gostaria de oferecer serviços de buffet, decoração e equipamentos para eventos cadastrados no TrocaTicket.', 'rejeitado', '2026-10-25 14:18:34'),
(3, 6, 'organizador', 'Gostaria de organizar eventos corporativos utilizando a plataforma TrocaTicket.', 'aprovado', '2026-10-26 16:50:15'),
(4, 7, 'fornecedor', 'Gostaria de oferecer serviços de buffet, decoração e equipamentos para eventos cadastrados no TrocaTicket.', 'rejeitado', '2026-10-26 17:44:45'),
(5, 9, 'organizador', 'teste', 'pendente', '2026-10-28 03:49:03');

-- --------------------------------------------------------

--
-- Estrutura para tabela `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `nome` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `senha` varchar(100) NOT NULL,
  `perfil` enum('organizador','fornecedor','participante','admin') NOT NULL DEFAULT 'organizador'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Despejando dados para a tabela `usuarios`
--

INSERT INTO `usuarios` (`id`, `nome`, `email`, `senha`, `perfil`) VALUES
(1, 'Lucas', 'lucas.mysql@teste.com', '$2b$12$ibC8YnYuQ1PmBBPe6ZM77.3MjSUKLtV134W3o/uE9bTSCl8Ff38qm', 'organizador'),
(2, 'Usuario Teste', 'usuario.teste.segundo@example.com', '$2b$12$HDQIuBa8sg4sAAmFcYzR0O0a35OLFpWqHDu.usJZAOtl2uLrIgG4m', 'organizador'),
(3, 'Fornecedor Teste', 'fornecedor.teste@trocaticket.com', '$2b$12$u50uGfVbYSg7GpbDO2/FkOdWRf/FJA7NXlSDAJLys.QsJ0Mn7lPHS', 'fornecedor'),
(4, 'Participante Teste', 'participante.teste@trocaticket.com', '$2b$12$HyRota9eibXAYqosHvtSQuUqLvwgxdrbIseXBO9IOaUaVsXdTFY9K', 'organizador'),
(5, 'Administrador Teste', 'admin.teste@trocaticket.com', '$2b$12$ov9cUTQpi01hkcj7HwdtOOkfg5MuR23/Stwgs.nCErdMWzq0k0BIS', 'admin'),
(6, 'Participante Teste 2', 'participante2@trocaticket.com', '$2b$12$nMuxC0.KD75p7IfwSV0Kg.uuiBmgk2v56Y/aJK/MTV0aFwJFtnhmy', 'organizador'),
(7, 'Participante Teste 3', 'participante3@trocaticket.com', '$2b$12$yPDokIlsQ.mKN.rmz45P..sHUEofFGnykwx7bWwuqT40.luFeifQy', 'participante'),
(8, 'Participante Teste', 'participante.teste2@trocaticket.com', '$2b$12$nmKSGjUUjaXGScdCk4G97ubh54YuZ7lPyDWlqRIKCi8pfr2okVQXu', 'participante'),
(9, 'testepedido', 'testepedido@gmail.com', '$2b$12$JIIvHl6KlAJCpWMQz.vYCe.Hym1uL/ZjQoWpFWduYYjQWkL6GW492', 'participante');

--
-- Índices para tabelas despejadas
--

--
-- Índices de tabela `cotacoes`
--
ALTER TABLE `cotacoes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_cotacao_evento` (`evento_id`);

--
-- Índices de tabela `custos_evento`
--
ALTER TABLE `custos_evento`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_custos_evento_evento_id` (`evento_id`);

--
-- Índices de tabela `eventos`
--
ALTER TABLE `eventos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_evento_usuario` (`usuario_id`);

--
-- Índices de tabela `inscricoes`
--
ALTER TABLE `inscricoes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_inscricao_usuario_evento` (`usuario_id`,`evento_id`),
  ADD KEY `fk_inscricao_evento` (`evento_id`);

--
-- Índices de tabela `itens_cotacao`
--
ALTER TABLE `itens_cotacao`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_item_cotacao` (`cotacao_id`);

--
-- Índices de tabela `propostas`
--
ALTER TABLE `propostas`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_propostas_cotacao` (`cotacao_id`),
  ADD KEY `fk_propostas_fornecedor` (`fornecedor_id`);

--
-- Índices de tabela `solicitacoes_acesso`
--
ALTER TABLE `solicitacoes_acesso`
  ADD PRIMARY KEY (`id`),
  ADD KEY `usuario_id` (`usuario_id`);

--
-- Índices de tabela `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT para tabelas despejadas
--

--
-- AUTO_INCREMENT de tabela `cotacoes`
--
ALTER TABLE `cotacoes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de tabela `custos_evento`
--
ALTER TABLE `custos_evento`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT de tabela `eventos`
--
ALTER TABLE `eventos`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT de tabela `inscricoes`
--
ALTER TABLE `inscricoes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de tabela `itens_cotacao`
--
ALTER TABLE `itens_cotacao`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=22;

--
-- AUTO_INCREMENT de tabela `propostas`
--
ALTER TABLE `propostas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT de tabela `solicitacoes_acesso`
--
ALTER TABLE `solicitacoes_acesso`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de tabela `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- Restrições para tabelas despejadas
--

--
-- Restrições para tabelas `cotacoes`
--
ALTER TABLE `cotacoes`
  ADD CONSTRAINT `fk_cotacao_evento` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `custos_evento`
--
ALTER TABLE `custos_evento`
  ADD CONSTRAINT `fk_custos_evento_evento` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `eventos`
--
ALTER TABLE `eventos`
  ADD CONSTRAINT `fk_evento_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Restrições para tabelas `inscricoes`
--
ALTER TABLE `inscricoes`
  ADD CONSTRAINT `fk_inscricao_evento` FOREIGN KEY (`evento_id`) REFERENCES `eventos` (`id`),
  ADD CONSTRAINT `fk_inscricao_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

--
-- Restrições para tabelas `itens_cotacao`
--
ALTER TABLE `itens_cotacao`
  ADD CONSTRAINT `fk_item_cotacao` FOREIGN KEY (`cotacao_id`) REFERENCES `cotacoes` (`id`) ON DELETE CASCADE;

--
-- Restrições para tabelas `propostas`
--
ALTER TABLE `propostas`
  ADD CONSTRAINT `fk_propostas_cotacao` FOREIGN KEY (`cotacao_id`) REFERENCES `cotacoes` (`id`),
  ADD CONSTRAINT `fk_propostas_fornecedor` FOREIGN KEY (`fornecedor_id`) REFERENCES `usuarios` (`id`);

--
-- Restrições para tabelas `solicitacoes_acesso`
--
ALTER TABLE `solicitacoes_acesso`
  ADD CONSTRAINT `solicitacoes_acesso_ibfk_1` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
