$ErrorActionPreference = 'Continue'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

Set-Location $PSScriptRoot

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
  Write-Host "Full log is saved here:"
  Write-Host $Log
  Write-Host ''
  Get-Content -Path $Log -Encoding UTF8 | ForEach-Object { Write-Host $_ }
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 1
}

function Read-MultilineInput {
  param(
    [string]$Title,
    [string]$Prompt,
    [string]$Hint,
    [string]$PrimaryButton,
    [string]$InitialText = ''
  )

  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = [System.Windows.Forms.Form]::new()
    $form.Text = $Title
    $form.StartPosition = 'CenterScreen'
    $form.Width = 760
    $form.Height = 520
    $form.MinimumSize = [System.Drawing.Size]::new(620, 420)

    $label = [System.Windows.Forms.Label]::new()
    $label.Text = $Prompt
    $label.AutoSize = $true
    $label.Left = 12
    $label.Top = 12
    $form.Controls.Add($label)

    $instruction = [System.Windows.Forms.Label]::new()
    $instruction.Text = 'Enter: new line | Shift+Enter or main button: continue | Esc/Cancel: close'
    $instruction.AutoSize = $true
    $instruction.Left = 12
    $instruction.Top = 34
    $instruction.ForeColor = [System.Drawing.Color]::DimGray
    $form.Controls.Add($instruction)

    $textBox = [System.Windows.Forms.TextBox]::new()
    $textBox.Multiline = $true
    $textBox.AcceptsReturn = $true
    $textBox.AcceptsTab = $true
    $textBox.ScrollBars = 'Vertical'
    $textBox.WordWrap = $true
    $textBox.Left = 12
    $textBox.Top = 62
    $textBox.Width = 720
    $textBox.Height = 346
    $textBox.Anchor = 'Top,Bottom,Left,Right'
    $textBox.Font = [System.Drawing.Font]::new('Malgun Gothic', 10)
    $textBox.Text = $InitialText
    $form.Controls.Add($textBox)

    $hint = [System.Windows.Forms.Label]::new()
    $hint.Text = $Hint
    $hint.AutoSize = $true
    $hint.Left = 12
    $hint.Top = 420
    $hint.Anchor = 'Bottom,Left'
    $form.Controls.Add($hint)

    $runButton = [System.Windows.Forms.Button]::new()
    $runButton.Text = $PrimaryButton
    $runButton.Width = 100
    $runButton.Height = 32
    $runButton.Left = 532
    $runButton.Top = 414
    $runButton.Anchor = 'Bottom,Right'
    $runButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($runButton)

    $cancelButton = [System.Windows.Forms.Button]::new()
    $cancelButton.Text = 'Cancel'
    $cancelButton.Width = 90
    $cancelButton.Height = 32
    $cancelButton.Left = 642
    $cancelButton.Top = 414
    $cancelButton.Anchor = 'Bottom,Right'
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($cancelButton)

    $form.CancelButton = $cancelButton
    $form.Add_Shown({ $textBox.Focus() })
    $textBox.Add_KeyDown({
      param($sender, $event)
      if ($event.Shift -and $event.KeyCode -eq [System.Windows.Forms.Keys]::Enter) {
        $event.SuppressKeyPress = $true
        $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.Close()
      }
    })

    $result = $form.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
    return $textBox.Text
  } catch {
    $msg = $_.Exception.Message
    Add-LogLine "Multiline input window failed: $msg"
    Write-Host "Multiline input window failed: $msg"
    Write-Host 'Multiline input window unavailable; using console fallback.'
    Write-Host "$Prompt Finish with a line containing only <<END>>."
    $lines = @()
    while ($true) {
      $line = Read-Host
      if ($line -match '^\s*<{2,3}END>{2,3}\s*$') { break }
      $lines += $line
    }
    return ($lines -join "`n")
  }
}

function Read-BeaverGoal {
  return Read-MultilineInput `
    -Title 'Beaver AI - Goal' `
    -Prompt 'What should Beaver do?' `
    -Hint 'Generated files go to OUTPUT/. Progress is shown here and saved to beaver-launcher-last.log.' `
    -PrimaryButton 'Run'
}

