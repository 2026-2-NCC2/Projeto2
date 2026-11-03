$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../sequencia-segura.ps1')
$result=ConvertFrom-Json -InputObject ([IO.File]::ReadAllText((Join-Path $PSScriptRoot '../resultado-preparacao.json')))
Assert-CorrectionBundle $result.correctionManifestSha256
$rejected=$false
try { Assert-CorrectionBundle ('0'*64) } catch { $rejected=$_.Exception.Data['Code'] -ceq 'RETOMADA_PACOTE_CORRECAO_ALTERADO' }
if (!$rejected) { throw 'HASH_INCORRETO_NAO_RECUSADO' }
foreach($file in (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..') -Filter '*.ps1')+(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1')) {
  $tokens=$null;$errors=$null;$null=[System.Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
  if ($errors.Count -gt 0) { throw 'SINTAXE_POWERSHELL_REPROVADA' }
}
Write-Output 'MANIFESTO_CORRECAO_VALIDO'
Write-Output 'HASH_INCORRETO_RECUSADO'
Write-Output 'SINTAXE_POWERSHELL_APROVADA'
