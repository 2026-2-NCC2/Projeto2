Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
# Somente helpers curtos. Nunca usar para iniciar/matar o controlador persistente.
function ConvertTo-NativeArgument([string]$Value) {
  if ($null -eq $Value -or $Value.IndexOf([char]0) -ge 0 -or $Value -match '[\r\n]') { throw 'PROCESSO_ARGUMENTO_INVALIDO' }
  # CommandLineToArgvW: duplicar barras antes de aspas e antes da aspa final.
  return '"'+[regex]::Replace([regex]::Replace($Value,'(\\*)"','$1$1\"'),'(\\+)$','$1$1')+'"'
}
function Assert-ProcessReceipt($Result) {
  if ($null -eq $Result -or $Result -is [array] -or $Result.PSObject.Properties.Name -notcontains 'ok' -or $Result.ok -isnot [bool] -or !$Result.ok -or $Result.PSObject.Properties.Name -notcontains 'exit_code' -or $Result.exit_code -isnot [int] -or $Result.exit_code -ne 0) { throw 'PROCESSO_RECIBO_INVALIDO' }
}
function Invoke-VerifiedHelper {
  param([Parameter(Mandatory=$true)][string]$ScriptFile,[string[]]$Arguments=@(),[ValidateRange(100,15000)][int]$TimeoutMs=10000)
  $file=[IO.Path]::GetFullPath($ScriptFile)
  if (![IO.File]::Exists($file) -or [IO.Path]::GetExtension($file) -ine '.ps1' -or ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'PROCESSO_SCRIPT_INVALIDO' }
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=Join-Path $PSHOME 'powershell.exe'
  $info.Arguments=(@('-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',$file)+$Arguments | ForEach-Object {ConvertTo-NativeArgument $_}) -join ' '
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $process=New-Object Diagnostics.Process
  $process.StartInfo=$info
  try {
    if (!$process.Start()) { throw 'PROCESSO_NAO_INICIADO' }
    $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
    if (!$process.WaitForExit($TimeoutMs)) {
      # Este handle pertence exclusivamente ao helper filho criado nesta chamada.
      $process.Kill();$process.WaitForExit();throw 'PROCESSO_TIMEOUT_SEM_RETRY'
    }
    $code=$process.ExitCode
    $out=$stdout.GetAwaiter().GetResult();$err=$stderr.GetAwaiter().GetResult()
    if ($code -ne 0) { throw 'PROCESSO_EXIT_NAO_ZERO' }
    if ($err.Length -ne 0 -or $out.Length -gt 65536) { throw 'PROCESSO_SAIDA_RECUSADA' }
    try {$receipt=ConvertFrom-Json -InputObject $out -ErrorAction Stop} catch {throw 'PROCESSO_JSON_INVALIDO'}
    Assert-ProcessReceipt $receipt
    return $receipt
  } finally {$process.Dispose()}
}
