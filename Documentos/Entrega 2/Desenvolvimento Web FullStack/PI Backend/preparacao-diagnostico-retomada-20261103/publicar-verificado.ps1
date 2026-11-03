param([switch]$AutorizarPublicacao,[string]$ObservacaoFile,[string]$StatusFile,[string]$ExpectedDestinationHash)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'processo-verificado.ps1')
$original=Join-Path $PSScriptRoot '../preparacao-retomada-status-20261102'
. (Join-Path $original 'sequencia-segura.ps1')
try {
  if (!$AutorizarPublicacao) { throw 'PUBLICACAO_NAO_AUTORIZADA' }
  # Pacote anterior imutavel: nao confiar num helper escolhido por argumento.
  $approved='43ba0c318f92caee38d3ec38b41ff33057ec10525052935960324fde85074a33'
  Assert-CorrectionBundle $approved
  $result=Invoke-VerifiedHelper -ScriptFile (Join-Path $original 'publicar-status.ps1') -Arguments @('-AutorizarPublicacao','-CorrecaoSha256',$approved,'-ObservacaoFile',$ObservacaoFile,'-StatusFile',$StatusFile,'-ExpectedDestinationHash',$ExpectedDestinationHash)
  $result | ConvertTo-Json -Compress -Depth 8
  exit 0
} catch {
  # Nao imprimir excecoes, argumentos, stdout/stderr ou segredos do helper.
  [pscustomobject]@{ok=$false;exit_code=1;code='PUBLICACAO_PROCESSO_RECUSADO';maintenanceReleased=$false}|ConvertTo-Json -Compress
  exit 1
}
