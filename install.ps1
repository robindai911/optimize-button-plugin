<#
.SYNOPSIS
  Install the dsh-prompt-optimizer plugin into a DeepSeek Harness profile.

.DESCRIPTION
  Copies the plugin directory into <Profile>\plugins\ and appends the loader row
  to <Profile>\cordis.patch.yml.

  The row's `name` is patch-relative and DSH anchors it to a file: URL beside the
  patch file, so the target profile directory may live anywhere. No absolute path
  and no DSH_HOME assumption is baked into the plugin.

  The patch file is backed up before it is edited, and the edit is idempotent:
  running this twice does not add a second row.

.PARAMETER Profile
  Target dsh profile directory.
  Default: $env:USERPROFILE\.dsh\profiles\desktop

.PARAMETER Force
  Overwrite an already-installed copy of the plugin.

.EXAMPLE
  .\install.ps1
  .\install.ps1 -Profile 'D:\dsh\.dsh\profiles\desktop' -Force
#>
[CmdletBinding()]
param(
  [string]$Profile = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop'),
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$here = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$source = Join-Path $here 'dsh-prompt-optimizer'
$dest = Join-Path (Join-Path $Profile 'plugins') 'dsh-prompt-optimizer'
$patchPath = Join-Path $Profile 'cordis.patch.yml'

Write-Host "dsh-prompt-optimizer installer" -ForegroundColor Cyan
Write-Host "  source  : $source"
Write-Host "  profile : $Profile"
Write-Host ""

# ---------------------------------------------------------------- 0. validate
if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "plugin directory not found next to this script: $source"
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'lib\index.js'))) {
  throw "the plugin is incomplete (lib\index.js is missing): $source"
}

# A dsh profile directory always carries cordis.yml (the loader's root config).
if (-not (Test-Path -LiteralPath (Join-Path $Profile 'cordis.yml'))) {
  Write-Warning "'$Profile' does not look like a dsh profile directory (no cordis.yml)."
  Write-Warning "Pass the right one with -Profile, e.g. -Profile '<DSH_HOME>\profiles\desktop'."
  if (-not $Force) {
    throw "refusing to install into '$Profile' without -Force"
  }
}

# ---------------------------------------------------------------- 1. copy files
$pluginsDir = Join-Path $Profile 'plugins'
if (-not (Test-Path -LiteralPath $pluginsDir)) {
  New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null
}

if (Test-Path -LiteralPath $dest) {
  if (-not $Force) {
    Write-Host "An existing copy is already installed; updating it in place." -ForegroundColor Yellow
    Write-Host "(use -Force to silence this notice)" -ForegroundColor DarkGray
  }
  Remove-Item -LiteralPath $dest -Recurse -Force
}
Copy-Item -LiteralPath $source -Destination $dest -Recurse -Force
Write-Host "[1/3] plugin files -> $dest" -ForegroundColor Green

# ---------------------------------------------------------------- 2. patch row
$block = @'
# dsh-prompt-optimizer: composer "optimize prompt" button.
# `name` is patch-relative; app-boot rewrites it to a file: URL beside this file.
- insert:
    - id: prompt-optimizer
      name: ./plugins/dsh-prompt-optimizer/lib/index.js
'@

$existing = if (Test-Path -LiteralPath $patchPath) { Get-Content -LiteralPath $patchPath -Raw -Encoding UTF8 } else { '' }

if ($existing -match '(?m)^\s*-\s*id:\s*prompt-optimizer\s*$') {
  Write-Host "[2/3] cordis.patch.yml already has the prompt-optimizer row; left unchanged" -ForegroundColor Green
} else {
  if ($existing.Trim() -eq '') {
    # A comments-only or empty patch file fails boot; write a real array.
    Set-Content -LiteralPath $patchPath -Value $block -Encoding UTF8
    Write-Host "[2/3] created cordis.patch.yml with the loader row" -ForegroundColor Green
  } else {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Copy-Item -LiteralPath $patchPath -Destination "$patchPath.bak-$stamp" -Force
    Write-Host "      backup: cordis.patch.yml.bak-$stamp" -ForegroundColor DarkGray

    # Append as a new top-level array entry, keeping the file's line ending style.
    $text = $existing.TrimEnd("`r", "`n")
    $sep = if ($existing -match "`r`n") { "`r`n" } else { "`n" }
    $new = $text + $sep + ($block -replace "`r`n", $sep) + $sep
    Set-Content -LiteralPath $patchPath -Value $new -Encoding UTF8 -NoNewline
    Write-Host "[2/3] appended the loader row to cordis.patch.yml" -ForegroundColor Green
  }
}

# ---------------------------------------------------------------- 3. next steps
$port = 19387
$url = "http://127.0.0.1:$port/prompt-optimizer/status"
Write-Host "[3/3] done." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps" -ForegroundColor Cyan
Write-Host "  1. Restart DeepSeek Harness."
Write-Host "     The host half is a Node ESM import; changed or new module bytes are"
Write-Host "     only picked up by a fresh process."
Write-Host "  2. Refresh the GUI page."
Write-Host "  3. Confirm the host half is up (adapt the port if yours differs):"
Write-Host "       Invoke-RestMethod http://127.0.0.1:19387/prompt-optimizer/status"
Write-Host "     A healthy answer contains 'hasModel' and a 'modes' array of six entries."
Write-Host "  4. In the composer you should now see, right of the input: [ (rocket) 优化 ] [ v ]"
Write-Host "     Clicking the rocket rewrites the draft in place; the chevron picks the mode."
Write-Host ""
Write-Host "Uninstall: remove '$dest' and the '- insert:' block for prompt-optimizer"
Write-Host "           from '$patchPath', then restart."
