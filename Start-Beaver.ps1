$ErrorActionPreference = 'Continue'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

Set-Location $PSScriptRoot

# Pin the provider to claude-code by default. Codex is opt-in (set
# BEAVER_PROVIDER=codex before running this script) — keeps runs working
# when the local Codex / OpenAI account hits its usage cap.
if (-not $env:BEAVER_PROVIDER) { $env:BEAVER_PROVIDER = 'claude-code' }

$Log = Join-Path (Get-Location) 'beaver-launcher-last.log'
Set-Content -Path $Log -Encoding UTF8 -Value @(
  'Beaver AI launcher log'
  "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  "CWD: $(Get-Location)"
  ''
)

function Add-LogLine {
  param([string]$Line)
  Add-Content -Path $Log -Encoding UTF8 -Value $Line
}

function Invoke-LoggedNative {
  param([string]$File, [string[]]$Arguments)

  Add-LogLine ('$ ' + $File + ' ' + ($Arguments -join ' '))
  & $File @Arguments *>&1 | ForEach-Object {
    $line = $_.ToString()
    Write-Host $line
    Add-LogLine $line
  }
  return $global:LASTEXITCODE
}

function Fail-Launcher {
  param([string]$Message)

  Write-Host ''
  Write-Host $Message
  Write-Host 'Full log is saved here:'
  Write-Host $Log
  Write-Host ''
  Get-Content -Path $Log -Encoding UTF8 | ForEach-Object { Write-Host $_ }
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 1
}

function Read-TextViaNotepad {
  param(
    [string]$FileName,
    [string[]]$Instructions
  )

  $path = Join-Path (Get-Location) $FileName
  Set-Content -Path $path -Encoding UTF8 -Value $Instructions
  Write-Host ''
  Write-Host "Opening input file: $path"
  Write-Host 'Write your text, save the file, then close Notepad to continue.'
  Write-Host ''
  Start-Process notepad.exe -ArgumentList "`"$path`"" -Wait

  $content = Get-Content -Path $path -Raw -Encoding UTF8
  $lines = $content -split "`r?`n"
  $body = $lines | Where-Object {
    $_ -notmatch '^#'
  }
  return (($body -join "`n").Trim())
}

function Read-BeaverGoal {
  return Read-TextViaNotepad `
    -FileName 'beaver-goal-input.txt' `
    -Instructions @(
      '# Beaver AI Goal'
      '# Write the full goal below. Multiline text is OK.'
      '# Save this file and close Notepad to run.'
      '# Generated files will go to OUTPUT/.'
      ''
    )
}

function Read-BeaverFeedback {
  $text = Read-TextViaNotepad `
    -FileName 'beaver-feedback-input.txt' `
    -Instructions @(
      '# Beaver AI Feedback'
      '# Review OUTPUT/.'
      '# To request changes or answer questions, write feedback below.'
      '# To finish, leave the body empty, save, and close Notepad.'
      ''
    )

  if ([string]::IsNullOrWhiteSpace($text)) {
    return @{ Action = 'finish'; Text = '' }
  }
  return @{ Action = 'revise'; Text = $text }
}

Write-Host 'Beaver AI v0.1'
Write-Host "Log: $Log"
Write-Host ''

if (-not (Test-Path 'node_modules')) {
  Write-Host 'node_modules missing. Running pnpm install...'
  $code = Invoke-LoggedNative 'pnpm' @('install')
  if ($code -ne 0) { Fail-Launcher 'pnpm install failed.' }
}

if (-not (Test-Path '.beaver')) {
  Write-Host 'Initializing .beaver/ ...'
  $code = Invoke-LoggedNative 'node' @('--no-warnings', '--import=tsx', 'packages\cli\src\bin.ts', 'init')
  if ($code -ne 0) { Fail-Launcher 'beaver init failed.' }
}

$goal = Read-BeaverGoal
if ([string]::IsNullOrWhiteSpace($goal)) {
  Add-LogLine 'No goal provided.'
  Fail-Launcher 'No goal provided.'
}

$goal = $goal.Replace('"', '')
New-Item -ItemType Directory -Force -Path 'OUTPUT' | Out-Null

$baseGoal = $goal
$revision = ''
$round = 1

while ($true) {
  if ([string]::IsNullOrWhiteSpace($revision)) {
    $runGoal = @"
$baseGoal

Execution rules:
- If you need clarification, write concise questions in the final message under "Questions".
- The launcher will keep a feedback step open so the user can answer those questions.
- If you can proceed with reasonable assumptions, proceed and summarize assumptions in the final message.
- If you create standalone user-facing output files, place them under OUTPUT/ instead of the project root.
"@
  } else {
    $runGoal = @"
Revise the existing files in OUTPUT/ for this original goal:
$baseGoal

User feedback to apply exactly:
$revision

Execution rules:
- If you need clarification, write concise questions in the final message under "Questions".
- The launcher will keep a feedback step open so the user can answer those questions.
- If you can proceed with reasonable assumptions, proceed and summarize assumptions in the final message.
- Keep standalone user-facing output files under OUTPUT/.
"@
  }

  Write-Host ''
  Write-Host "Running round $round..."
  Write-Host "Output folder: $(Join-Path (Get-Location) 'OUTPUT')"
  Write-Host ''

  $code = Invoke-LoggedNative 'node' @(
    '--no-warnings'
    '--import=tsx'
    'packages\cli\src\bin.ts'
    'run'
    '--no-server'
    '--replace-active'
    '--auto-approve-final-review'
    $runGoal
  )

  if ($code -ne 0) { Fail-Launcher 'Beaver run failed.' }

  $outputFiles = @(Get-ChildItem -Path 'OUTPUT' -File -Recurse -ErrorAction SilentlyContinue)
  if ($outputFiles.Count -eq 0) {
    Fail-Launcher 'Beaver completed without creating files in OUTPUT/. Treating this as a failed run.'
  }

  try {
    Start-Process explorer.exe (Join-Path (Get-Location) 'OUTPUT')
  } catch {
    Write-Host 'Could not open OUTPUT automatically.'
  }

  $feedback = Read-BeaverFeedback
  if ($feedback.Action -eq 'finish') { break }
  $revision = ([string]$feedback.Text).Replace('"', '')
  Add-LogLine ''
  Add-LogLine "Revision feedback round ${round}:"
  Add-LogLine $revision
  $round += 1
}

Write-Host ''
Write-Host 'Done.'
Write-Host "Log saved: $Log"
Write-Host 'Press Enter to close.'
Add-LogLine 'Done.'
[void](Read-Host)
exit 0
