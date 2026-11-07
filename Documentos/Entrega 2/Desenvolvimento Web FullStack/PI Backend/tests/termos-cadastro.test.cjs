'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const {criarTermosCadastro,ErroTermos}=require('../termos-cadastro.cjs');
const {criarRepositorioUsuarios}=require('../repositories/supabase/usuarios.cjs');
const original=require('../../PI React/src/pages/publicas/termosUso.json');
const publicado={...original,estado:'aprovado',aprovacao:'referencia-exclusivamente-sintetica'};
const conteudo=JSON.stringify(publicado),hash=createHash('sha256').update(conteudo).digest('hex');
const row={documento_id:publicado.id,versao:publicado.versao,hash,conteudo,ativo:true,aprovado_em:'2030-01-01T00:00:00Z'};
const aceite={aceito:true,documento:row.documento_id,versao:row.versao,hash};
const dados={nome:'Pessoa sintética',email:'p@example.invalid',senhaHash:'hash-sintetico',perfil:'participante'};
test('minuta bloqueia cadastro sem consultar ou alterar banco',async()=>{
 let consultas=0;const s=criarTermosCadastro({termoVigente(){consultas++;}});
 await assert.rejects(s.vigente(),e=>e.status===503);assert.equal(consultas,0);
});
test('backend rejeita ausência, false, data arbitrária e usuário injetado antes da leitura',async()=>{
 let consultas=0;const s=criarTermosCadastro({termoVigente(){consultas++;return row;}},publicado);
 for(const a of [null,{},false,[],{...aceite,aceito:false},{...aceite,usuario_id:8},{...aceite,aceito_em:'2030-01-01'}])await assert.rejects(s.validar(a),e=>e.status===400);
 assert.equal(consultas,0);
});
test('documento aprovado exige correspondência de conteúdo e publicação no banco',async()=>{
 for(const r of [null,{...row,ativo:false},{...row,hash:'b'.repeat(64)},{...row,conteudo:'alterado'},{...row,aprovado_em:null}])await assert.rejects(criarTermosCadastro({termoVigente:async()=>r},publicado).vigente(),e=>e.status===503);
 const s=criarTermosCadastro({termoVigente:async()=>row},publicado);
 for(const a of [{...aceite,versao:'antiga'},{...aceite,hash:'b'.repeat(64)},{...aceite,documento:'outro'}])await assert.rejects(s.validar(a),e=>e.status===409);
 assert.deepEqual(await s.validar(aceite),{documento:aceite.documento,versao:aceite.versao,hash});
});
test('repositório usa uma RPC sem retry, sem timestamp, usuário arbitrário ou segunda gravação',async()=>{
 const calls=[];const repo=criarRepositorioUsuarios({schema:s=>{assert.equal(s,'public');return {rpc:(nome,args)=>{calls.push({nome,args});return {retry:v=>{assert.equal(v,false);return Promise.resolve({data:17});}};}};}});
 assert.equal(await repo.criarComAceite({...dados,aceite,usuario_id:999,aceito_em:'arbitrario'}),17);
 assert.equal(calls.length,1);assert.equal(calls[0].nome,'cadastrar_usuario_termos_v1');
 assert.deepEqual(Object.keys(calls[0].args),['p_nome','p_email','p_senha_hash','p_documento','p_versao','p_hash']);
});
test('falha RPC não retorna sucesso nem aciona fallback ou compensação',async()=>{
 for(const resposta of [{error:{code:'42501'}},{data:null},{error:{code:'PT409'}},{error:{code:'23505'}}]){
  let n=0;const repo=criarRepositorioUsuarios({schema(){return {rpc(){n++;return {retry(){return Promise.resolve(resposta);}};}};}});
  await assert.rejects(repo.criarComAceite({...dados,aceite}));assert.equal(n,1);
 }
});
function handler(repo,servico){let h;const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 vm.runInNewContext(source.slice(source.indexOf('app.post("/usuarios",'),source.indexOf('// Login')),{app:{post(r,...args){assert.equal(r,'/usuarios');h=args.at(-1);}},limitarFrequencia:()=>()=>{},termosCadastro:servico,ErroTermos,usuariosRepository:repo,bcrypt:{hash:async()=>dados.senhaHash},Buffer,console:{error(){}}});return h;
}
test('handler HTTP fecha cadastro sem aceite e com minuta, sem criar conta',async()=>{
 let n=0;const repo={criarComAceite(){n++;},buscarIdPorEmail(){n++;}};
 for(const [a,status]of [[undefined,400],[aceite,503]]){
 const res={status(s){this.code=s;return this;},json(b){this.body=b;}};
 await handler(repo,criarTermosCadastro(repo))({body:{nome:dados.nome,email:dados.email,senha:'senha1234',perfil:'participante',aceite_termos:a}},res);
 assert.equal(res.code,status);assert.equal(n,0);
 }
});
test('revisão estática: migration transacional, minuta inativa, sem backfill e com relógio do banco',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../../Banco de dados/termos_aceite.incremental.sql'),'utf8');
 assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/);assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/DEFAULT false/);assert.match(sql,/FOR SHARE/);assert.match(sql,/clock_timestamp\(\)/);
 assert.match(sql,/REFERENCES public\.usuarios\(id\) ON DELETE RESTRICT/);
 assert.doesNotMatch(sql,/INSERT INTO public\.termos_aceites[\s\S]*SELECT .*public\.usuarios|ALTER TABLE public\.usuarios/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);assert.match(sql,/GRANT SELECT,INSERT ON public\.termos_aceites/);
 const canonical=JSON.stringify(original),h=createHash('sha256').update(canonical).digest('hex');
 assert.ok(sql.includes(h));assert.ok(sql.includes('$conteudo$'+canonical+'$conteudo$'));
});
test('revisão estática: bloqueio é restrito à auxiliar e não concede UPDATE em documentos',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../../Banco de dados/termos_aceite.incremental.sql'),'utf8');
 const principal=sql.split('CREATE FUNCTION public.cadastrar_usuario_termos_v1')[1].split('END $func$;')[0];
 assert.doesNotMatch(principal,/FOR SHARE/);
 assert.match(principal,/public\.termos_publicacao_bloquear_v1/);
 assert.match(sql,/SECURITY DEFINER SET search_path=pg_catalog,pg_temp/);
 assert.match(sql,/current_setting\('role',true\) IS DISTINCT FROM 'service_role'/);
 assert.match(sql,/current_user<>'postgres'/);
 assert.doesNotMatch(sql,/GRANT[^;]*UPDATE[^;]*termos_documentos/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.termos_publicacao_bloquear_v1/);
});
