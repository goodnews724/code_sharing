$ErrorActionPreference = 'Continue'
$log    = "C:\Users\OWNER\Desktop\archive\06_project\sm_auto_log.txt"
$python = "C:\Users\OWNER\Desktop\archive\06_project\.venv\Scripts\python.exe"
$script = "C:\Users\OWNER\Desktop\archive\06_project\06_SM" + [char]0xD504 + [char]0xB85C + [char]0xADF8 + [char]0xB7A8 + [char]0xC790 + [char]0xB3D9 + [char]0xD654 + "\sm_auto.py"

$env:PYTHONIOENCODING = "utf-8"

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] START" | Add-Content $log -Encoding UTF8
& $python "-X" "utf8" $script 2>&1 | ForEach-Object { $_.ToString() } | Add-Content $log -Encoding UTF8
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] END`n" | Add-Content $log -Encoding UTF8