# Instalação em outro computador

Instale Node.js 24 e npm. Copie ou obtenha o projeto completo, incluindo
`config/ativacao-supabase.json`, que é versionado e não contém credenciais.
No terminal, dentro de `PI Backend`, execute:

```powershell
npm install
```

Crie `PI Backend/.env` com os valores fornecidos pelo responsável pelo ambiente:

```dotenv
DB_PROVIDER=supabase
SUPABASE_URL=https://gnwybroqfvwosiqzsfla.supabase.co
SUPABASE_SECRET_KEY=<secret key de backend fornecida pelo responsável>
JWT_SECRET=<segredo seguro de pelo menos 32 caracteres>
PORT=3001
```

Não versione o `.env` e não coloque a secret key no frontend. Não use flags
`TROCATICKET_HOMOLOGACAO` ou desabilite a verificação TLS. Variáveis já definidas
no processo prevalecem sobre o `.env`; confira-as se houver divergência.
MySQL e `DB_PROVIDER` ausente são recusados na inicialização normal.

Inicie a partir de `PI Backend`:

```powershell
npm start
```

O comando `npm start` usa `--use-system-ca` para confiar também nos certificados
do sistema operacional, mantendo a verificação TLS habilitada. Requer Node.js 24.
Executar `node server.js` diretamente não aplica essa opção.

O servidor deve informar a porta 3001. `GET http://localhost:3001/` é o endpoint
de saúde existente; confirma o HTTP e não consulta o banco. Com o servidor
aberto, valide também uma leitura mínima do Supabase em outro terminal:

```powershell
node scripts/validar-startup-portavel-leitura.cjs
```

Essa verificação exige HTTP 200 nas duas chamadas e o projeto esperado. Consulta
somente `id`, com limite de um evento, e não exibe registros ou credenciais.

Se o Node informar `UNABLE_TO_VERIFY_LEAF_SIGNATURE` na rede da faculdade,
habilite os certificados confiáveis do Windows no terminal antes de iniciar
o backend e, também, no terminal da verificação:

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
node server.js
```

No segundo terminal, use a mesma variável e execute
`node scripts/validar-startup-portavel-leitura.cjs`. Essa opção mantém a
validação TLS e usa as autoridades certificadoras confiadas pelo sistema.
Não use `NODE_TLS_REJECT_UNAUTHORIZED=0`. A variável é do terminal, sem edição
de credenciais no `.env`. Se já houver opções em `NODE_OPTIONS`, preserve-as
ao acrescentar `--use-system-ca`.

Para diagnosticar o login com a conta de homologação já configurada no `.env`
(`HOMOLOG_ADMIN_EMAIL` e `HOMOLOG_ADMIN_PASSWORD`, no mesmo projeto Supabase):

```powershell
node --use-system-ca scripts/diagnosticar-login.cjs
```

O diagnóstico usa a aplicação real em uma porta local temporária, consulta o
usuário, verifica bcrypt, executa `POST /login`, valida o JWT e chama `/perfil`.
Não altera registros nem imprime credenciais, hashes ou tokens. Sem a opção
`--use-system-ca`, permite reproduzir a falha TLS nesta rede.

Para o frontend, em `PI React`, execute `npm install` e `npm run dev`.
`npm run build` e `npm run lint` verificam o frontend. O backend tem `npm test`
e não possui scripts próprios de build ou lint.

## Fundamento e bloqueios

A ativação se fundamenta exclusivamente em
`evidencias/resultado-encerramento-administrativo-20261103.json`, que documenta
fase `CONCLUIDA`, encerramento administrativo, HTTP normal aprovado e critério
`RECONCILIACAO_ATUAL`. O documento aceita explicitamente a lacuna histórica e
a ausência de snapshot independente anterior. A ausência histórica de escritas
**não foi comprovada**. O manifesto não acrescenta prova de integridade histórica.

Computadores novos dispensam
`%USERPROFILE%/BackupsTrocaTicket/SupervisorCutover/estado.json`. Se o diretório
local existir, seu estado continua sendo lido primeiro: `INCERTA`, transição
incompleta, congelamento, selagem, corrupção, arquivo ausente dentro do diretório
existente ou erro de acesso impedem a inicialização normal. Não apague ou edite
esse estado para contornar bloqueios; interrompa a instalação e consulte o
responsável. Manifesto ausente, ilegível, inválido ou projeto divergente também
recusa o startup. Não há fallback para MySQL.

A rotação legítima de `JWT_SECRET` e `SUPABASE_SECRET_KEY` não exige alterar o
manifesto nem o hash histórico do estado concluído. O JWT continua exigindo um
segredo seguro e a secret key continua sujeita à validação de formato. A rotação
do JWT invalida sessões assinadas pelo segredo anterior.

O manifesto só autoriza inicialização normal. Migração, recuperação, rollback e
admissões seladas conservam os controles existentes, incluindo tickets, contexto
privado e fingerprints de credenciais quando já exigidos pelos procedimentos.
Esta instalação não deve executar esses procedimentos.
