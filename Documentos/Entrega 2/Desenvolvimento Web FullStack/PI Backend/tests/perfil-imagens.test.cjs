"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { iniciar } = require("./helpers/http-autenticacao.cjs");
const { contexto, novoArquivo, conferirReferencia, politicas } = require("../imagens/politica.cjs");
const { processarImagem } = require("../imagens/processar.cjs");
const { criarStorageImagens } = require("../imagens/storage.cjs");
const { criarServicoImagens, limparUmaImagem } = require("../imagens/servico.cjs");
const usuario = { id: 7, perfil: "organizador" };
const imagem = (formato = "png", width = 32, height = 24) => sharp({ create: {
  width, height, channels: 3, background: "#37617a",
} })[formato]().toBuffer();
const ref = (u = usuario, tipo = "foto") => ({ usuario_id: u.id, tipo, ...novoArquivo(u, tipo) });

test("HTTP usa JWT existente e mantém GET/PUT/DELETE bloqueados nos quatro perfis", async t => {
  const a = await iniciar(t, "supabase");
  const antes = structuredClone(a.state.usuarios);
  for (const metodo of ["GET", "PUT", "DELETE"]) for (const tipo of ["foto", "capa"]) {
    const rota = `/perfil/imagens/${tipo}`;
    for (const token of [undefined, "invalido"]) assert.equal((await a.request(metodo, rota, undefined, token)).status, 401);
    for (const id of [7, 8, 9, 10]) assert.equal((await a.request(metodo, rota + "?usuario_id=999", undefined, a.token(id))).status, 503);
  }
  assert.deepEqual(a.state.usuarios, antes);
  assert.ok(!a.calls.some(c => ["PUT", "POST", "PATCH", "DELETE"].includes(c.method)));
  assert.ok(!a.imports.some(c => /sharp|imagens\/(storage|servico)/.test(c)));
});

test("nomes são UUID v4 do servidor e referências não atravessam proprietários", () => {
  for (const perfil of ["participante", "organizador", "fornecedor", "admin"]) {
    const u = { id: 7, perfil };
    const r = ref(u);
    assert.equal(conferirReferencia(u, "foto", r), r);
    assert.notEqual(novoArquivo(u, "foto").caminho, r.caminho);
    for (const troca of [{ usuario_id: 8 }, { caminho: "8/arquivo.webp" }, { caminho: "7/../arquivo.webp" },
      { bucket: "perfil-capas" }, { tipo: "capa" }]) {
      assert.throws(() => conferirReferencia(u, "foto", { ...r, ...troca }), { status: 403 });
    }
  }
  assert.throws(() => contexto({ id: 7, perfil: "desconhecido" }, "foto"), { status: 403 });
  assert.throws(() => contexto({ id: "7", perfil: "admin" }, "foto"), { status: 401 });
  assert.throws(() => contexto(usuario, "__proto__"), { status: 400 });
});

for (const formato of ["jpeg", "png", "webp"]) test(`decodifica ${formato} real e normaliza para WebP`, async () => {
  const r = await processarImagem(usuario, "foto", await imagem(formato));
  assert.equal(r.mime, "image/webp"); assert.equal(r.tamanho, r.dados.length);
  assert.equal(r.largura, 32); assert.equal(r.altura, 24);
  assert.equal((await sharp(r.dados).metadata()).format, "webp");
});

test("reprocessamento aplica orientação, reduz dimensões e remove metadados", async () => {
  const entrada = await sharp(await imagem("jpeg", 1000, 600))
    .withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: "Dado privado sintético" } }).toBuffer();
  assert.ok((await sharp(entrada).metadata()).exif);
  const r = await processarImagem(usuario, "foto", entrada);
  assert.equal(r.altura, 512); assert.ok(r.largura < r.altura);
  const meta = await sharp(r.dados).metadata();
  for (const campo of ["exif", "icc", "iptc", "xmp", "orientation"]) assert.equal(meta[campo], undefined);
});

test("rejeita tamanho, dimensão, pixels excessivos, conteúdo forjado e truncamento", async () => {
  for (const tipo of ["foto", "capa"]) {
    await assert.rejects(processarImagem(usuario, tipo, Buffer.alloc(politicas[tipo].bytes + 1)), { status: 413 });
  }
  for (const entrada of [Buffer.from("<svg><script/></svg>"), Buffer.from("arquivo.jpg"), Buffer.from("%PDF-1.7")]) {
    await assert.rejects(processarImagem(usuario, "foto", entrada), { status: 415 });
  }
  await assert.rejects(processarImagem(usuario, "foto", Buffer.alloc(0)), { status: 400 });
  await assert.rejects(processarImagem(usuario, "foto", Buffer.from([255, 216, 255, 0])), { status: 422 });
  const jpeg = await imagem("jpeg");
  await assert.rejects(processarImagem(usuario, "foto", jpeg.subarray(0, Math.floor(jpeg.length / 2))), { status: 422 });
  await assert.rejects(processarImagem(usuario, "foto", await imagem("png", 4097, 1)), { status: 422 });
  await assert.rejects(processarImagem(usuario, "foto", await imagem("png", 4001, 4000)), { status: 422 });
  await assert.rejects(processarImagem(usuario, "capa", await imagem("png", 8193, 1)), { status: 422 });
});

