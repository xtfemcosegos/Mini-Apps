@echo off
title Mini Apps Suite :7006 - Micro-aplicaciones Táctiles CIC OS 3
color 0A

echo.
echo  ====================================================================
echo   CIC OS 3 - MINI APPS SUITE (PUERTO 7006)
echo   Checador Facial IA, CDI Andén, Recorridos GPS y Bitácora Móvil
echo   CSCP SA DE CV / FEMSA - Ecosistema CIC
echo  ====================================================================
echo.

:: Obtener IP Local
set IP=127.0.0.1
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"Direcci" ^| findstr /v "169.254" ^| findstr /v "::1"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
set IP=%IP: =%

echo  [*] IP de Red Local detectada: %IP%
echo.

:: Verificar si el puerto 7006 ya está activo (vía UBE u otro servidor)
netstat -ano | findstr ":7006" | findstr "LISTENING" > nul
if %errorlevel% equ 0 (
    echo  [OK] Puerto 7006 ya activo y atendido en el sistema.
) else (
    echo  [*] Iniciando servidor local dedicado para Mini Apps en puerto 7006...
    start "Mini Apps Suite :7006" cmd /k "cd /d "%~dp0" && node server.js"
    timeout /t 2 /nobreak > nul
)

echo.
echo  ====================================================================
echo    ENLACES DIRECTOS A LAS MINI APPS (PUERTO 7006):
echo  ====================================================================
echo    Hub Mini Apps:        http://localhost:7006/
echo    Checador Facial IA:   http://localhost:7006/checador-movil.html
echo    CDI Andén:            http://localhost:7006/cdi-movil.html
echo    Recorridos GPS:       http://localhost:7006/recorrido-movil.html
echo    Bitácora Móvil:       http://localhost:7006/bitacora-movil.html
echo    Red Local:            http://%IP%:7006/
echo    Nube Oficial:         https://cic-os-miniapps.web.app/
echo  ====================================================================
echo.

echo  Abriendo Mini Apps Hub en su navegador...
timeout /t 2 /nobreak > nul
start "" "http://localhost:7006/"

echo.
echo  Presiona cualquier tecla para cerrar esta ventana.
pause > nul
