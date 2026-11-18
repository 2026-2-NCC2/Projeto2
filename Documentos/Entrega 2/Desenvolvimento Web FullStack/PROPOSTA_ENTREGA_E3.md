# E3 — Proposta final de estrutura e liberação

Preparação local de 17/11/2026. **Proposta não aprovada para distribuição.**
Não foi criado pacote, cópia de entrega ou ZIP. README raiz, dumps, E2 e histórico
permanecem intactos. Nenhuma credencial foi testada, nenhum serviço remoto foi
acessado e nenhum recurso foi ativado.

## 1. Comparação e consolidação dos READMEs

| Tema | README raiz | README E2 | Consolidação proposta E3 |
| --- | --- | --- | --- |
| Descrição/estrutura | Apresenta projeto e entregas acadêmicas | Foca a pasta FullStack | Estrutura autocontida da proposta, com arquitetura e quatro perfis |
| Créditos | Registra quatro pessoas | Não cria atribuições | Preserva os quatro créditos como referência; confirmação ainda necessária |
| Contas | Bloco de credenciais de demonstração não verificadas | Sem credenciais | Apenas orientação de obtenção privada de contas sintéticas |
| Instalação | npm install | npm ci | npm ci por pasta e lockfiles preservados |
| Execução | Porta Vite indicada como normalmente 5173 | strictPort e limites do modo principal | Portas fixas, pré-condições e caminho isolado, sem sugerir funcionamento offline completo |
| Testes/rotas | Instruções parciais | Comandos e baseline E1 | Mantém testes, build/lint, data HashRouter, 403/404 e limites dos resultados |
| A7/A10/F8 | Não consolida todos os bloqueios | Distingue recursos desativados | Mantém flags desligadas e separa implementação, habilitação e validação real |
| Licenças/IA | Escopo de licença pendente | Remete aos autores | Não resolve divergência nem infere modelo, assinatura ou aprovação |

[README_CONSOLIDADO_E3.md](README_CONSOLIDADO_E3.md) é a versão preparada.
Somente após aprovação poderá ser copiada como `README.md` da entrega. O E3
não substitui o original, nem remove créditos ou informações históricas.

## 2. Estrutura proposta e necessidade

```text
TrocaTicket-entrega/
  README.md                 <- README_CONSOLIDADO_E3.md aprovado
  PI React/
    src/, public/ quando existente, index.html
    package.json, package-lock.json, configs Vite/ESLint, tests/
  PI Backend/
    server.js, modulos, services/, repositories/, imagens/
    config/, certificados/ e evidencias/ somente nos itens aprovados
    scripts/, tests/, fixtures/, package.json, package-lock.json
    .gitattributes          # preservar bytes dos arquivos selados
  Banco de dados/
    SQL incremental/preflight e instrucoes revisados; sem dumps
  guias E1/E2/E3 e roteiro/registro visual aprovados
```

O inventário de referência é [DISTRIBUICAO_E3.json](DISTRIBUICAO_E3.json).
Ele mantém uma lista explícita, não usa "copiar a pasta inteira" e não executa
empacotamento. Candidatos E2 não são declarados automaticamente livres de
segredos; a liberação depende da revisão final de conteúdo e dependências.

### Classificação dos 152 condicionais do E2

Cada arquivo possui risco, necessidade, justificativa e decisão proposta no
inventário E3. "Excluir" significa **fora da proposta de pacote**, nunca apagar
ou modificar o original.

| Grupo | Risco / necessidade | Decisão proposta |
| --- | --- | --- |
| Três manifestos de ativação | Médio; indispensáveis às guardas dos modos existentes | Inclusão condicionada à aprovação de referências ao projeto, sem alterar valores ou burlar guardas |
| Evidência de imagens indicada pelo manifesto e evidência de encerramento usada nos testes de portabilidade | Alto pela origem operacional; necessárias ao startup principal atual ou à regressão correspondente | Pendência impeditiva: aprovar fornecimento dos arquivos atuais ou definir separadamente solução autorizada. Não fabricar evidência "aprovada" |
| Outros registros e scripts em evidencias/ | Alto até comprovar sanitização; não demonstrados como necessários ao startup normal | Fora do pacote padrão; avaliar anexo técnico separado. Referências por ferramentas históricas continuam registradas |
| .env.example | Médio: contém referência de infraestrutura, embora campos de segredo estejam vazios | Incluir somente após revisão; não copiar .env privado nem preencher credenciais no pacote |
| Certificado CA público | Baixo quanto a segredo; necessário se a configuração TLS o exigir | Revisar procedência, validade e distribuição; não confundir certificado com chave privada ou desativar TLS |
| Dois patches históricos | Médio; opcionais e potencialmente aplicáveis por engano | Fora do pacote padrão; não aplicar |
| Configuração de editor | Médio por caminhos/configuração local; dispensável à execução | Fora do pacote padrão |
| Imagem hero.png | Revisão de procedência/licença; nenhuma referência literal encontrada na fonte | Fora do pacote padrão por ausência de necessidade comprovada; sem excluir original |

