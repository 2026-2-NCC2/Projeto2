# FECAP - Fundação de Comércio Álvares Penteado

<p align="center">
<a href= "https://www.fecap.br/"><img src="https://tse4.mm.bing.net/th/id/OIP.mmndDi3pHHHtTOmlNkpU0QHaCZ?r=0&rs=1&pid=ImgDetMain&o=7&rm=3" alt="FECAP - Fundação de Comércio Álvares Penteado" border="0"></a>
</p>

# TrocaTicket
## CLJG

## Integrantes: <a href="https://github.com/IC4DUI">Carlos Eduardo da Silva</a>, <a href="https://github.com/lucaspelliciotti">Lucas Pelliciotti Cintra Da Silva</a>, <a href="https://github.com/guilhermehmorato-glitch">Guilherme Harada Morato</a>, <a href="https://github.com/GuilhermeF420">Guilherme Fernandes Alexandre de Carvalho</a>

## Professores Orientadores: <a href="https://www.linkedin.com/in/francisco-escobar/">Francisco de Souza Escobar</a>, <a href="https://www.linkedin.com/in/paula-astorino-432b5812a/">Paula Sanchez Astorino</a>, <a href="https://www.linkedin.com/in/dolemes/">David De Oliveira Lemes</a>, <a href="https://www.linkedin.com/in/jesuslisboagomes/">Jésus De Lisboa Gomes</a>, <a href="https://www.linkedin.com/in/katia-bossi/">Katia Milani Lara Bossi</a>

## 📌 Descrição

O **TrocaTicket** é uma plataforma web que conecta organizadores de eventos e fornecedores de serviços. Seu objetivo é centralizar o cadastro de eventos, o planejamento de custos, a publicação de cotações e o acompanhamento de propostas, tornando a organização mais prática e transparente.

O projeto reúne áreas para **organizadores, fornecedores, participantes e administradores**. A Entrega 1 contém o protótipo em React; a Entrega 2 integra o frontend a uma API em Node.js e Express, com persistência no Supabase.

**Tecnologias principais:** React, Vite, JavaScript, HTML, CSS, Node.js, Express e Supabase.

## 🛠 Estrutura de pastas

- **Raiz**
  - **Documentos**
    - **Entrega 1**
      - Cálculo II
      - Desenvolvimento Web FullStack
        - PI React
      - Gestão Empresarial e Dinâmicas das Organizações
      - Projeto Interdisciplinar Programação Web
      - Projeto em Banco de Dados
    - **Entrega 2**
      - Cálculo II
      - Desenvolvimento Web FullStack
        - PI React
        - PI Backend
        - Banco de dados
        - arquivo
      - Gestão Empresarial e Dinâmicas das Organizações
      - Projeto Interdisciplinar Programação Web
      - Projeto em Banco de Dados
  - **src**
    - **Entrega 1**
      - Backend
      - Frontend
    - **Entrega 2**
      - Backend
      - Frontend
  - **README.md**

## 💾 Tabela de entregas

| Entrega | Disciplina | Material |
|---|---|---|
| 1 | Cálculo II | [Polinômio de Taylor — PDF](Documentos/Entrega%201/C%C3%A1lculo%20II/Projeto%20Interdisciplinar%20-%20Polinomio%20de%20Taylor%20TrocaTicket%2000.pdf) |
| 1 | Desenvolvimento Web FullStack | [Frontend React](Documentos/Entrega%201/Desenvolvimento%20Web%20FullStack/PI%20React) |
| 1 | Gestão Empresarial e Dinâmicas das Organizações | [Documento da Entrega 1 — PDF](Documentos/Entrega%201/Gest%C3%A3o%20Empresarial%20e%20Din%C3%A2micas%20das%20Organiza%C3%A7%C3%B5es/TrocaTicket_Entrega_1_Missao_Visao_Valores_Proposta_de_Valor.pdf) |
| 1 | Projeto Interdisciplinar Programação Web | [Link do Figma](Documentos/Entrega%201/Projeto%20Interdisciplinar%20Programa%C3%A7%C3%A3o%20Web/link%20figma.txt) |
| 1 | Projeto em Banco de Dados | [Registro da modelagem](Documentos/Entrega%201/Projeto%20em%20Banco%20de%20Dados/Diagrama%20modelagem.txt) |
| 2 | Cálculo II | [Polinômio de Taylor — PDF](Documentos/Entrega%202/C%C3%A1lculo%20II/Projeto%20Interdisciplinar%20-%20Polinomio%20de%20Taylor%20TrocaTicket%2000.pdf) |
| 2 | Desenvolvimento Web FullStack | [Frontend](Documentos/Entrega%202/Desenvolvimento%20Web%20FullStack/PI%20React) · [Backend](Documentos/Entrega%202/Desenvolvimento%20Web%20FullStack/PI%20Backend) · [Banco de dados](Documentos/Entrega%202/Desenvolvimento%20Web%20FullStack/Banco%20de%20dados) |
| 2 | Gestão Empresarial e Dinâmicas das Organizações | [Mapa de processos — PDF](Documentos/Entrega%202/Gest%C3%A3o%20Empresarial%20e%20Din%C3%A2micas%20das%20Organiza%C3%A7%C3%B5es/TrocaTicket_Mapa_de_Processos.pdf) |
| 2 | Projeto Interdisciplinar Programação Web | [Link do Figma](Documentos/Entrega%202/Projeto%20Interdisciplinar%20Programa%C3%A7%C3%A3o%20Web/link%20figma.txt) |
| 2 | Projeto em Banco de Dados | [Diagrama de modelagem — PDF](Documentos/Entrega%202/Projeto%20em%20Banco%20de%20Dados/Diagrama%20modelagem.pdf) |

