# E2 — Saneamento pré-entrega: diagnóstico e propostas

Revisão local de 17/11/2026. Não houve autenticação com as credenciais,
acesso ao Supabase, alteração de dados, remoção de dumps, ZIP, alteração de
flags ou reescrita do histórico. Este documento não declara o repositório
liberado para distribuição.

## 1. Riscos comprovados e alcance

| Prioridade | Arquivo | Evidência sem valores | Tratamento proposto |
| --- | --- | --- | --- |
| Alta | README.md na raiz do repositório, linhas 134–153 na revisão examinada | Bloco identificado como acesso manual aos perfis: quatro contas e duas senhas distintas em texto claro | Substituir o bloco por orientação de obtenção privada de contas sintéticas; responsáveis verificam se as credenciais são utilizadas e providenciam revogação/rotação quando aplicável |
| Alta | `Banco de dados/trocaticket.sql` | Rastreado; nove e-mails e nove hashes bcrypt | Não distribuir o dump atual. Confirmar origem e autorização; futura fixture deve ser exclusivamente sintética, sem reutilizar identificadores ou hashes atuais |
| Alta | `Banco de dados/trocaticket_supabase.sql` | Rastreado; nove e-mails e nove hashes bcrypt | Mesmo bloqueio do outro dump; não usar como seed de apresentação enquanto a origem for desconhecida |
| Média | Histórico Git local desses três caminhos | Foram inspecionadas revisões que alteram cada caminho, em todas as referências locais | Corrigir o arquivo atual não remove versões anteriores; eventual tratamento de histórico exige plano e autorização próprios |
| Média | README, metadados do backend e declaração de IA | Escopo CC BY 4.0/ISC pendente; declaração ainda requer confirmação dos autores | Não aprovar licença, autoria ou modelo por inferência |

### Finalidade e validade das credenciais

A finalidade declarada no README é facilitar o acesso manual de demonstração
aos quatro perfis. Isso não comprova que as contas sejam descartáveis, que os
dados sejam fictícios ou que as credenciais estejam revogadas. Não foi possível
estabelecer sua validade sem consultar o serviço, o que não foi realizado.

Não foi localizada ocorrência exata das senhas do bloco nos outros arquivos
textuais rastreados da árvore atual do repositório. Essa busca não cobre
conteúdo de imagens, documentos binários, objetos Git inalcançáveis ou cópias
externas. Não é prova de inexistência de reutilização.

Se os responsáveis confirmarem uso em contas ativas, tratar como credenciais
expostas: revogar/rotacionar pelo canal autorizado, revisar reutilização e
decidir o tratamento de sessões existentes. Nada disso foi executado no E2.
Não tentar descobrir a senha a partir dos hashes e não tentar login para
"confirmar" a exposição.

### Histórico e arquivos de entrega

Consulta somente leitura às referências Git locais, sem fetch:

| Caminho | Revisões que alteram o caminho inspecionadas | Revisões com os indícios relevantes |
| --- | ---: | ---: |
| README raiz | 48 | 2 com bloco de credenciais |
| Dump MySQL/MariaDB | 1 | 1 com e-mails e bcrypt |
| Dump Supabase | 1 | 1 com e-mails e bcrypt |

Esses números não são contagem de todas as cópias, de todos os commits que
podem conter o mesmo conteúdo, nem certificação de remotos/forks. Não foram
inspecionados objetos inacessíveis ou binários históricos.

Os dois dumps são os SQLs rastreados com bcrypt encontrados na árvore atual do
repositório. Para os três arquivos, o atributo `export-ignore` está
`unspecified`. Assim, um `git archive` padrão de uma revisão que os contenha
pode incluí-los; um clone preserva o histórico disponível. Nenhum pacote foi
gerado. Não foram encontrados ZIP/7z/RAR/TGZ, dumps binários ou backups com essas
extensões na árvore de trabalho examinada fora de dependências/artefatos Git.
Isso não inspeciona anexos internos de PDFs/DOCX ou arquivos fora do repositório.

## 2. Correções documentais prontas para revisão

### Substituição proposta do bloco de credenciais do README raiz

