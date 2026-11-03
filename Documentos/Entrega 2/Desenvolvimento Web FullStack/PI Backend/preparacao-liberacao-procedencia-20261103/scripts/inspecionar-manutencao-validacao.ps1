param([int]$PidAlvo,[string]$CriadoEm,[int]$Pai,[switch]$Encerrar,[switch]$PortaLivre)
$ErrorActionPreference='Stop'
if($PortaLivre){$l=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {$_.LocalPort -eq 3001});[pscustomobject]@{portaLivre=($l.Count -eq 0)}|ConvertTo-Json -Compress;exit}
$entry=Join-Path $PSScriptRoot 'manutencao-validacao.cjs'
$p=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
if($null -eq $p -or $p.Name -ne 'node.exe' -or !$p.CommandLine.Contains($entry)){throw 'MANUTENCAO_PROCESSO_DESCONHECIDO'}
$listeners=@(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction Stop)
if($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $PidAlvo -or $listeners[0].LocalAddress -ne '127.0.0.1'){throw 'MANUTENCAO_PORTA_DIVERGENTE'}
if($Encerrar){
  $state=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'BackupsTrocaTicket/SupervisorCutover/estado.json') -Raw|ConvertFrom-Json
  $r=$state.transicao.restabelecimento
  if(!$state.congelado -or !$state.selado -or $state.transicao.fase -ne 'INCERTA' -or $r.etapa -ne 'AGUARDANDO_PORTA' -or $r.respondedor.pid -ne $PidAlvo -or $r.respondedor.criadoEm -cne $CriadoEm -or $r.respondedor.parentPid -ne $Pai){throw 'MANUTENCAO_ENCERRAMENTO_NAO_AUTORIZADO'}
  $native=Get-Process -Id $PidAlvo;$null=$native.Handle
  $again=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
  if($null -eq $again -or $again.ParentProcessId -ne $Pai -or $again.CreationDate.ToUniversalTime().ToString('o') -cne $CriadoEm -or !$again.CommandLine.Contains($entry)){throw 'MANUTENCAO_IDENTIDADE_DIVERGENTE'}
  $native.Kill();if(!$native.WaitForExit(15000)){throw 'MANUTENCAO_SAIDA_TIMEOUT'}
  [pscustomobject]@{pid=$PidAlvo;encerrado=$native.HasExited}|ConvertTo-Json -Compress;exit
}
[pscustomobject]@{pid=$PidAlvo;parentPid=[int]$p.ParentProcessId;criadoEm=$p.CreationDate.ToUniversalTime().ToString('o');role='MANUTENCAO_SEM_BACKEND';entradaConhecida=$true;portaExclusivaLocal=$true;backendSupervisor=$false}|ConvertTo-Json -Compress