## 🔧 Instalação

**Pré-requisitos:** Node.js 24, npm, Git e acesso autorizado ao ambiente Supabase do projeto.

Clone o repositório:

```sh
git clone https://github.com/2026-2-NCC2/Projeto2.git
cd Projeto2
```

Instale as dependências da Entrega 2, executando cada bloco em um terminal aberto na raiz do repositório:

**Backend**

```sh
cd "Documentos/Entrega 2/Desenvolvimento Web FullStack/PI Backend"
npm install
```

**Frontend**

```sh
cd "Documentos/Entrega 2/Desenvolvimento Web FullStack/PI React"
npm install
```

## 💻 Configurações para desenvolvimento

### Ambiente

Na pasta **PI Backend**, crie um arquivo `.env` com os valores privados fornecidos pelo responsável pelo ambiente:

```dotenv
DB_PROVIDER=supabase
SUPABASE_URL=<URL_DO_PROJETO_AUTORIZADO>
SUPABASE_SECRET_KEY=<CHAVE_SECRETA_DO_BACKEND>
JWT_SECRET=<SEGREDO_SEGURO_COM_PELO_MENOS_32_CARACTERES>
PORT=3001
```

Substitua os marcadores antes de iniciar. **Não versione o `.env` nem exponha a chave secreta no frontend.** Utilize o projeto Supabase esperado pela configuração versionada.

### Execução

No terminal do **PI Backend**:

```sh
npm start
```

No terminal do **PI React**:

```sh
npm run dev
```

A API utiliza **http://localhost:3001**. Abra o endereço informado pelo Vite para acessar o frontend, normalmente **http://localhost:5173**.

O comando `npm start` utiliza os certificados confiáveis do sistema e mantém a verificação TLS. Para detalhes, consulte o [guia de instalação do backend](Documentos/Entrega%202/Desenvolvimento%20Web%20FullStack/PI%20Backend/INSTALACAO.md). A instalação normal utiliza Supabase e não exige executar migrações ou scripts SQL.

## 📋 Licença/License

[TrocaTicket](https://github.com/2026-2-NCC2/Projeto2) © 2026 por [Carlos Eduardo da Silva](https://github.com/IC4DUI), [Lucas Pelliciotti Cintra Da Silva](https://github.com/lucaspelliciotti), [Guilherme Harada Morato](https://github.com/guilhermehmorato-glitch) e [Guilherme Fernandes Alexandre de Carvalho](https://github.com/GuilhermeF420) está licenciado sob [Creative Commons Atribuição 4.0 Internacional](https://creativecommons.org/licenses/by/4.0/).

<a href="https://creativecommons.org/licenses/by/4.0/">
  <img src="https://mirrors.creativecommons.org/presskit/icons/cc.svg" alt="Creative Commons" width="32">
  <img src="https://mirrors.creativecommons.org/presskit/icons/by.svg" alt="Atribuição" width="32">
</a>

## 🎓 Reference

[TrocaTicket](https://trocaticket.com.br/index)
