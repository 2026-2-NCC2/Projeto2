param([string]$CorrecaoSha256,[switch]$AutorizarPublicacao,[string]$ObservacaoFile,[string]$StatusFile,[string]$ExpectedDestinationHash)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'processo-verificado.ps1')
$original=$PSScriptRoot
. (Join-Path $original 'sequencia-segura.ps1')
try {
  if (!$AutorizarPublicacao) { throw 'PUBLICACAO_NAO_AUTORIZADA' }
  # Pacote anterior imutavel: nao confiar num helper escolhido por argumento.
  $approved=$CorrecaoSha256
  Assert-CorrectionBundle $approved
  $result=Invoke-VerifiedHelper -ScriptFile (Join-Path $original 'publicar-status.ps1') -Arguments @('-AutorizarPublicacao','-CorrecaoSha256',$approved,'-ObservacaoFile',$ObservacaoFile,'-StatusFile',$StatusFile,'-ExpectedDestinationHash',$ExpectedDestinationHash)
  $result | ConvertTo-Json -Compress -Depth 8
  exit 0
} catch {
  # Nao imprimir excecoes, argumentos, stdout/stderr ou segredos do helper.
  [pscustomobject]@{ok=$false;exit_code=1;code='PUBLICACAO_PROCESSO_RECUSADO';maintenanceReleased=$false}|ConvertTo-Json -Compress
  exit 1
}
