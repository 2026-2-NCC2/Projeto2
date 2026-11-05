FECAP — Fundação Escola de Comércio Álvares Penteado
<p align="center">
  <a href="https://www.fecap.br/">
    <img src="https://tse4.mm.bing.net/th/id/OIP.mmndDi3pHHHtTOmlNkpU0QHaCZ?r=0&rs=1&pid=ImgDetMain&o=7&rm=3" alt="Logo da FECAP" width="380">
  </a>
</p>TrocaTicket
Projeto acadêmico interdisciplinar — organização de eventos e conexão entre organizadores e fornecedores.
Sumário
- Equipe e orientação
- Sobre o projeto
- Tecnologias utilizadas
- Funcionalidades
- Estrutura de pastas
- Instalação e execução
- Configuração de ambiente
- Entregas acadêmicas
- Licença
- Referências
Equipe e orientação
Integrantes
Integrante	GitHub
Carlos Eduardo da Silva	IC4DUI
Lucas Pelliciotti Cintra Da Silva	lucaspelliciotti
Guilherme Harada Morato	guilhermehmorato-glitch
Guilherme Fernandes Alexandre de Carvalho	GuilhermeF420


Professores orientadores
- Francisco de Souza Escobar
- Paula Sanchez Astorino
- David De Oliveira Lemes
- Jésus De Lisboa Gomes
- Katia Milani Lara Bossi
Sobre o projeto
O TrocaTicket é uma plataforma web voltada à organização de eventos e à conexão entre organizadores e fornecedores de serviços. A proposta é reunir o planejamento do evento, seus custos, a publicação de cotações e o acompanhamento de propostas em um único ambiente.

A Entrega 1 contém o protótipo navegável em React. A Entrega 2 reúne a evolução do frontend e uma API em Node.js e Express, com integração ao Supabase, além de áreas para organizadores, fornecedores, participantes e administração.
Missão, visão e valores
Missão: facilitar a organização de eventos, conectando organizadores e fornecedores para encontrar serviços, solicitar e comparar propostas e acompanhar contratações.

Visão: ser uma plataforma de referência para a organização de eventos e para a conexão entre organizadores e fornecedores.

Valores: segurança, transparência, praticidade, confiabilidade, inovação e foco no usuário.

Esses objetivos representam a proposta do projeto; a disponibilidade dos recursos está detalhada em Funcionalidades.
Apresentação visual
Consultar o protótipo no Figma.

Captura da plataforma: pendente de inclusão. Não foi localizada uma captura de tela da aplicação no repositório. O arquivo hero.png dos frontends é uma ilustração genérica e não representa a interface do TrocaTicket.
Tecnologias utilizadas
Área	Tecnologias confirmadas
Frontend	React, React DOM, JavaScript, JSX, HTML e CSS
Desenvolvimento do frontend	Vite e ESLint
Backend	Node.js, Express, CORS e dotenv
Autenticação	JSON Web Token (jsonwebtoken) e bcryptjs
Persistência principal	Supabase, com cliente @supabase/supabase-js
Integrações de banco presentes no backend	pg e mysql2
Processamento de imagens	Sharp
Versionamento e prototipação	Git, GitHub e Figma


A presença de pg e mysql2 nas dependências não significa que sejam modos alternativos de execução normal. A instalação atual documentada exige DB_PROVIDER=supabase e não faz fallback para MySQL.
Funcionalidades
Implementadas no código
Área	Recursos
Autenticação e acesso	Cadastro, login com JWT, validação de sessão, navegação por perfil e solicitações de acesso
Organizador	Listagem, consulta, criação, edição e publicação de eventos; operações de cancelamento e encerramento
Planejamento financeiro	Rascunhos de custos por evento, consulta e salvamento de custos, cálculo do planejamento financeiro
Cotações e propostas	Publicação e consulta de cotações, envio e acompanhamento de propostas pelo fornecedor e avaliação de propostas pelo organizador
Participante	Consulta de eventos e inscrição, com consulta das próprias inscrições
Administração	Consultas de usuários, eventos, cotações e propostas; análise de solicitações de acesso
Perfil	Consulta e edição de dados pessoais


Implementação no código não equivale a validação do ambiente remoto. As operações dependem das permissões do perfil, da preparação do banco e dos controles de disponibilidade do backend.
Em desenvolvimento ou com disponibilidade condicionada
Recurso	Situação identificada
Contratos ativos	Opção indisponível no portal do fornecedor; não deve ser apresentada como contratação concluída
Imagens de eventos	Código presente, mas ativação desabilitada no arquivo versionado config/ativacao-eventos-imagens.json
Perfil profissional	Disponibilidade condicionada à variável PERFIL_PROFISSIONAL_ATIVO e à preparação correspondente
Portfólio do fornecedor	Interface e integração presentes; disponibilidade condicionada à configuração do backend e à preparação do banco
Imagens de perfil	Ativação registrada em config/ativacao-imagens.json, com verificações adicionais na inicialização
Controle de capacidade dos eventos	Depende das capacidades informadas pela API e da preparação do banco


