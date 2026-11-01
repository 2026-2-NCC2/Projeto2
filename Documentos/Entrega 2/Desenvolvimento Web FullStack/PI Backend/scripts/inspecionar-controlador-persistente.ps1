param([Parameter(Mandatory=$true)][int]$PidAlvo,[Parameter(Mandatory=$true)][int]$PidBackend)
$ErrorActionPreference='Stop'
$entry=Join-Path $PSScriptRoot 'controlador-recuperacao-smoke-selado.cjs'
$backendEntry=Join-Path $PSScriptRoot 'iniciar-instancia-planejada.cjs'
$nextEntry=Join-Path $PSScriptRoot 'substituir-controlador-selado.cjs'
$nextBackend=Join-Path $PSScriptRoot 'iniciar-supervisor-substituido.cjs'
$p=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
$child=Get-CimInstance Win32_Process -Filter "ProcessId=$PidBackend"
$isNew=$false
if($null -ne $p -and $p.CommandLine.Contains($nextEntry)){
  $e=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'BackupsTrocaTicket/SupervisorCutover/estado.json') -Raw|ConvertFrom-Json
  $isNew=$e.controleSelado.controlador.pid -eq $PidAlvo -and $e.controleSelado.supervisor.pid -eq $PidBackend -and $e.controleSelado.etapa -in @('VINCULANDO','ATIVO') -and $null -eq $e.controleSelado.ticketControlador -and $null -eq $e.controleSelado.ticketSupervisor
}
if($null -eq $p -or $null -eq $child -or $p.Name -ne 'node.exe' -or $child.Name -ne 'node.exe' -or (!$p.CommandLine.Contains($entry) -and !$isNew) -or (!$child.CommandLine.Contains($backendEntry) -and !($isNew -and $child.CommandLine.Contains($nextBackend))) -or $child.ParentProcessId -ne $PidAlvo){throw 'CONTROLE_IDENTIDADE_RECUSADA'}
$listeners=@(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction Stop)
if($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $PidBackend -or $listeners[0].LocalAddress -ne '127.0.0.1'){throw 'CONTROLE_LISTENER_RECUSADO'}
[pscustomobject]@{controlador=[pscustomobject]@{pid=$PidAlvo;parentPid=[int]$p.ParentProcessId;criadoEm=$p.CreationDate.ToUniversalTime().ToString('o');entradaConhecida=$true};backend=[pscustomobject]@{pid=$PidBackend;parentPid=$PidAlvo;criadoEm=$child.CreationDate.ToUniversalTime().ToString('o');entradaConhecida=$true;portaExclusivaLocal=$true};ipcConsultado=$false}|ConvertTo-Json -Depth 4 -Compress
