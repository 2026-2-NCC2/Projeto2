param([Parameter(Mandatory=$true)][ValidateSet('self','inspecionar','ausentes','reinicio','encerrar')][string]$Modo,[int]$PidAlvo,[string]$CriadoEm,[int]$Pai,[ValidateSet('controlador','supervisor','respondedor')][string]$Role,[string]$PidsAnteriores)
$ErrorActionPreference='Stop'
if($Modo -in @('ausentes','reinicio')){
  if($PidsAnteriores -notmatch '^\d+(,\d+)*$'){throw 'SUBSTITUICAO_LISTA_PIDS_INVALIDA'}
  $presentes=@();foreach($item in $PidsAnteriores.Split(',')){if($null -ne (Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$item)")){$presentes+=([int]$item)}}
  if($Modo -eq 'reinicio'){[pscustomobject]@{todosAusentes=($presentes.Count -eq 0);presentes=$presentes;pidsConsultados=@($PidsAnteriores.Split(',')|ForEach-Object {[int]$_});lastBootUtc=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o');capturedUtc=[datetime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress}else{[pscustomobject]@{todosAusentes=($presentes.Count -eq 0);presentes=$presentes}|ConvertTo-Json -Compress};exit
}
$p=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
if($null -eq $p -or $p.Name -ne 'node.exe'){throw 'SUBSTITUICAO_PROCESSO_DESCONHECIDO'}
$names=if($Modo -eq 'self'){@('substituir-controlador-selado.cjs','restabelecer-controlador-apos-reinicio.cjs')}elseif($Role -eq 'controlador'){@('controlador-recuperacao-smoke-selado.cjs','substituir-controlador-selado.cjs','restabelecer-controlador-apos-reinicio.cjs')}elseif($Role -eq 'supervisor'){@('iniciar-instancia-planejada.cjs','iniciar-supervisor-substituido.cjs')}else{@('manutencao-validacao.cjs')}
function Test-Entry($processInfo,[string]$name){
  $entry=[regex]::Escape((Join-Path $PSScriptRoot $name))
  return $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine -match ('^\s*(?:"[^"]+"|\S+)\s+(?:"'+$entry+'"|'+$entry+')(?=\s|$)')
}
$known=$false;foreach($name in $names){if(Test-Entry $p $name){$known=$true}}
if(!$known){throw 'SUBSTITUICAO_ENTRADA_DESCONHECIDA'}
$proof=[pscustomobject]@{pid=$PidAlvo;parentPid=[int]$p.ParentProcessId;criadoEm=$p.CreationDate.ToUniversalTime().ToString('o');entradaConhecida=$true}
if($Modo -ne 'encerrar'){$proof|ConvertTo-Json -Compress;exit}
$stateRaw=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'BackupsTrocaTicket/SupervisorCutover/estado.json') -Encoding UTF8 -Raw
$e=$stateRaw|ConvertFrom-Json
$r=$e.controleSelado
if(!$e.congelado -or !$e.selado -or $e.transicao.fase -ne 'INICIADA' ){throw 'SUBSTITUICAO_FENCE_RECUSADO'}
if($e.transicao.t1){
  $fenceRaw=& node (Join-Path $PSScriptRoot 'validar-fence-pos-t1.cjs') --somente-validar
  if($LASTEXITCODE -ne 0){throw 'SUBSTITUICAO_T1_FENCE_RECUSADO'}
  $fence=$fenceRaw|ConvertFrom-Json
  $stateFile=Join-Path $env:USERPROFILE 'BackupsTrocaTicket/SupervisorCutover/estado.json'
  $algorithm=[Security.Cryptography.SHA256]::Create()
  try{$initialHash=([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($stateRaw)))).Replace('-','').ToLowerInvariant();$stateHash=([BitConverter]::ToString($algorithm.ComputeHash([IO.File]::ReadAllBytes($stateFile)))).Replace('-','').ToLowerInvariant()}finally{$algorithm.Dispose()}
  if($stateHash -cne $fence.estadoSha256 -or $initialHash -cne $fence.estadoSha256){throw 'SUBSTITUICAO_T1_ESTADO_ALTERADO'}
}
if($Role -eq 'supervisor'){$expected=$r.origem.backend;$step='ENCERRANDO_SUPERVISOR'}elseif($Role -eq 'controlador'){$expected=$r.origem.controlador;$step='ENCERRANDO_CONTROLADOR';if($null -ne (Get-CimInstance Win32_Process -Filter "ProcessId=$($r.origem.backend.pid)")){throw 'SUBSTITUICAO_FILHO_AINDA_ATIVO'}}else{$expected=$r.respondedor;$step='TROCANDO_PORTA'}
if($r.etapa -ne $step -or $expected.pid -ne $PidAlvo -or $expected.criadoEm -cne $CriadoEm -or $expected.parentPid -ne $Pai -or $proof.criadoEm -cne $CriadoEm -or $proof.parentPid -ne $Pai){throw 'SUBSTITUICAO_IDENTIDADE_DIVERGENTE'}
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {$_.LocalPort -eq 3001})
if($Role -eq 'controlador'){
  if($listeners.Count -ne 0){
    # Retomada explicita pode conservar a ponte 503, nunca outro backend.
    $b=$r.respondedor;$bp=if($b){Get-CimInstance Win32_Process -Filter "ProcessId=$($b.pid)"}else{$null}
    if(!$r.retomadaAutorizada -or $listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $b.pid -or $listeners[0].LocalAddress -ne '127.0.0.1' -or $null -eq $bp -or !(Test-Entry $bp 'manutencao-validacao.cjs') -or $bp.CreationDate.ToUniversalTime().ToString('o') -cne $b.criadoEm -or $bp.ParentProcessId -ne $b.parentPid){throw 'SUBSTITUICAO_PORTA_AINDA_OCUPADA'}
  }
}elseif($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $PidAlvo -or $listeners[0].LocalAddress -ne '127.0.0.1'){throw 'SUBSTITUICAO_LISTENER_DIVERGENTE'}
$native=Get-Process -Id $PidAlvo;$null=$native.Handle
$again=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
if($null -eq $again -or $again.CreationDate.ToUniversalTime().ToString('o') -cne $CriadoEm -or $again.ParentProcessId -ne $Pai -or $again.CommandLine -cne $p.CommandLine){throw 'SUBSTITUICAO_PID_REUTILIZADO'}
if($e.transicao.t1){$lastAlgorithm=[Security.Cryptography.SHA256]::Create();try{$lastHash=([BitConverter]::ToString($lastAlgorithm.ComputeHash([IO.File]::ReadAllBytes($stateFile)))).Replace('-','').ToLowerInvariant()}finally{$lastAlgorithm.Dispose()};if($lastHash -cne $fence.estadoSha256){throw 'SUBSTITUICAO_T1_FENCE_ALTERADO'}}
$native.Kill();if(!$native.WaitForExit(15000)){throw 'SUBSTITUICAO_SAIDA_TIMEOUT'}
[pscustomobject]@{pid=$PidAlvo;encerrado=$native.HasExited}|ConvertTo-Json -Compress
