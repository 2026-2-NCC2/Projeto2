$ErrorActionPreference='Stop'
$backend=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$package=Join-Path $backend 'preparacao-integracao-retomada-20261103'
$fixture=Join-Path $PSScriptRoot ('fixture-'+[guid]::NewGuid().ToString('N'))
$utf8=New-Object Text.UTF8Encoding($false)
function Git-Test([string[]]$Arguments) {
  $r=& git -C $fixture @Arguments
  if($LASTEXITCODE -ne 0){throw 'GIT_TESTE_RECUSADO'}
  return $r
}
function Hash([string]$File) {return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()}
try {
  [IO.Directory]::CreateDirectory((Join-Path $fixture 'PI Backend/scripts')) | Out-Null
  Git-Test @('init','--quiet') | Out-Null
  # Configuracao somente do repositorio ficticio. Nenhum commit ou git add.
  Git-Test @('config','core.autocrlf','true') | Out-Null
  [IO.File]::Copy((Join-Path $backend '.gitattributes'),(Join-Path $fixture 'PI Backend/.gitattributes'))
  $manifest=ConvertFrom-Json ([IO.File]::ReadAllText((Join-Path $package 'manifest-alteracoes.json')))
  $paths=@($manifest.files | ForEach-Object {'PI Backend/'+$_.file})
  $paths+= 'PI Backend/preparacao-integracao-retomada-20261103/publicar-status.ps1'
  $attributes=@(Git-Test (@('check-attr','text','--')+$paths))
  if($attributes.Count -ne 28 -or @($attributes | Where-Object {$_ -notmatch ': text: unset$'}).Count -ne 0){throw 'ATRIBUTOS_INCORRETOS'}
  Write-Output 'APROVADO: 27 arquivos e pacote sem conversao automatica'

  $patch=Join-Path $package 'diagnostico.patch'
  $plan=ConvertFrom-Json ([IO.File]::ReadAllText((Join-Path $package 'plano-implantacao.json')))
  if((Hash $patch) -cne $plan.patchSha256){throw 'PATCH_ALTERADO'}
  # Patch selado substitui o arquivo inteiro; reconstruir somente a fixture antiga.
  $oldLines=@([IO.File]::ReadAllLines($patch) | Where-Object {$_ -match '^-' -and $_ -notmatch '^--- '} | ForEach-Object {$_.Substring(1)})
  $entry=Join-Path $fixture 'PI Backend/scripts/substituir-controlador-selado.cjs'
  [IO.File]::WriteAllText($entry,($oldLines -join "`n")+"`n",$utf8)
  if((Hash $entry) -cne $plan.delta[0].beforeSha256){throw 'FIXTURE_ORIGEM_INCORRETA'}
  Git-Test @('apply','--check',$patch) | Out-Null
  Git-Test @('apply',$patch) | Out-Null
  if((Hash $entry) -cne $plan.delta[0].afterSha256){throw 'GIT_CONVERTEU_BYTES_SELADOS'}
  Write-Output 'APROVADO: git apply com autocrlf=true preserva LF selado'

  $sealed=Join-Path $fixture 'PI Backend/preparacao-integracao-retomada-20261103'
  [IO.Directory]::CreateDirectory($sealed) | Out-Null
  $crlf=Join-Path $sealed 'fixture-crlf.ps1'
  [IO.File]::WriteAllText($crlf,"linha1`r`nlinha2`r`n",$utf8)
  $raw=Git-Test @('hash-object','--no-filters',$crlf)
  $filtered=Git-Test @('hash-object','--path=PI Backend/preparacao-integracao-retomada-20261103/fixture-crlf.ps1',$crlf)
  if($raw -cne $filtered){throw 'GIT_CONVERTEU_CRLF_SELADO'}
  Write-Output 'APROVADO: CRLF originalmente selado tambem preservado'
  Write-Output 'TESTES_LF_CRLF: 3'
} finally {
  $resolved=[IO.Path]::GetFullPath($fixture)
  $allowed=[IO.Path]::GetFullPath($PSScriptRoot)+[IO.Path]::DirectorySeparatorChar
  if(!$resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^fixture-[a-f0-9]{32}$'){throw 'LIMPEZA_FORA_DA_FIXTURE'}
  if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
