# Starts only the independent, local plant editor; keep this terminal open.
$ErrorActionPreference = 'Stop'
$editorRoot = $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $editorRoot 'package.json') -Raw | ConvertFrom-Json
if ($package.name -ne 'plantas-rio-content-editor') { throw 'Unexpected editor project.' }
$editorUrl = 'http://127.0.0.1:5174'
$runningEditor = $null
try {
    $runningEditor = Invoke-RestMethod -Uri ($editorUrl + '/package.json') -TimeoutSec 3
} catch {
    # No reachable plant editor yet; start this workspace's server below.
}
if ($runningEditor.name -eq $package.name) {
    Write-Output ('Plant content editor is already running: ' + $editorUrl)
    Write-Output 'Open that address in your browser. No second server is needed.'
    exit 0
}
$workspaceRoot = Split-Path $editorRoot -Parent
$localNode = Join-Path $workspaceRoot '.tools\node\node-v22.14.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $localNode 'node.exe')) {
    $env:PATH = $localNode + ';' + $env:PATH
}
Set-Location -LiteralPath $editorRoot
if (-not (Test-Path -LiteralPath 'node_modules\vite\bin\vite.js')) {
    throw 'Dependencies are missing. Run npm.cmd ci in this folder first.'
}
Write-Output 'Plant content editor: http://127.0.0.1:5174 (Ctrl+C to stop).'
& npm.cmd run dev
exit $LASTEXITCODE
