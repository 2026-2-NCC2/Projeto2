"use strict";
// Cliente dedicado: timeout inclui leitura da resposta; sem retry ou sessão de
// usuário. Não cria buckets, não lê .env e não é chamado no startup principal.
function criarClienteStorage({ url, secretKey }, executarFetch = fetch) {
  const { lerConfiguracaoBanco } = require('../config/banco.cjs');
  const config = lerConfiguracaoBanco({ DB_PROVIDER: 'supabase', SUPABASE_URL: url, SUPABASE_SECRET_KEY: secretKey });
  const fetchLimitado = async (entrada, opcoes = {}) => {
    const destino = new URL(String(entrada));
    if (destino.origin !== config.url || !destino.pathname.startsWith('/storage/v1/object/')) throw Error('Destino Storage inválido.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const resposta = await executarFetch(entrada, { ...opcoes, redirect: 'error', signal: controller.signal });
      const partes = []; let tamanho = 0;
      if (resposta.body) for await (const parte of resposta.body) {
        tamanho += parte.length;
        if (tamanho > 1024 * 1024) { controller.abort(); throw Error('Resposta Storage excessiva.'); }
        partes.push(Buffer.from(parte));
      }
      return new Response([204,205,304].includes(resposta.status) ? null : Buffer.concat(partes), {
        status: resposta.status, statusText: resposta.statusText, headers: resposta.headers,
      });
    } finally { clearTimeout(timer); }
  };
  return require('@supabase/supabase-js').createClient(config.url, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchLimitado },
  });
}
module.exports = { criarClienteStorage };
