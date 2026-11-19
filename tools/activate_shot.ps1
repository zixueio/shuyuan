# 找到微信开发者工具窗口(优先主程序, 排除 WeChatAppEx 运行时) -> 激活置前 -> 截屏 tools/devtools_win3.png
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
}
"@
$cands = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {
    [PSCustomObject]@{ Name = $_.ProcessName; Title = $_.MainWindowTitle; H = $_.MainWindowHandle }
}
$cands | ForEach-Object { Write-Output ("PROC " + $_.Name + " | " + $_.Title) }
# 优先级1: 开发者工具主程序(进程名就是中文); 优先级2: 标题含微信开发者工具/devtools;
# 优先级3: 小游戏相关但明确排除 WeChatAppEx(上次误选中它, 激活后是聊天页)
$hit = $cands | Where-Object { $_.Name -match '微信开发者' -or $_.Name -match 'wechatdev' } | Select-Object -First 1
if (-not $hit) {
    $hit = $cands | Where-Object { $_.Title -match '微信开发者工具|devtools' } | Select-Object -First 1
}
if (-not $hit) {
    $hit = $cands | Where-Object { $_.Title -match '小游戏|英语争霸' -and $_.Name -notmatch 'WeChatAppEx' } | Select-Object -First 1
}
if ($hit) {
    Write-Output ("ACTIVATE " + $hit.Name + " | " + $hit.Title)
    [W32]::ShowWindow($hit.H, 9) | Out-Null
    [W32]::SetForegroundWindow($hit.H) | Out-Null
    Start-Sleep -Seconds 3
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
    $bmp.Save('C:/Users/23569/PycharmProjects/shuyuan/tools/devtools_win3.png')
    Write-Output 'SHOT3_OK'
} else {
    Write-Output 'NO_DEVTOOLS_WINDOW'
}
