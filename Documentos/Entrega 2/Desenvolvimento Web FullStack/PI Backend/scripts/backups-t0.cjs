"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {comando,quoteOption}=require('./backup-mysql-isolado.cjs');
const {pgpass}=require('./backup-postgres-isolado.cjs');
const {TABLES}=require('./delta-cutover.cjs');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function limparClienteT0(id,token,run=comando){assert.match(id,/^[a-f0-9]{64}$/);const listed=(await run('docker',['ps','-a','--no-trunc','--filter','id='+id,'--format','{{.ID}}'])).toString().trim();if(!listed)return;assert.equal(listed,id);const [c]=JSON.parse((await run('docker',['inspect',id])).toString());assert.equal(c.Id,id);assert.equal(c.Config.Labels['tt.cutover.t0'],token);assert.equal(c.HostConfig.ReadonlyRootfs,true);await run('docker',['rm','-f',id]);}
function criarProdutorT0(env,ca){
  assert.ok(['localhost','127.0.0.1','::1'].includes(env.DB_HOST));assert.ok(/^[A-Za-z0-9_]+$/.test(env.DB_NAME));assert.ok(env.DB_USER&&Object.hasOwn(env,'DB_PASSWORD'));
  assert.match(env.PGHOST,/^[a-z0-9.-]+\.pooler\.supabase\.com$/);assert.equal(env.PGUSER,'postgres.gnwybroqfvwosiqzsfla');assert.equal(env.PGPORT,'5432');assert.equal(env.PGDATABASE,'postgres');assert.ok(env.PGPASSWORD&&ca);
  // Este construtor nao abre conexoes nem cria diretorios.
  return async({somenteLeitura,semRepetirRestauracoes})=>{
    assert.equal(somenteLeitura,true);assert.equal(semRepetirRestauracoes,true);
    const dir=path.join(os.homedir(),'BackupsTrocaTicket','t0-'+crypto.randomBytes(16).toString('hex'));
    const verified=JSON.parse((await require('./helper-powershell.cjs').executarHelper('preparar-diretorio-t0.ps1',['-Destino',dir])).toString());assert.equal(verified.privateAclVerified,true);
    const token=path.basename(dir);
    async function cliente(args,options){const cid=path.join(dir,'cliente-'+crypto.randomUUID()+'.cid');try{return await comando('docker',[...args.slice(0,2),'--label','tt.cutover.t0='+token,'--cidfile',cid,...args.slice(2)],options);}finally{if(fs.existsSync(cid)){await limparClienteT0(fs.readFileSync(cid,'utf8').trim(),token);fs.unlinkSync(cid);}}}
    const cnf=path.join(dir,'mysql-client-temporario.cnf'),pass=path.join(dir,'pgpass-temporario'),mysql=path.join(dir,'mysql-t0.sql'),pg=path.join(dir,'supabase-t0.dump'),roles=path.join(dir,'roles-sem-senhas.sql'),toc=path.join(dir,'supabase-toc.txt'),copy=path.join(dir,'supabase-public-t0.copy.sql');
    try{
      fs.writeFileSync(cnf,'[client]\nhost='+quoteOption(env.DB_HOST)+'\nport='+Number(env.DB_PORT||3306)+'\nuser='+quoteOption(env.DB_USER)+'\npassword='+quoteOption(env.DB_PASSWORD)+'\nprotocol=tcp\n',{flag:'wx',mode:0o600});
      await comando('C:\\xampp\\mysql\\bin\\mysqldump.exe',['--defaults-extra-file='+cnf,'--single-transaction','--skip-lock-tables','--quick','--hex-blob','--complete-insert','--tz-utc','--default-character-set=utf8mb4','--routines','--events','--triggers','--databases',env.DB_NAME],{output:mysql,timeout:120000});
      fs.copyFileSync(ca,path.join(dir,'supabase-ca.crt'),fs.constants.COPYFILE_EXCL);
      fs.writeFileSync(pass,[env.PGHOST,env.PGPORT,env.PGDATABASE,env.PGUSER,env.PGPASSWORD].map(pgpass).join(':')+'\n',{flag:'wx',mode:0o600});
      const image=(await comando('docker',['image','inspect','postgres:17','--format','{{.Id}}'])).toString().trim();assert.match(image,/^sha256:[a-f0-9]{64}$/);
      const args=['run','--rm','--read-only','--network','bridge','--tmpfs','/tmp:rw,size=64m','--mount','type=bind,source='+dir+',target=/backup,readonly',
        '--env','PGHOST='+env.PGHOST,'--env','PGPORT=5432','--env','PGDATABASE=postgres','--env','PGUSER='+env.PGUSER,'--env','PGSSLMODE=verify-full','--env','PGSSLROOTCERT=/backup/supabase-ca.crt','--env','PGCONNECT_TIMEOUT=15','--env','PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000 -c timezone=UTC','--entrypoint','/bin/sh',image,'-c','cp /backup/pgpass-temporario /tmp/pass && chmod 600 /tmp/pass && export PGPASSFILE=/tmp/pass && exec "$@"','t0-client'];
      await cliente([...args,'pg_dump','--format=custom'],{output:pg,timeout:300000});
      await cliente([...args,'pg_dumpall','--roles-only','--no-role-passwords'],{output:roles,timeout:120000});
      await cliente(['run','--rm','--network','none','--read-only','--mount','type=bind,source='+dir+',target=/backup,readonly','--entrypoint','pg_restore',image,'--list','/backup/supabase-t0.dump'],{output:toc});
      // Extracao textual do dump, sem conectar/restaurar banco ou repetir ensaios.
      await cliente(['run','--rm','--network','none','--read-only','--mount','type=bind,source='+dir+',target=/backup,readonly','--entrypoint','pg_restore',image,'--data-only','--schema=public','--file=-','/backup/supabase-t0.dump'],{output:copy});
      const sql=fs.readFileSync(mysql,'utf8'),list=fs.readFileSync(toc,'utf8');
      for(const t of TABLES){assert.ok(sql.includes('CREATE TABLE `'+t+'`'));assert.ok(new RegExp('TABLE DATA public '+t+'\\b').test(list));}
      for(const fn of ['substituir_custos_evento','publicar_cotacao','decidir_solicitacao_acesso','avaliar_proposta'])assert.ok(new RegExp('FUNCTION public '+fn+'\\(').test(list));
      assert.equal(fs.readFileSync(pg).subarray(0,5).toString(),'PGDMP');
      const artifacts=[mysql,pg,roles,toc,copy].map(file=>({file,bytes:fs.statSync(file).size,sha256:sha(file)}));
      const report={directory:dir,mysqlDataFile:mysql,postgresDataFile:copy,privateAclVerified:true,schemaComplete:true,rolesWithoutPasswords:true,restoreTestsRepeated:false,artifacts};
      fs.writeFileSync(path.join(dir,'manifesto-t0.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return report;
    }finally{for(const file of [cnf,pass])if(fs.existsSync(file))fs.unlinkSync(file);}
  };
}
function validarArtefatosT0(result){let root=__dirname;while(!fs.existsSync(path.join(root,'.git'))&&path.dirname(root)!==root)root=path.dirname(root);const dir=fs.realpathSync(result.directory),rel=path.relative(root,dir);assert.ok(rel.startsWith('..'+path.sep)||path.isAbsolute(rel),'T0_PRIVADO_FORA_REPO');assert.equal(result.privateAclVerified,true);assert.equal(result.schemaComplete,true);assert.equal(result.rolesWithoutPasswords,true);assert.equal(result.restoreTestsRepeated,false);assert.ok(result.artifacts.length>=5);for(const a of result.artifacts){assert.equal(path.dirname(fs.realpathSync(a.file)),dir);assert.ok(a.bytes>0);assert.equal(fs.statSync(a.file).size,a.bytes);assert.equal(sha(a.file),a.sha256);}for(const file of [result.mysqlDataFile,result.postgresDataFile])assert.ok(result.artifacts.some(a=>a.file===file));return true;}
module.exports={criarProdutorT0,validarArtefatosT0,limparClienteT0};
