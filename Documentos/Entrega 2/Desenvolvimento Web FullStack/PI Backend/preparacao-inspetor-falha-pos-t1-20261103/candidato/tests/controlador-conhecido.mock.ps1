$ErrorActionPreference='Stop'
# Todas as primitivas nativas abaixo sao falsas; nenhum processo real e consultado/encerrado.
$helper=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../scripts/controlador-restabelecimento-conhecido.ps1'))
$global:tcMockEntry=Join-Path (Split-Path $helper) 'controlador-restabelecimento-autorizado.cjs'
$global:tcMockBorn=[datetime]'2026-11-01T12:00:00Z'
function Reset-Fixture {
  $global:tcMockKills=0;$global:tcMockReads=0;$global:tcMockChild=$false;$global:tcMockPort=$false;$global:tcMockRace=$false
  $global:tcMockProcess=[pscustomobject]@{Name='node.exe';CommandLine=$global:tcMockEntry;CreationDate=$global:tcMockBorn;ParentProcessId=123}
  $global:tcMockState=@{congelado=$true;selado=$true;transicao=@{fase='INCERTA';restabelecimento=@{etapa='RECUPERACAO_SUBSEQUENTE';pidDestino=77};recuperacao=@{etapa='ENCERRANDO';pidAnterior=77}}}
}
function Get-CimInstance {param($ClassName,$Filter)
  if($Filter -eq 'ProcessId=424242'){$global:tcMockReads++;if($global:tcMockRace -and $global:tcMockReads -gt 1){$global:tcMockProcess.CreationDate=$global:tcMockBorn.AddSeconds(1)};return $global:tcMockProcess}
  if($Filter -eq 'ProcessId=77'){if($global:tcMockChild){return [pscustomobject]@{ProcessId=77}};return $null}
  throw 'NATIVO_NAO_SIMULADO'
}
function Get-Content {param($LiteralPath,[switch]$Raw) if($LiteralPath -notlike '*SupervisorCutover*estado.json'){throw 'ARQUIVO_REAL_PROIBIDO'};return ($global:tcMockState|ConvertTo-Json -Depth 8 -Compress)}
function Get-NetTCPConnection {param($State,$ErrorAction) if($global:tcMockPort){return [pscustomobject]@{LocalPort=3001}}}
function Get-Process {param($Id)
  if($Id -ne 424242){throw 'PROCESSO_REAL_PROIBIDO'};$obj=[pscustomobject]@{Handle=0;HasExited=$true}
  $obj|Add-Member -MemberType ScriptMethod -Name Kill -Value {$global:tcMockKills++}
  $obj|Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {param($ms) return $true};return $obj
}
$cases=@(
  @{name='admite somente controlador conhecido apos saida do filho';mutate={};ok=$true},
  @{name='recusa entrada desconhecida';mutate={$global:tcMockProcess.CommandLine='outro.cjs'}},
  @{name='recusa fase diferente';mutate={$global:tcMockState.transicao.fase='INICIADA'}},
  @{name='recusa sem congelamento';mutate={$global:tcMockState.congelado=$false}},
  @{name='recusa sem selagem';mutate={$global:tcMockState.selado=$false}},
  @{name='recusa recuperacao incompleta';mutate={$global:tcMockState.transicao.recuperacao.etapa='PRONTA_SMOKE'}},
  @{name='recusa registro sem handoff';mutate={$global:tcMockState.transicao.restabelecimento.etapa='ADMITIDA_SELADA'}},
  @{name='recusa filho divergente';mutate={$global:tcMockState.transicao.restabelecimento.pidDestino=88}},
  @{name='recusa criacao divergente';mutate={$global:tcMockProcess.CreationDate=$global:tcMockBorn.AddSeconds(2)}},
  @{name='recusa pai divergente';mutate={$global:tcMockProcess.ParentProcessId=456}},
  @{name='recusa filho ativo';mutate={$global:tcMockChild=$true}},
  @{name='recusa porta ocupada';mutate={$global:tcMockPort=$true}},
  @{name='recusa PID reutilizado apos abrir handle';mutate={$global:tcMockRace=$true}}
)
$passed=0
foreach($case in $cases){Reset-Fixture;& $case.mutate;$caught=$false;try{$null=& $helper -PidAlvo 424242 -CriadoEm $global:tcMockBorn.ToUniversalTime().ToString('o') -Pai 123 -Encerrar}catch{$caught=$true}
  if($case.ok){if($caught -or $global:tcMockKills -ne 1){throw ('TESTE_FALHOU: '+$case.name)}}else{if(!$caught -or $global:tcMockKills -ne 0){throw ('TESTE_FALHOU: '+$case.name)}};$passed++
}
Reset-Fixture;$proof=(& $helper -PidAlvo 424242)|ConvertFrom-Json;if($proof.pid -ne 424242 -or $global:tcMockKills -ne 0){throw 'INSPECAO_NAO_INERTE'};$passed++
[pscustomobject]@{tests=$passed;pass=$passed;fail=0;realProcessesStopped=0;realDatabaseAccess=$false}|ConvertTo-Json -Compress
