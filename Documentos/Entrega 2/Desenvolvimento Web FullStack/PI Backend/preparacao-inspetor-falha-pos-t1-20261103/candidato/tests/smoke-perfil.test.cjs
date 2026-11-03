"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {validarRespostaPerfil}=require('../scripts/smoke-perfil.cjs');
const conta={id:42,email:'ficticio@example.invalid',perfil:'admin'};
const resposta={id:42,nome:'Usuario ficticio',email:conta.email};
test('smoke aceita contrato real de perfil sem campo perfil',()=>{
  assert.equal(Object.hasOwn(resposta,'perfil'),false);
  assert.doesNotThrow(()=>validarRespostaPerfil(resposta,conta));
});
test('smoke recusa identidade ou email divergentes',()=>{
  assert.throws(()=>validarRespostaPerfil({...resposta,id:43},conta),/SMOKE_PERFIL_IDENTIDADE/);
  assert.throws(()=>validarRespostaPerfil({...resposta,email:'outro@example.invalid'},conta),/SMOKE_PERFIL_EMAIL/);
});
test('smoke recusa corpo invalido ou nome ausente',()=>{
  for(const r of [null,[],undefined])assert.throws(()=>validarRespostaPerfil(r,conta),/SMOKE_PERFIL_CORPO/);
  assert.throws(()=>validarRespostaPerfil({id:conta.id,email:conta.email},conta),/SMOKE_PERFIL_NOME/);
});
