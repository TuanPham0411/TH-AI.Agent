param([string]$Server='https://thienha.io.vn',[switch]$FullControl,[switch]$NoStartup)
$ErrorActionPreference='Stop'
$uri=[Uri]$Server
if($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/'){throw 'Use a trusted HTTPS server origin.'}
$python=Get-Command python.exe -ErrorAction SilentlyContinue
if(-not $python){throw 'Install Python 3.10+ from python.org (include PATH), then run this installer again.'}
& $python.Source -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ required"'
if($LASTEXITCODE -ne 0){throw 'Python 3.10+ required.'}
$folder=Join-Path $env:LOCALAPPDATA 'ThienHa\DeviceLink'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $folder /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to restrict device credential folder permissions.'}
foreach($file in @('personal-device.py','personal-bridge.py','office-tool.ps1')){Invoke-WebRequest -UseBasicParsing -Uri "$($Server.TrimEnd('/'))/$file" -OutFile (Join-Path $folder $file)}
Write-Host "Server: $Server"
Write-Host "Full computer control: $($FullControl.IsPresent). Runs as $identity; it does not elevate Windows privileges."
$secure=Read-Host 'Paste the one-time device token from Connections (hidden)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
if($token -notmatch '^[A-Za-z0-9_-]{43}$'){throw 'Invalid device token.'}
$config=@{server=$Server.TrimEnd('/');token=$token;execution='desktop';unattended=$false;fullControl=$FullControl.IsPresent;roots=@{home=$env:USERPROFILE};actions=@{}}
$configPath=Join-Path $folder 'device.json'
$config|ConvertTo-Json -Depth 8|Set-Content -Encoding UTF8 -LiteralPath $configPath
$token=$null;$config=$null
$agent=Join-Path $folder 'personal-device.py'
if(-not $NoStartup){
 $action=New-ScheduledTaskAction -Execute $python.Source -Argument "`"$agent`" --config `"$configPath`""
 $trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity
 $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
 try{Register-ScheduledTask -TaskName 'TH Personal Device Link' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null;Start-ScheduledTask -TaskName 'TH Personal Device Link';Write-Host 'Installed and started. Return to Connections and refresh this device.'}
 catch{Write-Host 'Startup task could not be installed. Starting in this terminal instead; keep it open.';& $python.Source $agent --config $configPath}
} else {& $python.Source $agent --config $configPath}
