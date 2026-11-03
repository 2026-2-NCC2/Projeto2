'use strict';
// Diagnostico somente do helper READ ONLY; nunca chama o controlador/admissao.
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'helper-reinicio-20261103.stderr.log');
require('../scripts/helper-powershell.cjs').executarHelper('processo-substituicao-selada.ps1',['-Modo','reinicio','-PidsAnteriores','25144,15788'],{errorLog:file}).then(bytes=>{
 const r=JSON.parse(bytes.toString().replace(/^\uFEFF/,''));console.log(JSON.stringify({ok:true,todosAusentes:r.todosAusentes,capturedUtc:r.capturedUtc,admissionExecuted:false}));
}).catch(e=>{
 console.log(JSON.stringify({ok:false,code:e.code,errorLogCreated:fs.existsSync(file),admissionExecuted:false}));process.exitCode=1;
});
