$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../sequencia-segura.ps1')
$source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../retomar-operacional.ps1'))
$source=[regex]::Replace($source,'(?m)^\. \(Join-Path .+\)\r?\n','')
$source=$source.Replace('$PSScriptRoot',("'"+(Join-Path $PSScriptRoot '..').Replace("'","''")+"'"))
$source=$source.Replace('exit 0','return').Replace('exit 1','return');$entry=[scriptblock]::Create($source)
$seal=Get-FileBytesHash (Join-Path $PSScriptRoot '../manifest-correcao.json')
# Mesma entrada e coordenador; IO externo exclusivamente falso.
function Get-CurrentRetomada {
  $script:reads++
  $stateHash='b'*64;if($script:scenario -eq 'estado-alterado' -and $script:reads -eq 2){$stateHash='c'*64}
  $mode='APLICADO_AGUARDANDO_ADMISSAO';if($script:scenario -eq 'ja-admitido'){$mode='JA_ADMITIDO_NAO_RELANCAR'}
  return [pscustomobject]@{ok=$true;exit_code=0;mode=$mode;patchApplyRequired=$false;hashesVerified=27;stateHash=$stateHash;manifestHash=('a'*64);privateDir='C:\ficticio';stateFile='C:\ficticio\estado.json';controllerPid=101;supervisorPid=202;backendRoot='C:\ficticio';packageFile='C:\ficticio\pacote.json';packageSha256=('e'*64)}
}
function Enter-StatusLock {param($Path) $script:reserves++;return [pscustomobject]@{ok=$true;exit_code=0}}
function Exit-StatusLock {param($Lock) $script:releases++}
function Read-PrivateObservation {param($File,$Snapshot) return '{}'}
function Invoke-VerifiedHelper {
 param($ScriptFile,$Arguments)
 $script:helpers++
 if([IO.Path]::GetFileName($ScriptFile) -ne 'publicar-status.ps1' -or $Arguments[0] -ne '-AutorizarPublicacao' -or $Arguments[2] -ne $seal){throw 'INTEGRACAO_HELPER_INCORRETA'}
 if($script:scenario -eq 'processo-falhou'){throw 'PROCESSO_EXIT_NAO_ZERO'}
 $ok=$true;$code=0;if($script:scenario -eq 'recibo-recusado'){$ok=$false};if($script:scenario -eq 'codigo-invalido'){$code='0'}
 return [pscustomobject]@{ok=$ok;exit_code=$code;statusSha256=('d'*64);stateHash=('b'*64);file='C:\ficticio\destino.json'}
}
function Confirm-StatusReceipt {
 param($Receipt,$Dir,$StateFile,$StateHash,$ControllerPid,$SupervisorPid)
 $script:verifies++
 if($script:scenario -eq 'vencido-antes-lancamento' -and $script:verifies -eq 2){throw 'STATUS_EXPIRADO'}
 return [pscustomobject]@{ok=$true;exit_code=0;verified=($script:scenario -ne 'verificacao-falhou');statusSha256=('d'*64);stateHash=('b'*64)}
}
function node {$script:launches++;$global:LASTEXITCODE=0;if($script:scenario -eq 'lancador-recusado'){$global:LASTEXITCODE=9}}
$scenarios=@('sucesso','processo-falhou','recibo-recusado','codigo-invalido','verificacao-falhou','estado-alterado','vencido-antes-lancamento','lancador-recusado','ja-admitido','selo-invalido')
foreach($scenario in $scenarios){
 $script:scenario=$scenario;$script:reads=0;$script:reserves=0;$script:releases=0;$script:helpers=0;$script:verifies=0;$script:launches=0
 $hash=$seal;if($scenario -eq 'selo-invalido'){$hash='0'*64}
 $result=@(& $entry -Modo Retomar -AutorizarRetomada -CorrecaoSha256 $hash -ObservacaoFile 'C:\ficticio\observacao.json' -StatusFile 'C:\ficticio\destino.json' -ReferenciaAutorizacao 'Autorizacao somente ficticia')
 $last=$null;if($result.Count -gt 0){$last=$result[-1];if($last -is [string]){$last=ConvertFrom-Json $last}}
 $expectedLaunch=0;if($scenario -in @('sucesso','lancador-recusado')){$expectedLaunch=1}
 if($script:launches -ne $expectedLaunch){throw ('LANCAMENTO_INDEVIDO: '+$scenario)}
 if($script:reserves -ne $script:releases){throw 'RESERVA_NAO_LIBERADA'}
 if($scenario -eq 'sucesso' -and ($script:helpers -ne 1 -or $script:verifies -ne 2 -or $script:reads -ne 2)){throw 'SEQUENCIA_INCOMPLETA'}
 if($scenario -eq 'ja-admitido' -and ($script:helpers -ne 0 -or $script:reserves -ne 0)){throw 'REAPLICACAO_INDEVIDA'}
 if($scenario -notin @('sucesso','ja-admitido') -and ($null -eq $last -or $last.ok -ne $false)){throw ('RECUSA_AUSENTE: '+$scenario)}
 Write-Output ('APROVADO: '+$scenario)
}
Write-Output ('TESTES_INTEGRACAO: '+$scenarios.Count)
