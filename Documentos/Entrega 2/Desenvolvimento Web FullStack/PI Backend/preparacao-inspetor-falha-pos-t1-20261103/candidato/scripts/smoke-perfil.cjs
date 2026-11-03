"use strict";
const assert=require('node:assert/strict');
// GET /perfil compartilha este contrato entre MySQL e Supabase.
// O papel continua validado nos claims JWT e nas rotas protegidas.
function validarRespostaPerfil(resposta,conta){
  assert.ok(resposta&&typeof resposta==='object'&&!Array.isArray(resposta),'SMOKE_PERFIL_CORPO');
  assert.equal(resposta.id,conta.id,'SMOKE_PERFIL_IDENTIDADE');
  assert.equal(typeof resposta.nome,'string','SMOKE_PERFIL_NOME');
  assert.equal(resposta.email,conta.email,'SMOKE_PERFIL_EMAIL');
}
module.exports={validarRespostaPerfil};
