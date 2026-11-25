@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

echo ============================================================
echo   Instalador sin terminal - Fabrica de Clips DomUP
echo ============================================================
echo.

set "NEED_WINGET=0"

where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo [..] Instalando ffmpeg (Gyan.FFmpeg^)...
  winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
  set "NEED_WINGET=1"
)

set "PY_CMD="
where python >nul 2>&1 && set "PY_CMD=python"
if not defined PY_CMD (
  if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set "PY_CMD=%LocalAppData%\Programs\Python\Python312\python.exe"
)
if not defined PY_CMD (
  echo [..] Instalando Python 3.12 (Python.Python.3.12^)...
  winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
  set "NEED_WINGET=1"
)

where node >nul 2>&1
if errorlevel 1 (
  echo [..] Instalando Node.js LTS (OpenJS.NodeJS.LTS^)...
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  set "NEED_WINGET=1"
)

:: T6.d: recargar PATH desde el registro (HKLM + HKCU) despues de winget
if "!NEED_WINGET!"=="1" (
  for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
  for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
  if defined SYS_PATH call set "SYS_PATH=!SYS_PATH!"
  if defined USR_PATH call set "USR_PATH=!USR_PATH!"
  if defined SYS_PATH set "PATH=!SYS_PATH!;!USR_PATH!;!PATH!"
)

:: Buscar python.exe en ubicaciones estandar si todavia no aparece en PATH
set "PY_CMD="
where python >nul 2>&1 && set "PY_CMD=python"
if not defined PY_CMD if exist "%LocalAppData%\Programs\Python\Python312\python.exe" (
  set "PY_CMD=%LocalAppData%\Programs\Python\Python312\python.exe"
  set "PATH=%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python312\Scripts;!PATH!"
)
if not defined PY_CMD if exist "%ProgramFiles%\Python312\python.exe" (
  set "PY_CMD=%ProgramFiles%\Python312\python.exe"
  set "PATH=%ProgramFiles%\Python312;%ProgramFiles%\Python312\Scripts;!PATH!"
)
if not defined PY_CMD (
  where py >nul 2>&1 && set "PY_CMD=py -3"
)

if defined PY_CMD (
  echo [..] Verificando librerias Python (opencv-python, pillow, numpy^)...
  !PY_CMD! -c "import cv2, PIL, numpy" >nul 2>&1
  if errorlevel 1 (
    echo [..] Instalando opencv-python pillow numpy...
    !PY_CMD! -m pip install --upgrade opencv-python pillow numpy
  )
)

:: T6.e: leer Documentos desde User Shell Folders (Personal) con fallback a %USERPROFILE%\Documents
set "DOCS_DIR="
for /f "tokens=2*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" /v Personal 2^>nul') do set "DOCS_RAW=%%B"
if defined DOCS_RAW (
  call set "DOCS_DIR=!DOCS_RAW!"
)
if not defined DOCS_DIR set "DOCS_DIR=%USERPROFILE%\Documents"
if not exist "!DOCS_DIR!" mkdir "!DOCS_DIR!" >nul 2>&1

set "WORK_DIR=!DOCS_DIR!\Fabrica DomUP"
set "CLIPS_DIR=!WORK_DIR!\clips"
set "ENV_FILE=!WORK_DIR!\.env.local"
if not exist "!CLIPS_DIR!" mkdir "!CLIPS_DIR!" >nul 2>&1

set "CLIPS_RAIZ_FWD=!CLIPS_DIR:\=/!"
set "CLIPS_ENV_FWD=!ENV_FILE:\=/!"

:: T6.f: .env.local solo con CLIPS_RAIZ, CLIPS_ENV_LOCAL y ELEVENLABS_API_KEY (SHORTS_MTL/CLIPS_SKILL_SCRIPTS se resuelven relativos al plugin)
set "K_ELEVEN=ELEVENLABS_API_KEY"
set "EXISTING_ELEVEN="
if exist "!ENV_FILE!" (
  for /f "usebackq tokens=1,* delims==" %%A in ("!ENV_FILE!") do (
    if /i "%%A"=="!K_ELEVEN!" set "EXISTING_ELEVEN=%%B"
  )
)
(
  echo CLIPS_RAIZ=!CLIPS_RAIZ_FWD!
  echo CLIPS_ENV_LOCAL=!CLIPS_ENV_FWD!
  echo !K_ELEVEN!=!EXISTING_ELEVEN!
) > "!ENV_FILE!"

echo.
echo ============================================================
echo   Resumen de verificacion
echo ============================================================

set "OK_FFMPEG=❌"
where ffmpeg >nul 2>&1 && where ffprobe >nul 2>&1 && set "OK_FFMPEG=✅"
echo   !OK_FFMPEG! ffmpeg y ffprobe

set "OK_PYTHON=❌"
if defined PY_CMD (
  !PY_CMD! --version >nul 2>&1 && set "OK_PYTHON=✅"
)
echo   !OK_PYTHON! Python 3.12

set "OK_PYLIBS=❌"
if defined PY_CMD (
  !PY_CMD! -c "import cv2, PIL, numpy" >nul 2>&1 && set "OK_PYLIBS=✅"
)
echo   !OK_PYLIBS! Librerias Python (opencv-python, pillow, numpy^)

set "OK_NODE=❌"
where node >nul 2>&1 && set "OK_NODE=✅"
echo   !OK_NODE! Node.js LTS

set "OK_CURL=❌"
where curl.exe >nul 2>&1 && set "OK_CURL=✅"
echo   !OK_CURL! curl.exe

set "OK_CARPETA=❌"
if exist "!CLIPS_DIR!" set "OK_CARPETA=✅"
echo   !OK_CARPETA! Carpeta de trabajo: !CLIPS_DIR!

set "OK_ENV=❌"
if exist "!ENV_FILE!" set "OK_ENV=✅"
echo   !OK_ENV! Archivo .env.local: !ENV_FILE!

set "OK_ELEVEN=❌"
if defined EXISTING_ELEVEN if not "!EXISTING_ELEVEN!"=="" set "OK_ELEVEN=✅"
echo   !OK_ELEVEN! ELEVENLABS_API_KEY en .env.local

echo.
if "!OK_ELEVEN!"=="❌" (
  echo Se va a abrir .env.local en el Bloc de notas para que pegues tu ELEVENLABS_API_KEY
  echo despues del signo =, guardes el archivo ^(Ctrl+G / Guardar^) y lo cierres.
  echo Nunca pegues tu clave en el chat.
  start "" notepad.exe "!ENV_FILE!"
  echo.
)
echo ============================================================
echo   Listo. Cerra y volve a abrir Claude para tomar los cambios.
echo ============================================================
pause
endlocal