As necessidades não foram inferidas apenas pelo nome dos arquivos. Foram lidos
`server.js`, `config/startup-controlado.cjs`, `imagens/inicializacao.cjs`,
`eventos-imagens-inicializacao.cjs` e `tests/startup-portabilidade.test.cjs`, além
dos manifestos. O grafo estava desatualizado e não substituiu essa verificação.

No estado examinado, a ativação de imagens de perfil está ligada no manifesto;
a de imagens de eventos está desligada. Isso é independente de A7/A10/F8,
que permanecem desativados. **Não alterar essas configurações para tornar o
pacote portátil.** O startup pode executar preflight e limpeza; não foi iniciado.

A evidência de encerramento é referenciada pelo manifesto e lida pelo teste de
portabilidade; a validação normal compara o próprio manifesto. Não afirmar que
todas as evidências históricas são lidas pelo startup. As duas evidências
condicionais necessárias foram separadas das demais para evitar uma exclusão
que esconda quebra de execução ou regressão.

A ausência de referência literal não prova ausência de dependência dinâmica.
Antes de liberar qualquer cópia, verificar resolução de imports/leitura de
arquivos e executar os testes nessa cópia. Não alegar que o subconjunto já
passou nas suítes: nenhum pacote foi montado para ensaio neste lote.

## 3. Bloqueios e exposição anterior

- Excluir da proposta os dois dumps históricos e o README raiz na forma atual.
  Credenciais não foram autenticadas e a proveniência dos dados continua desconhecida.
- Excluir `.git/`, `.env`, chaves privadas, backups/journals privados, logs,
  caches, temporários, node_modules e builds locais do pacote de fontes.
- Não gerar `git archive`/ZIP genérico: os arquivos sensíveis estão rastreados
  e sem export-ignore. Exclusão do pacote não remove a exposição histórica.
- Os responsáveis precisam confirmar uso/reutilização e, quando aplicável,
  revogar/rotacionar credenciais e decidir sobre sessões anteriores.
- Tratar histórico, remotos, forks e clones em decisão separada. Não há
  autorização para reescrever história, fazer push ou remover dados.
- Referências a nomes de variáveis de ambiente nos documentos não são valores
  de credenciais. Identificadores reais de infraestrutura e evidências ficam
  condicionados à revisão; não publicá-los por presunção.

## 4. Adequação aos requisitos conhecidos do PI

| Requisito conhecido | Evidência / situação | Critério antes da apresentação |
| --- | --- | --- |
| React Router e URLs | createHashRouter, contratos de rotas, useNavigate/useBlocker e testes de histórico | Conferir F5 e Voltar/Avançar no notebook |
| Página 404 e acesso protegido | 404/403 distintos, sessão validada e autorização no backend | Conferir URL inexistente e perfil sem acesso sem expor dados |
| Login real | JWT e consulta de usuário atual no servidor; testes sintéticos | Contas autorizadas por canal privado, sem testar credenciais expostas |
| APIs assíncronas | Serviços/hooks e estados de carregamento/erro/recuperação | Serviços e capacidades reais confirmados em ambiente autorizado |
| Validações próprias | Mensagens de campos e início futuro em America/Sao_Paulo | Demonstrar rejeição de data passada e formulário futuro sem gravação indevida |
| Separação de componentes | Páginas, componentes, hooks, serviços e repositórios | Arquivos grandes restantes são melhoria posterior, não motivo para reescrever agora |
| Responsividade e acessibilidade | Regras/testes estruturais, foco, teclado e labels | Inspeção real em 320px, tablet, desktop e zoom 200% permanece pendente |
| Busca, ticket e acréscimo | Fluxos e testes existentes | Mostrar dados sintéticos e explicar estimativas, sem prometer receita/pagamento |

