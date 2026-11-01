param([Parameter(Mandatory=$true)][int]$PidAlvo,[string]$CriadoEm,[int]$Pai,[switch]$Encerrar)
$ErrorActionPreference='Stop'
$entry=Join-Path $PSScriptRoot 'controlador-restabelecimento-autorizado.cjs'
$p=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
if($null -eq $p -or $p.Name -ne 'node.exe' -or !$p.CommandLine.Contains($entry)){throw 'CONTROLADOR_DESCONHECIDO'}
$created=$p.CreationDate.ToUniversalTime().ToString('o')
if($Encerrar){
  $state=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'BackupsTrocaTicket/SupervisorCutover/estado.json') -Raw|ConvertFrom-Json
  $rec=$state.transicao.recuperacao
  if(!$state.congelado -or !$state.selado -or $state.transicao.fase -ne 'INCERTA' -or $rec.etapa -ne 'ENCERRANDO' -or $state.transicao.restabelecimento.etapa -ne 'RECUPERACAO_SUBSEQUENTE' -or $rec.pidAnterior -ne $state.transicao.restabelecimento.pidDestino){throw 'CONTROLADOR_ESTADO_RECUSADO'}
  if($created -cne $CriadoEm -or $p.ParentProcessId -ne $Pai){throw 'CONTROLADOR_IDENTIDADE_DIVERGENTE'}
  if($null -ne (Get-CimInstance Win32_Process -Filter "ProcessId=$($rec.pidAnterior)")){throw 'CONTROLADOR_FILHO_AINDA_ATIVO'}
  $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {$_.LocalPort -eq 3001})
  if($listeners.Count -ne 0){throw 'CONTROLADOR_PORTA_OCUPADA'}
  $native=Get-Process -Id $PidAlvo;$null=$native.Handle
  $again=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
  if($null -eq $again -or $again.CreationDate.ToUniversalTime().ToString('o') -cne $CriadoEm -or $again.ParentProcessId -ne $Pai -or !$again.CommandLine.Contains($entry)){throw 'CONTROLADOR_IDENTIDADE_DIVERGENTE'}
  $native.Kill();if(!$native.WaitForExit(15000)){throw 'CONTROLADOR_SAIDA_TIMEOUT'}
  [pscustomobject]@{pid=$PidAlvo;encerrado=$native.HasExited}|ConvertTo-Json -Compress
}else{[pscustomobject]@{pid=$PidAlvo;parentPid=[int]$p.ParentProcessId;criadoEm=$created;entradaConhecida=$true}|ConvertTo-Json -Compress}
