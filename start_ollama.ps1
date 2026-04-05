# NeuroVision — Start Ollama with chrome-extension CORS enabled
# Run: Right-click → Run with PowerShell

Write-Host "Stopping existing Ollama processes..." -ForegroundColor Yellow
Get-Process -Name "ollama" -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process -Name "ollama app" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Write-Host "Starting Ollama with OLLAMA_ORIGINS=*..." -ForegroundColor Green

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ollama"
$psi.Arguments = "serve"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $false

# Explicitly set the environment variable in the child process
$psi.EnvironmentVariables["OLLAMA_ORIGINS"] = "*"

$process = [System.Diagnostics.Process]::Start($psi)
Write-Host "Ollama started (PID $($process.Id)) with OLLAMA_ORIGINS=*" -ForegroundColor Green
Write-Host "Keep this window open while using NeuroVision." -ForegroundColor Cyan
$process.WaitForExit()
