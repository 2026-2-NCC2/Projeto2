param([Parameter(Mandatory=$true)][int]$PidHistorico)
$ErrorActionPreference='Stop'
$original=Get-CimInstance Win32_Process -Filter "ProcessId=$PidHistorico"
$os=Get-CimInstance Win32_OperatingSystem
[pscustomobject]@{origemOriginalAusente=($null -eq $original);lastBootUtc=$os.LastBootUpTime.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress
