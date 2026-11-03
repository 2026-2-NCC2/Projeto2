$ErrorActionPreference='Stop'
# Executa o helper real com TODAS as primitivas de processo/estado substituidas.
$helperFile=Join-Path $PSScriptRoot '../scripts/processo-substituicao-selada.ps1'
$helperDir=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($helperFile))
$source=[IO.File]::ReadAllText($helperFile)
if(!$source.Contains('[IO.File]::ReadAllBytes($stateFile)')){throw 'ALVO_MOCK_AUSENTE'}
$source=$source.Replace('[IO.File]::ReadAllBytes($stateFile)','$global:mockStateBytes').Replace('$PSScriptRoot',("'"+$helperDir.Replace("'","''")+"'"))
$scriptBlock=[ScriptBlock]::Create($source)
$global:mockBorn=[datetime]'2026-11-02T12:00:00Z'
function Get-CimInstance {param($ClassName,$Filter)
  if($Filter -eq "ProcessId=$global:mockTarget"){$global:mockReads++;if($global:mockPidRace -and $global:mockReads -gt 1){$global:mockProcess.CreationDate=$global:mockBorn.AddSeconds(1)};return $global:mockProcess}
  if($Filter -eq 'ProcessId=202'){return $null}
  throw 'CONSULTA_REAL_PROIBIDA'
}
function Get-Content {param($LiteralPath,[switch]$Raw) if($LiteralPath -notlike '*SupervisorCutover*estado.json'){throw 'ARQUIVO_REAL_PROIBIDO'};return $global:mockStateJson}
function Get-NetTCPConnection {param($State,$ErrorAction) if($global:mockRole -ne 'controlador'){return [pscustomobject]@{LocalPort=3001;LocalAddress='127.0.0.1';OwningProcess=$global:mockTarget}}}
function Get-Process {param($Id) if($Id -ne $global:mockTarget){throw 'PROCESSO_REAL_PROIBIDO'};$p=[pscustomobject]@{Handle=0;HasExited=$true};$p|Add-Member ScriptMethod Kill {$global:mockKills++};$p|Add-Member ScriptMethod WaitForExit {param($ms) return $true};return $p}
function node {param($File,$Mode)
  if($File -notlike '*validar-fence-pos-t1.cjs' -or $Mode -ne '--somente-validar'){throw 'NODE_REAL_PROIBIDO'}
  $global:mockNodeCalls++;$global:LASTEXITCODE=if($global:mockNodeReject){1}else{0}
  $algo=[Security.Cryptography.SHA256]::Create();try{$h=([BitConverter]::ToString($algo.ComputeHash($global:mockStateBytes))).Replace('-','').ToLowerInvariant()}finally{$algo.Dispose()}
  if($global:mockHashRace){$h='0'*64};return (@{estadoSha256=$h}|ConvertTo-Json -Compress)
}
$cases=@(
  @{name='supervisor pos T1 conhecido';role='supervisor';ok=$true},
  @{name='controlador depois da saida do filho';role='controlador';ok=$true},
  @{name='ponte conhecida depois da admissao';role='respondedor';ok=$true},
  @{name='fence JS reprovado';role='supervisor';reject=$true},
  @{name='estado alterado apos fence';role='supervisor';race=$true},
  @{name='PID reutilizado';role='supervisor';pidRace=$true},
  @{name='fase incorreta';role='supervisor';phase='INCERTA'},
  @{name='sem congelamento';role='supervisor';unfrozen=$true},
  @{name='estado UTF8 preserva hash com acentos';role='supervisor';unicode=$true;ok=$true},
  @{name='legado sem T1 conserva fence anterior';role='supervisor';legacy=$true;ok=$true}
)
foreach($case in $cases){
  $global:mockRole=$case.role;$global:mockTarget=if($case.role -eq 'supervisor'){202}elseif($case.role -eq 'controlador'){101}else{707}
  $parent=if($case.role -eq 'supervisor'){101}elseif($case.role -eq 'controlador'){1}else{303}
  $entry=if($case.role -eq 'supervisor'){'iniciar-supervisor-substituido.cjs'}elseif($case.role -eq 'controlador'){'substituir-controlador-selado.cjs'}else{'manutencao-validacao.cjs'}
  $global:mockProcess=[pscustomobject]@{Name='node.exe';CommandLine=('node "'+(Join-Path $helperDir $entry)+'"');CreationDate=$global:mockBorn;ParentProcessId=$parent}
  $born=$global:mockBorn.ToUniversalTime().ToString('o');$proof=@{pid=$global:mockTarget;parentPid=$parent;criadoEm=$born}
  $step=if($case.role -eq 'supervisor'){'ENCERRANDO_SUPERVISOR'}elseif($case.role -eq 'controlador'){'ENCERRANDO_CONTROLADOR'}else{'TROCANDO_PORTA'}
  $state=@{congelado=!$case.unfrozen;selado=$true;transicao=@{fase=if($case.phase){$case.phase}else{'INICIADA'}};controleSelado=@{etapa=$step;origem=@{backend=@{pid=202};controlador=@{pid=101}};respondedor=$proof}}
  if(!$case.legacy){$state.transicao.t1=@{run='T1_FICTICIA'}}
  if($case.role -eq 'supervisor'){$state.controleSelado.origem.backend=$proof}elseif($case.role -eq 'controlador'){$state.controleSelado.origem.controlador=$proof}
  if($case.unicode){$state.observacao='a'+[char]0x00E7+[char]0x00E3+'o'}
  $global:mockStateJson=$state|ConvertTo-Json -Depth 10 -Compress;$global:mockStateBytes=[Text.Encoding]::UTF8.GetBytes($global:mockStateJson)
  $global:mockNodeReject=$case.reject;$global:mockHashRace=$case.race;$global:mockPidRace=$case.pidRace;$global:mockKills=0;$global:mockReads=0;$global:mockNodeCalls=0
  $accepted=$true;try{& $scriptBlock -Modo encerrar -Role $case.role -PidAlvo $global:mockTarget -CriadoEm $born -Pai $parent|Out-Null}catch{$accepted=$false}
  if($accepted -ne [bool]$case.ok -or $global:mockKills -ne $(if($case.ok){1}else{0})){throw ('CASO_REPROVADO: '+$case.name)}
  if($case.legacy -and $global:mockNodeCalls -ne 0){throw 'FENCE_LEGADO_ALTERADO'}
  Write-Output ('APROVADO: '+$case.name)
}
Write-Output ('TESTES_MOCK_POWERSHELL: '+$cases.Count)