```markdown
### Acesso aos perfis de demonstração

Utilize exclusivamente contas sintéticas autorizadas para o ambiente escolhido.
Solicite os identificadores e as senhas ao responsável por canal privado.
Não publique credenciais no README, slides, capturas ou arquivos de entrega.

A seleção de perfil no Login apenas apresenta o portal; a autorização efetiva
é determinada pelo servidor. Não utilize contas com dados de produção para
preparar a demonstração.
```

Essa substituição é uma proposta, não foi aplicada ao README raiz. Não contém
novos logins ou senhas padrão. Não distribuir a raiz atual como se já estivesse
saneada. O novo [README_ENTREGA_E2.md](README_ENTREGA_E2.md) é uma orientação
local limpa; não substitui nem remove o README da raiz ou suas versões anteriores.

### Instalação e execução a corrigir na documentação da raiz

- Recomendar `npm.cmd ci` nas duas pastas com os lockfiles revisados, em vez de
  alterar versões durante a preparação. E2 não instalou dependências.
- Fixar o frontend principal em `localhost:5173` com `--strictPort`; não aceitar
  automaticamente outra porta, pois o CORS principal exige essa origem.
- Informar React Router/data HashRouter, página 404, distinção 403 e suporte ao
  histórico. Não descrever a navegação atual como estado local sem URL.
- Explicar que API local em 3001 pode usar o Supabase compartilhado; localhost
  não comprova isolamento nem funcionamento offline.
- Não apresentar `npm start` como teste somente leitura: o startup principal
  pode consultar infraestrutura e iniciar rotinas operacionais de imagens.
- Separar implementação disponível, capacidade habilitada e validação real.
  A7/A10/F8 permanecem desativados. Cadastro depende dos termos/capacidades;
  portfólio e imagens dependem de configuração e infraestrutura.
- Usar os resultados do E1 como baseline datado, não como prova de execução no
  computador do avaliador ou aprovação das integrações PostgreSQL.

## 3. Licenças e declaração de IA

O README da raiz declara CC BY 4.0 para o projeto; `PI Backend/package.json`
declara ISC. O próprio README, a partir da seção de escopo pendente, registra
que a divisão entre código e documentos ainda não foi aprovada. Manter textos,
metadados, titulares e licenças de terceiros intactos até decisão dos autores.

Declaração localizada em `Documentos/Declaração IA/Declaração_uso_IA.pdf`, na raiz
do repositório. As ferramentas locais `pypdf`, `pdfplumber`, PyMuPDF e Poppler
não estavam disponíveis; o conteúdo/modelo e o layout não foram revalidados.
Nenhuma ferramenta foi instalada. Os autores precisam revisar o PDF e confirmar
ferramentas/modelos realmente utilizados, finalidade, créditos e eventuais
assinaturas. Não substituir modelo ou atribuir autoria com base nesta auditoria.

## 4. Distribuição: lista revisável, sem empacotamento

[DISTRIBUICAO_E2.json](DISTRIBUICAO_E2.json) inventaria os arquivos atuais deste
escopo como **candidatos**, **revisão manual** ou **bloqueados**. Não é script de
ZIP, não é aprovação de publicação e não é lista de execução de migrações.
O campo `aprovado_para_distribuicao` permanece false. Caminhos listados são
relativos a esta pasta; README raiz e declaração de IA ficam em escopo externo.

| Grupo | Tratamento |
| --- | --- |
| Fontes React/Node, testes, utilitários, manifestos npm, lockfiles e configurações sem segredos | Candidatos à entrega técnica após revisão final; incluir os testes sintéticos necessários |
| SQL incremental/preflight e suas instruções | Candidatos como documentação/código preparado; não executar automaticamente ou alegar migração aplicada |
| README local E2, E1, guias de demonstração/validação e registro visual | Candidatos; registros antigos mantêm datas e limitações, e registro não executado não vira aprovação |
| Dois dumps históricos | Bloqueados na proposta de distribuição; mantidos intactos no repositório |
| `.env`, chaves privadas, credenciais, backups, logs, caches, node_modules e diretórios dist | Fora do pacote de fontes proposto; não copiar arquivos ignorados por arrasto da pasta inteira |
| Configurações de ativação e evidências operacionais do backend | Revisão manual: podem conter referências ao projeto, caminhos e evidências reais; também podem ser necessárias às guardas/testes. Não apagar, regenerar ou omitir silenciosamente |
| Imagens binárias, certificados e patches históricos | Revisão manual de origem/finalidade/licença; certificado público não é chave privada, mas não relaxar TLS nem substituir certificados para empacotar |
| Configuração de editor | Não necessária ao pacote de execução; classificada para revisão, sem exclusão automática |

