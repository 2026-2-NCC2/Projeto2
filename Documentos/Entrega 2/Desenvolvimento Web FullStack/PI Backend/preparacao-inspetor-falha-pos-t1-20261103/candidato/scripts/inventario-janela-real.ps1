$ErrorActionPreference='Stop'
$processes=@(Get-CimInstance Win32_Process|Where-Object {$_.Name -match '^(node|node_repl|mysqld|mariadbd|Postman|Insomnia|DBeaver|pgAdmin|mysqlworkbench|ngrok|cloudflared|plink).*'}|ForEach-Object {
  [pscustomobject]@{pid=[int]$_.ProcessId;name=$_.Name;category=if($_.Name -match '^mysqld|mariadbd'){'MYSQL_LOCAL'}elseif($_.CommandLine -match 'codex|mcp|node_repl'){'CODEX_MCP'}elseif($_.CommandLine -match 'PI Backend|TrocaTicket|server\.js|homologacao|validar-rpc|limpeza|janela-real|instancia-planejada'){'BACKEND_POSSIVEL'}else{'NAO_ATRIBUIDO'}}
})
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalPort -in @(3001,3107,3111)}|Select-Object @{n='port';e={[int]$_.LocalPort}},@{n='pid';e={[int]$_.OwningProcess}})
$mysqlClients=@(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue|Where-Object {$_.RemotePort -eq 3306}|Select-Object @{n='pid';e={[int]$_.OwningProcess}})
$tasks=@(Get-ScheduledTask -ErrorAction SilentlyContinue|Where-Object {($_.Actions.Execute -join ' ')+' '+($_.Actions.Arguments -join ' ') -match 'PI Backend|TrocaTicket|Projeto2'}|Select-Object @{n='name';e={$_.TaskName}},@{n='state';e={[string]$_.State}})
[pscustomobject]@{processes=$processes;listeners=$listeners;mysqlClients=$mysqlClients;tasks=$tasks}|ConvertTo-Json -Depth 5 -Compress
