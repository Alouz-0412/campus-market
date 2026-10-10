@echo off
cd /d "%~dp0"

set "PY=D:\python\python.exe"
if not exist "%PY%" set "PY=python"

set "BASE=http://127.0.0.1:8000"
if not "%~1"=="" set "BASE=%~1"

echo ============================================================
echo   Campus Market - end-to-end smoke test
echo   Target: %BASE%
echo   The server must be running (start.cmd in another window).
echo ============================================================
echo.

"%PY%" "backend\scripts\smoke_test.py" "%BASE%"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo All checks passed.
) else if "%RC%"=="2" (
  echo Cannot reach the backend. Run start.cmd first.
) else (
  echo Some checks failed - see the [FAIL] lines above.
)
pause
exit /b %RC%
