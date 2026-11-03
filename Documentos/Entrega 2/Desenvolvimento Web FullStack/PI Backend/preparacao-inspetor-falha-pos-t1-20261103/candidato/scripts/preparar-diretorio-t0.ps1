param([Parameter(Mandatory=$true)][string]$Destino)
$ErrorActionPreference='Stop'
$base=Join-Path $env:USERPROFILE 'BackupsTrocaTicket'
$target=[IO.Path]::GetFullPath($Destino)
if((Split-Path -Parent $target) -ne [IO.Path]::GetFullPath($base) -or (Split-Path -Leaf $target) -notmatch '^t0-[a-f0-9]{32}$'){throw 'T0_DESTINO_INVALIDO'}
if(Test-Path -LiteralPath $target){throw 'T0_DESTINO_EXISTENTE'}
$cursor=Get-Item -LiteralPath $base
while($null -ne $cursor){if($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'T0_REPARSE_RECUSADO'};$cursor=$cursor.Parent}
New-Item -ItemType Directory -Path $target|Out-Null
$acl=New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true,$false)
$current=[Security.Principal.WindowsIdentity]::GetCurrent().User
foreach($sid in @($current,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))){
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
}
Set-Acl -LiteralPath $target -AclObject $acl
$check=Get-Acl -LiteralPath $target
if(!$check.AreAccessRulesProtected){throw 'T0_ACL_RECUSADA'}
foreach($r in $check.Access){if($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($current.Value,'S-1-5-18')){throw 'T0_ACL_RECUSADA'}}
Write-Output '{"privateAclVerified":true}'