function Read-BeaverFeedback {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = [System.Windows.Forms.Form]::new()
    $form.Text = 'Beaver AI - Feedback'
    $form.StartPosition = 'CenterScreen'
    $form.Width = 760
    $form.Height = 520
    $form.MinimumSize = [System.Drawing.Size]::new(620, 420)
    $form.ControlBox = $false

    $label = [System.Windows.Forms.Label]::new()
    $label.Text = 'Review OUTPUT. Answer questions or request changes.'
    $label.AutoSize = $true
    $label.Left = 12
    $label.Top = 12
    $form.Controls.Add($label)

    $instruction = [System.Windows.Forms.Label]::new()
    $instruction.Text = 'Enter: new line | Shift+Enter or Run Revision: apply | Finish: close feedback loop'
    $instruction.AutoSize = $true
    $instruction.Left = 12
    $instruction.Top = 34
    $instruction.ForeColor = [System.Drawing.Color]::DimGray
    $form.Controls.Add($instruction)

    $textBox = [System.Windows.Forms.TextBox]::new()
    $textBox.Multiline = $true
    $textBox.AcceptsReturn = $true
    $textBox.AcceptsTab = $true
    $textBox.ScrollBars = 'Vertical'
    $textBox.WordWrap = $true
    $textBox.Left = 12
    $textBox.Top = 62
    $textBox.Width = 720
    $textBox.Height = 346
    $textBox.Anchor = 'Top,Bottom,Left,Right'
    $textBox.Font = [System.Drawing.Font]::new('Malgun Gothic', 10)
    $form.Controls.Add($textBox)

    $hint = [System.Windows.Forms.Label]::new()
    $hint.Text = 'This window stays open until you click Finish. Empty feedback will not close it.'
    $hint.AutoSize = $true
    $hint.Left = 12
    $hint.Top = 420
    $hint.Anchor = 'Bottom,Left'
    $form.Controls.Add($hint)

    $action = 'revise'

    $reviseButton = [System.Windows.Forms.Button]::new()
    $reviseButton.Text = 'Run Revision'
    $reviseButton.Width = 120
    $reviseButton.Height = 32
    $reviseButton.Left = 502
    $reviseButton.Top = 414
    $reviseButton.Anchor = 'Bottom,Right'
    $reviseButton.Add_Click({
      if ([string]::IsNullOrWhiteSpace($textBox.Text)) {
        [System.Windows.Forms.MessageBox]::Show(
          'Type feedback first, or click Finish.',
          'Beaver AI',
          [System.Windows.Forms.MessageBoxButtons]::OK,
          [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
        return
      }
      $script:FeedbackAction = 'revise'
      $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $form.Close()
    })
    $form.Controls.Add($reviseButton)

    $finishButton = [System.Windows.Forms.Button]::new()
    $finishButton.Text = 'Finish'
    $finishButton.Width = 90
    $finishButton.Height = 32
    $finishButton.Left = 642
    $finishButton.Top = 414
    $finishButton.Anchor = 'Bottom,Right'
    $finishButton.Add_Click({
      $script:FeedbackAction = 'finish'
      $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $form.Close()
    })
    $form.Controls.Add($finishButton)

    $form.Add_Shown({ $textBox.Focus() })
    $textBox.Add_KeyDown({
      param($sender, $event)
      if ($event.Shift -and $event.KeyCode -eq [System.Windows.Forms.Keys]::Enter) {
        $event.SuppressKeyPress = $true
        $reviseButton.PerformClick()
      }
    })

    $script:FeedbackAction = 'revise'
    [void]$form.ShowDialog()
    return @{
      Action = $script:FeedbackAction
      Text = $textBox.Text
    }
  } catch {
    $msg = $_.Exception.Message
    Add-LogLine "Feedback window failed: $msg"
    Write-Host "Feedback window failed: $msg"
    Write-Host 'Feedback window unavailable; using console fallback.'
    Write-Host 'Type feedback. Type <<FINISH>> to finish. Type <<END>> to run revision.'
    $lines = @()
    while ($true) {
      $line = Read-Host
      if ($line -match '^\s*<{2,3}FINISH>{2,3}\s*$') { return @{ Action = 'finish'; Text = '' } }
      if ($line -match '^\s*<{2,3}END>{2,3}\s*$') { return @{ Action = 'revise'; Text = ($lines -join "`n") } }
      $lines += $line
    }
  }
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
- The launcher will keep a feedback window open so the user can answer those questions.
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
- The launcher will keep a feedback window open so the user can answer those questions.
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

  try {
    Start-Process explorer.exe (Join-Path (Get-Location) 'OUTPUT')
  } catch {
    Write-Host 'Could not open OUTPUT automatically.'
  }

  $feedback = Read-BeaverFeedback
  if ($feedback.Action -eq 'finish') { break }
  $revision = [string]$feedback.Text
  $revision = $revision.Replace('"', '')
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
