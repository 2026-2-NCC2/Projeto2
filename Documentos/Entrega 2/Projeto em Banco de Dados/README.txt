# TrocaTicket — Banco de Dados

## Descrição

Banco de dados desenvolvido em MySQL para a disciplina de **Projetos em Banco de Dados — Entrega 2**, utilizando o MySQL Workbench.

O banco possui quatro tabelas relacionadas ao gerenciamento de eventos, usuários, inscrições e cotações.

## Tabelas

### 1. usuarios

Armazena as informações dos usuários, como nome, e-mail e perfil.

| Campo | Tipo |
|---|---|
| id (PK) | INT |
| nome | VARCHAR(100) |
| email (UNIQUE) | VARCHAR(150) |
| perfil | VARCHAR(30) |

**Chave primária:** `id`, responsável por identificar cada usuário de forma única.

### 2. eventos

Armazena as informações dos eventos, incluindo nome, data, horário, local, capacidade e status.

| Campo | Tipo |
|---|---|
| id (PK) | INT |
| nome | VARCHAR(100) |
| data | DATE |
| horario | TIME |
| local | VARCHAR(200) |
| capacidade | INT |
| status | VARCHAR(30) |
| usuario_id (FK) | INT |

**Chave primária:** `id`, identifica cada evento.

**Chave estrangeira:** `usuario_id`, referencia `usuarios.id`, identificando o organizador responsável pelo evento.

### 3. inscricoes

Registra a participação dos usuários nos eventos.

| Campo | Tipo |
|---|---|
| id (PK) | INT |
| usuario_id (FK) | INT |
| evento_id (FK) | INT |
| data_inscricao | TIMESTAMP |
| status | VARCHAR(30) |

**Chave primária:** `id`, identifica cada inscrição.

**Chaves estrangeiras:**
- `usuario_id` referencia `usuarios.id`, identificando o participante.
- `evento_id` referencia `eventos.id`, identificando o evento da inscrição.

### 4. cotacoes

Armazena solicitações de orçamento vinculadas aos eventos, incluindo prazo, modalidade, observações e status.

| Campo | Tipo |
|---|---|
| id (PK) | INT |
| evento_id (FK) | INT |
| prazo | DATE |
| modalidade | VARCHAR(50) |
| observacoes | TEXT |
| status | VARCHAR(30) |
| criada_em | TIMESTAMP |

**Chave primária:** `id`, identifica cada cotação.

**Chave estrangeira:** `evento_id`, referencia `eventos.id`, vinculando a cotação ao evento correspondente.

## Chaves e Relacionamentos

- **PK (Primary Key):** identifica cada registro de forma única dentro de uma tabela.
- **FK (Foreign Key):** conecta tabelas por meio de referências às suas chaves primárias, garantindo a integridade dos relacionamentos.

O banco possui relacionamentos **1:N (um para muitos)**, permitindo que um usuário organize vários eventos, que participantes realizem inscrições em diferentes eventos e que cada evento possua várias cotações.

## Diagrama EER

![Diagrama do Banco de Dados](./Diagrama_Banco_de_Dados.png)

## Tecnologias

- MySQL
- MySQL Workbench
- SQL