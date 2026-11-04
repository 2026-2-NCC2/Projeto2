"use strict";
const { contexto, falha } = require("./politica.cjs");

function temControleAnimacaoPng(entrada) {
  // Alguns decodificadores leem somente o primeiro frame de APNG. Verificar
  // o chunk de controle evita aceitá-lo como PNG estático nessas plataformas.
  for (let pos = 8; pos + 12 <= entrada.length;) {
    const tamanho = entrada.readUInt32BE(pos);
    if (tamanho > entrada.length - pos - 12) break;
    const tipo = entrada.toString("ascii", pos + 4, pos + 8);
    if (tipo === "acTL") return true;
    if (tipo === "IEND") break;
    pos += tamanho + 12;
  }
  return false;
}

// Não usa nome, extensão ou MIME declarados pelo navegador. Decodificação local.
async function processarImagem(usuario, tipo, entrada) {
  const p = contexto(usuario, tipo);
  if (!Buffer.isBuffer(entrada) || !entrada.length) throw falha(400, "Arquivo vazio ou inválido.");
  if (entrada.length > p.bytes) throw falha(413, "A imagem excede o limite de tamanho.");
  const jpeg = entrada.length >= 3 && entrada.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  const png = entrada.length >= 8 && entrada.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = entrada.length >= 12 && entrada.toString("ascii", 0, 4) === "RIFF" && entrada.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp) throw falha(415, "Envie uma imagem JPEG, PNG ou WebP.");
  if (png && temControleAnimacaoPng(entrada)) throw falha(422, "Imagens animadas não são permitidas.");
  const sharp = require("sharp");
  const opcoes = { limitInputPixels: p.pixels, failOn: "warning", animated: true };
  try {
    const meta = await sharp(entrada, opcoes).metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format) ||
        (meta.format === "jpeg" ? !jpeg : meta.format === "png" ? !png : !webp)) throw Error();
    if (!meta.width || !meta.height || meta.width > p.lado || meta.height > p.lado ||
        meta.width * meta.height > p.pixels || (meta.pages ?? 1) !== 1) throw Error();
    // rotate aplica orientação antes de descartar EXIF. Sharp remove metadados
    // por padrão; nunca chamar keepMetadata/withMetadata. Sem recorte nesta etapa.
    const { data, info } = await sharp(entrada, opcoes).rotate()
      .resize({ width: p.saida, height: p.saida, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 }).timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
    if (data.length > p.bytes) throw Error();
    return { dados: data, mime: "image/webp", largura: info.width, altura: info.height, tamanho: data.length };
  } catch {
    throw falha(422, "Imagem corrompida, animada ou com dimensões não permitidas.");
  }
}
module.exports = { processarImagem };
