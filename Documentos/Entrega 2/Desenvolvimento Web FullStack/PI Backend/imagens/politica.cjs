"use strict";
const { randomUUID } = require("node:crypto");

const politicas = Object.freeze({
  foto: Object.freeze({ bucket: "perfil-fotos", bytes: 5 * 1024 * 1024, lado: 4096, pixels: 16000000, saida: 512 }),
  capa: Object.freeze({ bucket: "perfil-capas", bytes: 10 * 1024 * 1024, lado: 8192, pixels: 24000000, saida: 1920 }),
});
function falha(status, mensagem) { return Object.assign(new Error(mensagem), {
  status, resultadoIncerto: status >= 500,
}); }
function contexto(usuario, tipo) {
  if (!usuario || !Number.isSafeInteger(usuario.id) || usuario.id <= 0) throw falha(401, "Autenticação necessária.");
  if (!["participante", "organizador", "fornecedor", "admin"].includes(usuario.perfil)) throw falha(403, "Perfil não autorizado.");
  if (!Object.hasOwn(politicas, tipo)) throw falha(400, "Tipo de imagem inválido.");
  return politicas[tipo];
}
function novoArquivo(usuario, tipo) {
  const politica = contexto(usuario, tipo);
  const operacao = randomUUID();
  return { operacao, bucket: politica.bucket, caminho: `${usuario.id}/${operacao}.webp` };
}
function conferirReferencia(usuario, tipo, ref) {
  const politica = contexto(usuario, tipo);
  if (!ref || ref.usuario_id !== usuario.id || ref.tipo !== tipo || ref.bucket !== politica.bucket ||
      typeof ref.caminho !== "string" || !new RegExp(`^${usuario.id}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.webp$`).test(ref.caminho)) {
    throw falha(403, "Referência de imagem não autorizada.");
  }
  return ref;
}
module.exports = { politicas, contexto, novoArquivo, conferirReferencia, falha };