Não foi recebida uma rubrica completa adicional da faculdade; não declarar
100% de atendimento a critérios desconhecidos. Baseline local E1 permanece
989 testes React e 1.758 backend aprovados, com 23 skips no backend. PostgreSQL
e inspeção visual reais não estão aprovados por esses números.

## 5. Aprovação dos três integrantes — preencher, não presumir

Três revisores técnicos devem registrar nome, data, decisão e itens pendentes:

| Revisor | Nome / data | README e funcionalidades | Segurança e inventário | Licenças/IA e créditos | Decisão |
| --- | --- | --- | --- | --- | --- |
| Integrante 1 | A preencher | Pendente | Pendente | Pendente | Não aprovado |
| Integrante 2 | A preencher | Pendente | Pendente | Pendente | Não aprovado |
| Integrante 3 | A preencher | Pendente | Pendente | Pendente | Não aprovado |

O README original credita quatro pessoas. Confirmar representação e anuência
dos titulares antes de decisões de autoria/licença; três revisões técnicas não
apagam o quarto crédito nem substituem consentimentos necessários. A declaração
de IA continua dependente de revisão humana; seu conteúdo/modelo não foi
revalidado automaticamente, e não se presume aprovação.

## 6. Critérios objetivos para liberar a distribuição

- [ ] README consolidado aprovado, sem valores de acesso, sem substituir original.
- [ ] Credenciais expostas avaliadas pelos responsáveis; rotação/revogação
      concluída quando necessária, com registro privado de evidência.
- [ ] Dumps, segredos, histórico Git e artefatos privados ausentes da lista final.
- [ ] Todos os itens condicionais necessários aprovados individualmente;
      se não puderem ser fornecidos, documentar o limite e resolver dependências
      em etapa separada, sem simular backend operacional.
- [ ] Licenças, créditos e IA confirmados pelos titulares; divergências resolvidas.
- [ ] Três revisores preencheram a tabela e eventuais consentimentos adicionais.
- [ ] Fontes, lockfiles, configs, testes e SQL preparado mantêm estrutura e bytes;
      imports, referências e testes conferidos na cópia final autorizada.
- [ ] Visual e fluxos da apresentação registrados como realmente executados,
      com limitações de infraestrutura e funcionalidades desativadas explícitas.
- [ ] Conteúdo do pacote final comparado à lista aprovada e varrido novamente;
      criação e distribuição autorizadas em etapa própria.

Até todos os bloqueios aplicáveis serem resolvidos, manter
`aprovado_para_distribuicao: false`. Não basta criar o README limpo para declarar
seguro um clone do repositório. E3 entrega proposta e critérios, não o pacote.

## 7. Validação estática E3

- 152 condicionais E2 classificados sem duplicação ou omissão: riscos alto
  (143), médio (8) e baixo (1), sempre como avaliação de distribuição, não prova
  de que um arquivo contenha segredo.
- Inventário: 615 candidatos à revisão final, sete inclusões condicionadas e
  147 exclusões da proposta padrão. Listas disjuntas, caminhos existentes e
  restritos à pasta do projeto; os dois dumps estão fora dos candidatos.
- 615 candidatos textuais examinados: nenhuma correspondência às senhas ou
  identificadores de login conhecidos do README, nem aos padrões pesquisados
  de chave privada PEM, JWT literal, senha em URI de banco e bcrypt literal.
- Os três novos documentos também foram verificados quanto a credenciais
  conhecidas, endereços de login, tokens pesquisados, links locais e whitespace.
- Nenhum arquivo necessário foi declarado aprovado: as sete dependências
  condicionadas ainda impedem anunciar um pacote operacional revisado.
- `git diff --check` aprovado. Não houve testes funcionais, instalação, build,
  PostgreSQL ou acesso remoto no E3; somente documentação e verificações estáticas.

A busca não verifica validade de credenciais, não cobre todo segredo possível,
binários ou histórico completo, nem garante ausência de dependências dinâmicas.
Não foi feita varredura de uma cópia empacotada porque ela não foi criada.
Os resultados completos de testes anteriores continuam datados no E1.

Arquivos criados neste lote: `README_CONSOLIDADO_E3.md`,
`PROPOSTA_ENTREGA_E3.md` e `DISTRIBUICAO_E3.json`. Nenhum arquivo original foi
substituído, excluído ou renormalizado; A7/A10/F8 permanecem desativados.
