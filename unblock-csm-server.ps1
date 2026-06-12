# Go bo Zone.Identifier (file copy tu Mac/USB) — thu truoc khi ky hoac chay
# PowerShell: Set-ExecutionPolicy -Scope Process Bypass; .\unblock-csm-server.ps1

param(
    [string]$Dir = $PSScriptRoot
)

Write-Host "Unblock trong: $Dir"
Get-ChildItem -LiteralPath $Dir -Include "csm_server.exe", "lib*.dll" -File -ErrorAction SilentlyContinue |
    ForEach-Object {
        Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue
        Write-Host "  OK $($_.Name)"
    }

Write-Host "[OK] Xong. Chay lai csm_server.exe"
