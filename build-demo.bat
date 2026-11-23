@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 24 from https://nodejs.org/
  pause
  exit /b 1
)
node main.ts --input sample\synthetic_snapshot.json --output out
if errorlevel 1 (
  echo Build failed. Node.js 22.18 or newer is required.
  pause
  exit /b 1
)
start "" "out\dashboard\index.html"