test("WebP animado é rejeitado", async () => {
  const pixels = Buffer.concat([Buffer.from([255,0,0,255,0,0,255,0,0,255,0,0]),
    Buffer.from([0,0,255,0,0,255,0,0,255,0,0,255])]);
  const entrada = await sharp(pixels, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } })
    .webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(entrada, { animated: true }).metadata()).pages, 2);
  await assert.rejects(processarImagem(usuario, "foto", entrada), { status: 422 });
});

test("controle APNG é recusado mesmo se o codec suportar apenas o primeiro frame", async () => {
  const png = await imagem();
  const controle = Buffer.alloc(20);
  controle.writeUInt32BE(8, 0); controle.write("acTL", 4);
  controle.writeUInt32BE(2, 8); // Dois frames, loop infinito.
  let crc = 0xffffffff;
  for (const byte of controle.subarray(4, 16)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  controle.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 16);
  // IHDR permanece intacto. Rejeitar a declaração de animação antes do codec.
  const entrada = Buffer.concat([png.subarray(0, 33), controle, png.subarray(33)]);
  await assert.rejects(processarImagem(usuario, "foto", entrada), e => e.status === 422 && /animadas/.test(e.message));
});

function ambiente() {
  const chamadas = [], gravados = new Map(), reservas = new Map(), fila = [];
  let atual = null, modo = "ok";
  const repositorio = {
    async buscar(id, tipo) { chamadas.push(["buscar", id, tipo]); return atual; },
    async reservar(r) { chamadas.push(["reservar", r]); reservas.set(r.operacao, r); },
    async confirmar(id, tipo, operacao) {
      chamadas.push(["confirmar", id, tipo, operacao]);
      if (modo === "commit-falhou") throw Error("falha sintética");
      if (atual) fila.push(atual);
      atual = reservas.get(operacao); reservas.delete(operacao);
      if (modo === "resposta-perdida") throw Error("timeout após commit sintético");
    },
    async desvincular(id, tipo) {
      chamadas.push(["desvincular", id, tipo]);
      if (modo === "unlink-falhou") throw Error("falha sintética");
      if (atual) fila.push(atual); atual = null;
    },
    async reivindicarLimpeza() { return fila[0] || null; },
    async concluirLimpeza(op) { chamadas.push(["limpo", op]); fila.shift(); },
    async adiarLimpeza(op) { chamadas.push(["adiado", op]); },
  };
  const storage = {
    async enviar(u, tipo, r, dados) {
      conferirReferencia(u, tipo, r); chamadas.push(["enviar", r]);
      if (modo === "upload-falhou") throw Error("falha sintética");
      gravados.set(r.caminho, dados);
      if (modo === "upload-incerto") throw Error("timeout após upload sintético");
    },
    async assinar(u, tipo, r) { conferirReferencia(u, tipo, r); return { url: "https://example.invalid/temporaria", expira_em_segundos: 120 }; },
    async remover(u, tipo, r) {
      conferirReferencia(u, tipo, r); chamadas.push(["apagar", r]);
      if (modo === "delete-falhou") throw Error("falha sintética");
      gravados.delete(r.caminho);
    },
  };
  const servico = criarServicoImagens({ repositorio, storage });
  return { servico, repositorio, storage, chamadas, gravados, reservas, fila,
    get atual() { return atual; }, modo: v => { modo = v; } };
}

test("validação falha antes de reservar ou chamar Storage", async () => {
  const a = ambiente();
  await assert.rejects(a.servico.substituir(usuario, "foto", Buffer.from("invalido")), { status: 415 });
  assert.equal(a.chamadas.length, 0);
});

test("substitui primeiro a referência, preserva a antiga até limpeza e não persiste URL", async () => {
  const a = ambiente(), entrada = await imagem();
  await a.servico.substituir(usuario, "foto", entrada);
  const antiga = a.atual;
  await a.servico.substituir(usuario, "foto", entrada);
  assert.equal(a.gravados.size, 2); assert.equal(a.fila[0], antiga);
  assert.deepEqual(a.chamadas.slice(0, 3).map(c => c[0]), ["reservar", "enviar", "confirmar"]);
  assert.equal((await a.servico.consultar(usuario, "foto")).expira_em_segundos, 120);
  assert.ok(!JSON.stringify(a.atual).includes("https://"));
  await limparUmaImagem(a);
  assert.equal(a.gravados.size, 1); assert.ok(a.gravados.has(a.atual.caminho));
});

