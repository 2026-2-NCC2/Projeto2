"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {responder}=require('../scripts/manutencao-validacao.cjs');
test('respondedor devolve sempre 503 para leitura login e escritas',()=>{
  for(const [method,url] of [['GET','/perfil'],['POST','/login'],['POST','/eventos'],['PUT','/eventos/1/custos'],['DELETE','/eventos/1'],['HEAD','/']]){
    let status,headers,body;responder({method,url},{writeHead(s,h){status=s;headers=h;},end(b){body=b;}});assert.equal(status,503);assert.equal(headers['Retry-After'],'60');assert.equal(headers['Cache-Control'],'no-store');assert.equal(typeof JSON.parse(body).erro,'string');
  }
});
test('respondedor nao importa aplicacao credenciais ou persistencia',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../scripts/manutencao-validacao.cjs'),'utf8');assert.doesNotMatch(code,/require\(['"](?:\.\.\/server|dotenv|pg|mysql2|\.\.\/db|express)/);assert.doesNotMatch(code,/writeFile|gravar\(|liberar\(|consumirEntrada/);
});
