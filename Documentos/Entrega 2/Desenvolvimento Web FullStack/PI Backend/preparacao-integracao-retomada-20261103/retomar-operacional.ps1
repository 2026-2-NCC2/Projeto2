param([ValidateSet('Verificar','Retomar')][string]$Modo='Verificar',[switch]$AutorizarRetomada,[string]$CorrecaoSha256,[string]$ObservacaoFile,[string]$StatusFile,[string]$ReferenciaAutorizacao)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'sequencia-segura.ps1')
. (Join-Path $PSScriptRoot 'processo-verificado.ps1')
try {
  if ($Modo -eq 'Verificar') {
    if ($AutorizarRetomada) { Stop-Retomada 'RETOMADA_FLAGS_CONFLITANTES' }
    Get-CurrentRetomada | ConvertTo-Json -Depth 8 -Compress; exit 0
  }
  if (!$AutorizarRetomada) { Stop-Retomada 'RETOMADA_NAO_AUTORIZADA' }
  Assert-CorrectionBundle $CorrecaoSha256
  if ([string]::IsNullOrWhiteSpace($ReferenciaAutorizacao) -or $ReferenciaAutorizacao.Trim().Length -lt 8) { Stop-Retomada 'RETOMADA_AUTORIZACAO_AUSENTE' }
  Invoke-RetomadaGuardada -Authorized $true -Preflight { Get-CurrentRetomada } -AcquireReservation {
    param($s) Enter-StatusLock (Join-Path $s.privateDir 'retomada-pos-t1.reserva')
  } -ReleaseReservation { param($lock) Exit-StatusLock $lock } -Publish {
    param($s)
    $json=Read-PrivateObservation $ObservacaoFile $s
    if ([IO.Path]::GetFullPath($ObservacaoFile) -ieq [IO.Path]::GetFullPath($StatusFile)) { Stop-Retomada 'STATUS_OBSERVACAO_IGUAL_DESTINO' }
    $expected='AUSENTE';if ([IO.File]::Exists($StatusFile)) { $expected=Get-FileBytesHash $StatusFile }
    Invoke-VerifiedHelper -ScriptFile (Join-Path $PSScriptRoot 'publicar-status.ps1') -Arguments @('-AutorizarPublicacao','-CorrecaoSha256',$CorrecaoSha256,'-ObservacaoFile',$ObservacaoFile,'-StatusFile',$StatusFile,'-ExpectedDestinationHash',$expected)
  } -Verify {
    param($s,$receipt) Confirm-StatusReceipt $receipt $s.privateDir $s.stateFile $s.stateHash $s.controllerPid $s.supervisorPid
  } -Revalidate { param($s) Get-CurrentRetomada } -Launch {
    param($s,$receipt)
    [pscustomobject]@{phase='STATUS_VERIFICADO_ANTES_DO_LANCADOR';statusSha256=$receipt.statusSha256;stateHash=$s.stateHash;file=$receipt.file} | ConvertTo-Json -Compress
    # Unica invocacao oficial. Nao recebe T1/smoke/liberacao; stdin permanece herdado.
    & node (Join-Path $s.backendRoot 'scripts/substituir-controlador-selado.cjs') --implantar-correcao-pos-t1-selada --autorizar-implantacao-pos-t1 --pacote $s.packageFile --pacote-sha256 $s.packageSha256 --status-origem $receipt.file --autorizacao $ReferenciaAutorizacao
    $codigoLancador=$LASTEXITCODE
    if ($codigoLancador -ne 0) { Stop-Retomada 'RETOMADA_LANCADOR_RECUSADO' }
  }
} catch {
  $code='RETOMADA_INTERROMPIDA';if ($_.Exception.Data.Contains('Code')) { $code=$_.Exception.Data['Code'] }
  [pscustomobject]@{ok=$false;exit_code=1;code=$code;maintenanceReleased=$false} | ConvertTo-Json -Compress
  exit 1
}
