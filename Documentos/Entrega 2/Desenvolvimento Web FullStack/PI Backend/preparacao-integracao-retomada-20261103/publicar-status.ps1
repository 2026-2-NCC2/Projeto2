param([switch]$AutorizarPublicacao,[string]$CorrecaoSha256,[string]$ObservacaoFile,[string]$StatusFile,[string]$ExpectedDestinationHash)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'sequencia-segura.ps1')
try {
  if (!$AutorizarPublicacao) { Stop-Retomada 'STATUS_PUBLICACAO_NAO_AUTORIZADA' }
  Assert-CorrectionBundle $CorrecaoSha256
  # Sem Node auxiliar durante o inventario do candidato. Somente estado/nativo/503.
  $pins=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'origem-operacional.json')))
  $dir=Join-Path $env:USERPROFILE 'BackupsTrocaTicket/SupervisorCutover'; $stateFile=Join-Path $dir 'estado.json'
  Assert-PrivateAcl $dir; Assert-StatusState $stateFile $pins.expectedStateSha256
  $e=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($stateFile))
  $s=[pscustomobject]@{backendRoot=(Split-Path $PSScriptRoot);privateDir=$dir;controller=$e.controleSelado.controlador;supervisor=$e.controleSelado.supervisor;controllerPid=$e.controleSelado.controlador.pid;supervisorPid=$e.transicao.pidDestino}
  Assert-CurrentActors $s
  if ([IO.Path]::GetFullPath($ObservacaoFile) -ieq [IO.Path]::GetFullPath($StatusFile)) { Stop-Retomada 'STATUS_OBSERVACAO_IGUAL_DESTINO' }
  $json=Read-PrivateObservation $ObservacaoFile $s
  Publish-StatusAtomico -Directory $dir -Destination $StatusFile -StateFile $stateFile -ExpectedStateHash $pins.expectedStateSha256 -ExpectedDestinationHash $ExpectedDestinationHash -StatusJson $json -ControllerPid $s.controllerPid -SupervisorPid $s.supervisorPid | ConvertTo-Json -Compress
} catch {
  $code='STATUS_PUBLICACAO_INTERROMPIDA';if ($_.Exception.Data.Contains('Code')) { $code=$_.Exception.Data['Code'] }
  [pscustomobject]@{ok=$false;exit_code=1;code=$code;maintenanceReleased=$false} | ConvertTo-Json -Compress
  exit 1
}
