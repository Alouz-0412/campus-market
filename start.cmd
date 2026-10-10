@echo off
cd /d "%~dp0"

set "PY=D:\python\python.exe"
if not exist "%PY%" set "PY=python"

echo ============================================================
echo   Campus Market - starting server
echo ============================================================
echo   Python   : %PY%
echo   Homepage : http://127.0.0.1:8000/
echo   API docs : http://127.0.0.1:8000/docs
echo   Stop     : press Ctrl+C
echo ============================================================
echo.

rem wait 4s before opening the browser so the server is ready
start "campus-market" /min cmd /c "timeout /t 4 /nobreak >nul && explorer http://127.0.0.1:8000/"

"%PY%" "backend\run.py"

echo.
echo Server stopped.
pause
