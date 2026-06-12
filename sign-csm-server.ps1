# Ký csm_server.exe trên Windows (không cần signtool / Windows SDK)
# Chạy PowerShell "Run as administrator":
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\sign-csm-server.ps1
#
# Dùng cho máy nội bộ: tạo cert self-signed, tin cậy trên máy này, ký exe.
# Smart App Control có thể vẫn chặn — khi đó tắt SAC hoặc mua cert Code Signing thật.

param(
    [string]$ExePath = "$PSScriptRoot\csm_server.exe",
    [string]$CertName = "CN=CSM Server Internal"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ExePath)) {
    Write-Error "Khong tim thay: $ExePath"
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Error "Hay mo PowerShell Run as administrator."
}

Write-Host "=== Ky noi bo csm_server.exe ===" -ForegroundColor Cyan
Write-Host "File: $ExePath"

# Cert ky ma trong LocalMachine\My (hoac dung lai neu da co)
$cert = Get-ChildItem Cert:\LocalMachine\My -CodeSigningCert -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -eq $CertName } |
    Select-Object -First 1

if (-not $cert) {
    Write-Host "Tao certificate moi: $CertName"
    $cert = New-SelfSignedCertificate `
        -Subject $CertName `
        -Type CodeSigningCert `
        -CertStoreLocation Cert:\LocalMachine\My `
        -KeyExportPolicy Exportable `
        -NotAfter (Get-Date).AddYears(5)
}

# Tin cert tren may nay (Root + TrustedPublisher)
foreach ($storeName in @("Root", "TrustedPublisher")) {
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, "LocalMachine")
    $store.Open("ReadWrite")
    if (-not ($store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint })) {
        $store.Add($cert)
        Write-Host "Da them cert vao LocalMachine\$storeName"
    }
    $store.Close()
}

# Ky bang PowerShell — khong can signtool
Write-Host "Dang ky file..."
$sig = Set-AuthenticodeSignature -FilePath $ExePath -Certificate $cert -HashAlgorithm SHA256

Write-Host "Status: $($sig.Status)" -ForegroundColor $(if ($sig.Status -eq "Valid") { "Green" } else { "Yellow" })
Write-Host "Signer: $($sig.SignerCertificate.Subject)"

if ($sig.Status -ne "Valid") {
    Write-Host ""
    Write-Host "Neu van bi Smart App Control chan:" -ForegroundColor Yellow
    Write-Host "  Settings > Privacy & security > Windows Security > App & browser control"
    Write-Host "  > Smart App Control > Off"
    Write-Host ""
    Write-Host "Hoac mua Code Signing Certificate (OV/EV) va dung signtool + Windows SDK."
    exit 1
}

Write-Host ""
Write-Host "[OK] Da ky. Thu chay: .\start-csm-rust-service.bat" -ForegroundColor Green
