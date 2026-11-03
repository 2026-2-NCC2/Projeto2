$ErrorActionPreference='Stop'
# Primitivas nativas falsas; nenhum processo real consultado ou encerrado.
$helper=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../scripts/processo-substituicao-selada.ps1'))
$global:hsBorn=[datetime]'2026-11-01T12:00:00Z'
function Reset-Fixture([string]$role='supervisor'){
  $global:hsRole=$role;$global:hsKills=0;$global:hsReads=0;$global:hsChild=$false;$global:hsRace=$false;$global:hsUnknownPort=$false;$global:hsBridge=$false
  $global:hsTarget=if($role -eq 'controlador'){5555}elseif($role -eq 'respondedor'){6666}else{4444}
  $entry=if($role -eq 'controlador'){'controlador-recuperacao-smoke-selado.cjs'}elseif($role -eq 'respondedor'){'manutencao-validacao.cjs'}else{'iniciar-instancia-planejada.cjs'}
  $global:hsProcess=[pscustomobject]@{Name='node.exe';ParentProcessId=123;CreationDate=$global:hsBorn;CommandLine=('node "'+(Join-Path (Split-Path $helper) $entry)+'"')}
  $proof=@{pid=$global:hsTarget;parentPid=123;criadoEm=$global:hsBorn.ToUniversalTime().ToString('o')}
  $global:hsState=@{congelado=$true;selado=$true;transicao=@{fase='INICIADA'};controleSelado=@{etapa=if($role -eq 'controlador'){'ENCERRANDO_CONTROLADOR'}elseif($role -eq 'respondedor'){'TROCANDO_PORTA'}else{'ENCERRANDO_SUPERVISOR'};origem=@{backend=@{pid=4444;parentPid=123;criadoEm=$proof.criadoEm};controlador=@{pid=5555;parentPid=123;criadoEm=$proof.criadoEm}};respondedor=@{pid=6666;parentPid=123;criadoEm=$proof.criadoEm}}}
}
function Get-CimInstance {param($ClassName,$Filter)
  if($Filter -eq "ProcessId=$global:hsTarget"){$global:hsReads++;if($global:hsRace -and $global:hsReads -gt 1){$global:hsProcess.CreationDate=$global:hsBorn.AddSeconds(1)};return $global:hsProcess}
  if($Filter -eq 'ProcessId=4444'){if($global:hsChild){return [pscustomobject]@{ProcessId=4444}};return $null}
  if($Filter -eq 'ProcessId=6666'){return [pscustomobject]@{Name='node.exe';ParentProcessId=123;CreationDate=$global:hsBorn;CommandLine=('node "'+(Join-Path (Split-Path $helper) 'manutencao-validacao.cjs')+'"')}};throw 'NATIVO_NAO_SIMULADO'
}
function Get-Content {param($LiteralPath,[switch]$Raw) if($LiteralPath -notlike '*SupervisorCutover*estado.json'){throw 'ARQUIVO_REAL_PROIBIDO'};return ($global:hsState|ConvertTo-Json -Depth 9 -Compress)}
function Get-NetTCPConnection {param($State,$ErrorAction) if($global:hsUnknownPort){return [pscustomobject]@{LocalPort=3001;OwningProcess=9999;LocalAddress='127.0.0.1'}};if($global:hsBridge){return [pscustomobject]@{LocalPort=3001;OwningProcess=6666;LocalAddress='127.0.0.1'}};if($global:hsRole -ne 'controlador'){return [pscustomobject]@{LocalPort=3001;OwningProcess=$global:hsTarget;LocalAddress='127.0.0.1'}}}
function Get-Process {param($Id) if($Id -ne $global:hsTarget){throw 'PROCESSO_REAL_PROIBIDO'};$obj=[pscustomobject]@{Handle=0;HasExited=$true};$obj|Add-Member ScriptMethod Kill {$global:hsKills++};$obj|Add-Member ScriptMethod WaitForExit {param($ms) return $true};return $obj}
$cases=@(
 @{name='encerra supervisor conhecido';role='supervisor';ok=$true;mutate={}},
 @{name='encerra controlador somente apos filho';role='controlador';ok=$true;mutate={}},
 @{name='encerra ponte conhecida';role='respondedor';ok=$true;mutate={}},
 @{name='recusa entrada desconhecida';mutate={$global:hsProcess.CommandLine='node outro.cjs'}},
 @{name='recusa entrada apenas como argumento';mutate={$global:hsProcess.CommandLine='node outro.cjs "'+(Join-Path (Split-Path $helper) 'iniciar-instancia-planejada.cjs')+'"'}},
 @{name='recusa sem freeze';mutate={$global:hsState.congelado=$false}},
 @{name='recusa sem selo';mutate={$global:hsState.selado=$false}},
 @{name='recusa T1 existente';mutate={$global:hsState.transicao.t1=@{run='ficticio'}}},
 @{name='recusa fase alterada';mutate={$global:hsState.transicao.fase='INCERTA'}},
 @{name='recusa etapa inesperada';mutate={$global:hsState.controleSelado.etapa='ATIVO'}},
 @{name='recusa criacao alterada';mutate={$global:hsProcess.CreationDate=$global:hsBorn.AddSeconds(1)}},
 @{name='recusa pai alterado';mutate={$global:hsProcess.ParentProcessId=999}},
 @{name='recusa PID reutilizado';mutate={$global:hsRace=$true}},
 @{name='preserva listener desconhecido';mutate={$global:hsUnknownPort=$true}},
 @{name='controlador nao para com filho vivo';role='controlador';mutate={$global:hsChild=$true}},
 @{name='controlador nao para com porta ocupada';role='controlador';mutate={$global:hsUnknownPort=$true}},
 @{name='retomada conserva ponte conhecida';role='controlador';ok=$true;mutate={$global:hsBridge=$true;$global:hsState.controleSelado.retomadaAutorizada=@{referencia='Autorizacao ficticia'}}},
 @{name='ponte exige retomada explicita';role='controlador';mutate={$global:hsBridge=$true}},
 @{name='retomada recusa ponte com pai divergente';role='controlador';mutate={$global:hsBridge=$true;$global:hsState.controleSelado.retomadaAutorizada=@{referencia='Autorizacao ficticia'};$global:hsState.controleSelado.respondedor.parentPid=456}}
)
$passed=0
foreach($case in $cases){$role=if($case.role){$case.role}else{'supervisor'};Reset-Fixture $role;& $case.mutate;$caught=$false
  try{$null=& $helper -Modo encerrar -Role $role -PidAlvo $global:hsTarget -CriadoEm $global:hsBorn.ToUniversalTime().ToString('o') -Pai 123}catch{$caught=$true}
  if($case.ok){if($caught -or $global:hsKills -ne 1){throw ('TESTE_FALHOU: '+$case.name)}}elseif(!$caught -or $global:hsKills -ne 0){throw ('TESTE_FALHOU: '+$case.name)};$passed++
}
[pscustomobject]@{tests=$passed;pass=$passed;fail=0;realProcessesStopped=0;realDatabaseAccess=$false}|ConvertTo-Json -Compress
