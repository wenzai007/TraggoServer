# Traggo Build and Deploy Script for Windows
# This script builds the Traggo UI, creates a release binary, and deploys it to Ubuntu

Write-Host "=== Traggo Build and Deploy Script ===" -ForegroundColor Cyan

# Step 1: Build the UI
Write-Host "`n[Step 1/4] Building Traggo UI..." -ForegroundColor Yellow
Set-Location "C:\Users\wenzzha\working\repos\TraggoServer\ui"
yarn build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: yarn build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "UI build completed successfully!" -ForegroundColor Green

# Step 2: Build the release binary
Write-Host "`n[Step 2/4] Building Traggo release binary..." -ForegroundColor Yellow
Set-Location "C:\Users\wenzzha\working\repos\TraggoServer"
docker run --rm -e CGO_ENABLED=1 -v /var/run/docker.sock:/var/run/docker.sock -v /c/Users/wenzzha/working/repos/TraggoServer:/work -w /work traggo:build release --clean --snapshot --skip=docker

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Release binary build completed successfully!" -ForegroundColor Green

# Step 3: Find the generated tar.gz file
Write-Host "`n[Step 3/4] Finding generated tar.gz file..." -ForegroundColor Yellow
$distPath = "C:\Users\wenzzha\working\repos\TraggoServer\dist"
$tarFile = Get-ChildItem -Path $distPath -Filter "traggo_0.0.0-SNAPSHOT-*_linux_amd64.tar.gz" | Select-Object -First 1

if (-not $tarFile) {
    Write-Host "Error: No tar.gz file found in dist directory!" -ForegroundColor Red
    exit 1
}

$tarFileName = $tarFile.Name
$tarFilePath = $tarFile.FullName
Write-Host "Found file: $tarFileName" -ForegroundColor Green

# Step 4: SCP the file to Ubuntu
Write-Host "`n[Step 4/4] Deploying to Ubuntu server (20.6.8.1)..." -ForegroundColor Yellow

# Using pscp (PuTTY's SCP) - make sure it's installed
# Alternative: Use WinSCP or install OpenSSH on Windows

# Check if pscp is available
$pscpPath = Get-Command pscp -ErrorAction SilentlyContinue

if ($pscpPath) {
    # Using pscp
    Write-Host "Using pscp to transfer file..." -ForegroundColor Cyan
    echo y | pscp -pw Zwz@ms6165311 "$tarFilePath" bigstep@20.6.8.1:~/$tarFileName
} else {
    # Try using scp (if OpenSSH is installed on Windows)
    $scpPath = Get-Command scp -ErrorAction SilentlyContinue
    
    if ($scpPath) {
        Write-Host "Using scp to transfer file..." -ForegroundColor Cyan
        # Note: scp will prompt for password interactively
        scp "$tarFilePath" bigstep@20.6.8.1:~/$tarFileName
    } else {
        Write-Host "Error: Neither pscp nor scp found!" -ForegroundColor Red
        Write-Host "Please install one of the following:" -ForegroundColor Yellow
        Write-Host "  - PuTTY (for pscp): https://www.putty.org/" -ForegroundColor Yellow
        Write-Host "  - OpenSSH Client (Windows feature)" -ForegroundColor Yellow
        Write-Host "`nManually copy this file to Ubuntu:" -ForegroundColor Yellow
        Write-Host "  File: $tarFilePath" -ForegroundColor Cyan
        Write-Host "  Destination: bigstep@20.6.8.1:~/" -ForegroundColor Cyan
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== Deployment completed successfully! ===" -ForegroundColor Green
    Write-Host "File deployed: $tarFileName" -ForegroundColor Cyan
    Write-Host "Destination: bigstep@20.6.8.1:~/" -ForegroundColor Cyan
} else {
    Write-Host "`nError: File transfer failed!" -ForegroundColor Red
    exit 1
}
