# CA pública do PostgreSQL Supabase

`supabase-prod-ca-2021.crt` é um certificado público, não uma credencial.
Obtido em 04/11/2026 por HTTPS validado, sem redirecionamentos, da URL:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

A origem foi confirmada no código oficial do Dashboard:
https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json
(chave `ssl:certificate_url`, ambiente `prod`).

CA: Supabase Root 2021 CA. SHA-256:
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.
Validade: 28/04/2021 a 26/04/2031. Conferidos CA, autoassinatura e validade.
A coincidência com a raiz apresentada pela conexão foi apenas diagnóstico;
a confiança veio do download HTTPS pela origem oficial, não do certificado
recebido na conexão PostgreSQL que falhou.

Configurar `PGSSLROOTCERT` no ambiente privado com o caminho desse arquivo.
O pool existente mantém `rejectUnauthorized: true`, verificação de hostname e
TLS mínimo 1.2. Não foi instalado certificado no repositório global do Windows.
`--use-system-ca` permanece útil, mas não inclui automaticamente esta CA privada.
Em outro computador, ajustar somente o caminho local; não copiar credenciais.
Se a CA expirar ou mudar, validar a substituta pela origem oficial antes de usar.

Preflight PostgreSQL, sem repetir REST/Storage:
`node --use-system-ca scripts/preflight-imagens-producao.cjs --somente-postgres`
