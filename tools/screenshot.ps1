# 截取整个虚拟屏幕 -> tools/devtools_win.png (看开发者工具模拟器当前画面)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$bmp.Save('C:/Users/23569/PycharmProjects/shuyuan/tools/devtools_win.png')
Write-Output ('SCREEN_OK ' + $b.Width + 'x' + $b.Height)
