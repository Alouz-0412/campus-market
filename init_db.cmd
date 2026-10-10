@echo off
cd /d "%~dp0"

set "PY=D:\python\python.exe"
if not exist "%PY%" set "PY=python"

echo ============================================================
echo   Campus Market - rebuild database and seed demo data
echo ============================================================
echo   WARNING: the business tables in campus_market will be DROPPED.
echo   Make sure the server is stopped before running this.
echo ============================================================
echo.
set /p "ans=Type y then Enter to continue, anything else cancels: "
if /i not "%ans%"=="y" goto :cancel

echo.
"%PY%" "backend\scripts\init_db.py"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo Done. You can now run start.cmd
) else (
  echo Failed with exit code %RC%.
  echo Check the DB credentials in .env and whether the MySQL80 service is running.
)
pause
exit /b %RC%

:cancel
echo Cancelled, nothing changed.
pause
exit /b 0
