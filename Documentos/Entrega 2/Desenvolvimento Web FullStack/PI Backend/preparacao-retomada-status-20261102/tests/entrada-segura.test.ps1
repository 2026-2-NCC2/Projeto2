$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../status-atomico.ps1')
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../retomar-operacional.ps1'))
$dotSource=". (Join-Path `$PSScriptRoot 'sequencia-segura.ps1')"
if (!$source.Contains($dotSource)) { throw 'ALVO_ENTRADA_AUSENTE' }
# Somente o ambiente externo e o encerramento do runner sao substituidos.
# Os parametros e todos os ramos da entrada sao os do script real.
$source=$source.Replace($dotSource,'').Replace('exit 0','return').Replace('exit 1','return')
$entry=[scriptblock]::Create($source)
function Get-CurrentRetomada { $global:entryReads++; return [pscustomobject]@{ok=$true;exit_code=0;mode='APLICADO_AGUARDANDO_ADMISSAO'} }
function Assert-CorrectionBundle { param($ExpectedHash) $global:entryBundles++;if ($ExpectedHash -cnotmatch '^[a-f0-9]{64}$') {Stop-Retomada 'RETOMADA_PACOTE_CORRECAO_OBRIGATORIO'};if ($global:entryRejectBundle) { Stop-Retomada 'RETOMADA_CORRECAO_ALTERADA' } }
function Invoke-RetomadaGuardada { $global:entryCoordinators++; return [pscustomobject]@{ok=$true;exit_code=0;simulated=$true} }
$cases=@(
  @{name='padrao e somente leitura';args=@{};reads=1;coordinators=0},
  @{name='Verificar explicito nao coordena admissao';args=@{Modo='Verificar'};reads=1;coordinators=0},
  @{name='Verificar com autorizacao conflitante e recusado';args=@{Modo='Verificar';AutorizarRetomada=$true};reads=0;coordinators=0;fail=$true},
  @{name='Retomar sem autorizacao e recusado';args=@{Modo='Retomar'};reads=0;coordinators=0;fail=$true},
  @{name='Retomar sem referencia e recusado';args=@{Modo='Retomar';AutorizarRetomada=$true;CorrecaoSha256=('a'*64)};reads=0;coordinators=0;fail=$true},
  @{name='Retomar sem hash da correcao e recusado';args=@{Modo='Retomar';AutorizarRetomada=$true;ReferenciaAutorizacao='Referencia ficticia'};reads=0;coordinators=0;fail=$true},
  @{name='pacote alterado recusa coordenador';args=@{Modo='Retomar';AutorizarRetomada=$true;CorrecaoSha256=('a'*64);ReferenciaAutorizacao='Referencia ficticia'};reads=0;coordinators=0;fail=$true;reject=$true},
  @{name='modo e autorizacao explicitos chegam somente ao coordenador falso';args=@{Modo='Retomar';AutorizarRetomada=$true;CorrecaoSha256=('a'*64);ReferenciaAutorizacao='Referencia ficticia'};reads=0;coordinators=1}
)
foreach($case in $cases){
  $global:entryReads=0;$global:entryBundles=0;$global:entryCoordinators=0;$global:entryRejectBundle=$case.ContainsKey('reject')
  $parameters=$case.args;$r=& $entry @parameters
  if ($r -is [string]) { $r=ConvertFrom-Json $r }
  if ($global:entryReads -ne $case.reads -or $global:entryCoordinators -ne $case.coordinators) { throw ('EFEITO_INDEVIDO: '+$case.name) }
  if ($case.ContainsKey('fail') -and $r.ok -ne $false) { throw 'RECUSA_AUSENTE' }
  Write-Output ('APROVADO: '+$case.name)
}
Write-Output ('TESTES_ENTRADA_ISOLADA: '+$cases.Count)
