$ErrorActionPreference='Stop'
$scripts=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../scripts'))
$file=Join-Path $scripts 'processo-substituicao-selada.ps1'
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if($errors.Count -ne 0){throw 'AST_INVALIDA'}
$function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-Entry'},$true)
if($null -eq $function){throw 'FUNCAO_AUSENTE'}
# Executa somente o predicado puro extraido; nao executa o script nativo.
$source=$function.Extent.Text.Replace('$PSScriptRoot',("'"+$scripts.Replace("'","''")+"'"))
. ([scriptblock]::Create($source))
$entry=Join-Path $scripts 'restabelecer-controlador-apos-reinicio.cjs'
$forward=$entry.Replace('\','/')
$withForward=[pscustomobject]@{Name='node.exe';CommandLine=('node.exe "'+$forward+'" --restabelecer-pos-t1-selado')}
$withCanonical=[pscustomobject]@{Name='node.exe';CommandLine=('node.exe "'+$entry+'" --restabelecer-pos-t1-selado')}
$a=Test-Entry $withForward 'restabelecer-controlador-apos-reinicio.cjs'
$b=Test-Entry $withCanonical 'restabelecer-controlador-apos-reinicio.cjs'
if($a -ne $false -or $b -ne $true){throw 'RESULTADO_INESPERADO'}
[pscustomobject]@{scope='REPLAY_PURO_DO_FORMATO_NAO_EVIDENCIA_DE_PROCESSO_ATIVO';forwardSlashEntryAccepted=$a;canonicalEntryAccepted=$b;failedAttemptUsedForwardSlash=$true;nativeIdentityOrAdmissionExecuted=$false}|ConvertTo-Json -Compress
