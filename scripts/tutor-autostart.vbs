' ============================================================
' Tutor 网站静默启动器
'
' 放在「启动」文件夹里，用户登录后自动运行。
' Run(..., 0, False) 中的 0 表示窗口样式=隐藏，
' 所以不会出现黑色命令行窗口。
'
' 真正的启动逻辑在 start-server-for-system.cmd 里。
' ============================================================

Dim sh, launcher
Set sh = CreateObject("WScript.Shell")

launcher = "C:\Users\33696\Projects\tutor-feedback\scripts\start-server-for-system.cmd"

' 等待 5 秒，给系统登录后的网络/磁盘一点时间，避免抢跑
WScript.Sleep 5000

' 0 = 隐藏窗口，False = 不等待退出（后台常驻）
sh.Run """" & launcher & """", 0, False
