
$tarFileName = $tarFile.Name
$tarFilePath = $tarFile.FullName

$tarFilePath = "C:\Users\wenzzha\working\repos\TraggoServer\dist\traggo_0.0.0-SNAPSHOT-39e958c_linux_amd64.tar.gz"
$tarFileName = "traggo_0.0.0-SNAPSHOT-39e958c_linux_amd64.tar.gz"
Write-Host "Found file: $tarFileName" -ForegroundColor Green

$passwordOfUbuntu = "Zwz@ms6165311"



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
    echo y | pscp -pw $passwordOfUbuntu "$tarFilePath" bigstep@20.6.8.1:~/$tarFileName
} else {
    # Try using scp with password automation
    $scpPath = Get-Command scp -ErrorAction SilentlyContinue
    
    if ($scpPath) {
        Write-Host "Using scp to transfer file..." -ForegroundColor Cyan
        
        # Option 1: Use Posh-SSH module (PowerShell native) - BEST METHOD
        if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
            Write-Host "Posh-SSH module not found. Installing..." -ForegroundColor Yellow
            try {
                Install-Module -Name Posh-SSH -Force -Scope CurrentUser -ErrorAction Stop
                Write-Host "Posh-SSH installed successfully!" -ForegroundColor Green
            }
            catch {
                Write-Host "Warning: Could not install Posh-SSH automatically. Trying alternative methods..." -ForegroundColor Yellow
            }
        }
        
        if (Get-Module -ListAvailable -Name Posh-SSH) {
            Write-Host "Using Posh-SSH module for automated transfer..." -ForegroundColor Cyan
            Import-Module Posh-SSH
            
            $password = ConvertTo-SecureString $passwordOfUbuntu -AsPlainText -Force
            $credential = New-Object System.Management.Automation.PSCredential ("bigstep", $password)
            
            Set-SCPItem -ComputerName "20.6.8.1" -Credential $credential -Path "$tarFilePath" -Destination "." -AcceptKey
        }
        # Option 2: Use expect-style automation with PowerShell
        else {
            Write-Host "Attempting automated password input..." -ForegroundColor Cyan
            
            # Create a temporary expect-like script
            $expectScript = @"
`$password = $passwordOfUbuntu
`$process = Start-Process -FilePath "scp" -ArgumentList "$tarFilePath","bigstep@20.6.8.1:~/$tarFileName" -NoNewWindow -PassThru -RedirectStandardInput
Start-Sleep -Milliseconds 500
`$process.StandardInput.WriteLine(`$password)
`$process.WaitForExit()
"@
            
            # Try using WSL if available for expect command
            $wslPath = Get-Command wsl -ErrorAction SilentlyContinue
            if ($wslPath) {
                Write-Host "Using WSL with sshpass for automated transfer..." -ForegroundColor Cyan
                
                # Check if sshpass is installed in WSL
                $sshpassCheck = wsl bash -c "which sshpass 2>/dev/null"
                if (-not $sshpassCheck) {
                    Write-Host "Installing sshpass in WSL..." -ForegroundColor Yellow
                    wsl sudo apt-get update
                    wsl sudo apt-get install -y sshpass
                }
                
                # Convert Windows path to WSL path
                $wslFilePath = wsl wslpath "`"$tarFilePath`""
                wsl sshpass -p "'$passwordOfUbuntu'" scp -o StrictHostKeyChecking=no "$wslFilePath" bigstep@20.6.8.1:~/$tarFileName
            }
            else {
                # Fallback: Show password and use interactive scp
                Write-Host "`nFor automated transfer, install one of:" -ForegroundColor Yellow
                Write-Host "  1. Posh-SSH module: Install-Module -Name Posh-SSH" -ForegroundColor Cyan
                Write-Host "  2. PuTTY suite (pscp): https://www.putty.org/" -ForegroundColor Cyan
                Write-Host "  3. WSL with sshpass: wsl --install" -ForegroundColor Cyan
                Write-Host "`nFor now, enter password manually when prompted:" -ForegroundColor Yellow
                Write-Host "Password: $passwordOfUbuntu" -ForegroundColor Green
                scp -o StrictHostKeyChecking=no "$tarFilePath" bigstep@20.6.8.1:~/$tarFileName
            }
        }
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


