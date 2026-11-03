Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'status-atomico.ps1')
function Assert-StepApproved($Result,[string]$Name) {
  if ($null -eq $Result -or $Result -is [array] -or !$Result.PSObject.Properties['ok'] -or $Result.ok -isnot [bool] -or !$Result.ok -or !$Result.PSObject.Properties['exit_code'] -or $Result.exit_code -isnot [int] -or $Result.exit_code -ne 0) { Stop-Retomada ('RETOMADA_'+$Name+'_RECUSADO') }
}
function Invoke-RetomadaGuardada {
  param([bool]$Authorized,[scriptblock]$Preflight,[scriptblock]$AcquireReservation,[scriptblock]$ReleaseReservation,[scriptblock]$Publish,[scriptblock]$Verify,[scriptblock]$Revalidate,[scriptblock]$Launch)
  $ErrorActionPreference='Stop'
  if (!$Authorized) { Stop-Retomada 'RETOMADA_NAO_AUTORIZADA' }
  $first=& $Preflight; Assert-StepApproved $first 'PREFLIGHT'
  if ($first.mode -eq 'JA_ADMITIDO_NAO_RELANCAR') { return [pscustomobject]@{ok=$true;exit_code=0;mode=$first.mode;launched=$false} }
  if ($first.mode -ne 'APLICADO_AGUARDANDO_ADMISSAO' -or $first.patchApplyRequired -isnot [bool] -or $first.patchApplyRequired -ne $false -or $first.hashesVerified -ne 27 -or $first.stateHash -cnotmatch '^[a-f0-9]{64}$' -or $first.manifestHash -cnotmatch '^[a-f0-9]{64}$') { Stop-Retomada 'RETOMADA_PARCIAL_RECUSADA' }
  $reservation=$null
  try {
    $candidateReservation=& $AcquireReservation $first
    Assert-StepApproved $candidateReservation 'RESERVA'
    $reservation=$candidateReservation
    $published=& $Publish $first; Assert-StepApproved $published 'PUBLICACAO'
    if ($published.statusSha256 -cnotmatch '^[a-f0-9]{64}$' -or $published.stateHash -cne $first.stateHash) { Stop-Retomada 'RETOMADA_PUBLICACAO_DIVERGENTE' }
    $verified=& $Verify $first $published; Assert-StepApproved $verified 'VERIFICACAO'
    if ($verified.verified -isnot [bool] -or !$verified.verified -or $verified.statusSha256 -cne $published.statusSha256 -or $verified.stateHash -cne $first.stateHash) { Stop-Retomada 'RETOMADA_RECIBO_RECUSADO' }
    $last=& $Revalidate $first; Assert-StepApproved $last 'REVALIDACAO'
    if ($last.mode -ne $first.mode -or $last.stateHash -cne $first.stateHash -or $last.manifestHash -cne $first.manifestHash -or $last.hashesVerified -ne 27 -or $last.patchApplyRequired -ne $false) { Stop-Retomada 'RETOMADA_ALTERACAO_POSTERIOR' }
    # Verificacao final depois da coleta: nao prolonga o prazo do status observado.
    $final=& $Verify $last $published; Assert-StepApproved $final 'VERIFICACAO_FINAL'
    if ($final.verified -isnot [bool] -or !$final.verified -or $final.statusSha256 -cne $published.statusSha256 -or $final.stateHash -cne $first.stateHash) { Stop-Retomada 'RETOMADA_RECIBO_FINAL_RECUSADO' }
    & $Launch $last $published
  } finally { if ($null -ne $reservation) { & $ReleaseReservation $reservation | Out-Null } }
}
function Assert-CurrentActors($Snapshot) {
  $root=$Snapshot.backendRoot
  foreach ($item in @(@{actor=$Snapshot.controller;entry='substituir-controlador-selado.cjs'},@{actor=$Snapshot.supervisor;entry='iniciar-supervisor-substituido.cjs'})) {
    $actor=$item.actor;$native=Get-CimInstance Win32_Process -Filter ('ProcessId='+$actor.pid) -ErrorAction Stop
    $entry=[regex]::Escape((Join-Path $root ('scripts/'+$item.entry)))
    if ($null -eq $native -or $native.Name -ne 'node.exe' -or $native.ParentProcessId -ne $actor.parentPid -or $native.CreationDate.ToUniversalTime().ToString('o') -cne $actor.criadoEm -or $native.CommandLine -notmatch ('^\s*(?:"[^"]+"|\S+)\s+(?:"'+$entry+'"|'+$entry+')(?=\s|$)')) { Stop-Retomada 'RETOMADA_IDENTIDADE_RECUSADA' }
  }
  $listeners=@(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction Stop)
  if ($listeners.Count -ne 1 -or $listeners[0].OwningProcess -ne $Snapshot.supervisorPid -or $listeners[0].LocalAddress -ne '127.0.0.1') { Stop-Retomada 'RETOMADA_LISTENER_RECUSADO' }
  $code=$null
  try { $res=Invoke-WebRequest -Uri 'http://127.0.0.1:3001/perfil' -UseBasicParsing -TimeoutSec 5; $code=[int]$res.StatusCode }
  catch { if ($_.Exception.Response) { $code=[int]$_.Exception.Response.StatusCode } else { Stop-Retomada 'RETOMADA_HTTP_INACESSIVEL' } }
  if ($code -ne 503) { Stop-Retomada 'RETOMADA_HTTP_NAO_SELADO' }
}
function Get-CurrentRetomada {
  $raw=& node (Join-Path $PSScriptRoot 'snapshot-retomada.cjs') --verificar
  $exitCode=$LASTEXITCODE
  if ($exitCode -ne 0 -or $raw -is [array]) { Stop-Retomada 'RETOMADA_SNAPSHOT_RECUSADO' }
  try { $s=ConvertFrom-Json -InputObject $raw -ErrorAction Stop } catch { Stop-Retomada 'RETOMADA_SNAPSHOT_RECUSADO' }
  Assert-StepApproved $s 'SNAPSHOT'
  Assert-PrivateAcl $s.privateDir; Assert-PrivateAcl $s.stateFile -AllowInherited
  Assert-CurrentActors $s
  return $s
}
function Assert-CorrectionBundle([string]$ExpectedHash) {
  if ($ExpectedHash -cnotmatch '^[a-f0-9]{64}$') { Stop-Retomada 'RETOMADA_PACOTE_CORRECAO_OBRIGATORIO' }
  $file=Join-Path $PSScriptRoot 'manifest-correcao.json'
  if ((Get-FileBytesHash $file) -cne $ExpectedHash) { Stop-Retomada 'RETOMADA_PACOTE_CORRECAO_ALTERADO' }
  $m=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($file))
  if ($m.files.Count -ne 6) { Stop-Retomada 'RETOMADA_PACOTE_CORRECAO_INCOMPLETO' }
  foreach ($item in $m.files) {
    $target=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot $item.file))
    if ([IO.Path]::GetDirectoryName($target) -ine $PSScriptRoot) { Stop-Retomada 'RETOMADA_PACOTE_CAMINHO_RECUSADO' }
    Assert-NoReparse $target
    if ((Get-FileBytesHash $target) -cne $item.sha256) { Stop-Retomada 'RETOMADA_CORRECAO_ALTERADA' }
  }
}
function Read-PrivateObservation([string]$File,$Snapshot) {
  if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($File)) -ine $Snapshot.privateDir) { Stop-Retomada 'STATUS_OBSERVACAO_FORA_DO_DIRETORIO' }
  Assert-PrivateAcl $File
  return (New-Object Text.UTF8Encoding($false,$true)).GetString([IO.File]::ReadAllBytes($File))
}
