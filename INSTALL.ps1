$ErrorActionPreference = "Stop"

Write-Host "Cleaning old dependencies..." -ForegroundColor Cyan
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue

Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

Write-Host "Running security audit..." -ForegroundColor Cyan
npm audit

Write-Host "Starting Nexa Model..." -ForegroundColor Green
npm run dev