O roteiro de instalação abaixo não ativa recursos opcionais nem executa alterações de banco.
Estrutura de pastas
A organização abaixo resume os diretórios relevantes, preservando os nomes reais:
- Documentos/
  - Entrega 1/
    - Cálculo II/
    - Desenvolvimento Web FullStack/
      - PI React/ — frontend da primeira entrega
    - Gestão Empresarial e Dinâmicas das Organizações/
    - Projeto Interdisciplinar Programação Web/
    - Projeto em Banco de Dados/
  - Entrega 2/
    - Cálculo II/
    - Desenvolvimento Web FullStack/
      - PI React/ — frontend da segunda entrega
      - PI Backend/ — API, configurações, serviços, repositórios e testes
      - Banco de dados/ — scripts SQL e documentação técnica
      - arquivo/ — documentação arquivada
    - Gestão Empresarial e Dinâmicas das Organizações/
    - Projeto Interdisciplinar Programação Web/
    - Projeto em Banco de Dados/
- src/
  - Entrega 1/Backend/ e Entrega 1/Frontend/
  - Entrega 2/Backend/ e Entrega 2/Frontend/
- README.md — apresentação e guia principal
- AGENTS.md — orientações para agentes de desenvolvimento
As pastas em src/ contêm arquivos de reserva chamados Código aqui.txt. O código executável está nos diretórios de Desenvolvimento Web FullStack em Documentos/. Não há pasta imagens/ na raiz.
Instalação e execução
Pré-requisitos
- Node.js 24 e npm, conforme a documentação de instalação do backend.
- Git para clonar o repositório.
- Acesso autorizado ao ambiente Supabase esperado pelo projeto.
- Editor de código de sua preferência.
Obter o projeto
git clone https://github.com/2026-2-NCC2/Projeto2.git
cd Projeto2
Os comandos seguintes consideram terminais abertos na raiz Projeto2. Os caminhos estão entre aspas porque contêm espaços.
Backend — Entrega 2
No primeiro terminal:
cd "Documentos/Entrega 2/Desenvolvimento Web FullStack/PI Backend"
npm install
Antes de iniciar, crie o arquivo privado .env conforme Configuração de ambiente.
npm start
A porta prevista é 3001. O script aplica --use-system-ca, mantendo a verificação TLS e utilizando também os certificados confiáveis do sistema.

O endpoint http://localhost:3001/ verifica a resposta HTTP da API; ele não confirma a conexão com o banco.

Para detalhes e diagnóstico, consulte [INSTALACAO.md](Documentos/Entrega%202/Desenvolvimento%20Web%20FullStack/PI%20Backend/INSTALACAO.md). Se os controles de inicialização bloquearem o servidor, consulte o responsável pelo ambiente; não remova os controles para contornar o bloqueio.
Frontend — Entrega 2
Em outro terminal, a partir da raiz:
cd "Documentos/Entrega 2/Desenvolvimento Web FullStack/PI React"
npm install
npm run dev
Abra o endereço informado pelo Vite, normalmente http://localhost:5173/.

O frontend principal usa a API em http://localhost:3001, definida em src/services/api.js. Mantenha o backend em execução nessa porta para utilizar essa configuração.
Frontend — Entrega 1
Para consultar o protótipo da primeira entrega, em um terminal separado a partir da raiz:
cd "Documentos/Entrega 1/Desenvolvimento Web FullStack/PI React"
npm install
npm run dev
Use o endereço informado pelo Vite. Esse diretório corresponde à primeira versão e não substitui o frontend da Entrega 2.
Comandos de verificação disponíveis
Diretório da Entrega 2	Comando	Finalidade
PI React	npm run build	Gerar o build do frontend
PI React	npm run lint	Executar a análise do ESLint
PI React	npm run preview	Visualizar localmente o build gerado
PI Backend	npm test	Executar os testes declarados no pacote


Configuração de ambiente
Crie .env somente em Documentos/Entrega 2/Desenvolvimento Web FullStack/PI Backend/, com valores fornecidos pelo responsável pelo ambiente.

