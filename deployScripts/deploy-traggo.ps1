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

# Read password from config.txt file (add config.txt to .gitignore)
$passwordOfUbuntu = (Get-Content "C:\Users\wenzzha\Downloads\PassForUbuntuNothingSpecial\pass.txt" -Raw).Trim()

# Initialize transfer success flag
$transferSuccess = $false

# Check if Posh-SSH is available, install if not
if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
    Write-Host "Posh-SSH module not found. Installing..." -ForegroundColor Yellow
    try {
        Install-Module -Name Posh-SSH -Force -Scope CurrentUser -ErrorAction Stop
        Write-Host "Posh-SSH installed successfully!" -ForegroundColor Green
    }
    catch {
        Write-Host "Error: Could not install Posh-SSH: $_" -ForegroundColor Red
        exit 1
    }
}

# Use Posh-SSH for transfer
Write-Host "Using Posh-SSH module for automated transfer..." -ForegroundColor Cyan
Import-Module Posh-SSH

$password = ConvertTo-SecureString $passwordOfUbuntu -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential ("bigstep", $password)

try {
    # -AcceptKey automatically accepts the SSH host key
    Set-SCPItem -ComputerName "20.6.8.1" -Credential $credential -Path "$tarFilePath" -Destination "/home/bigstep/" -AcceptKey -ErrorAction Stop
    Write-Host "File transferred successfully!" -ForegroundColor Green
    $transferSuccess = $true
}
catch {
    Write-Host "Posh-SSH transfer failed: $_" -ForegroundColor Red
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor Red
    $transferSuccess = $false
    exit 1
}

if ($transferSuccess) {
    Write-Host "`n=== Deployment completed successfully! ===" -ForegroundColor Green
    Write-Host "File deployed: $tarFileName" -ForegroundColor Cyan
    Write-Host "Destination: bigstep@20.6.8.1:/home/bigstep/" -ForegroundColor Cyan
} else {
    Write-Host "`nError: File transfer failed!" -ForegroundColor Red
    exit 1
}