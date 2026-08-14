$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$distRoot = Join-Path $projectRoot 'dist'
$clientRoot = Join-Path $distRoot 'client'
$serverRoot = Join-Path $distRoot 'server'

if (Test-Path -LiteralPath $distRoot) {
  Remove-Item -LiteralPath $distRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $clientRoot, $serverRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'index.html') -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'app.config.json') -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'styles.css') -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'js') -Destination $clientRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'worker\index.js') -Destination (Join-Path $serverRoot 'index.js')

Write-Output "Static build created in $distRoot"
