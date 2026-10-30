# Resets LAMAYNE IPTV to a blank state, as on a PC where the application has never run.
# Useful to test the first launch. CLOSE THE APPLICATION before running this script.
#
# Deletes:
#   - the IPTV accounts saved in the Windows Credential Manager
#     (new name "LAMAYNE.IPTV.Xtream" and old name "MyStreamPlayer.Xtream");
#   - the application data: profiles, favourites, history, programme guide cache
#     (folders "com.lamayne.iptv" and the old "nini22p.tauri-plugin-libmpv-example").
#
# Usage:  .\scripts\reset-local-data.ps1          (asks for confirmation)
#         .\scripts\reset-local-data.ps1 -Yes     (no confirmation)

param([switch]$Yes)

$services = 'LAMAYNE\.IPTV\.Xtream|MyStreamPlayer\.Xtream'

$folders = @(
  "$env:LOCALAPPDATA\com.lamayne.iptv",
  "$env:APPDATA\com.lamayne.iptv",
  "$env:LOCALAPPDATA\nini22p.tauri-plugin-libmpv-example",
  "$env:APPDATA\nini22p.tauri-plugin-libmpv-example"
) | Where-Object { Test-Path $_ }

$targets = @(
  cmdkey /list | ForEach-Object {
    if ($_ -match 'target=(.+)$') { $Matches[1].Trim() }
  } | Where-Object { $_ -match $services }
)

$running = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -in @('lamayne-iptv', 'tauri-plugin-libmpv-example') }

if ($running) {
  Write-Host "The application is open: close it, then run this script again." -ForegroundColor Yellow
  return
}

if (-not $targets.Count -and -not $folders.Count) {
  Write-Host "Nothing to delete: the application is already blank." -ForegroundColor Green
  return
}

Write-Host ""
Write-Host "Accounts saved in the Windows vault ($($targets.Count)):"
$targets | ForEach-Object { Write-Host "  - $_" }
Write-Host "Data folders ($($folders.Count)):"
$folders | ForEach-Object { Write-Host "  - $_" }
Write-Host ""

if (-not $Yes) {
  $answer = Read-Host "Delete everything permanently? (y/N)"
  if ($answer -notmatch '^[yYoO]') { Write-Host "Cancelled."; return }
}

foreach ($target in $targets) { cmdkey /delete:$target | Out-Null }

foreach ($folder in $folders) {
  try { Remove-Item $folder -Recurse -Force -ErrorAction Stop }
  catch { Write-Host "Could not delete ${folder}: $($_.Exception.Message)" -ForegroundColor Yellow }
}

Write-Host "Done. Start the application: it should open on Settings, with no source." -ForegroundColor Green
