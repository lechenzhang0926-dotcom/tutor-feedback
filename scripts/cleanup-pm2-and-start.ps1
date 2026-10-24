# Cleanup pm2 remnants and start the proper TutorFeedback server.
# (Run by the elevated .bat)

$log = [System.Collections.Generic.List[string]]::new()
try {
    Stop-ScheduledTask -TaskName "TutorFeedback" -ErrorAction SilentlyContinue
    $log.Add("Stopped TutorFeedback task")
    Start-Sleep -Seconds 1

    $procs = Get-CimInstance Win32_Process | Where-Object {
        ($_.CommandLine -like "*pm2*lib*Daemon.js*") -or
        ($_.CommandLine -like "*next*dist*bin*next start*")
    }
    foreach ($p in $procs) {
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $log.Add("Killed PID $($p.ProcessId)") }
        catch { $log.Add("Kill PID $($p.ProcessId) ERR: $($_.Exception.Message)") }
    }
    Start-Sleep -Seconds 2

    $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) { $log.Add("WARN port3000 still held by $($conn.OwningProcess)") } else { $log.Add("port3000 FREE") }

    $runKeys = @("HKLM:\Software\Microsoft\Windows\CurrentVersion\Run", "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run")
    $foundAuto = $false
    foreach ($k in $runKeys) {
        if (Test-Path $k) {
            $vals = Get-ItemProperty -Path $k
            $vals.PSObject.Properties | Where-Object { $_.Name -like "*pm2*" -or $_.Value -like "*pm2*" } | ForEach-Object { $log.Add("AUTOSTART pm2 entry in $k : $($_.Name)"); $foundAuto = $true }
        }
    }
    if (-not $foundAuto) { $log.Add("No pm2 auto-start registry entry found (good)") }

    Start-ScheduledTask -TaskName "TutorFeedback"
    $log.Add("Started TutorFeedback task")
    Start-Sleep -Seconds 12

    $t = Get-ScheduledTask -TaskName "TutorFeedback"
    $log.Add("TaskState: $($t.State)")
    $conn2 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn2) {
        $log.Add("port3000 LISTENING pid=$($conn2.OwningProcess)")
        $w = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn2.OwningProcess)"
        $log.Add("ServerCmd: $($w.CommandLine)")
        $pp = Get-CimInstance Win32_Process -Filter "ProcessId=$($w.ParentProcessId)" -ErrorAction SilentlyContinue
        if ($pp) { $log.Add("ParentCmd: $($pp.CommandLine)") } else { $log.Add("ParentCmd: (parent gone)") }
    } else {
        $log.Add("port3000 NOT LISTENING - server failed to start!")
    }
    try { $r = Invoke-WebRequest -Uri http://127.0.0.1:3000/ -TimeoutSec 10 -UseBasicParsing; $log.Add("HTTP: $($r.StatusCode)") }
    catch { $log.Add("HTTP ERR: $($_.Exception.Message)") }
}
catch { $log.Add("FATAL: $($_.Exception.Message)") }
$log | Out-File -FilePath "C:\Users\33696\cleanup-result.txt" -Encoding utf8
