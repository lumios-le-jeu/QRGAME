$exePath = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"

Write-Host "Attempting to install Cloudflare Tunnel..." -ForegroundColor Cyan

# Check if we are administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERROR: LE TERMINAL N'EST PAS ADMINISTRATEUR !" -ForegroundColor Red
    Write-Host "Veuillez faire un clic droit sur PowerShell > 'Exécuter en tant qu'administrateur' et relancer ce script." -ForegroundColor Yellow
    exit 1
}

if (Test-Path $exePath) {
    Write-Host "Found cloudflared at: $exePath"
    & $exePath service install eyJhIjoiMjI3MzU3MTZhN2YzMDQ3ZGI5OGRkNWM2MzdhYzM0M2UiLCJ0IjoiY2E2MWYzYjgtMmY5YS00NjljLWIyN2ItOTYxMDE0NDQzYjc5IiwicyI6Ik1tRmxOalJqTWpJdFpXSTFaQzAwTnpKakxXSTVaV0V0T1RVek56ZzVaV05qWkdRMiJ9
} else {
    Write-Host "Cloudflared executable not found in known path. Trying global access..."
    cloudflared service install eyJhIjoiMjI3MzU3MTZhN2YzMDQ3ZGI5OGRkNWM2MzdhYzM0M2UiLCJ0IjoiY2E2MWYzYjgtMmY5YS00NjljLWIyN2ItOTYxMDE0NDQzYjc5IiwicyI6Ik1tRmxOalJqTWpJdFpXSTFaQzAwTnpKakxXSTVaV0V0T1RVek56ZzVaV05qWkdRMiJ9
}

if ($?) {
    Write-Host "SUCCÈS ! Service installé." -ForegroundColor Green
    exit 0
} else {
    Write-Host "ÉCHEC de l'installation." -ForegroundColor Red
    exit 1
}
