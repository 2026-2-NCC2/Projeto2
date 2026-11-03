Set-StrictMode -Version Latest

function Stop-Retomada([string]$Code) {
  $erro = New-Object InvalidOperationException($Code)
  $erro.Data['Code'] = $Code
  throw $erro
}
function Get-BytesHash([byte[]]$Bytes) {
  $algoritmo = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($algoritmo.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() }
  finally { $algoritmo.Dispose() }
}
function Get-FileBytesHash([string]$File) { return Get-BytesHash ([IO.File]::ReadAllBytes($File)) }
function Assert-NoReparse([string]$Path) {
  $atual = [IO.Path]::GetFullPath($Path)
  while ($atual) {
    if ([IO.File]::Exists($atual) -or [IO.Directory]::Exists($atual)) {
      if (([IO.File]::GetAttributes($atual) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { Stop-Retomada 'STATUS_REPARSE_RECUSADO' }
    }
    $pai = [IO.Path]::GetDirectoryName($atual)
    if ($pai -eq $atual) { break }; $atual = $pai
  }
}
function New-PrivateFileSecurity {
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = New-Object Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true,$false); $acl.SetOwner($sid)
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')))
  $system = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($system,'FullControl','Allow')))
  return $acl
}
function Assert-PrivateAcl([string]$Path,[switch]$AllowInherited) {
  Assert-NoReparse $Path
  $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
  if ((!$AllowInherited -and !$acl.AreAccessRulesProtected) -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid) { Stop-Retomada 'STATUS_ACL_RECUSADA' }
  $temUsuario = $false
  foreach ($regra in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
    if ($regra.AccessControlType -ne 'Allow') { continue }
    if ($regra.IdentityReference.Value -notin @($sid,'S-1-5-18')) { Stop-Retomada 'STATUS_ACL_RECUSADA' }
    if ($regra.IdentityReference.Value -eq $sid -and ($regra.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $temUsuario = $true }
  }
  if (!$temUsuario) { Stop-Retomada 'STATUS_ACL_RECUSADA' }
}
function New-PrivateStream([string]$Path) {
  return [IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::FullControl,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough,(New-PrivateFileSecurity))
}
function Enter-StatusLock([string]$Path) {
  $id = [guid]::NewGuid().ToString()
  try { $stream = New-PrivateStream $Path } catch { Stop-Retomada 'STATUS_LOCK_OCUPADO' }
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($id); $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true)
    return [pscustomobject]@{ok=$true;exit_code=0;path=$Path;id=$id;stream=$stream}
  } catch { $stream.Dispose(); throw }
}
function Exit-StatusLock($Lock) {
  $Lock.stream.Dispose()
  if ([IO.File]::ReadAllText($Lock.path) -cne $Lock.id) { Stop-Retomada 'STATUS_LOCK_DONO_DIVERGENTE' }
  [IO.File]::Delete($Lock.path)
}
function Assert-StatusState([string]$StateFile,[string]$ExpectedStateHash) {
  Assert-PrivateAcl $StateFile -AllowInherited
  if ((Get-FileBytesHash $StateFile) -cne $ExpectedStateHash) { Stop-Retomada 'STATUS_ESTADO_ALTERADO' }
}
function Convert-StatusObservado([string]$Json,[int]$ControllerPid,[int]$SupervisorPid,[long]$Now,[switch]$AllowExpired) {
  if ([string]::IsNullOrWhiteSpace($Json) -or $Json.Length -gt 2048 -or $Json[0] -eq [char]0xFEFF) { Stop-Retomada 'STATUS_JSON_RECUSADO' }
  try { $s = ConvertFrom-Json -InputObject $Json -ErrorAction Stop } catch { Stop-Retomada 'STATUS_JSON_RECUSADO' }
  if ($null -eq $s -or $s -is [array]) { Stop-Retomada 'STATUS_JSON_RECUSADO' }
  $keys = @($s.PSObject.Properties.Name | Sort-Object)
  if (($keys -join ',') -cne 'controllerPid,nonce,ok,pedido,supervisorPid,verificadoEm') { Stop-Retomada 'STATUS_CAMPOS_RECUSADOS' }
  if ($s.ok -isnot [bool] -or !$s.ok -or $s.controllerPid -isnot [int] -or $s.supervisorPid -isnot [int] -or $s.controllerPid -ne $ControllerPid -or $s.supervisorPid -ne $SupervisorPid) { Stop-Retomada 'STATUS_IDENTIDADE_RECUSADA' }
  if ($s.verificadoEm -isnot [long] -and $s.verificadoEm -isnot [int]) { Stop-Retomada 'STATUS_HORARIO_RECUSADO' }
  foreach ($k in @('pedido','nonce')) { if ($s.$k -isnot [string] -or $s.$k -cnotmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') { Stop-Retomada 'STATUS_UUID_RECUSADO' } }
  if ($s.verificadoEm -gt $Now -or (!$AllowExpired -and $Now - $s.verificadoEm -gt 30000)) { Stop-Retomada 'STATUS_EXPIRADO' }
  $canonical = [ordered]@{pedido=$s.pedido;ok=$true;controllerPid=$s.controllerPid;supervisorPid=$s.supervisorPid;nonce=$s.nonce;verificadoEm=$s.verificadoEm} | ConvertTo-Json -Compress
  return [pscustomobject]@{status=$s;bytes=([Text.Encoding]::UTF8.GetBytes($canonical))}
}
function Confirm-StatusReceipt {
  param($Receipt,[string]$Directory,[string]$StateFile,[string]$ExpectedStateHash,[int]$ControllerPid,[int]$SupervisorPid)
  if ($null -eq $Receipt -or $Receipt -is [array] -or !$Receipt.ok -or $Receipt.exit_code -ne 0 -or $Receipt.stateHash -cne $ExpectedStateHash) { Stop-Retomada 'STATUS_RECIBO_RECUSADO' }
  $destino = [IO.Path]::GetFullPath($Receipt.file)
  if ([IO.Path]::GetDirectoryName($destino) -ine [IO.Path]::GetFullPath($Directory)) { Stop-Retomada 'STATUS_CAMINHO_RECUSADO' }
  Assert-PrivateAcl $Directory; Assert-PrivateAcl $destino; Assert-StatusState $StateFile $ExpectedStateHash
  $bytes = [IO.File]::ReadAllBytes($destino)
  if ((Get-BytesHash $bytes) -cne $Receipt.statusSha256) { Stop-Retomada 'STATUS_LEITURA_DIVERGENTE' }
  $null = Convert-StatusObservado ([Text.Encoding]::UTF8.GetString($bytes)) $ControllerPid $SupervisorPid ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
  return [pscustomobject]@{ok=$true;exit_code=0;verified=$true;statusSha256=$Receipt.statusSha256;stateHash=$ExpectedStateHash}
}
function Publish-StatusAtomico {
  param([string]$Directory,[string]$Destination,[string]$StateFile,[string]$ExpectedStateHash,[string]$ExpectedDestinationHash,[string]$StatusJson,[int]$ControllerPid,[int]$SupervisorPid,[hashtable]$TestHooks=@{})
  $ErrorActionPreference = 'Stop'
  $dir = [IO.Path]::GetFullPath($Directory); $dest = [IO.Path]::GetFullPath($Destination)
  if ([IO.Path]::GetDirectoryName($dest) -ine $dir -or [IO.Path]::GetFileName($dest) -cnotmatch '^status-origem-[a-zA-Z0-9-]+\.json$' -or [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($StateFile)) -ine $dir) { Stop-Retomada 'STATUS_CAMINHO_RECUSADO' }
  if ($ExpectedStateHash -cnotmatch '^[a-f0-9]{64}$' -or ($ExpectedDestinationHash -cne 'AUSENTE' -and $ExpectedDestinationHash -cnotmatch '^[a-f0-9]{64}$')) { Stop-Retomada 'STATUS_HASH_RECUSADO' }
  Assert-PrivateAcl $dir; Assert-StatusState $StateFile $ExpectedStateHash
  $inputStatus = Convert-StatusObservado $StatusJson $ControllerPid $SupervisorPid ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
  $newHash = Get-BytesHash $inputStatus.bytes; $lock = $null; $temp = $null; $ownTemp = $false; $receipt = $null
  try {
    $lock = Enter-StatusLock ($dest+'.publicacao.lock')
    Assert-StatusState $StateFile $ExpectedStateHash
    $exists = [IO.File]::Exists($dest); $oldHash = 'AUSENTE'; $oldStatus = $null
    if ($exists) {
      Assert-PrivateAcl $dest; $oldBytes = [IO.File]::ReadAllBytes($dest); $oldHash = Get-BytesHash $oldBytes
      $oldStatus = Convert-StatusObservado ([Text.Encoding]::UTF8.GetString($oldBytes)) $ControllerPid $SupervisorPid ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -AllowExpired
    }
    if ($oldHash -ceq $newHash) {
      $receipt = [pscustomobject]@{ok=$true;exit_code=0;file=$dest;statusSha256=$newHash;stateHash=$ExpectedStateHash;updated=$false}
    } else {
      if ($oldHash -cne $ExpectedDestinationHash) { Stop-Retomada 'STATUS_COMPARE_AND_SWAP_RECUSADO' }
      if ($oldStatus -and ($inputStatus.status.verificadoEm -le $oldStatus.status.verificadoEm -or $inputStatus.status.pedido -ceq $oldStatus.status.pedido -or $inputStatus.status.nonce -ceq $oldStatus.status.nonce)) { Stop-Retomada 'STATUS_REGRESSAO_OU_REPLAY' }
      $temp = Join-Path $dir ('.status-'+[guid]::NewGuid().ToString()+'.tmp')
      $stream = New-PrivateStream $temp; $ownTemp = $true
      try { $stream.Write($inputStatus.bytes,0,$inputStatus.bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
      Assert-PrivateAcl $temp
      if ((Get-FileBytesHash $temp) -cne $newHash) { Stop-Retomada 'STATUS_TEMP_DIVERGENTE' }
      if ($TestHooks.ContainsKey('BeforeCommit')) { & $TestHooks.BeforeCommit $temp $dest | Out-Null }
      Assert-StatusState $StateFile $ExpectedStateHash
      $null = Convert-StatusObservado $StatusJson $ControllerPid $SupervisorPid ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
      if ($exists) { if ((Get-FileBytesHash $dest) -cne $oldHash) { Stop-Retomada 'STATUS_COMPARE_AND_SWAP_RECUSADO' } }
      elseif ([IO.File]::Exists($dest)) { Stop-Retomada 'STATUS_COMPARE_AND_SWAP_RECUSADO' }
      if ($exists) { [IO.File]::Replace($temp,$dest,[System.Management.Automation.Language.NullString]::Value) }
      else { [IO.File]::Move($temp,$dest) }
      if ($TestHooks.ContainsKey('AfterCommit')) { & $TestHooks.AfterCommit $dest | Out-Null }
      $receipt = [pscustomobject]@{ok=$true;exit_code=0;file=$dest;statusSha256=$newHash;stateHash=$ExpectedStateHash;updated=$true}
    }
    $null = Confirm-StatusReceipt $receipt $dir $StateFile $ExpectedStateHash $ControllerPid $SupervisorPid
  } finally {
    # Somente temporario e lock desta chamada; destino nunca e apagado/restaurado.
    try { if ($ownTemp -and [IO.File]::Exists($temp)) { [IO.File]::Delete($temp) } }
    finally { if ($lock) { Exit-StatusLock $lock } }
  }
  return $receipt
}