for (const modo of ["upload-falhou", "upload-incerto", "commit-falhou", "resposta-perdida"]) {
  test(`${modo}: não executa compensação destrutiva nem retry`, async () => {
    const a = ambiente(), entrada = await imagem();
    await a.servico.substituir(usuario, "foto", entrada);
    const antiga = a.atual;
    a.modo(modo);
    await assert.rejects(a.servico.substituir(usuario, "foto", entrada), { status: 503 });
    assert.equal(a.chamadas.filter(c => c[0] === "enviar").length, 2);
    assert.ok(!a.chamadas.some(c => c[0] === "apagar"));
    if (modo === "resposta-perdida") {
      assert.notEqual(a.atual.caminho, antiga.caminho); assert.ok(a.gravados.has(a.atual.caminho));
    } else { assert.equal(a.atual, antiga); assert.equal(a.reservas.size, 1); }
  });
}

test("remoção é idempotente e falha do Storage mantém tarefa para nova tentativa", async () => {
  const a = ambiente(); await a.servico.substituir(usuario, "foto", await imagem());
  await a.servico.remover(usuario, "foto"); await a.servico.remover(usuario, "foto");
  assert.equal(await a.servico.consultar(usuario, "foto"), null); assert.equal(a.fila.length, 1);
  a.modo("delete-falhou"); await assert.rejects(limparUmaImagem(a), { status: 503 });
  assert.equal(a.fila.length, 1); assert.equal(a.gravados.size, 1);
  a.modo("ok"); await limparUmaImagem(a);
  assert.equal(a.gravados.size, 0); assert.equal(a.fila.length, 0);
  assert.equal(await limparUmaImagem(a), false);
});

test("falha de desvinculação preserva referência e não toca no Storage", async () => {
  const a = ambiente(); await a.servico.substituir(usuario, "foto", await imagem());
  a.modo("unlink-falhou"); await assert.rejects(a.servico.remover(usuario, "foto"));
  assert.ok(a.atual); assert.equal(a.fila.length, 0); assert.equal(a.gravados.size, 1);
});

test("leitura e worker recusam caminho de outro dono, inclusive para admin", async () => {
  const estrangeira = ref({ id: 8, perfil: "fornecedor" });
  let acessouStorage = false;
  const servico = criarServicoImagens({ repositorio: { buscar: async () => estrangeira },
    storage: { assinar: async () => { acessouStorage = true; } } });
  await assert.rejects(servico.consultar({ id: 7, perfil: "admin" }, "foto"), { status: 403 });
  assert.equal(acessouStorage, false);
  await assert.rejects(limparUmaImagem({ repositorio: {
    reivindicarLimpeza: async () => ({ ...estrangeira, caminho: "7/outro.webp" }), adiarLimpeza: async () => {},
  }, storage: { remover: async () => { acessouStorage = true; } } }), { status: 503 });
  assert.equal(acessouStorage, false);
});

test("adaptador usa bucket privado, sem upsert, assinatura curta e erros sanitizados", async () => {
  const calls = [], r = ref(); let falhar = false;
  const cliente = { storage: { from(bucket) {
    assert.equal(bucket, "perfil-fotos");
    return Object.fromEntries(["upload", "remove", "createSignedUrl"].map(m => [m, async (...args) => {
      calls.push([m, ...args]);
      return falhar ? { error: Error("segredo-sintetico") } : { data: { path: args[0], signedUrl: "https://example.invalid/signed" } };
    }]));
  } } };
  const storage = criarStorageImagens(cliente);
  await storage.enviar(usuario, "foto", r, Buffer.from("WebP sintético para mock"));
  assert.equal(calls[0][3].upsert, false); assert.equal(calls[0][3].contentType, "image/webp");
  assert.equal((await storage.assinar(usuario, "foto", r)).expira_em_segundos, 120);
  assert.deepEqual(calls[1], ["createSignedUrl", r.caminho, 120]);
  await storage.remover(usuario, "foto", r);
  assert.deepEqual(calls[2], ["remove", [r.caminho]]);
  falhar = true;
  for (const acao of [() => storage.enviar(usuario, "foto", r, Buffer.alloc(1)),
    () => storage.assinar(usuario, "foto", r), () => storage.remover(usuario, "foto", r)]) {
    await assert.rejects(acao(), e => e.status === 503 && !e.message.includes("segredo"));
  }
});

test("Storage recusa confirmação de upload vazia e não chama SDK com referência estrangeira", async () => {
  let chamadas = 0;
  const storage = criarStorageImagens({ storage: { from() {
    chamadas++;
    return { upload: async () => ({ data: null, error: null }) };
  } } });
  await assert.rejects(storage.enviar(usuario, "foto", ref(), Buffer.alloc(1)), { status: 503 });
  const estrangeira = ref({ id: 8, perfil: "admin" });
  await assert.rejects(storage.enviar(usuario, "foto", estrangeira, Buffer.alloc(1)), { status: 403 });
  await assert.rejects(storage.assinar(usuario, "foto", estrangeira), { status: 403 });
  await assert.rejects(storage.remover(usuario, "foto", estrangeira), { status: 403 });
  assert.equal(chamadas, 1);
});