### O que o .gitignore protege e o que não protege

O `.env` privado do backend, node_modules e dist estão ignorados. Os dumps não
estão ignorados no caminho real e já são rastreados. A regra histórica na raiz
para outro caminho de dump não resolve isso. Adicionar uma regra de ignore não
retira arquivos já rastreados nem os elimina do histórico ou de arquivos Git
exportados. Não foram alterados `.gitignore`, índice ou atributos de exportação.

Não foi identificado arquivo temporário que pudesse ser excluído automaticamente
com segurança. Dependências e scripts históricos não foram removidos. A7, A10,
F8 e a infraestrutura de backup permanecem preservados e não foram ativados.

## 5. Decisões dos responsáveis

1. Confirmar uso/origem das quatro contas e necessidade de rotação/revogação,
   inclusive eventual reutilização fora da demonstração.
2. Aprovar substituição do bloco do README e definir a política de credenciais
   de demonstração por canal privado.
3. Confirmar proveniência dos dumps e decidir entre não distribuí-los ou criar
   futuramente fixtures sintéticas novas. Não reutilizar hashes existentes.
4. Decidir separadamente sobre eventual tratamento do histórico e coordenação
   com colaboradores, clones/forks e remotos; nenhuma reescrita está autorizada.
5. Confirmar escopo das licenças, atribuições e declaração de IA.
6. Aprovar quais evidências/configurações específicas do projeto podem ser
   compartilhadas, preservando o funcionamento das guardas e dos testes.
7. Autorizar e revisar um pacote final por lista explícita, sem incluir o
   histórico Git nem arquivos privados. Este lote não criou esse pacote.

## 6. Checklist de distribuição

- [ ] README raiz substituído após revisão; nenhuma credencial no material.
- [ ] Responsáveis confirmaram rotação/revogação quando necessária.
- [ ] Dumps atuais fora do pacote; fixture alternativa, se houver, é nova e sintética.
- [ ] Licenças, autoria e declaração de IA revisadas pelos autores.
- [ ] Arquivos classificados para revisão manual aprovados individualmente.
- [ ] Configurações privadas, backups, logs, caches e `.git/` ausentes do pacote.
- [ ] Instruções correspondem ao ambiente efetivamente fornecido; nenhum mock
      apresentado como serviço operacional, nenhuma flag habilitada para a entrega.
- [ ] Lista final conferida contra o conteúdo do pacote; hashes/listagem podem
      ser produzidos somente em etapa autorizada, sem copiar segredos.
- [ ] Testes e roteiro visual executados no ambiente da apresentação, com
      resultados reais registrados e limitações PostgreSQL explícitas.

O estado seguro para distribuição **não foi alcançado automaticamente**: os
arquivos sensíveis originais e o histórico permanecem intactos, com propostas e
inventário preparados para decisão. O baseline completo continua no relatório E1.

## 7. Verificações executadas e alterações

| Verificação E2 | Resultado |
| --- | --- |
| Frontend: `node --test tests/landingPage.test.js tests/entradaPublica.test.js` | 30 aprovados, zero falhas/skips; inclui build isolado em memória |
| Backend: `node --test tests/banco-provider.test.cjs tests/startup-portabilidade.test.cjs` | 47 aprovados, zero falhas/skips, com dependências simuladas |
| JSON, caminhos existentes, separação das classes e bloqueio dos dumps | Aprovados: 612 candidatos, 152 para revisão manual e dois bloqueados |
| Novos documentos: credenciais conhecidas, endereços de login, bcrypt e padrões de token pesquisados | Sem ocorrências; nenhuma garantia absoluta de ausência de informação sensível |
| Links locais e whitespace dos documentos | Conferidos |
| `git diff --check` | Aprovado |

Não houve nova suíte completa, PostgreSQL, lint/build de produção ou inspeção
visual: foram criados somente `SANEAMENTO_E2.md`, `README_ENTREGA_E2.md` e
`DISTRIBUICAO_E2.json`. Não há alteração de comportamento a justificar esses
ensaios adicionais. Os originais sensíveis e todos os lotes anteriores foram
preservados. Não houve commit, push, alteração de índice ou histórico Git.
