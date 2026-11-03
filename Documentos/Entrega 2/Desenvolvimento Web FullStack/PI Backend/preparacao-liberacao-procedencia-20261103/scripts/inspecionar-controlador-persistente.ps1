param([Parameter(Mandatory=$true)][int]$PidAlvo,[Parameter(Mandatory=$true)][int]$PidBackend)
$ErrorActionPreference='Stop'
$entry=Join-Path $PSScriptRoot 'controlador-recuperacao-smoke-selado.cjs'
$backendEntry=Join-Path $PSScriptRoot 'iniciar-instancia-planejada.cjs'
$nextEntry=Join-Path $PSScriptRoot 'substituir-controlador-selado.cjs'
$restartEntry=Join-Path $PSScriptRoot 'restabelecer-controlador-apos-reinicio.cjs'
$nextBackend=Join-Path $PSScriptRoot 'iniciar-supervisor-substituido.cjs'
$p=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
$child=Get-CimInstance Win32_Process -Filter "ProcessId=$PidBackend"
$isNew=$false
$isPosT1=$false
$stateFile=Join-Path $env:USERPROFILE 'BackupsTrocaTicket/SupervisorCutover/estado.json'
if($null -ne $p -and ($p.CommandLine.Contains($nextEntry) -or $p.CommandLine.Contains($restartEntry))){
  $stateHash=(Get-FileHash -LiteralPath $stateFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $e=Get-Content -LiteralPath $stateFile -Encoding UTF8 -Raw|ConvertFrom-Json
  $isNew=$e.controleSelado.controlador.pid -eq $PidAlvo -and $e.controleSelado.supervisor.pid -eq $PidBackend -and $e.controleSelado.etapa -in @('VINCULANDO','ATIVO') -and $null -eq $e.controleSelado.ticketControlador -and $null -eq $e.controleSelado.ticketSupervisor
  if($p.CommandLine.Contains($restartEntry)){
    $legacy=$e.controleSelado.modo -eq 'RESTABELECIMENTO_POS_REINICIO' -and $null -eq $e.transicao.t1
    $post=$e.controleSelado.modo -eq 'IMPLANTACAO_POS_T1' -and $e.controleSelado.motivoOperacao -eq 'RESTABELECIMENTO_POS_T1' -and $null -ne $e.transicao.t1
    $isNew=$isNew -and ($legacy -or $post)
  }
  if($isNew -and $null -ne $e.transicao.t1){
    $raw=& node (Join-Path $PSScriptRoot 'validar-inspecao-pos-t1.cjs') --somente-inspecionar --controlador $PidAlvo --supervisor $PidBackend
    $nativeExit=$LASTEXITCODE
    if($nativeExit -ne 0){throw 'CONTROLE_POS_T1_VALIDACAO_RECUSADA'}
    $proof=$raw|ConvertFrom-Json
    if($proof.ok -ne $true -or $proof.estadoSha256 -cne $stateHash){throw 'CONTROLE_POS_T1_ESTADO_DIVERGENTE'}
    $isPosT1=$true
  }
}
if($null -eq $p -or $null -eq $child -or $p.Name -ne 'node.exe' -or $child.Name -ne 'node.exe' -or (!$p.CommandLine.Contains($entry) -and !$isNew) -or (!$child.CommandLine.Contains($backendEntry) -and !($isNew -and $child.CommandLine.Contains($nextBackend))) -or $child.ParentProcessId -ne $PidAlvo){throw 'CONTROLE_IDENTIDADE_RECUSADA'}
$listeners=@(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction Stop)
if($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $PidBackend -or $listeners[0].LocalAddress -ne '127.0.0.1'){throw 'CONTROLE_LISTENER_RECUSADO'}
if($isPosT1){
  function Test-Canonical($actor,[string]$file){$escaped=[regex]::Escape($file);return $actor.CommandLine -match ('^\s*(?:"[^"]+"|\S+)\s+(?:"'+$escaped+'"|'+$escaped+')(?=\s|$)')}
  if(!(Test-Canonical $p $restartEntry) -and !(Test-Canonical $p $nextEntry)){throw 'CONTROLE_ENTRADA_NAO_CANONICA'}
  if(!(Test-Canonical $child $nextBackend)){throw 'CONTROLE_ENTRADA_FILHO_RECUSADA'}
  if($p.ParentProcessId -ne $e.controleSelado.controlador.parentPid -or $p.CreationDate.ToUniversalTime().ToString('o') -cne $e.controleSelado.controlador.criadoEm -or $child.CreationDate.ToUniversalTime().ToString('o') -cne $e.controleSelado.supervisor.criadoEm){throw 'CONTROLE_IDENTIDADE_POS_T1_DIVERGENTE'}
  $again=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
  $againChild=Get-CimInstance Win32_Process -Filter "ProcessId=$PidBackend"
  if($null -eq $again -or $null -eq $againChild -or $again.CommandLine -cne $p.CommandLine -or $again.CreationDate -ne $p.CreationDate -or $again.ParentProcessId -ne $p.ParentProcessId -or $againChild.CommandLine -cne $child.CommandLine -or $againChild.CreationDate -ne $child.CreationDate -or $againChild.ParentProcessId -ne $PidAlvo){throw 'CONTROLE_IDENTIDADE_ALTERADA'}
  if((Get-FileHash -LiteralPath $stateFile -Algorithm SHA256).Hash.ToLowerInvariant() -cne $stateHash){throw 'CONTROLE_ESTADO_ALTERADO'}
}
[pscustomobject]@{controlador=[pscustomobject]@{pid=$PidAlvo;parentPid=[int]$p.ParentProcessId;criadoEm=$p.CreationDate.ToUniversalTime().ToString('o');entradaConhecida=$true};backend=[pscustomobject]@{pid=$PidBackend;parentPid=$PidAlvo;criadoEm=$child.CreationDate.ToUniversalTime().ToString('o');entradaConhecida=$true;portaExclusivaLocal=$true};ipcConsultado=$false}|ConvertTo-Json -Depth 4 -Compress
