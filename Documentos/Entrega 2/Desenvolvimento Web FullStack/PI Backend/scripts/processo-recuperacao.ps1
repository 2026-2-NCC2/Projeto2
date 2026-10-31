param([Parameter(Mandatory=$true)][int]$PidAlvo,[string]$CriadoEm,[int]$Pai,[switch]$Encerrar)
$ErrorActionPreference='Stop'
$entry=Join-Path $PSScriptRoot 'iniciar-instancia-planejada.cjs'
$restoredEntry=Join-Path $PSScriptRoot 'iniciar-supervisor-restabelecido.cjs'
$state=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'BackupsTrocaTicket/SupervisorCutover/estado.json') -Raw|ConvertFrom-Json
$p=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
$restored=$state.transicao.restabelecimento
$isRestored=$null -ne $p -and $p.CommandLine.Contains($restoredEntry) -and $restored.pidDestino -eq $PidAlvo -and $restored.ticket -eq $null -and $restored.etapa -in @('ADMITIDA_SELADA','RECUPERACAO_SUBSEQUENTE')
if($null -eq $p -or $p.Name -ne 'node.exe' -or (!$p.CommandLine.Contains($entry) -and !$isRestored)){throw 'RECUPERACAO_PROCESSO_DESCONHECIDO'}
if($isRestored){$entry=$restoredEntry}
$created=$p.CreationDate.ToUniversalTime().ToString('o')
$listeners=@(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction Stop)
$local=$listeners.Count -eq 1 -and $listeners[0].OwningProcess -eq $PidAlvo -and $listeners[0].LocalAddress -eq '127.0.0.1'
if(!$Encerrar){[pscustomobject]@{pid=$PidAlvo;parentPid=[int]$p.ParentProcessId;criadoEm=$created;entradaConhecida=$true;portaExclusivaLocal=$local}|ConvertTo-Json -Compress;exit}
if(!$local -or $created -cne $CriadoEm -or $p.ParentProcessId -ne $Pai){throw 'RECUPERACAO_IDENTIDADE_DIVERGENTE'}
$state=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'BackupsTrocaTicket/SupervisorCutover/estado.json') -Raw|ConvertFrom-Json
if(!$state.congelado -or !$state.selado -or $state.transicao.fase -ne 'INCERTA' -or $state.transicao.recuperacao.etapa -ne 'ENCERRANDO' -or $state.transicao.recuperacao.pidAnterior -ne $PidAlvo){throw 'RECUPERACAO_ESTADO_RECUSADO'}
# Abrir o handle antes da ultima conferencia impede atingir outro processo por PID reutilizado.
$native=Get-Process -Id $PidAlvo
$null=$native.Handle
$again=Get-CimInstance Win32_Process -Filter "ProcessId=$PidAlvo"
if($null -eq $again -or $again.CreationDate.ToUniversalTime().ToString('o') -cne $CriadoEm -or $again.ParentProcessId -ne $Pai -or !$again.CommandLine.Contains($entry)){throw 'RECUPERACAO_IDENTIDADE_DIVERGENTE'}
$native.Kill()
if(!$native.WaitForExit(15000)){throw 'RECUPERACAO_SAIDA_TIMEOUT'}
$remaining=@(Get-NetTCPConnection -State Listen -ErrorAction Stop|Where-Object {$_.LocalPort -eq 3001})
[pscustomobject]@{pid=$PidAlvo;encerrado=$native.HasExited;portaLivre=($remaining.Count -eq 0)}|ConvertTo-Json -Compress
