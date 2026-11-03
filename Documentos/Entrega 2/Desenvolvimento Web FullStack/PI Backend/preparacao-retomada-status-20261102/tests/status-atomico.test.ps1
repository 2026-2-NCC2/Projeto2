$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../sequencia-segura.ps1')
$script:passed=0
$script:root=Join-Path $PSScriptRoot ('artefatos-'+[guid]::NewGuid().ToString())
$null=New-Item -ItemType Directory -Path $script:root
function Check([bool]$Condition,[string]$Message) { if (!$Condition) { throw $Message } }
function Case([string]$Name,[scriptblock]$Body) { & $Body; $script:passed++; Write-Output ('APROVADO: '+$Name) }
function PrivateDir([string]$Dir) {
  $null=New-Item -ItemType Directory -Path $Dir
  $acl=New-Object Security.AccessControl.DirectorySecurity;$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
  foreach ($who in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) { $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($who,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))) }
  Set-Acl -LiteralPath $Dir -AclObject $acl
}
function WritePrivate([string]$File,[byte[]]$Bytes) { $s=New-PrivateStream $File;try{$s.Write($Bytes,0,$Bytes.Length);$s.Flush($true)}finally{$s.Dispose()} }
function Status([long]$Time=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())) { return ([ordered]@{pedido=[guid]::NewGuid().ToString();ok=$true;controllerPid=11;supervisorPid=22;nonce=[guid]::NewGuid().ToString();verificadoEm=$Time}|ConvertTo-Json -Compress) }
function Fixture {
  $dir=Join-Path $script:root ([guid]::NewGuid().ToString());PrivateDir $dir
  $state=Join-Path $dir 'estado.json';WritePrivate $state ([Text.Encoding]::UTF8.GetBytes('{"ficticio":true}'))
  $dest=Join-Path $dir 'status-origem-ficticio.json';$old=Status ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-1000)
  WritePrivate $dest ([Text.Encoding]::UTF8.GetBytes($old))
  return @{Directory=$dir;Destination=$dest;StateFile=$state;ExpectedStateHash=(Get-FileBytesHash $state);ExpectedDestinationHash=(Get-FileBytesHash $dest);StatusJson=(Status);ControllerPid=11;SupervisorPid=22}
}
function Refused([scriptblock]$Body,[string]$Code='') {
  $failed=$false;try{& $Body|Out-Null}catch{$failed=$true;if($Code){Check ($_.Exception.Data['Code'] -ceq $Code) ('Codigo inesperado: '+$_.Exception.Message)}}
  Check $failed 'A operacao deveria ser recusada'
}
Case 'reproduz null PowerShell e valida nulo CLR em arquivos descartaveis' {
  $f=Fixture;$tmp=Join-Path $f.Directory 'repro.tmp';WritePrivate $tmp ([Text.Encoding]::UTF8.GetBytes('novo'));$old=$f.ExpectedDestinationHash
  $failed=$false;try{[IO.File]::Replace($tmp,$f.Destination,$null)}catch{$failed=$_.Exception.InnerException -is [ArgumentException]};Check $failed 'Falha original nao reproduzida';Check ((Get-FileBytesHash $f.Destination)-ceq $old) 'Destino alterado na falha'
  [IO.File]::Replace($tmp,$f.Destination,[System.Management.Automation.Language.NullString]::Value);Check ([IO.File]::ReadAllText($f.Destination)-ceq 'novo') 'Nulo CLR nao substituiu'
}
Case 'publicacao atomica confirma bytes ACL privada e ausencia de BOM' {
  $f=Fixture;$r=Publish-StatusAtomico @f;Check ($r.ok -and $r.updated) 'Sem recibo';Assert-PrivateAcl $f.Destination
  $b=[IO.File]::ReadAllBytes($f.Destination);Check ($b[0] -ne 239) 'BOM';Check ((Get-BytesHash $b)-ceq $r.statusSha256) 'Hash divergente';Check (![IO.File]::Exists($f.Destination+'.publicacao.lock')) 'Lock nao liberado'
}
Case 'criacao inicial usa rename exclusivo sem publicar arquivo vazio' {
  $f=Fixture;$f.Destination=Join-Path $f.Directory 'status-origem-inicial.json';$f.ExpectedDestinationHash='AUSENTE';$r=Publish-StatusAtomico @f;Check $r.updated 'Nao criou';Check (([IO.File]::ReadAllBytes($f.Destination)).Length -gt 0) 'Arquivo vazio'
}
Case 'retomada identica nao substitui destino novamente' {
  $f=Fixture;$a=Publish-StatusAtomico @f;$time=[IO.File]::GetLastWriteTimeUtc($f.Destination);$b=Publish-StatusAtomico @f;Check (!$b.updated) 'Repetiu commit';Check ($a.statusSha256 -ceq $b.statusSha256) 'Hash mudou';Check ([IO.File]::GetLastWriteTimeUtc($f.Destination)-eq $time) 'Regravou'
}
Case 'status antigo vencido pode ser sucedido por observacao nova verdadeira' {
  $f=Fixture;$old=Convert-StatusObservado (Status ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-60000)) 11 22 ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -AllowExpired
  [IO.File]::WriteAllBytes($f.Destination,$old.bytes);$f.ExpectedDestinationHash=Get-FileBytesHash $f.Destination;Check ((Publish-StatusAtomico @f).ok) 'Nao renovou'
}
foreach ($change in @(
  @{name='observacao vencida';fn={param($f) $f.StatusJson=Status ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-31000)}},
  @{name='horario futuro';fn={param($f) $f.StatusJson=Status ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+60000)}},
  @{name='PID divergente';fn={param($f) $s=ConvertFrom-Json $f.StatusJson;$s.controllerPid=99;$f.StatusJson=$s|ConvertTo-Json -Compress}},
  @{name='campo privado adicional';fn={param($f) $s=ConvertFrom-Json $f.StatusJson;$s|Add-Member NoteProperty JWT_SECRET 'ficticio';$f.StatusJson=$s|ConvertTo-Json -Compress}},
  @{name='hash CAS divergente';fn={param($f) $f.ExpectedDestinationHash='0'*64}},
  @{name='caminho fora do diretorio';fn={param($f) $f.Destination=Join-Path $script:root 'status-origem-fora.json'}},
  @{name='JSON invalido';fn={param($f) $f.StatusJson='{}'}},
  @{name='JSON com BOM';fn={param($f) $f.StatusJson=[char]0xFEFF+$f.StatusJson}},
  @{name='UUID forjado';fn={param($f) $s=ConvertFrom-Json $f.StatusJson;$s.nonce='nao-uuid';$f.StatusJson=$s|ConvertTo-Json -Compress}}
)) {
  Case ('recusa '+$change.name) { $f=Fixture;$file=$f.Destination;$old=Get-FileBytesHash $file;& $change.fn $f;Refused {Publish-StatusAtomico @f};Check ((Get-FileBytesHash $file)-ceq $old) 'Destino alterado';Check (![IO.File]::Exists($file+'.publicacao.lock')) 'Lock remanescente' }
}
Case 'replay com mesmo pedido e outro horario e recusado' {
  $f=Fixture;$old=ConvertFrom-Json ([IO.File]::ReadAllText($f.Destination));$s=ConvertFrom-Json $f.StatusJson;$s.pedido=$old.pedido;$f.StatusJson=$s|ConvertTo-Json -Compress;Refused {Publish-StatusAtomico @f} 'STATUS_REGRESSAO_OU_REPLAY'
}
Case 'interrupcao antes do commit conserva bytes anteriores' {
  $f=Fixture;$f.TestHooks=@{BeforeCommit={throw 'INTERRUPCAO_ISOLADA'}};Refused {Publish-StatusAtomico @f};Check ((Get-FileBytesHash $f.Destination)-ceq $f.ExpectedDestinationHash) 'Alterou antes do commit';Check (@([IO.Directory]::GetFiles($f.Directory,'.status-*.tmp')).Count -eq 0) 'Temporario proprio remanescente'
}
Case 'interrupcao depois do commit nao faz rollback e permite verificacao idempotente explicita' {
  $f=Fixture;$f.TestHooks=@{AfterCommit={throw 'RESPOSTA_INTERROMPIDA'}};Refused {Publish-StatusAtomico @f};Check ((Get-FileBytesHash $f.Destination)-cne $f.ExpectedDestinationHash) 'Nao houve commit';$f.Remove('TestHooks');$r=Publish-StatusAtomico @f;Check (!$r.updated -and $r.ok) 'Repetiu commit apos resposta incerta'
}
Case 'mudanca do estado apos staging bloqueia publicacao sem restaurar estado' {
  $f=Fixture;$statePath=$f.StateFile;$f.TestHooks=@{BeforeCommit={param($temp,$dest)[IO.File]::WriteAllText($statePath,'{"mudou":true}')}};Refused {Publish-StatusAtomico @f} 'STATUS_ESTADO_ALTERADO';Check ((Get-FileBytesHash $f.Destination)-ceq $f.ExpectedDestinationHash) 'Commit indevido';Check ((Get-FileBytesHash $f.StateFile)-cne $f.ExpectedStateHash) 'Restaurou estado'
}
Case 'lock preexistente nao e removido nem tomado por conveniencia' {
  $f=Fixture;$path=$f.Destination+'.publicacao.lock';WritePrivate $path ([Text.Encoding]::UTF8.GetBytes('outro-dono'));Refused {Publish-StatusAtomico @f} 'STATUS_LOCK_OCUPADO';Check ([IO.File]::ReadAllText($path)-ceq 'outro-dono') 'Removeu lock alheio'
}
Case 'ACL publica no destino e recusada' {
  $f=Fixture;$acl=[IO.File]::GetAccessControl($f.Destination,[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group);$everyone=New-Object Security.Principal.SecurityIdentifier('S-1-1-0');$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($everyone,'Read','Allow')));[IO.File]::SetAccessControl($f.Destination,$acl);Refused {Publish-StatusAtomico @f} 'STATUS_ACL_RECUSADA'
}
Case 'estado com ACL herdada privada e aceito sem modifica-la' {
  $f=Fixture;$acl=[IO.File]::GetAccessControl($f.StateFile,[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group);$acl.SetAccessRuleProtection($false,$true);[IO.File]::SetAccessControl($f.StateFile,$acl);$before=(Get-Acl -LiteralPath $f.StateFile).Sddl;Check ((Publish-StatusAtomico @f).ok) 'Estado privado herdado recusado';Check ((Get-Acl -LiteralPath $f.StateFile).Sddl -ceq $before) 'Alterou ACL do estado'
}
Case 'dois publicadores concorrentes nunca aprovam sobrescrita perdida' {
  $f=Fixture;$entered=New-Object Threading.ManualResetEvent($false);$release=New-Object Threading.ManualResetEvent($false);$worker=[PowerShell]::Create()
  $code={param($module,$f,$entered,$release) . $module;$f.TestHooks=@{BeforeCommit={param($temp,$dest)$null=$entered.Set();if(!$release.WaitOne(10000)){throw 'BARRIER_TIMEOUT'}}};Publish-StatusAtomico @f}
  $null=$worker.AddScript($code.ToString()).AddArgument((Join-Path $PSScriptRoot '../status-atomico.ps1')).AddArgument($f.Clone()).AddArgument($entered).AddArgument($release);$running=$worker.BeginInvoke()
  try { Check ($entered.WaitOne(5000)) 'Worker nao iniciou';Refused {Publish-StatusAtomico @f} 'STATUS_LOCK_OCUPADO';Check ((Get-FileBytesHash $f.Destination)-ceq $f.ExpectedDestinationHash) 'Destino visivel parcial';$null=$release.Set();$result=$worker.EndInvoke($running);Check (!$worker.HadErrors -and $result.Count -eq 1 -and $result[0].ok) 'Worker falhou';$g=$f.Clone();$g.StatusJson=Status ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds());Refused {Publish-StatusAtomico @g} 'STATUS_COMPARE_AND_SWAP_RECUSADO' }
  finally { $null=$release.Set();$worker.Dispose();$entered.Dispose();$release.Dispose() }
}
function GuardFixture {
  $g=@{launched=0;published=0;verified=0;released=0;reserved=0}
  $snapshot=[pscustomobject]@{ok=$true;exit_code=0;mode='APLICADO_AGUARDANDO_ADMISSAO';patchApplyRequired=$false;hashesVerified=27;stateHash=('a'*64);manifestHash=('b'*64)}
  $hooks=@{Authorized=$true;Preflight={$snapshot};AcquireReservation={param($s)$g.reserved++;[pscustomobject]@{ok=$true;exit_code=0}};ReleaseReservation={param($r)$g.released++};Publish={param($s)$g.published++;[pscustomobject]@{ok=$true;exit_code=0;statusSha256=('c'*64);stateHash=$snapshot.stateHash}};Verify={param($s,$p)$g.verified++;[pscustomobject]@{ok=$true;exit_code=0;verified=$true;statusSha256=$p.statusSha256;stateHash=$s.stateHash}};Revalidate={param($s)$snapshot};Launch={param($s,$p)$g.launched++}}
  # GetNewClosure conserva os contadores e a fixture apos retornar desta funcao.
  foreach($k in @($hooks.Keys)){if($hooks[$k] -is [scriptblock]){$hooks[$k]=$hooks[$k].GetNewClosure()}}
  return @{counts=$g;args=$hooks;snapshot=$snapshot}
}
function RunGuard($f) { $parameters=$f.args; Invoke-RetomadaGuardada @parameters }
Case 'sequencia valida invoca lancador exatamente uma vez apos todas as confirmacoes' { $f=GuardFixture;RunGuard $f|Out-Null;Check ($f.counts.launched -eq 1 -and $f.counts.verified -eq 2 -and $f.counts.released -eq 1) 'Sequencia incorreta' }
foreach($step in @('Preflight','AcquireReservation','Publish','Verify','Revalidate')) {
  Case ('excecao em '+$step+' impede lancador') { $f=GuardFixture;$f.args[$step]={throw 'FALHA_SIMULADA'};Refused {RunGuard $f};Check ($f.counts.launched -eq 0) 'Lancou apos excecao' }
}
foreach($bad in @($null,$false,[pscustomobject]@{ok=$true;exit_code=1},[pscustomobject]@{ok=$false;exit_code=0},[pscustomobject]@{ok=$true},[pscustomobject]@{ok='true';exit_code=0})) {
  Case 'resultado externo negativo ambiguo ou sem exit_code impede lancador' { $f=GuardFixture;$resultBad=$bad;$f.args.Publish={$resultBad}.GetNewClosure();Refused {RunGuard $f};Check ($f.counts.launched -eq 0) 'Ignorou exit_code/status' }
}
Case 'falha na verificacao final depois da revalidacao impede admissao' { $f=GuardFixture;$f.args.Verify={param($s,$p)$f.counts.verified++;if($f.counts.verified -eq 2){throw 'STATUS_EXPIRADO'};[pscustomobject]@{ok=$true;exit_code=0;verified=$true;statusSha256=$p.statusSha256;stateHash=$s.stateHash}};Refused {RunGuard $f};Check ($f.counts.launched -eq 0) 'Lancou apos expiracao' }
Case 'autorizacao ausente impede qualquer publicacao ou lancamento' { $f=GuardFixture;$f.args.Authorized=$false;Refused {RunGuard $f};Check ($f.counts.published -eq 0 -and $f.counts.launched -eq 0) 'Mutou sem autorizacao' }
Case 'admissao ja observada nao e repetida nem publica outro status' { $f=GuardFixture;$f.snapshot.mode='JA_ADMITIDO_NAO_RELANCAR';$r=RunGuard $f;Check (!$r.launched -and $f.counts.published -eq 0 -and $f.counts.launched -eq 0) 'Repetiu admissao' }
Case 'arquivos parcialmente aplicados impedem retomada sem tentar git apply' { $f=GuardFixture;$f.snapshot.hashesVerified=26;Refused {RunGuard $f};Check ($f.counts.published -eq 0 -and $f.counts.launched -eq 0) 'Reaplicou/lancou estado parcial' }
Case 'alteracao posterior entre publicacao e lancamento bloqueia retomada' { $f=GuardFixture;$last=$f.snapshot.PSObject.Copy();$last.stateHash='d'*64;$f.args.Revalidate={$last}.GetNewClosure();Refused {RunGuard $f};Check ($f.counts.launched -eq 0) 'Ignorou mudanca posterior' }
Case 'reaplicacao do patch nunca e aceita como retomada' { $f=GuardFixture;$f.snapshot.patchApplyRequired=$true;Refused {RunGuard $f};Check ($f.counts.published -eq 0 -and $f.counts.launched -eq 0) 'Tentou reaplicar' }
Case 'destino modificado apos publicacao invalida recibo sem restaurar arquivo' { $f=Fixture;$r=Publish-StatusAtomico @f;[IO.File]::WriteAllText($f.Destination,'{}');Refused {Confirm-StatusReceipt $r $f.Directory $f.StateFile $f.ExpectedStateHash 11 22} 'STATUS_LEITURA_DIVERGENTE';Check ([IO.File]::ReadAllText($f.Destination)-ceq '{}') 'Restaurou destino' }
Case 'hash de estado UTF8 e mantido sem alterar bytes ou ACL' { $f=Fixture;$json='{"texto":"a'+[char]0x00E7+[char]0x00E3+'o"}';$bytes=[Text.Encoding]::UTF8.GetBytes($json);[IO.File]::WriteAllBytes($f.StateFile,$bytes);$f.ExpectedStateHash=Get-BytesHash $bytes;$acl=(Get-Acl -LiteralPath $f.StateFile).Sddl;$null=Publish-StatusAtomico @f;Check ((Get-FileBytesHash $f.StateFile)-ceq $f.ExpectedStateHash) 'Estado UTF8 alterado';Check ((Get-Acl -LiteralPath $f.StateFile).Sddl -ceq $acl) 'ACL alterada' }
Case 'reserva exclusiva impede dois lancadores concorrentes antes da admissao' {
  $f=Fixture;$entered=New-Object Threading.ManualResetEvent($false);$release=New-Object Threading.ManualResetEvent($false);$worker=[PowerShell]::Create()
  $code={param($module,$dir,$entered,$release)
    . $module
    $s=[pscustomobject]@{ok=$true;exit_code=0;mode='APLICADO_AGUARDANDO_ADMISSAO';patchApplyRequired=$false;hashesVerified=27;stateHash=('a'*64);manifestHash=('b'*64)}
    Invoke-RetomadaGuardada -Authorized $true -Preflight {$s} -AcquireReservation {param($x)Enter-StatusLock (Join-Path $dir 'reserva-ficticia')} -ReleaseReservation {param($lock)Exit-StatusLock $lock} -Publish {param($x)[pscustomobject]@{ok=$true;exit_code=0;statusSha256=('c'*64);stateHash=$s.stateHash}} -Verify {param($x,$r)[pscustomobject]@{ok=$true;exit_code=0;verified=$true;statusSha256=$r.statusSha256;stateHash=$s.stateHash}} -Revalidate {$s} -Launch {param($x,$r)$null=$entered.Set();if(!$release.WaitOne(10000)){throw 'BARRIER_TIMEOUT'};'LANCAMENTO_EXCLUSIVAMENTE_SIMULADO'}
  }
  $null=$worker.AddScript($code.ToString()).AddArgument((Join-Path $PSScriptRoot '../sequencia-segura.ps1')).AddArgument($f.Directory).AddArgument($entered).AddArgument($release);$running=$worker.BeginInvoke()
  try {Check ($entered.WaitOne(5000)) 'Reserva nao adquirida';$other=GuardFixture;$reservationPath=Join-Path $f.Directory 'reserva-ficticia';$other.args.AcquireReservation={param($x)Enter-StatusLock $reservationPath}.GetNewClosure();Refused {RunGuard $other} 'STATUS_LOCK_OCUPADO';Check ($other.counts.published -eq 0 -and $other.counts.launched -eq 0) 'Segundo lancador prosseguiu';$null=$release.Set();$result=$worker.EndInvoke($running);Check (!$worker.HadErrors -and $result.Count -eq 1) 'Primeiro lancador simulado falhou';Check (![IO.File]::Exists($reservationPath)) 'Reserva propria remanescente'}
  finally {$null=$release.Set();$worker.Dispose();$entered.Dispose();$release.Dispose()}
}
Write-Output ('TESTES_STATUS_E_SEQUENCIA: '+$script:passed)
