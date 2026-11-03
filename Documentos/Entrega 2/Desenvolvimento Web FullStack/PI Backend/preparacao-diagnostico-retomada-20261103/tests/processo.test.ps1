$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../processo-verificado.ps1')
$folder=Join-Path $PSScriptRoot ('fixture-processo-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($folder) | Out-Null
$script:count=0
function Case([string]$Name,[scriptblock]$Run) { & $Run; $script:count++;Write-Output ('APROVADO: '+$Name) }
function Fixture([string]$Name,[string]$Source) {$f=Join-Path $folder ($Name+'.ps1');[IO.File]::WriteAllText($f,$Source,(New-Object Text.UTF8Encoding($false)));return $f}
function Refuse([scriptblock]$Run,[string]$Code) {try {& $Run | Out-Null} catch {if ($_.Exception.Message -ne $Code) {throw};return};throw 'RECUSA_AUSENTE'}
try {
  $good=Fixture 'valido' 'Write-Output ''{"ok":true,"exit_code":0}''; exit 0'
  Case 'sucesso nativo explicito sem LASTEXITCODE' {Remove-Variable LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue;$r=Invoke-VerifiedHelper $good;if(!$r.ok){throw 'SEM_RECIBO'}}
  Case 'LASTEXITCODE antigo nao governa processo' {$global:LASTEXITCODE=79;$r=Invoke-VerifiedHelper $good;if(!$r.ok -or $global:LASTEXITCODE -ne 79){throw 'CODIGO_AMBIENTE_USADO'}}
  $bad=Fixture 'exit' 'Write-Output ''{"ok":true,"exit_code":0}''; exit 7'
  Case 'exit 7 vence recibo positivo' {Refuse {Invoke-VerifiedHelper $bad} 'PROCESSO_EXIT_NAO_ZERO'}
  $recusado=Fixture 'recusa' 'Write-Output ''{"ok":false,"exit_code":1}''; exit 0'
  Case 'recibo recusado com exit zero bloqueia' {Refuse {Invoke-VerifiedHelper $recusado} 'PROCESSO_RECIBO_INVALIDO'}
  $noise=Fixture 'ruido' 'Write-Output ''ruido''; Write-Output ''{"ok":true,"exit_code":0}''; exit 0'
  Case 'stdout ambiguo bloqueia' {Refuse {Invoke-VerifiedHelper $noise} 'PROCESSO_JSON_INVALIDO'}
  $empty=Fixture 'vazio' 'exit 0'
  Case 'saida ausente bloqueia' {Refuse {Invoke-VerifiedHelper $empty} 'PROCESSO_RECIBO_INVALIDO'}
  $stderr=Fixture 'stderr' '[Console]::Error.WriteLine("falha ficticia"); Write-Output ''{"ok":true,"exit_code":0}''; exit 0'
  Case 'stderr bloqueia sem expor seu conteudo' {Refuse {Invoke-VerifiedHelper $stderr} 'PROCESSO_SAIDA_RECUSADA'}
  $slow=Fixture 'lento' 'Start-Sleep -Seconds 3; Write-Output ''{"ok":true,"exit_code":0}'''
  Case 'timeout mata somente helper proprio sem retry' {Refuse {Invoke-VerifiedHelper $slow -TimeoutMs 100} 'PROCESSO_TIMEOUT_SEM_RETRY'}
  $argsScript=Fixture 'argumentos' 'param([string]$Valor) [pscustomobject]@{ok=$true;exit_code=0;valor=$Valor}|ConvertTo-Json -Compress;exit 0'
  Case 'argumentos preservam espacos aspas e barras' {$value='nome com "aspas" e barra\';$r=Invoke-VerifiedHelper $argsScript -Arguments @('-Valor',$value);if($r.valor -cne $value){throw 'ARGUMENTO_ALTERADO'}}
  Case 'script ausente nao inicia processo' {Refuse {Invoke-VerifiedHelper (Join-Path $folder 'ausente.ps1')} 'PROCESSO_SCRIPT_INVALIDO'}
  Case 'recibo array nao aprova' {Refuse {Assert-ProcessReceipt @([pscustomobject]@{ok=$true;exit_code=0},[pscustomobject]@{ok=$true;exit_code=0})} 'PROCESSO_RECIBO_INVALIDO'}
  Case 'argumento com newline nao inicia processo' {Refuse {Invoke-VerifiedHelper $good -Arguments @("um`ndois")} 'PROCESSO_ARGUMENTO_INVALIDO'}
  # Testar a entrada nova com publicador/pacote inteiramente falsos.
  $source=[IO.File]::ReadAllText((Join-Path $PSScriptRoot '../publicar-verificado.ps1'))
  $source=[regex]::Replace($source,'(?m)^\. \(Join-Path .+\)\r?\n','')
  $source=$source.Replace('$PSScriptRoot',("'"+(Join-Path $PSScriptRoot '..').Replace("'","''")+"'"))
  $source=$source.Replace('exit 0','return').Replace('exit 1','return')
  $entry=[scriptblock]::Create($source)
  function Assert-CorrectionBundle {param($Hash) if($script:rejectBundle){throw 'PACOTE_ALTERADO'};if($Hash -ne '43ba0c318f92caee38d3ec38b41ff33057ec10525052935960324fde85074a33'){throw 'HASH_INCORRETO'}}
  function Invoke-VerifiedHelper {param($ScriptFile,$Arguments) $script:calls++;if($script:rejectProcess){throw 'PROCESSO_EXIT_NAO_ZERO'};return [pscustomobject]@{ok=$true;exit_code=0;statusSha256=('a'*64)}}
  foreach($scenario in @('sem-autorizacao','pacote-alterado','processo-falhou','sucesso')) {
    $script:calls=0;$script:rejectBundle=$scenario -eq 'pacote-alterado';$script:rejectProcess=$scenario -eq 'processo-falhou'
    Case ('entrada verificada: '+$scenario) {
      $r=& $entry -AutorizarPublicacao:($scenario -ne 'sem-autorizacao') -ObservacaoFile 'ficticio' -StatusFile 'ficticio-destino' -ExpectedDestinationHash ('b'*64)
      $r=ConvertFrom-Json $r
      if($r.ok -ne ($scenario -eq 'sucesso')){throw 'RESULTADO_INCORRETO'}
      $expectedCalls=0;if($scenario -in @('processo-falhou','sucesso')){$expectedCalls=1}
      if($script:calls -ne $expectedCalls){throw 'PUBLICACAO_INDEVIDA'}
    }
  }
  Write-Output ('TESTES_PROCESSO_ISOLADO: '+$script:count)
} finally {
  # Somente fixtures desta chamada, dentro da pasta de testes conhecida.
  $resolved=[IO.Path]::GetFullPath($folder);$base=[IO.Path]::GetFullPath($PSScriptRoot)+[IO.Path]::DirectorySeparatorChar
  if (!$resolved.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)) {throw 'LIMPEZA_FORA_DOS_TESTES'}
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
