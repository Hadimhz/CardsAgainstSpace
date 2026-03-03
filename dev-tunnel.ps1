Write-Host "Checking SSH host reachability..."
$tcp = New-Object System.Net.Sockets.TcpClient
if (-not $tcp.ConnectAsync("57.129.70.231", 22).Wait(10000)) {
    Write-Host "Cannot reach 57.129.70.231:22. Aborting."
    exit 1
}
$tcp.Close()

Write-Host "Opening SSH reverse tunnel in new Windows Terminal tab..."
Start-Process -FilePath "wt" -ArgumentList "--window", "0", "new-tab", "--title", "SSH-Tunnel", "--", "ssh", "-N", "-R", "5173:localhost:5173", "ubuntu@57.129.70.231"

Write-Host "Waiting for tunnel to negotiate..."
Start-Sleep -Seconds 4

Write-Host "Starting bun dev..."
$dev = Start-Process -FilePath "bun" -ArgumentList "run", "dev" -PassThru -NoNewWindow

Write-Host "Press Ctrl+C to stop both."
try {
    Wait-Process -Id $dev.Id
} finally {
    Stop-Process -Id $dev.Id -ErrorAction SilentlyContinue
    Get-Process -Name "ssh" -ErrorAction SilentlyContinue | Stop-Process -ErrorAction SilentlyContinue
    Write-Host "Done."
}