Exemplo com marcadores, sem credenciais:
DB_PROVIDER=supabase
SUPABASE_URL=<URL_DO_PROJETO_SUPABASE_AUTORIZADO>
SUPABASE_SECRET_KEY=<CHAVE_SECRETA_FORNECIDA_PELO_RESPONSAVEL>
JWT_SECRET=<SEGREDO_SEGURO_COM_PELO_MENOS_32_CARACTERES>
PORT=3001
Substitua os marcadores antes de executar. O ambiente deve corresponder ao projeto esperado pela configuração versionada; apontar para outro Supabase não constitui uma instalação equivalente.
- Não versione .env nem publique chaves, senhas ou tokens.
- A chave secreta do Supabase pertence exclusivamente ao backend. Não a copie para o frontend nem para variáveis VITE_.
- Variáveis já definidas no processo prevalecem sobre o arquivo .env.
- Preserve a verificação TLS e os arquivos de ativação versionados.
- A instalação normal não exige executar migrações, recuperação, rollback ou scripts SQL.
- O arquivo [`.env.example`](Documentos/Entrega%202/Desenvolvimento%20Web%20FullStack/PI%20Backend/.env.example) contém configurações adicionais. Variáveis de homologação e preparação não devem ser ativadas como parte deste guia.
Entregas acadêmicas
Os links abaixo apontam para materiais existentes no repositório. A presença de um arquivo não comprova aprovação ou conclusão acadêmica; datas e notas não foram atribuídas sem confirmação.
Entrega	Disciplina	Material
1	Cálculo II	[Polinômio de Taylor — PDF](Documentos/Entrega%201/C%C3%A1lculo%20II/Projeto%20Interdisciplinar%20-%20Polinomio%20de%20Taylor%20TrocaTicket%2000.pdf)
1	Desenvolvimento Web FullStack	Frontend React
1	Gestão Empresarial e Dinâmicas das Organizações	[Missão, visão, valores e proposta de valor — PDF](Documentos/Entrega%201/Gest%C3%A3o%20Empresarial%20e%20Din%C3%A2micas%20das%20Organiza%C3%A7%C3%B5es/TrocaTicket_Entrega_1_Missao_Visao_Valores_Proposta_de_Valor.pdf)
1	Projeto Interdisciplinar Programação Web	[Registro do link do Figma](Documentos/Entrega%201/Projeto%20Interdisciplinar%20Programa%C3%A7%C3%A3o%20Web/link%20figma.txt)
1	Projeto em Banco de Dados	[Registro da modelagem](Documentos/Entrega%201/Projeto%20em%20Banco%20de%20Dados/Diagrama%20modelagem.txt)
2	Cálculo II	[Polinômio de Taylor — PDF](Documentos/Entrega%202/C%C3%A1lculo%20II/Projeto%20Interdisciplinar%20-%20Polinomio%20de%20Taylor%20TrocaTicket%2000.pdf)
2	Desenvolvimento Web FullStack	Frontend · Backend · Banco de dados
2	Gestão Empresarial e Dinâmicas das Organizações	[Mapa de processos — PDF](Documentos/Entrega%202/Gest%C3%A3o%20Empresarial%20e%20Din%C3%A2micas%20das%20Organiza%C3%A7%C3%B5es/TrocaTicket_Mapa_de_Processos.pdf)
2	Projeto Interdisciplinar Programação Web	[Registro do link do Figma](Documentos/Entrega%202/Projeto%20Interdisciplinar%20Programa%C3%A7%C3%A3o%20Web/link%20figma.txt)
2	Projeto em Banco de Dados	[Diagrama de modelagem — PDF](Documentos/Entrega%202/Projeto%20em%20Banco%20de%20Dados/Diagrama%20modelagem.pdf)


Licença
Pendente de definição pela equipe.

Este README não atribui uma licença ao projeto. A definição e a formalização das condições de uso, modificação e distribuição serão realizadas pela equipe.

Equipe responsável: Carlos Eduardo da Silva, Lucas Pelliciotti Cintra Da Silva, Guilherme Harada Morato e Guilherme Fernandes Alexandre de Carvalho.
Referências
- FECAP — instituição de ensino.
- Protótipo TrocaTicket no Figma — endereço registrado nos materiais acadêmicos.
- [Documentação de instalação do backend](Documentos/Entrega%202/Desenvolvimento%20Web%20FullStack/PI%20Backend/INSTALACAO.md) — requisitos e orientações de execução.
- [Dependências e scripts do frontend](Documentos/Entrega%202/Desenvolvimento%20Web%20FullStack/PI%20React/package.json).
- [Dependências e scripts do backend](Documentos/Entrega%202/Desenvolvimento%20Web%20FullStack/PI%20Backend/package.json).
