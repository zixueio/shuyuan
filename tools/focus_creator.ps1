Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Fg {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
}
"@
$p = Get-Process -Id 64676 -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Output "NO_WINDOW_HANDLE"; exit 1 }
[Win32Fg]::ShowWindow($h, 9) | Out-Null
[Win32Fg]::SetForegroundWindow($h) | Out-Null
Write-Output "FOCUSED hwnd=$h title=$($p.MainWindowTitle)"
