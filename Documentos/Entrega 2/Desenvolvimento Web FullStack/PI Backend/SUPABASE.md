# Teste de leitura da API Supabase

O backend ja possui `@supabase/supabase-js`. O script independente
`scripts/testar-supabase-api.cjs` usa `SUPABASE_URL` e `SUPABASE_SECRET_KEY`
do ambiente do servidor ou do `.env` privado em `PI Backend`. Variaveis do
processo prevalecem sobre o arquivo; o script nao altera `process.env`.

Preencha essas duas variaveis somente no ambiente privado. O `.env.example`
contem apenas campos vazios e o `.gitignore` exclui `.env`. A Secret Key tem
acesso privilegiado: use-a exclusivamente no servidor, nunca em variaveis
`VITE_`, frontend ou arquivos versionados. Nao ha fallback para chave publica.

No PowerShell, dentro de `PI Backend`, execute:

```powershell
node scripts/testar-supabase-api.cjs
```

O teste consulta apenas `id,nome` de `eventos`, com limite de um registro e
timeout de 15 segundos. Exibe somente o resultado da operacao e a quantidade
de registros, sem imprimir chaves, URL, linhas retornadas ou erros brutos.
Falhas encerram com codigo 1; uma resposta vazia nao comprova que ha eventos.

O script nao importa `server.js`, `db.js` ou o inicializador isolado. Nao inicia
o backend, nao usa MySQL/PostgreSQL diretamente, nao executa migracoes e nao
realiza operacoes de escrita. Este teste nao integra as rotas ao Supabase.
