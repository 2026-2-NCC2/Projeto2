param([Parameter(Mandatory=$true)][string]$Relatorio,[switch]$ExecutarAutorizado)
$ErrorActionPreference='Stop'
if(!$ExecutarAutorizado){throw 'ADMIN_PARADA_EXIGE_AUTORIZACAO_EXPLICITA'}
$r=Get-Content -Raw -Encoding UTF8 -LiteralPath $Relatorio|ConvertFrom-Json
$age=([DateTime]::UtcNow-[DateTime]::Parse($r.finishedUtc).ToUniversalTime()).TotalSeconds
if($r.status -ne 'RECONCILIACAO_ADMINISTRATIVA_APROVADA' -or $age -lt 0 -or $age -gt 300){throw 'ADMIN_RELATORIO_EXPIRADO_OU_INVALIDO'}
$dir=Join-Path $env:USERPROFILE 'BackupsTrocaTicket\SupervisorCutover'
$file=Join-Path $dir 'estado.json'
if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $r.stateSha256){throw 'ADMIN_ESTADO_DIVERGENTE'}
$e=Get-Content -Raw -Encoding UTF8 -LiteralPath $file|ConvertFrom-Json
if(!$e.congelado -or !$e.selado -or $e.transicao.fase -ne 'INCERTA' -or $e.transicao.t1.etapa -ne 'CONCLUIDA' -or !$e.transicao.t1.cleanupVerified -or $e.transicao.t1.unknownResult){throw 'ADMIN_ESTADO_INSEGURO'}
$root=Split-Path $PSScriptRoot -Parent
$held=@()
try{
 foreach($item in @(@('controller','controlador','restabelecer-controlador-apos-reinicio.cjs'),@('supervisor','supervisor','iniciar-supervisor-substituido.cjs'))){
  $expected=$r.($item[0]);$registered=$e.controleSelado.($item[1]);foreach($key in @('pid','parentPid','criadoEm')){if($expected.$key -ne $registered.$key){throw 'ADMIN_IDENTIDADE_DIVERGENTE'}}
  $handle=Get-Process -Id $expected.pid -ErrorAction Stop;$null=$handle.Handle
  $native=Get-CimInstance Win32_Process -Filter "ProcessId=$($expected.pid)"
  $entry=[regex]::Escape((Join-Path $root ('scripts\'+$item[2])))
  if($null -eq $native -or $native.Name -ne 'node.exe' -or $native.ParentProcessId -ne $expected.parentPid -or $native.CreationDate.ToUniversalTime().ToString('o') -ne $expected.criadoEm -or $native.CommandLine -notmatch ('^\s*(?:"[^"]+"|\S+)\s+(?:"'+$entry+'"|'+$entry+')(?=\s|$)') -or $handle.HasExited){$handle.Dispose();throw 'ADMIN_PROCESSO_NAO_IDENTIFICADO'}
  $held+=,$handle
 }
 $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue)
 if($listeners.Count -eq 0 -or @($listeners|Where-Object {$_.OwningProcess -ne $r.supervisor.pid}).Count){throw 'ADMIN_PORTA_DIVERGENTE'}
 $audit=Join-Path $dir ('estado-incerta-antes-parada-'+[guid]::NewGuid().ToString()+'.json')
 $bytes=[IO.File]::ReadAllBytes($file);$stream=[IO.File]::Open($audit,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 if((Get-FileHash -LiteralPath $audit -Algorithm SHA256).Hash.ToLowerInvariant() -ne $r.stateSha256 -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $r.stateSha256){throw 'ADMIN_ARQUIVO_HISTORICO_DIVERGENTE'}
 # Handles identificados; pai primeiro, sem EOF que dispare nova orquestracao.
 foreach($handle in $held){if(!$handle.HasExited){$handle.Kill();if(!$handle.WaitForExit(10000)){throw 'ADMIN_PARADA_TIMEOUT'}}}
 if(@(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue).Count){throw 'ADMIN_PORTA_AINDA_OCUPADA'}
 [pscustomobject]@{status='PROCESSOS_IDENTIFICADOS_ENCERRADOS';controllerPid=$r.controller.pid;supervisorPid=$r.supervisor.pid;historyFile=$audit;httpNormalReleased=$false}|ConvertTo-Json -Compress
}finally{foreach($handle in $held){$handle.Dispose()}}
