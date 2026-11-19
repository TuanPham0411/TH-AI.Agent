param([string]$Server='https://thienha.io.vn',[switch]$FullControl,[switch]$EnableOdbc,[switch]$EnableFacebookBrowser,[ValidateSet('chrome','msedge','chromium')][string]$BrowserChannel='chrome',[switch]$NoStartup,[string]$PythonPath='',[switch]$RePair)
$ErrorActionPreference='Stop'
$uri=[Uri]$Server
if($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/'){throw 'Use a trusted HTTPS server origin.'}
$pythonExe=$PythonPath
if(-not $pythonExe){$python=Get-Command python.exe -ErrorAction SilentlyContinue;if($python){$pythonExe=$python.Source}}
if(-not $pythonExe -or -not (Test-Path -LiteralPath $pythonExe)){throw 'Install Python 3.10+ matching your ODBC driver (32/64-bit), then use -PythonPath if needed.'}
& $pythonExe -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ required"'
if($LASTEXITCODE -ne 0){throw 'Python 3.10+ required.'}
if($EnableOdbc){
 & $pythonExe -m pip install --user pyodbc
 if($LASTEXITCODE -ne 0){throw 'Unable to install pyodbc in this Python. Check pip/network or use the matching Python architecture.'}
}
if($EnableFacebookBrowser){
 & $pythonExe -m pip install --user playwright
 if($LASTEXITCODE -ne 0){throw 'Unable to install Playwright in the selected Python.'}
 if($BrowserChannel -eq 'chromium'){& $pythonExe -m playwright install chromium;if($LASTEXITCODE -ne 0){throw 'Unable to install Chromium.'}}
}
$folder=Join-Path $env:LOCALAPPDATA 'ThienHa\DeviceLink'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $folder /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to restrict device credential folder permissions.'}
foreach($file in @('personal-device.py','personal-bridge.py','personal-odbc.py','facebook-browser.py','office-tool.ps1')){Invoke-WebRequest -UseBasicParsing -Uri "$($Server.TrimEnd('/'))/$file" -OutFile (Join-Path $folder $file)}
Write-Host "Server: $Server"
Write-Host "Full computer control: $($FullControl.IsPresent). Runs as $identity; it does not elevate Windows privileges."
$previousPath=Join-Path $folder 'device.json'
$previous=$null
if(Test-Path -LiteralPath $previousPath){$previous=Get-Content -Raw -LiteralPath $previousPath|ConvertFrom-Json}
if(-not $RePair -and $previous -and $previous.server -eq $Server.TrimEnd('/') -and $previous.token -match '^[A-Za-z0-9_-]{43}$'){
 $token=$previous.token
 Write-Host 'Updating the existing device pairing; your private token is preserved.'
}else{
 $secure=Read-Host 'Paste the one-time device token from Connections (hidden)' -AsSecureString
 $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
 try{$token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
}
if($token -notmatch '^[A-Za-z0-9_-]{43}$'){throw 'Invalid device token.'}
$config=@{}
if($previous){foreach($property in $previous.PSObject.Properties){$config[$property.Name]=$property.Value}}
$config.server=$Server.TrimEnd('/');$config.token=$token;$config.execution='desktop';$config.unattended=$false
if(-not $previous -or $PSBoundParameters.ContainsKey('FullControl')){$config.fullControl=$FullControl.IsPresent}
if(-not $previous -or $PSBoundParameters.ContainsKey('EnableOdbc')){$config.enableOdbc=$EnableOdbc.IsPresent}
if(-not $previous -or $PSBoundParameters.ContainsKey('EnableFacebookBrowser')){$config.enableFacebookBrowser=$EnableFacebookBrowser.IsPresent}
if(-not $previous -or $PSBoundParameters.ContainsKey('BrowserChannel')){$config.browserChannel=$BrowserChannel}
if(-not $config.roots){$config.roots=@{home=$env:USERPROFILE}}
if(-not $config.actions){$config.actions=@{}}
$configPath=Join-Path $folder 'device.json'
$config|ConvertTo-Json -Depth 8|Set-Content -Encoding UTF8 -LiteralPath $configPath
$token=$null;$config=$null
$agent=Join-Path $folder 'personal-device.py'
if($EnableOdbc){& $pythonExe -c 'import struct,pyodbc; print("Python bitness:",struct.calcsize("P")*8); print("ODBC drivers:",pyodbc.drivers()); print("DSN names:",list(pyodbc.dataSources().keys()))'}
Stop-ScheduledTask -TaskName 'TH Personal Device Link' -ErrorAction SilentlyContinue
if(-not $NoStartup){
 $action=New-ScheduledTaskAction -Execute $pythonExe -Argument "`"$agent`" --config `"$configPath`""
 $trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity
 $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
 $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
 try{Register-ScheduledTask -TaskName 'TH Personal Device Link' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null;Start-ScheduledTask -TaskName 'TH Personal Device Link';Write-Host 'Installed and started. Return to Connections and refresh this device.'}
 catch{Write-Host 'Startup task could not be installed. Starting in this terminal instead; keep it open.';& $pythonExe $agent --config $configPath}
} else {& $pythonExe $agent --config $configPath}
