"use strict";

const redes = Object.freeze(["instagram", "linkedin", "facebook", "tiktok", "site_pessoal"]);
const comerciais = Object.freeze(["nome_comercial", "descricao", "telefone_comercial", "email_comercial", "cidade", "site_oficial", "categorias_servicos"]);
const objeto = v => v !== null && typeof v === "object" && !Array.isArray(v);
const falhar = (mensagem, status = 400) => { throw Object.assign(new Error(mensagem), { status }); };

function validarUrl(valor) {
  if (typeof valor !== "string") falhar("Informe um link em texto.");
  const texto = valor.trim();
  if (!texto) return null;
  if (texto.length > 2048 || /[\s\p{Cc}\\]/u.test(texto) || !/^https:\/\//i.test(texto)) falhar("Informe uma URL completa com HTTPS, sem espaços.");
  let url;
  try { url = new URL(texto); } catch { falhar("Informe uma URL válida com HTTPS."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) falhar("O link deve usar HTTPS e não pode conter credenciais.");
  return texto;
}

function validarSecao(valor, permitidos, comercial = false) {
  if (valor === null) return null;
  if (!objeto(valor) || Object.keys(valor).some(k => !permitidos.includes(k))) falhar("Há campos não permitidos nesta seção.");
  const resultado = {};
  for (const [campo, v] of Object.entries(valor)) {
    if (campo === "categorias_servicos") {
      if (!Array.isArray(v) || v.length > 20 || v.some(c => typeof c !== "string" || !c.trim() || c.trim().length > 80 || /[\p{Cc}]/u.test(c))) falhar("Informe até 20 categorias de até 80 caracteres.");
      const categorias = v.map(c => c.trim());
      if (new Set(categorias.map(c => c.toLocaleLowerCase("pt-BR"))).size !== categorias.length) falhar("Remova categorias repetidas.");
      if (categorias.length) resultado[campo] = categorias;
      continue;
    }
    if (!comercial || campo === "site_oficial") {
      const url = validarUrl(v);
      if (url) resultado[campo] = url;
      continue;
    }
    const limites = { nome_comercial: 150, descricao: 2000, telefone_comercial: 30, email_comercial: 150, cidade: 120 };
    if (typeof v !== "string") falhar("Os campos profissionais devem ser textos.");
    const texto = v.trim();
    if (texto.length > limites[campo] || (campo === "descricao" ? /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/ : /[\p{Cc}]/u).test(texto)) falhar("Revise o tamanho e os caracteres dos campos profissionais.");
    if (texto && campo === "telefone_comercial" && (!/^[+\d\s().-]+$/.test(texto) || !/\d/.test(texto))) falhar("Informe um telefone comercial válido.");
    if (texto && campo === "email_comercial" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) falhar("Informe um e-mail profissional válido.");
    if (texto) resultado[campo] = texto;
  }
  return Object.keys(resultado).length ? resultado : null;
}

function validarProfissional(body, perfil) {
  if (!objeto(body) || !Object.keys(body).length || Object.keys(body).some(k => !["redes_sociais", "dados_comerciais"].includes(k))) falhar("Informe apenas redes sociais e dados comerciais.");
  const dados = {};
  if (Object.hasOwn(body, "redes_sociais")) dados.redes_sociais = validarSecao(body.redes_sociais, redes);
  if (Object.hasOwn(body, "dados_comerciais")) {
    if (!["fornecedor", "organizador"].includes(perfil)) falhar("Seu perfil não permite editar informações comerciais.", 403);
    dados.dados_comerciais = validarSecao(body.dados_comerciais, perfil === "fornecedor" ? comerciais : comerciais.filter(c => c !== "categorias_servicos"), true);
  }
  return dados;
}

module.exports = { validarProfissional, validarUrl };
