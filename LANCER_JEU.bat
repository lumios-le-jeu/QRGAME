@echo off
title SERVEUR QRSHOT - NE PAS FERMER
color 0A

echo ===================================================
echo       LANCEMENT DE QRSHOT (SERVEUR + TUNNEL)
echo ===================================================
echo.

:: 1. VERIFICATION DE NODE
echo [1/3] Demarrage du serveur Node.js...
start "Node Server" /B node server.js
if %errorlevel% neq 0 (
    echo ERREUR : Node.js n'est pas installe ou server.js est introuvable.
    pause
    exit
)
echo    FAILED ? Non, ca tourne en tache de fond.

echo.
echo [2/3] Verification de Cloudflared...
:: On essaie de trouver cloudflared dans le PATH ou au chemin par defaut de Winget
set CLOUDFLARED_CMD=cloudflared
if exist "C:\Users\nak1oeil\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe" (
    set CLOUDFLARED_CMD="C:\Users\nak1oeil\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
)

echo [3/3] Demarrage du Tunnel vers fun.qrshotgame.fr...
%CLOUDFLARED_CMD% tunnel run --token eyJhIjoiMjI3MzU3MTZhN2YzMDQ3ZGI5OGRkNWM2MzdhYzM0M2UiLCJ0IjoiY2E2MWYzYjgtMmY5YS00NjljLWIyN2ItOTYxMDE0NDQzYjc5IiwicyI6Ik1tRmxOalJqTWpJdFpXSTFaQzAwTnpKakxXSTVaV0V0T1RVek56ZzVaV05qWkdRMiJ9

echo.
echo SI TU VOIS CA, C'EST QUE LE TUNNEL A CRASHE.
pause
