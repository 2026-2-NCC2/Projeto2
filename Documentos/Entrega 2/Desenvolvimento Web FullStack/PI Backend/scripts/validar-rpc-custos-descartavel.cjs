"use strict";
// Execucao explicitamente autorizada; nao importa configuracao ou pools da aplicacao.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const docker = 'C:\\Users\\Lucas\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
// Docker's credential helper resides beside its CLI; process-local PATH only.
process.env.PATH = path.dirname(docker) + path.delimiter + process.env.PATH;
const run = crypto.randomUUID().replaceAll('-', '');
const publicationMode = process.argv.includes('--publicacao');
const accessMode = process.argv.includes('--acesso');
const comparisonMode = process.argv.includes('--comparar-propostas');
assert.ok([publicationMode,accessMode,comparisonMode].filter(Boolean).length<=1, 'Choose one scenario');
const folder = path.join('C:\\Users\\Lucas\\PostgreSQLTest', 'tt-custos-pg-' + run);
const db = 'tt_custos_' + run;
const manifest = { run, folder, database: db, mode: comparisonMode ? 'comparar-propostas' : accessMode ? 'acesso' : publicationMode ? 'publicacao' : 'custos', context: 'desktop-linux', created: new Date().toISOString(), results: [] };
let cid, cluster, started, testDeadline;
const sessions = new Set();
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const save = () => fs.writeFileSync(path.join(folder, 'manifesto.json'), JSON.stringify(manifest, null, 2));
function command(exe, args, input, timeout = 30000) {
  const p = spawnSync(exe, args, { input, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 8e6 });
  if (p.error || p.status !== 0) throw new Error(`${path.basename(exe)}: ${p.error?.message || p.stderr || p.stdout}`);
  return (p.stdout + (args.includes('logs') ? p.stderr : '')).trim();
}
const d = (args, input, timeout) => command(docker, ['--context', 'desktop-linux', ...args], input, timeout);
const inspect = () => JSON.parse(d(['inspect', cid]))[0];
function verifyContainer() {
  const c = inspect();
  assert.equal(c.Id, cid); assert.equal(c.Config.Labels['tt.run'], run);
  assert.equal(c.Config.Labels['tt.purpose'], 'rpc-custos'); assert.equal(c.Image, manifest.image);
  assert.equal(c.HostConfig.NetworkMode, 'none'); assert.equal(c.HostConfig.Privileged, false);
  assert.ok(!c.HostConfig.PortBindings || !Object.keys(c.HostConfig.PortBindings).length);
  assert.ok(!c.Config.ExposedPorts || !c.NetworkSettings.Ports || !Object.values(c.NetworkSettings.Ports).some(Boolean));
  assert.deepEqual(Object.keys(c.HostConfig.Tmpfs), ['/var/lib/postgresql/data']);
  assert.equal(c.Mounts.filter(m => m.Type === 'bind').length, 1);
  assert.equal(c.Mounts.filter(m => m.Type === 'volume').length, 0);
  const bind = c.Mounts.find(m => m.Type === 'bind');
  assert.equal(bind.Destination, '/run/secrets/bootstrap-password'); assert.equal(bind.RW, false);
  assert.equal(path.resolve(bind.Source).toLowerCase(), path.join(folder, 'bootstrap-password.txt').toLowerCase());
  return c;
}
const execArgs = () => ['exec', '-i', '--user', 'postgres', cid, 'env', '-i', 'PATH=/usr/local/bin:/usr/bin:/bin', 'PGCONNECT_TIMEOUT=5', 'psql', '-X', '-w', '-qAt', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'];
const raw = sql => d(execArgs(), sql);
function identity() {
  const row = JSON.parse(raw(`SELECT json_build_object('db',current_database(),'version',current_setting('server_version_num'),'data',current_setting('data_directory'),'port',current_setting('port'),'listen',current_setting('listen_addresses'),'socket',current_setting('unix_socket_directories'),'addr',inet_server_addr(),'actor',current_user,'cluster',(SELECT system_identifier::text FROM pg_control_system()),'started',pg_postmaster_start_time());`));
  assert.equal(row.db, db); assert.equal(Math.floor(Number(row.version) / 10000), 17);
  assert.equal(row.data, '/var/lib/postgresql/data'); assert.equal(row.port, '5432'); assert.equal(row.listen, '');
  assert.equal(row.socket, '/var/run/postgresql'); assert.equal(row.addr, null); assert.equal(row.actor, 'postgres');
  assert.ok(Date.parse(row.started) >= Date.parse(started) - 1000);
  if (cluster) assert.equal(row.cluster, cluster); else cluster = row.cluster;
  return row;
}
function guard() {
  return `DO $$ BEGIN IF current_database() <> '${db}' OR (SELECT system_identifier::text FROM pg_control_system()) <> '${cluster}' OR current_setting('listen_addresses') <> '' OR inet_server_addr() IS NOT NULL THEN RAISE EXCEPTION 'IDENTITY MISMATCH'; END IF; END $$;\n`;
}
function sql(text) { assert.ok(!testDeadline || Date.now()<testDeadline,'Global test deadline 180s'); verifyContainer(); return raw(guard() + text); }
function pass(name, details) { manifest.results.push({ name, status: 'PASS', details }); save(); console.log('PASS ' + name); }
const item = (value, categoria = 'TESTE') => ({ categoria, descricao: 'Sintetico', valor_estimado: value });
const literal = obj => "'" + JSON.stringify(obj).replaceAll("'", "''") + "'::jsonb";
let a, b, c, event, empty, foreign;
const call = (items, ev = event, actor = a) => `SELECT public.substituir_custos_evento(${ev},${actor},${literal(items)});`;
const put = items => JSON.parse(sql('SET ROLE service_role; ' + call(items)));
const rows = (ev = event) => JSON.parse(sql(`SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'evento_id',evento_id,'categoria',categoria,'descricao',descricao,'valor_estimado',valor_estimado::text) ORDER BY id),'[]') FROM public.custos_evento WHERE evento_id=${ev};`));
function rejected(statement, code) {
  const before = rows();
  let message;
  try { sql('\\set VERBOSITY verbose\n' + statement); } catch (e) { message = e.message; }
  assert.ok(message?.includes(code), `Expected ${code}: ${message}`);
  assert.deepEqual(rows(), before);
}
function session(label) {
  verifyContainer();
  const child = spawn(docker, ['--context', 'desktop-linux', ...execArgs()], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  const s = { child, out: '', err: '', closed: false };
  sessions.add(s);
  child.stdout.on('data', x => { s.out += x; }); child.stderr.on('data', x => { s.err += x; });
  child.on('exit', code => { s.closed = true; s.code = code; });
  child.on('error', e => { s.err += e.message; s.closed = true; s.code = -1; });
  child.stdin.on('error', e => { s.err += e.message; });
  s.send = x => child.stdin.write(x + '\n');
  s.wait = async marker => { const end = Date.now()+12000; while(!s.out.includes(marker)) { if(s.closed || Date.now()>end) throw Error('Session '+label+': '+s.err+' '+s.out); await new Promise(r=>setTimeout(r,40)); } };
  s.send(guard()+`SET application_name='tt_${run}_${label}'; SELECT 'PID='||pg_backend_pid(); SET ROLE service_role; BEGIN ISOLATION LEVEL READ COMMITTED;`);
  return s;
}
async function contention(mode, ev) {
  const before = rows(ev); const x=session('A'), y=session('B');
  await x.wait('PID='); await y.wait('PID=');
  const xp=Number(x.out.match(/PID=(\d+)/)[1]), yp=Number(y.out.match(/PID=(\d+)/)[1]);
  const probe = `SELECT id FROM public.eventos WHERE id=${ev} AND usuario_id=${a} FOR UPDATE; SELECT id FROM public.custos_evento WHERE evento_id=${ev} ORDER BY id FOR UPDATE; SELECT 'SNAP='::text||COALESCE(jsonb_agg(categoria ORDER BY id),'[]')::text FROM public.custos_evento WHERE evento_id=${ev};`;
  x.send((mode==='probe-put'?probe:call([item('1.10','A')],ev))+"\n\\echo HELD"); await x.wait('HELD');
  y.send((mode==='put-probe'?probe:call([item('2.20','B')],ev))+"\nCOMMIT;\n\\echo DONE\n\\q");
  const until=Date.now()+3500; let blocked=false;
  while(Date.now()<until) { if(sql(`SELECT ${xp}=ANY(pg_blocking_pids(${yp}));`)==='t'){blocked=true;break;} await new Promise(r=>setTimeout(r,40)); }
  assert.ok(blocked,'No real blocking observed'); assert.deepEqual(rows(ev),before);
  x.send('COMMIT;\n\\q'); await y.wait('DONE');
  const exitDeadline=Date.now()+5000;
  while(!x.closed || !y.closed) { assert.ok(Date.now()<exitDeadline,'Session exit timeout'); await new Promise(r=>setTimeout(r,30)); }
  assert.equal(x.code,0,x.err); assert.equal(y.code,0,y.err);
  if(mode==='put-probe') { assert.ok(y.out.includes('SNAP=["A"]')); assert.equal(rows(ev)[0].categoria,'A'); }
  else { assert.equal(rows(ev).length,1); assert.equal(rows(ev)[0].categoria,'B'); }
  if(mode==='probe-put') assert.ok(x.out.includes('SNAP='+JSON.stringify(before.map(r=>r.categoria)).replaceAll(',', ', ')));
  pass(`${mode} evento ${ev}`, { blocker:xp, waiter:yp, observedBlocking:true, isolation:'read committed', publicationExecuted:false });
}
async function main() {
  assert.ok(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT,'Inherited Docker override forbidden');
  const context=JSON.parse(d(['context','inspect','desktop-linux']))[0];
  assert.equal(context.Endpoints.docker.Host,'npipe:////./pipe/dockerDesktopLinuxEngine');
  assert.equal(context.Endpoints.docker.SkipTLSVerify,false);
  const info=JSON.parse(d(['info','--format','{{json .}}'])); assert.equal(info.OSType,'linux'); assert.ok(info.MemTotal>2*1024**3);
  fs.mkdirSync(folder,{recursive:true}); save();
  const secret=path.join(folder,'bootstrap-password.txt');
  fs.writeFileSync(secret,crypto.randomBytes(48).toString('base64'),{flag:'wx'});
  command('icacls.exe',[secret,'/inheritance:r','/grant:r','Lucas:F','SYSTEM:F']);
  let image=d(['image','ls','postgres:17','--format','{{.ID}}']);
  if(!image) { assert.ok(!comparisonMode,'Image absent: downloads forbidden'); d(['pull','postgres:17'],undefined,180000); }
  const im=JSON.parse(d(['image','inspect','postgres:17']))[0]; manifest.image=im.Id; manifest.digests=im.RepoDigests; save();
  cid=d(['create','--name','tt-custos-pg-'+run,'--label','tt.run='+run,'--label','tt.purpose=rpc-custos','--network','none','--memory','768m','--cpus','1','--shm-size','64m','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=256m','--mount',`type=bind,source=${secret},target=/run/secrets/bootstrap-password,readonly`,'-e','POSTGRES_PASSWORD_FILE=/run/secrets/bootstrap-password','-e','POSTGRES_USER=postgres','-e','POSTGRES_DB='+db,'-e','PGDATA=/var/lib/postgresql/data','-e','POSTGRES_INITDB_ARGS=--auth-local=peer --auth-host=scram-sha-256',im.Id,'postgres','-c','port=5432','-c','listen_addresses=','-c','unix_socket_directories=/var/run/postgresql','-c','timezone=UTC','-c','statement_timeout=15000','-c','lock_timeout=5000','-c','idle_in_transaction_session_timeout=30000']);
  assert.match(cid,/^[0-9a-f]{64}$/); manifest.container=cid; save(); verifyContainer(); started=new Date().toISOString(); d(['start',cid]);
  const deadline=Date.now()+30000;
  while(!d(['logs',cid]).includes('database system is ready to accept connections')) { assert.ok(Date.now()<deadline,'Startup timeout'); await new Promise(r=>setTimeout(r,250)); }
  // Entrypoint's temporary server can be ready before final exec; wait for final log.
  while(!d(['logs',cid]).includes('PostgreSQL init process complete')) { assert.ok(Date.now()<deadline); await new Promise(r=>setTimeout(r,250)); }
  await new Promise(r=>setTimeout(r,500));
  manifest.identity=identity(); manifest.cluster=cluster; testDeadline=Date.now()+180000; save();
  assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname='public';"),'0');
  assert.equal(sql("SELECT count(*) FROM pg_roles WHERE rolname='service_role';"),'0'); pass('isolamento e identidade');
  if (comparisonMode) {
    fs.copyFileSync(__filename,path.join(folder,'controlador.cjs')); manifest.controllerSha256=hash(fs.readFileSync(__filename));save();
    await require('./comparar-propostas-descartavel.cjs')({sql,pass,folder,manifest,hash,save});
    pass('cluster final reconfirmado',identity());return;
  }
  if (accessMode) {
    fs.copyFileSync(__filename,path.join(folder,'controlador.cjs')); manifest.controllerSha256=hash(fs.readFileSync(__filename)); save();
    await require('./cenarios-acesso-descartavel.cjs')({sql,session,pass,folder,manifest,hash,save});
    pass('cluster final reconfirmado',identity());
    return;
  }
  const rpc=fs.readFileSync(path.resolve(__dirname,'../../Banco de dados/rpc_substituir_custos_evento.preparacao.sql'),'utf8'); manifest.rpcSha256=hash(rpc);
  fs.writeFileSync(path.join(folder,'rpc.sql'),rpc); fs.copyFileSync(__filename,path.join(folder,'controlador.cjs')); manifest.controllerSha256=hash(fs.readFileSync(__filename)); save();
  sql(`BEGIN; CREATE TYPE public.usuarios_perfil_enum AS ENUM ('organizador','fornecedor','participante','admin'); CREATE TABLE public.usuarios(id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,perfil public.usuarios_perfil_enum NOT NULL); CREATE TABLE public.eventos(id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,usuario_id integer NOT NULL REFERENCES public.usuarios); CREATE TABLE public.custos_evento(id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,evento_id integer NOT NULL REFERENCES public.eventos ON DELETE CASCADE,categoria varchar(100) NOT NULL,descricao varchar(255) NOT NULL,valor_estimado numeric(12,2) NOT NULL); CREATE INDEX ON public.custos_evento(evento_id); CREATE ROLE service_role NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE tt_probe NOLOGIN; ${rpc} REVOKE ALL ON FUNCTION public.substituir_custos_evento(bigint,bigint,jsonb) FROM PUBLIC; GRANT USAGE ON SCHEMA public TO service_role,tt_probe; GRANT SELECT ON public.usuarios,public.eventos TO service_role; GRANT UPDATE ON public.eventos TO service_role; GRANT SELECT,INSERT,DELETE ON public.custos_evento TO service_role; GRANT USAGE ON SEQUENCE public.custos_evento_id_seq TO service_role; GRANT EXECUTE ON FUNCTION public.substituir_custos_evento(bigint,bigint,jsonb) TO service_role; COMMIT;`);
  [a,b,c]=sql("INSERT INTO public.usuarios(perfil) VALUES ('organizador'),('organizador'),('participante') RETURNING id;").split('\n').map(Number);
  [event,empty,foreign]=sql(`INSERT INTO public.eventos(usuario_id) VALUES (${a}),(${a}),(${b}) RETURNING id;`).split('\n').map(Number);
  if (publicationMode) {
    await require('./cenarios-publicacao-descartavel.cjs')({sql, session, pass, item, call, put, rows, literal, a, c, event, empty, foreign, folder, manifest, hash, save});
    pass('cluster final reconfirmado',identity());
    return;
  }
  const valid=['0.00','0.10','0.20','9999999999.99'].map(v=>item(v));
  const result=put(valid); assert.deepEqual(result.map(x=>x.valor_estimado),valid.map(x=>x.valor_estimado)); assert.deepEqual(result,rows());
  assert.ok(result.every((r,i)=>r.id>0&&(!i||r.id>result[i-1].id))); assert.deepEqual(Object.keys(result[0]).sort(),['id','evento_id','categoria','descricao','valor_estimado'].sort()); pass('compilacao IDs decimais releitura persistida');
  rejected('SET ROLE service_role; '+call([],foreign),'TC404'); rejected('SET ROLE service_role; '+call([],2147483647),'TC404'); rejected('SET ROLE service_role; '+call([],event,c),'TC403'); rejected('SET ROLE tt_probe; '+call([]),'42501');
  sql('GRANT EXECUTE ON FUNCTION public.substituir_custos_evento(bigint,bigint,jsonb) TO tt_probe;'); rejected('SET ROLE tt_probe; '+call([]),'TC403'); pass('propriedade perfil e privilegios');
  for(const v of ['-1.00','1.001','10000000000.00','',null,1,'01.00','1e2','0.10\n']) rejected('SET ROLE service_role; '+call([item('1.00'),item(v)]),'TC400');
  rejected('SET ROLE service_role; '+call(null),'TC400'); rejected('SET ROLE service_role; '+call([item('1.00','😀'.repeat(101))]),'TC400');
  assert.equal(put([item('0.10','\uFEFF '+ '😀'.repeat(100)+' \u00a0')])[0].categoria,'😀'.repeat(100)); pass('validacao integral Unicode e escala');
  sql(`INSERT INTO public.custos_evento(evento_id,categoria,descricao,valor_estimado) VALUES (${foreign},'PRESERVAR','Sintetico',3.33);`);
  const other=rows(foreign); assert.deepEqual(put([]),[]); assert.deepEqual(rows(),[]); assert.deepEqual(rows(foreign),other); pass('lista vazia e outro evento preservado');
  put([item('7.77','ORIGINAL')]);
  sql(`CREATE SCHEMA tt_harness; CREATE FUNCTION tt_harness.fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.categoria='FAIL' THEN RAISE EXCEPTION USING ERRCODE='TX001',MESSAGE='injected second insert'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_insert AFTER INSERT ON public.custos_evento FOR EACH ROW EXECUTE FUNCTION tt_harness.fail_insert();`);
  rejected('SET ROLE service_role; '+call([item('1.00'),item('2.00','FAIL')]),'TX001'); sql('DROP TRIGGER fail_insert ON public.custos_evento;'); pass('rollback apos segunda insercao');
  sql(`CREATE FUNCTION tt_harness.mark_read() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.categoria='READFAIL' THEN PERFORM set_config('tt.fail_read','yes',true); END IF; RETURN NEW; END $$; CREATE FUNCTION tt_harness.guard_read() RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$ BEGIN IF current_setting('tt.fail_read',true)='yes' THEN RAISE EXCEPTION USING ERRCODE='TX002',MESSAGE='injected final reread'; END IF; RETURN true; END $$; GRANT USAGE ON SCHEMA tt_harness TO service_role; GRANT EXECUTE ON FUNCTION tt_harness.guard_read() TO service_role; ALTER TABLE public.custos_evento ENABLE ROW LEVEL SECURITY; CREATE POLICY read_guard ON public.custos_evento FOR SELECT TO service_role USING(tt_harness.guard_read()); CREATE POLICY ins ON public.custos_evento FOR INSERT TO service_role WITH CHECK(true); CREATE POLICY del ON public.custos_evento FOR DELETE TO service_role USING(true); CREATE TRIGGER mark_read AFTER INSERT ON public.custos_evento FOR EACH ROW EXECUTE FUNCTION tt_harness.mark_read();`);
  rejected('SET ROLE service_role; '+call([item('1.00'),item('2.00','READFAIL')]),'TX002'); sql('DROP TRIGGER mark_read ON public.custos_evento; ALTER TABLE public.custos_evento DISABLE ROW LEVEL SECURITY;'); pass('rollback falha releitura final instrumentada');
  // SELECT FOR UPDATE on costs needs UPDATE: only for the publication protocol probe.
  sql('GRANT UPDATE ON public.custos_evento TO service_role;');
  for(const ev of [event,empty]) { await contention('put-put',ev); if(ev===empty) sql('SET ROLE service_role; '+call([],ev)); await contention('put-probe',ev); sql('SET ROLE service_role; '+call([],ev)); await contention('probe-put',ev); }
  pass('cluster final reconfirmado',identity());
}
(async()=>{
  try { await main(); manifest.status='PASS'; }
  catch(e) { manifest.status='FAIL'; manifest.error=e.message; console.error(e.message); process.exitCode=1; }
  finally {
    for(const s of sessions) if(!s.closed) { s.child.stdin.end('ROLLBACK;\n\\q\n'); }
    if(cid) try { verifyContainer(); fs.writeFileSync(path.join(folder,'postgres.log'),d(['logs',cid])); d(['stop','--time','10',cid]); d(['rm',cid]); manifest.removed=true; } catch(e) { manifest.cleanupError=e.message; process.exitCode=1; }
    if(fs.existsSync(folder)) { const secret=path.join(folder,'bootstrap-password.txt'); if(fs.existsSync(secret)&&path.dirname(path.resolve(secret))===path.resolve(folder)) fs.unlinkSync(secret); save(); console.log('EVIDENCE '+path.join(folder,'manifesto.json')); }
  }
})();
