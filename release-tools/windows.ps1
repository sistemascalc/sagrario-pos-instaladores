$ErrorActionPreference = 'Stop'
function Checked { if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE)" } }
$job = Join-Path $env:RUNNER_TEMP 'sg-release-121'; New-Item $job -ItemType Directory | Out-Null
$tools = Join-Path $job 'tools'; New-Item $tools -ItemType Directory | Out-Null
$src = Join-Path $PSScriptRoot 'package-release.cjs'
Invoke-WebRequest 'https://github.com/sistemascalc/sagrario-pos-instaladores/releases/download/v1.2.0/Sagrario-POS-Setup-1.2.0.exe' -OutFile "$job/previous.exe"
node $src extract $job; Checked
7z x -y "-o$job/original" "$job/payload.7z" resources/app.asar resources/app-update.yml; Checked
npm install --prefix $tools --no-audit --no-fund --save-exact electron@44.7.1 electron-builder@26.15.3 @electron/asar@3.4.1; Checked
node "$tools/node_modules/@electron/asar/bin/asar.js" extract "$job/original/resources/app.asar" "$job/app"; Checked
node "$PSScriptRoot/patch.cjs" "$job/app"; Checked
node $src config $job; Checked
& "$tools/node_modules/.bin/electron.cmd" "$PSScriptRoot/test-print-runtime.cjs"; Checked
if ($env:BUILD_ONLY -eq 'true') { return }
& "$tools/node_modules/.bin/electron-builder.cmd" --projectDir "$job/app" --config "$job/builder.json" --win nsis --x64 --publish never; Checked
node $src verify $job; Checked
# Install both versions in sequence and verify upgrade identity and retained preferences on Windows.
$uninstallPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\a6eea4d1-99a9-50a9-a38d-d93e7d6f4051'
function Install-TestVersion($installer) {
  $p=Start-Process -FilePath $installer -ArgumentList '/S' -PassThru
  if (!$p.WaitForExit(180000) -or $p.ExitCode -ne 0) { throw "Installer failed: $installer" }
  Get-Process -Name 'Sagrario POS' -ErrorAction SilentlyContinue | Stop-Process -Force
}
Install-TestVersion "$job/previous.exe"
$old=Get-ItemProperty $uninstallPath
function InstallDir($data) {
  if ($data.InstallLocation) { return $data.InstallLocation.Trim('"') }
  if ($data.DisplayIcon) { return Split-Path ($data.DisplayIcon -replace ',[0-9]+$','').Trim('"') }
  if ($data.UninstallString -match '^"([^"]+)"') { return Split-Path $Matches[1] }
  throw 'Unable to resolve installed application'
}
$install=InstallDir $old; if (!(Test-Path "$install/resources/app.asar")) { throw 'Missing original registration' }
$profile=Join-Path $env:APPDATA 'sagrario-pos'; New-Item $profile -ItemType Directory -Force | Out-Null
$settings=Join-Path $profile 'printers.json'; [IO.File]::WriteAllText($settings,'{"pos":"QA receipt","intentions":"QA office"}')
Install-TestVersion "$job/installer/Sagrario-POS-Setup-1.2.1.exe"
$new=Get-ItemProperty $uninstallPath
if($new.DisplayVersion -ne '1.2.1' -or (InstallDir $new) -ne $install -or [IO.File]::ReadAllText($settings) -notmatch 'QA office'){throw 'Upgrade did not preserve the installation and preference'}
node "$tools/node_modules/@electron/asar/bin/asar.js" extract "$install/resources/app.asar" "$job/installed"; Checked
foreach($name in @('main.cjs','print-preload.cjs','print-native.cjs','activation.cjs','activation-config.json','activation-preload.cjs','settings-preload.cjs')){
 if((Get-FileHash "$job/app/$name").Hash -ne (Get-FileHash "$job/installed/$name").Hash){throw "Installed file mismatch: $name"}
}
if((Get-Content "$job/installed/package.json" -Raw | ConvertFrom-Json).version -ne '1.2.1'){throw 'Unexpected installed version'}
if((Get-Content "$install/resources/app-update.yml" -Raw) -notmatch 'sagrario-pos-instaladores'){throw 'Incorrect update feed'}
Write-Output 'PASS Windows upgrade 1.2.0 to 1.2.1; installed printing code, activation configuration, printer selection and updater verified.'
