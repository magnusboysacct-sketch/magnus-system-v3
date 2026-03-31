param(
  [Parameter(Mandatory=$true)]
  [string]$Name
)

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$cleanName = $Name.Trim().ToLower() -replace "[^a-z0-9]+","_" -replace "^_+|_+$",""
$fileName = "$timestamp" + "_" + "$cleanName.sql"
$fullPath = Join-Path ".\supabase\migrations" $fileName

New-Item -ItemType File -Path $fullPath -Force | Out-Null
Write-Host "Created migration:" $fullPath
