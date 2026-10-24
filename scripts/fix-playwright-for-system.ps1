# ============================================================
#  Fix: make Playwright browsers reachable for the SYSTEM task.
#  It re-registers task "TutorFeedback" to start the server through
#  start-server-for-system.cmd, which sets PLAYWRIGHT_BROWSERS_PATH
#  to the user-profile ms-playwright folder before launching Next.js.
#  Must run as Administrator (the .bat elevates automatically).
# ============================================================

$log = [System.Collections.Generic.List[string]]::new()

$launcher   = "C:\Users\33696\Projects\tutor-feedback\scripts\start-server-for-system.cmd"
$workDir    = "C:\Users\33696\Projects\tutor-feedback"
$browsers   = "C:\Users\33696\AppData\Local\ms-playwright"
$resultFile = "C:\Users\33696\fix-playwright-result.txt"

try {
    if (-not (Test-Path $launcher)) { throw "Launcher not found: $launcher" }
    if (-not (Test-Path $browsers)) { throw "Browsers folder not found: $browsers" }
    $log.Add("PRECHECK OK: launcher and browsers folder exist")

    $action = New-ScheduledTaskAction -Execute "C:\Windows\System32\cmd.exe" `
        -Argument "/c `"$launcher`"" `
        -WorkingDirectory $workDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" `
        -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -Hidden `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)

    Register-ScheduledTask -TaskName "TutorFeedback" `
        -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
        -Description "Tutor web server via launcher cmd (PLAYWRIGHT_BROWSERS_PATH set), SYSTEM, boot autostart" `
        -Force | Out-Null
    $log.Add("TASK UPDATED: action -> cmd.exe /c start-server-for-system.cmd")

    Stop-ScheduledTask -TaskName "TutorFeedback" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-ScheduledTask -TaskName "TutorFeedback"
    Start-Sleep -Seconds 8

    $t = Get-ScheduledTask -TaskName "TutorFeedback"
    $log.Add("TASK: State=$($t.State) Principal=$($t.Principal.UserId)/$($t.Principal.LogonType) Trigger=$((($t.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ',')) Hidden=$($t.Settings.Hidden)")

    $net = netstat -ano | Select-String ':3000' | Select-String 'LISTEN'
    $log.Add("port3000: $($net -join ' | ')")

    $code = & curl.exe --noproxy '*' -s -o NUL -w "%{http_code}" http://127.0.0.1:3000/
    $log.Add("HTTP: $code")
}
catch {
    $log.Add("ERROR: $($_.Exception.Message)")
}

$log | Out-File -FilePath $resultFile -Encoding utf8
Write-Output ($log -join "`n")
