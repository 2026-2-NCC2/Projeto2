"use strict";
const { conferirReferencia, falha } = require("./politica.cjs");
const TTL_SEGUNDOS = 120;

// Adaptador inerte: recebe cliente já criado pelo backend. Não lê credenciais,
// cria buckets, cria cliente nem é instalado na fábrica de persistência atual.
function criarStorageImagens(cliente, { origem } = {}) {
  async function executar(acao) {
    try {
      const resposta = await acao();
      if (!resposta || resposta.error) throw Error();
      return resposta.data;
    } catch { throw falha(503, "Armazenamento de imagens indisponível."); }
  }
  return Object.freeze({
    async enviar(usuario, tipo, ref, dados) {
      conferirReferencia(usuario, tipo, ref);
      const data = await executar(() => cliente.storage.from(ref.bucket).upload(ref.caminho, dados,
        { contentType: "image/webp", upsert: false, cacheControl: "0" }));
      if (data?.path !== ref.caminho) throw falha(503, "Upload de imagem não confirmado.");
    },
    async assinar(usuario, tipo, ref) {
      conferirReferencia(usuario, tipo, ref);
      const data = await executar(() => cliente.storage.from(ref.bucket).createSignedUrl(ref.caminho, TTL_SEGUNDOS));
      if (typeof data?.signedUrl !== "string" || !data.signedUrl.startsWith("https://")) throw falha(503, "Leitura de imagem indisponível.");
      if (origem) {
        const destino = new URL(data.signedUrl);
        if (destino.origin !== origem || destino.username || destino.password || destino.hash ||
            destino.pathname !== `/storage/v1/object/sign/${ref.bucket}/${ref.caminho}`) throw falha(503, "Leitura de imagem indisponível.");
      }
      return { url: data.signedUrl, expira_em_segundos: TTL_SEGUNDOS };
    },
    // Exclusivo do worker após reivindicação transacional; nunca recebe caminho HTTP.
    async remover(usuario, tipo, ref) {
      conferirReferencia(usuario, tipo, ref);
      await executar(() => cliente.storage.from(ref.bucket).remove([ref.caminho]));
    },
  });
}
module.exports = { criarStorageImagens, TTL_SEGUNDOS };
