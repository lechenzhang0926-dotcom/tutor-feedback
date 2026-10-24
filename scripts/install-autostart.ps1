# ============================================================
# Register boot autostart scheduled task (requires Administrator)
#
# Called by install-autostart.bat after elevation.
# English-only on purpose: PowerShell 5.1 parses BOM-less UTF-8 files
# as ANSI, which corrupts CJK characters and can break the parser.
# ============================================================

$ErrorActionPreference = 'Stop'

$apDir    = 'C:\Users\33696\Projects\tutor-feedback'
$launcher = Join-Path $apDir 'scripts\start-server-for-system.cmd'
$taskName = 'TutorFeedback'

# ---------- admin check ----------
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host '[ERROR] Administrator rights required.' -ForegroundColor Red
    Write-Host '        Right-click install-autostart.bat -> Run as administrator'
    exit 1
}

Write-Host "[INFO] Running as $($id.Name) (Administrator)"

# ---------- precheck ----------
if (-not (Test-Path $launcher)) {
    Write-Host "[ERROR] Launcher not found: $launcher" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $apDir '.next\BUILD_ID'))) {
    Write-Host '[WARN] .next\BUILD_ID missing - run "npm run build" first' -ForegroundColor Yellow
}

# ---------- register task ----------
try {
    $action = New-ScheduledTaskAction `
        -Execute 'C:\Windows\System32\cmd.exe' `
        -Argument ('/c "' + $launcher + '"') `
        -WorkingDirectory $apDir

    $trigger = New-ScheduledTaskTrigger -AtStartup

    # SYSTEM + ServiceAccount: runs in session 0, no visible window on desktop
    $taskPrincipal = New-ScheduledTaskPrincipal `
        -UserId 'SYSTEM' `
        -LogonType ServiceAccount `
        -RunLevel Highest

    $settings = New-ScheduledTaskSettingsSet `
        -Hidden `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $taskPrincipal `
        -Settings $settings `
        -Description 'Tutor feedback web server (SYSTEM, boot autostart, no window)' `
        -Force | Out-Null

    Write-Host '[OK] Scheduled task registered' -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] Registration failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ---------- report ----------
$t = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($t) {
    Write-Host ''
    Write-Host '---------- Current task ----------'
    Write-Host ('Name    : ' + $t.TaskName)
    Write-Host ('State   : ' + $t.State)
    Write-Host ('RunAs   : ' + $t.Principal.UserId + ' / ' + $t.Principal.LogonType)
    Write-Host ('Trigger : ' + (($t.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ', '))
    foreach ($a in $t.Actions) {
        Write-Host ('Action  : ' + $a.Execute + ' ' + $a.Arguments)
    }
}

Write-Host ''
Write-Host 'Done. The site starts at boot, no login needed, no window shown.'
Write-Host 'To let the task take over right now, run scripts\start-now.bat as administrator.'
