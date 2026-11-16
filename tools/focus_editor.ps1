# 强制激活 Cocos Creator 窗口: 最小化->还原->前台, 核对 GetForegroundWindow
$p = Get-Process CocosCreator | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
if (-not $p) { Write-Output "NO-WINDOW"; exit }
Add-Type -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
'@ -Name U -Namespace W
$h = $p.MainWindowHandle
[W.U]::ShowWindow($h, 6) | Out-Null   # SW_MINIMIZE
Start-Sleep -Milliseconds 600
[W.U]::ShowWindow($h, 9) | Out-Null   # SW_RESTORE
Start-Sleep -Milliseconds 800
$ok = [W.U]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 500
$fg = [W.U]::GetForegroundWindow()
Write-Output ("pid=" + $p.Id + " setfg=" + $ok + " fgIsTarget=" + ($fg -eq $h) + " title=" + $p.MainWindowTitle)
