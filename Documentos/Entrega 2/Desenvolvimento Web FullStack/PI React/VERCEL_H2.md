# Preparação Vercel — H2

O frontend está preparado para `/api` em produção. O backend Render ainda não
tem URL confirmada: o rewrite externo NÃO está instalado no `vercel.json`.
Sem ele, as requisições `/api/*` não têm proxy e devem falhar; login e portais
conectados não estão aprovados para demonstração online. Não há fallback para
localhost. Um build aprovado não comprova integração com o Render.

## Configuração do projeto Vercel

- Root Directory, relativo à raiz Git `Projeto2`:
  `Documentos/Entrega 2/Desenvolvimento Web FullStack/PI React`.
- Framework: Vite. Node.js: 24.x.
- Install Command: `npm ci`.
- Build Command: `npm run build`.
- Output Directory: `dist`.
- Não há variável de ambiente obrigatória de API no frontend.
  `VITE_API_URL` e `VITE_API_BASE_URL` não são utilizadas.
- Nunca cadastrar JWT_SECRET, SUPABASE_SECRET_KEY, senhas de banco ou o `.env`
  do backend na Vercel, especialmente em variáveis `VITE_*`.

## Pendência obrigatória antes de validar login online

Depois de receber e validar a origem HTTPS definitiva do backend Render,
adicionar como PRIMEIRO item de `rewrites` no `vercel.json` a regra abaixo,
substituindo o marcador. Este trecho é documentação, não configuração ativa:

```json
{
  "source": "/api/:path*",
  "destination": "https://<HOST-RENDER-CONFIRMADO>/:path*"
}
```

Não publicar esse marcador literalmente. O destino deve ser a origem real do
serviço, sem credenciais, query, fragmento ou prefixo `/api` duplicado.
Por exemplo, `/api/login` deve chegar ao endpoint `/login` do Express.
Não adicionar um fallback genérico que transforme `/api/*` em `index.html`.

Os quatro rewrites atuais preservam as URLs públicas de transparência.
As telas internas usam HashRouter (`/#/inicio`, `/#/entrar` etc.); não exigem
rewrite por seção e mantêm F5 e histórico existentes.

## Ambientes e validação

- `npm run dev`: API em `http://localhost:3001`, como antes.
- Modo isolado: permanece em `/api`, com sua configuração local exclusiva.
- `npm run build` e `npm run preview`: API relativa `/api`.
  O preview local NÃO executa os rewrites da Vercel nem inicia o backend.
- Custos e publicação já permitem `/api`; não ampliar suas listas de destinos.

Após a configuração definitiva e autorização da hospedagem, conferir login,
401/403, consultas dos perfis, custos/cotações, páginas públicas, F5 e histórico.
O backend principal mantém os bloqueios e riscos descritos em H1, inclusive
preflight e limpeza automática no startup. H2 não autoriza iniciá-lo, trocar
seu banco, alterar CORS/flags ou ativar A7, A10 ou F8.

## Alcance da inspeção do build

O código já contém uma origem pública Supabase na validação dos endereços de
imagens de eventos, além de localhost nas guardas de custos/publicação e no
construtor de desenvolvimento. Essas strings podem permanecer no bundle;
não são credenciais e não mudam o destino `/api` escolhido em produção.
Não remover essas validações para esconder strings: seria necessário avaliar
separadamente a confiança nas URLs de imagens. Não declarar que o bundle está
livre de toda referência ao projeto ou de todo endereço de desenvolvimento.

A verificação H2 deve comparar o artefato com os valores secretos privados sem
imprimi-los, procurar chaves privadas/secret keys e endereços de rede interna.
Ela não substitui auditoria completa de segredos ou a configuração segura do
backend. Nenhum segredo deve ser incluído na configuração Vercel.
