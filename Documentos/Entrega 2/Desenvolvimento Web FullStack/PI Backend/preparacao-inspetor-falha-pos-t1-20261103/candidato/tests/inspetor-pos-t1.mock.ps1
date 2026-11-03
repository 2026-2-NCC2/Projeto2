$ErrorActionPreference='Stop'
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop
Import-Module Microsoft.PowerShell.Management -ErrorAction Stop
$sourceFile=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../scripts/inspecionar-controlador-persistente.ps1'))
$scripts=Split-Path $sourceFile
$created=[datetime]'2026-11-03T17:00:00Z'
$iso=$created.ToUniversalTime().ToString('o')
$global:insp_passed=0
function State-Hash { $alg=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($alg.ComputeHash([Text.Encoding]::UTF8.GetBytes($global:insp_stateJson)))).Replace('-','').ToLowerInvariant()}finally{$alg.Dispose()} }
function Get-CimInstance {
 param($ClassName,$Filter)
 $id=[int]($Filter -replace '\D','');$global:insp_cim++
 $command='node.exe "'+(Join-Path $scripts $(if($id -eq 101){'restabelecer-controlador-apos-reinicio.cjs'}else{'iniciar-supervisor-substituido.cjs'}))+'" --ficticio'
 if($id -eq 101 -and $global:insp_case -eq 'path-nao-canonico'){$command=$command.Replace('\','/')}
 if($id -eq 101 -and $global:insp_case -eq 'entrada-em-argumento'){$command='node.exe outro.cjs --entrada "'+(Join-Path $scripts 'restabelecer-controlador-apos-reinicio.cjs')+'"'}
 $parent=1;if($id -eq 202){$parent=101};if($global:insp_case -eq 'pai-divergente' -and $id -eq 202){$parent=999}
 $time=$created;if($global:insp_case -eq 'criacao-divergente' -and $id -eq 101){$time=$created.AddSeconds(1)}
 if($global:insp_case -eq 'PID-reutilizado' -and $global:insp_cim -gt 2){$time=$created.AddSeconds(2)}
 return [pscustomobject]@{Name='node.exe';ProcessId=$id;ParentProcessId=$parent;CreationDate=$time;CommandLine=$command}
}
function Get-Content {param($LiteralPath,$Encoding,[switch]$Raw) return $global:insp_stateJson}
function Get-FileHash {param($LiteralPath,$Algorithm) $global:insp_hashCalls++;$h=State-Hash;if($global:insp_case -eq 'estado-alterado' -and $global:insp_hashCalls -gt 1){$h='f'*64}; $global:insp_lastHash=$h;return [pscustomobject]@{Hash=$h}}
function Get-NetTCPConnection {param($LocalPort,$State,$ErrorAction) $owner=202;$address='127.0.0.1';if($global:insp_case -eq 'listener-outro'){$owner=999};if($global:insp_case -eq 'bind-publico'){$address='0.0.0.0'};return [pscustomobject]@{OwningProcess=$owner;LocalAddress=$address;LocalPort=3001}}
function node {
 $global:insp_nodes++;$global:LASTEXITCODE=0
 if($global:insp_case -eq 'validador-recusa'){$global:LASTEXITCODE=1;return '{"ok":false}'}
 $h=State-Hash;if($global:insp_case -eq 'recibo-divergente'){$h='a'*64}
 $global:insp_lastProof=$h;return ([pscustomobject]@{ok=$true;estadoSha256=$h}|ConvertTo-Json -Compress)
}
$cases=@('pos-T1-valido','legado-valido','modo-errado','legado-com-T1','FALHA','ticket-pendente','validador-recusa','recibo-divergente','path-nao-canonico','entrada-em-argumento','pai-divergente','criacao-divergente','PID-reutilizado','listener-outro','bind-publico','estado-alterado')
foreach($case in $cases){
 $global:insp_case=$case;$global:insp_cim=0;$global:insp_nodes=0;$global:insp_hashCalls=0
 $control=[pscustomobject]@{modo='IMPLANTACAO_POS_T1';motivoOperacao='RESTABELECIMENTO_POS_T1';etapa='ATIVO';controlador=[pscustomobject]@{pid=101;parentPid=1;criadoEm=$iso};supervisor=[pscustomobject]@{pid=202;parentPid=101;criadoEm=$iso};ticketControlador=$null;ticketSupervisor=$null}
 $state=[pscustomobject]@{controleSelado=$control;transicao=[pscustomobject]@{t1=[pscustomobject]@{etapa='CONCLUIDA';cleanupVerified=$true}}}
 if($case -in @('legado-valido','legado-com-T1')){$control.modo='RESTABELECIMENTO_POS_REINICIO'}
 if($case -eq 'legado-valido'){$state.transicao.t1=$null}
 if($case -eq 'modo-errado'){$control.modo='OUTRO'}
 if($case -eq 'FALHA'){$control.etapa='FALHA'}
 if($case -eq 'ticket-pendente'){$control.ticketControlador='ficticio'}
 $global:insp_stateJson=$state|ConvertTo-Json -Compress -Depth 6
 $why=$null;$ok=$true;try{$result=& $sourceFile -PidAlvo 101 -PidBackend 202}catch{$ok=$false;$why=$_.Exception.Message}
 $expected=$case -in @('pos-T1-valido','legado-valido')
 if($ok -ne $expected){throw ('CENARIO_DIVERGENTE: '+$case+' / '+$why+' / HASH='+$global:insp_lastHash+' / PROOF='+$global:insp_lastProof)}
 if($ok){$r=ConvertFrom-Json $result;if($r.ipcConsultado -ne $false){throw 'IPC_FABRICADO'}}
 if($case -eq 'pos-T1-valido' -and $global:insp_nodes -ne 1){throw 'VALIDACAO_T1_IGNORADA'}
 if($case -eq 'legado-valido' -and $global:insp_nodes -ne 0){throw 'LANE_LEGADA_ALTERADA'}
 $global:insp_passed++;Write-Output ('APROVADO: '+$case)
}
Write-Output ('TESTES_INSPETOR_NATIVO_SIMULADO: '+$global:insp_passed)
