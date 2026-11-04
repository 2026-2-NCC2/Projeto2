"use strict";
const PRODUCAO = 'gnwybroqfvwosiqzsfla';
const PREFIXO = 'IMAGENS_HOMOLOG_';
const configuracoes = new WeakSet();
const falha = code => Object.assign(Error('Configuração de homologação de imagens recusada.'), { code });
function validarConfiguracao(valores, referencias = {}) {
  if (referencias.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw falha('IH_TLS');
  const ler = (nome, opcional = false) => {
    const v = valores[PREFIXO+nome];
    if (v === undefined && opcional) return undefined;
    if (typeof v !== 'string' || !v || v.trim() !== v || /[\x00-\x1f\x7f]/.test(v) || v.includes(PRODUCAO)) throw falha('IH_CONFIG');
    return v;
  };
  const ref = ler('PROJECT_REF'), url = ler('SUPABASE_URL');
  if (!/^[a-z]{20}$/.test(ref) || ref === PRODUCAO || url !== `https://${ref}.supabase.co`) throw falha('IH_PROJECT');
  const secretKey = ler('SUPABASE_SECRET_KEY'), jwtSecret = ler('JWT_SECRET');
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey) || !/^[A-Za-z0-9_-]{64,256}$/.test(jwtSecret) ||
      new Set(jwtSecret).size < 20 || jwtSecret === secretKey ||
      [referencias.JWT_SECRET, referencias.HOMOLOG_JWT_SECRET].filter(Boolean).includes(jwtSecret) ||
      [referencias.SUPABASE_SECRET_KEY, referencias.HOMOLOG_SUPABASE_SECRET_KEY].filter(Boolean).includes(secretKey)) throw falha('IH_SECRET');
  const host = ler('PGHOST'), user = ler('PGUSER'), port = ler('PGPORT'), database = ler('PGDATABASE');
  const direto = host === `db.${ref}.supabase.co` && user === 'postgres';
  const pooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) && user === `postgres.${ref}`;
  if ((!direto && !pooler) || port !== '5432' || database !== 'postgres') throw falha('IH_PG_DESTINO');
  const password = ler('PGPASSWORD');
  if (password === referencias.PGPASSWORD && referencias.PGPASSWORD) throw falha('IH_SECRET');
  let contas;
  try { contas = JSON.parse(ler('CONTAS')); } catch { throw falha('IH_CONTAS'); }
  const perfis = ['participante','organizador','fornecedor','admin'];
  if (!Array.isArray(contas) || contas.length !== 4 || contas.some(c=>!c || typeof c!=='object' || Array.isArray(c)) || new Set(contas.map(c=>c.id)).size !== 4 ||
      new Set(contas.map(c=>c.email)).size !== 4 || !perfis.every(p=>contas.filter(c=>c.perfil===p).length===1) ||
      contas.some(c=>!Number.isSafeInteger(c.id) || c.id<=0 || typeof c.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) || c.email!==c.email.toLowerCase())) throw falha('IH_CONTAS');
  const config = Object.freeze({ ref, url, secretKey, jwtSecret, host: '127.0.0.1', port: 3131,
    contas: Object.freeze(contas.map(c=>Object.freeze({id:c.id,email:c.email,perfil:c.perfil}))),
    pg: Object.freeze({ PGHOST:host, PGPORT:port, PGDATABASE:database, PGUSER:user, PGPASSWORD:password,
      PGPOOL_MAX:'2', PGCONNECT_TIMEOUT_MS:'5000', PGIDLE_TIMEOUT_MS:'10000',
      ...(ler('PGSSLROOTCERT',true) ? {PGSSLROOTCERT:ler('PGSSLROOTCERT')} : {}) }),
  });
  configuracoes.add(config); return config;
}
function exigirConfiguracao(config) { if(!configuracoes.has(config))throw falha('IH_CONFIG_NAO_VALIDADA'); }
function carregarConfiguracao(caminho) {
  // parse não escreve process.env. Campos principais servem somente para
  // recusar reutilização de segredos, nunca como fallback.
  const dados = require('dotenv').parse(require('node:fs').readFileSync(caminho));
  return validarConfiguracao(dados, { ...process.env, ...dados });
}
module.exports = { validarConfiguracao, carregarConfiguracao, exigirConfiguracao, PRODUCAO, falha };
