Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$script:ToolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:NodePath = Join-Path $script:ToolDir "node.exe"
$script:CliPath = Join-Path $script:ToolDir "app\node_modules\@gltf-transform\cli\bin\cli.js"
$script:BinDir = Join-Path $script:ToolDir "bin"
$script:CurrentProcess = $null
$script:StdoutTask = $null
$script:StderrTask = $null
$script:RunInputPath = ""
$script:RunOutputPath = ""

function Test-ToolFiles {
    $missing = @()
    foreach ($path in @($script:NodePath, $script:CliPath)) {
        if (-not (Test-Path -LiteralPath $path)) {
            $missing += $path
        }
    }
    if ($missing.Count -gt 0) {
        [System.Windows.Forms.MessageBox]::Show(
            "缺少必要文件：`r`n$($missing -join "`r`n")",
            "GLB 优化工具",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
        exit 1
    }
}

function Quote-Arg([string]$value) {
    if ($null -eq $value) { return '""' }
    if ($value -notmatch '[\s"]') { return $value }

    $result = '"'
    $slashes = 0
    foreach ($char in $value.ToCharArray()) {
        if ($char -eq '\') {
            $slashes += 1
            continue
        }
        if ($char -eq '"') {
            $result += ('\' * (($slashes * 2) + 1))
            $result += '"'
            $slashes = 0
            continue
        }
        if ($slashes -gt 0) {
            $result += ('\' * $slashes)
            $slashes = 0
        }
        $result += $char
    }
    if ($slashes -gt 0) {
        $result += ('\' * ($slashes * 2))
    }
    $result += '"'
    return $result
}

function Format-Bytes([int64]$bytes) {
    if ($bytes -ge 1GB) { return "{0:N2} GB" -f ($bytes / 1GB) }
    if ($bytes -ge 1MB) { return "{0:N2} MB" -f ($bytes / 1MB) }
    if ($bytes -ge 1KB) { return "{0:N2} KB" -f ($bytes / 1KB) }
    return "$bytes B"
}

function Get-DefaultOutputPath([string]$inputPath) {
    if ([string]::IsNullOrWhiteSpace($inputPath)) { return "" }
    $dir = [System.IO.Path]::GetDirectoryName($inputPath)
    $name = [System.IO.Path]::GetFileNameWithoutExtension($inputPath)
    return [System.IO.Path]::Combine($dir, "$name.optimized.glb")
}

function Test-SupportedInputPath([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
        return $false
    }

    $extension = [System.IO.Path]::GetExtension($path)
    return $extension -ieq ".glb" -or $extension -ieq ".gltf"
}

function Set-InputPath([string]$path) {
    if (-not (Test-SupportedInputPath $path)) {
        [System.Windows.Forms.MessageBox]::Show(
            "请拖入有效的 .glb 或 .gltf 文件。",
            "GLB 优化工具",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    $fullPath = [System.IO.Path]::GetFullPath($path)
    $previousInput = $inputText.Text.Trim()
    $previousDefaultOutput = Get-DefaultOutputPath $previousInput
    $shouldUpdateOutput = [string]::IsNullOrWhiteSpace($outputText.Text) -or
        (-not [string]::IsNullOrWhiteSpace($previousDefaultOutput) -and $outputText.Text.Trim() -ieq $previousDefaultOutput)

    $inputText.Text = $fullPath
    if ($shouldUpdateOutput) {
        $outputText.Text = Get-DefaultOutputPath $fullPath
    }
    $statusLabel.Text = "已加载：$([System.IO.Path]::GetFileName($fullPath))"
}

function Get-DroppedModelPath([System.Windows.Forms.DragEventArgs]$eventArgs) {
    if (-not $eventArgs.Data.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop)) {
        return $null
    }

    $paths = [string[]]$eventArgs.Data.GetData([System.Windows.Forms.DataFormats]::FileDrop)
    foreach ($path in $paths) {
        if (Test-SupportedInputPath $path) {
            return $path
        }
    }
    return $null
}

function Append-Log([System.Windows.Forms.TextBox]$box, [string]$text) {
    if ($box.InvokeRequired) {
        $box.BeginInvoke([Action[System.Windows.Forms.TextBox,string]]{ param($b, $t) Append-Log $b $t }, $box, $text) | Out-Null
        return
    }
    $box.AppendText($text + [Environment]::NewLine)
}

function Set-RunState([bool]$running) {
    $runButton.Enabled = -not $running
    $inspectButton.Enabled = -not $running
    $cancelButton.Enabled = $running
    $statusLabel.Text = if ($running) { "正在处理..." } else { "就绪" }
}

function Read-AvailableProcessOutput($reader, $readTask) {
    $linesRead = 0
    while ($null -ne $readTask -and $readTask.IsCompleted -and $linesRead -lt 200) {
        try {
            $line = $readTask.GetAwaiter().GetResult()
        } catch {
            Append-Log $logText ("读取进程输出失败：" + $_.Exception.Message)
            return $null
        }

        if ($null -eq $line) {
            return $null
        }

        Append-Log $logText $line
        $readTask = $reader.ReadLineAsync()
        $linesRead += 1
    }
    return $readTask
}

function Complete-NodeCommand {
    $process = $script:CurrentProcess
    if ($null -eq $process) { return }

    $exitCode = $process.ExitCode
    Append-Log $logText ""
    Append-Log $logText ("退出代码：" + $exitCode)

    $outputPath = $script:RunOutputPath
    $inputPath = $script:RunInputPath
    if ($exitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($outputPath) -and (Test-Path -LiteralPath $outputPath)) {
        if (-not [string]::IsNullOrWhiteSpace($inputPath) -and (Test-Path -LiteralPath $inputPath)) {
            $before = (Get-Item -LiteralPath $inputPath).Length
            $after = (Get-Item -LiteralPath $outputPath).Length
            $saved = $before - $after
            Append-Log $logText ("输入大小：" + (Format-Bytes $before))
            Append-Log $logText ("输出大小：" + (Format-Bytes $after))
            Append-Log $logText ("节省空间：" + (Format-Bytes $saved))
        }
    }

    $completedSuccessfully = $exitCode -eq 0
    $process.Dispose()
    $script:CurrentProcess = $null
    $script:StdoutTask = $null
    $script:StderrTask = $null
    $script:RunInputPath = ""
    $script:RunOutputPath = ""
    Set-RunState $false
    $statusLabel.Text = if ($completedSuccessfully) { "优化完成" } else { "处理失败（退出代码 $exitCode）" }
}

function Update-NodeCommand {
    $process = $script:CurrentProcess
    if ($null -eq $process) { return }

    $script:StdoutTask = Read-AvailableProcessOutput $process.StandardOutput $script:StdoutTask
    $script:StderrTask = Read-AvailableProcessOutput $process.StandardError $script:StderrTask

    if ($process.HasExited -and $null -eq $script:StdoutTask -and $null -eq $script:StderrTask) {
        Complete-NodeCommand
    }
}

function New-Label($text, $x, $y, $w, $h) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $text
    $label.Location = New-Object System.Drawing.Point($x, $y)
    $label.Size = New-Object System.Drawing.Size($w, $h)
    $label.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    return $label
}

function New-Button($text, $x, $y, $w, $h) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $text
    $button.Location = New-Object System.Drawing.Point($x, $y)
    $button.Size = New-Object System.Drawing.Size($w, $h)
    return $button
}

function New-CheckBox($text, $x, $y, $w, $checked) {
    $check = New-Object System.Windows.Forms.CheckBox
    $check.Text = $text
    $check.Location = New-Object System.Drawing.Point($x, $y)
    $check.Size = New-Object System.Drawing.Size($w, 24)
    $check.Checked = $checked
    return $check
}

function Add-ComboItems($combo, [string[]]$items, [string]$selected) {
    [void]$combo.Items.AddRange($items)
    $combo.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
    $combo.SelectedItem = $selected
}

function Get-CompressionValue([string]$label) {
    switch ($label) {
        "Meshopt 压缩" { return "meshopt" }
        "Draco 压缩" { return "draco" }
        "仅量化" { return "quantize" }
        "不压缩" { return "false" }
        default { return $label }
    }
}

function Get-TextureValue([string]$label) {
    switch ($label) {
        "WebP" { return "webp" }
        "KTX2" { return "ktx2" }
        "自动" { return "auto" }
        "AVIF" { return "avif" }
        "不压缩" { return "false" }
        default { return $label }
    }
}

function Build-OptimizeArgs {
    $commandArgs = New-Object System.Collections.Generic.List[string]
    $commandArgs.Add($script:CliPath)
    $commandArgs.Add("optimize")
    $commandArgs.Add($inputText.Text.Trim())
    $commandArgs.Add($outputText.Text.Trim())

    $compress = Get-CompressionValue ([string]$compressCombo.SelectedItem)
    $commandArgs.Add("--compress")
    $commandArgs.Add($compress)

    $texture = Get-TextureValue ([string]$textureCombo.SelectedItem)
    $commandArgs.Add("--texture-compress")
    $commandArgs.Add($texture)
    $commandArgs.Add("--texture-size")
    $commandArgs.Add([string][int]$textureSizeNumeric.Value)

    $commandArgs.Add("--simplify")
    $commandArgs.Add($(if ($simplifyCheck.Checked) { "true" } else { "false" }))
    $commandArgs.Add("--simplify-ratio")
    $commandArgs.Add(([double]$simplifyRatioNumeric.Value).ToString([System.Globalization.CultureInfo]::InvariantCulture))
    $commandArgs.Add("--simplify-error")
    $commandArgs.Add(([double]$simplifyErrorNumeric.Value).ToString([System.Globalization.CultureInfo]::InvariantCulture))
    $commandArgs.Add("--simplify-lock-border")
    $commandArgs.Add($(if ($lockBorderCheck.Checked) { "true" } else { "false" }))

    $commandArgs.Add("--flatten")
    $commandArgs.Add($(if ($flattenCheck.Checked) { "true" } else { "false" }))
    $commandArgs.Add("--join")
    $commandArgs.Add($(if ($joinCheck.Checked) { "true" } else { "false" }))
    $commandArgs.Add("--weld")
    $commandArgs.Add($(if ($weldCheck.Checked) { "true" } else { "false" }))
    $commandArgs.Add("--palette")
    $commandArgs.Add($(if ($paletteCheck.Checked) { "true" } else { "false" }))
    $commandArgs.Add("--prune")
    $commandArgs.Add($(if ($pruneCheck.Checked) { "true" } else { "false" }))
    $commandArgs.Add("--resample")
    $commandArgs.Add($(if ($resampleCheck.Checked) { "true" } else { "false" }))

    return $commandArgs
}

function Start-NodeCommand([string[]]$commandArgs, [string]$title, [string]$outputPath) {
    $logText.Clear()
    Append-Log $logText $title
    Append-Log $logText ("工具目录：" + $script:ToolDir)
    Append-Log $logText ("执行命令：node " + (($commandArgs | ForEach-Object { Quote-Arg $_ }) -join " "))
    Append-Log $logText ""

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $script:NodePath
    $psi.WorkingDirectory = $script:ToolDir
    $psi.Arguments = (($commandArgs | ForEach-Object { Quote-Arg $_ }) -join " ")
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.EnvironmentVariables["PATH"] = $script:BinDir + ";" + $psi.EnvironmentVariables["PATH"]

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $process.EnableRaisingEvents = $true
    $script:CurrentProcess = $process

    Set-RunState $true
    try {
        [void]$process.Start()
        $script:RunInputPath = $inputText.Text.Trim()
        $script:RunOutputPath = $outputPath
        $script:StdoutTask = $process.StandardOutput.ReadLineAsync()
        $script:StderrTask = $process.StandardError.ReadLineAsync()
    } catch {
        $script:CurrentProcess = $null
        Set-RunState $false
        $statusLabel.Text = "启动失败"
        Append-Log $logText ("启动失败：" + $_.Exception.Message)
        [System.Windows.Forms.MessageBox]::Show(
            "无法启动优化进程：`r`n$($_.Exception.Message)",
            "GLB 优化工具",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
}

Test-ToolFiles

$form = New-Object System.Windows.Forms.Form
$form.Text = "便携 GLB 优化工具"
$form.Size = New-Object System.Drawing.Size(900, 700)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.MinimumSize = New-Object System.Drawing.Size(820, 620)
$form.AllowDrop = $true

$inputText = New-Object System.Windows.Forms.TextBox
$inputText.Location = New-Object System.Drawing.Point(92, 18)
$inputText.Size = New-Object System.Drawing.Size(650, 24)
$inputText.AllowDrop = $true
$inputButton = New-Button "浏览..." 754 16 100 28

$outputText = New-Object System.Windows.Forms.TextBox
$outputText.Location = New-Object System.Drawing.Point(92, 54)
$outputText.Size = New-Object System.Drawing.Size(650, 24)
$outputButton = New-Button "另存为..." 754 52 100 28

$settingsGroup = New-Object System.Windows.Forms.GroupBox
$settingsGroup.Text = "优化设置"
$settingsGroup.Location = New-Object System.Drawing.Point(16, 94)
$settingsGroup.Size = New-Object System.Drawing.Size(838, 178)

$compressCombo = New-Object System.Windows.Forms.ComboBox
$compressCombo.Location = New-Object System.Drawing.Point(112, 28)
$compressCombo.Size = New-Object System.Drawing.Size(150, 24)
Add-ComboItems $compressCombo @("Meshopt 压缩", "Draco 压缩", "仅量化", "不压缩") "Meshopt 压缩"

$textureCombo = New-Object System.Windows.Forms.ComboBox
$textureCombo.Location = New-Object System.Drawing.Point(400, 28)
$textureCombo.Size = New-Object System.Drawing.Size(150, 24)
Add-ComboItems $textureCombo @("WebP", "KTX2", "自动", "AVIF", "不压缩") "WebP"

$textureSizeNumeric = New-Object System.Windows.Forms.NumericUpDown
$textureSizeNumeric.Location = New-Object System.Drawing.Point(692, 28)
$textureSizeNumeric.Size = New-Object System.Drawing.Size(110, 24)
$textureSizeNumeric.Minimum = 128
$textureSizeNumeric.Maximum = 8192
$textureSizeNumeric.Increment = 128
$textureSizeNumeric.Value = 2048

$simplifyCheck = New-CheckBox "减面" 20 70 90 $true
$simplifyRatioNumeric = New-Object System.Windows.Forms.NumericUpDown
$simplifyRatioNumeric.Location = New-Object System.Drawing.Point(206, 70)
$simplifyRatioNumeric.Size = New-Object System.Drawing.Size(92, 24)
$simplifyRatioNumeric.Minimum = 0
$simplifyRatioNumeric.Maximum = 1
$simplifyRatioNumeric.DecimalPlaces = 2
$simplifyRatioNumeric.Increment = [decimal]0.05
$simplifyRatioNumeric.Value = [decimal]0.75

$simplifyErrorNumeric = New-Object System.Windows.Forms.NumericUpDown
$simplifyErrorNumeric.Location = New-Object System.Drawing.Point(438, 70)
$simplifyErrorNumeric.Size = New-Object System.Drawing.Size(112, 24)
$simplifyErrorNumeric.Minimum = 0
$simplifyErrorNumeric.Maximum = 1
$simplifyErrorNumeric.DecimalPlaces = 5
$simplifyErrorNumeric.Increment = [decimal]0.0001
$simplifyErrorNumeric.Value = [decimal]0.0001

$lockBorderCheck = New-CheckBox "锁定边界" 606 70 130 $false

$flattenCheck = New-CheckBox "扁平化" 20 112 95 $true
$joinCheck = New-CheckBox "合并网格" 126 112 110 $true
$weldCheck = New-CheckBox "焊接顶点" 252 112 90 $true
$paletteCheck = New-CheckBox "调色板" 360 112 90 $true
$pruneCheck = New-CheckBox "清理无用项" 466 112 110 $true
$resampleCheck = New-CheckBox "重采样动画" 594 112 130 $true

$settingsGroup.Controls.AddRange(@(
    (New-Label "几何压缩" 20 28 90 24), $compressCombo,
    (New-Label "纹理格式" 316 28 80 24), $textureCombo,
    (New-Label "最大尺寸" 618 28 70 24), $textureSizeNumeric,
    $simplifyCheck,
    (New-Label "保留比例" 130 70 72 24), $simplifyRatioNumeric,
    (New-Label "误差" 388 70 48 24), $simplifyErrorNumeric,
    $lockBorderCheck,
    $flattenCheck, $joinCheck, $weldCheck, $paletteCheck, $pruneCheck, $resampleCheck
))

$runButton = New-Button "开始优化" 16 286 120 34
$inspectButton = New-Button "查看信息" 148 286 100 34
$cancelButton = New-Button "取消" 260 286 100 34
$cancelButton.Enabled = $false
$openOutputButton = New-Button "打开目录" 372 286 110 34
$statusLabel = New-Label "就绪" 500 286 340 34

$logText = New-Object System.Windows.Forms.TextBox
$logText.Location = New-Object System.Drawing.Point(16, 334)
$logText.Size = New-Object System.Drawing.Size(838, 300)
$logText.Multiline = $true
$logText.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical
$logText.Font = New-Object System.Drawing.Font("Consolas", 9)
$logText.ReadOnly = $true
$logText.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Bottom -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right

$form.Controls.AddRange(@(
    (New-Label "输入文件" 16 18 70 24), $inputText, $inputButton,
    (New-Label "输出文件" 16 54 70 24), $outputText, $outputButton,
    $settingsGroup,
    $runButton, $inspectButton, $cancelButton, $openOutputButton, $statusLabel,
    $logText
))

$processTimer = New-Object System.Windows.Forms.Timer
$processTimer.Interval = 100
$processTimer.Add_Tick({
    try {
        Update-NodeCommand
    } catch {
        $processTimer.Stop()
        Append-Log $logText ("更新进程状态失败：" + $_.Exception.Message)
        Set-RunState $false
        $statusLabel.Text = "状态更新失败"
    }
})
$processTimer.Start()

$inputButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = "glTF 文件 (*.glb;*.gltf)|*.glb;*.gltf|所有文件 (*.*)|*.*"
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        Set-InputPath $dialog.FileName
    }
})

$dragEnterHandler = {
    param($sender, [System.Windows.Forms.DragEventArgs]$eventArgs)
    if ($null -ne (Get-DroppedModelPath $eventArgs)) {
        $eventArgs.Effect = [System.Windows.Forms.DragDropEffects]::Copy
    } else {
        $eventArgs.Effect = [System.Windows.Forms.DragDropEffects]::None
    }
}

$dragDropHandler = {
    param($sender, [System.Windows.Forms.DragEventArgs]$eventArgs)
    $path = Get-DroppedModelPath $eventArgs
    if ($null -ne $path) {
        Set-InputPath $path
    } else {
        [System.Windows.Forms.MessageBox]::Show("请拖入 .glb 或 .gltf 文件。", "GLB 优化工具") | Out-Null
    }
}

$inputText.Add_DragEnter($dragEnterHandler)
$inputText.Add_DragDrop($dragDropHandler)
$form.Add_DragEnter($dragEnterHandler)
$form.Add_DragDrop($dragDropHandler)

$outputButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.SaveFileDialog
    $dialog.Filter = "二进制 glTF (*.glb)|*.glb|glTF JSON (*.gltf)|*.gltf|所有文件 (*.*)|*.*"
    if (-not [string]::IsNullOrWhiteSpace($outputText.Text)) {
        $dialog.FileName = [System.IO.Path]::GetFileName($outputText.Text)
        $dialog.InitialDirectory = [System.IO.Path]::GetDirectoryName($outputText.Text)
    }
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $outputText.Text = $dialog.FileName
    }
})

$runButton.Add_Click({
    $inputPath = $inputText.Text.Trim()
    $outputPath = $outputText.Text.Trim()
    if (-not (Test-Path -LiteralPath $inputPath)) {
        [System.Windows.Forms.MessageBox]::Show("请选择有效的 .glb 或 .gltf 输入文件。", "GLB 优化工具") | Out-Null
        return
    }
    if ([string]::IsNullOrWhiteSpace($outputPath)) {
        $outputText.Text = Get-DefaultOutputPath $inputPath
        $outputPath = $outputText.Text.Trim()
    }
    $outDir = [System.IO.Path]::GetDirectoryName($outputPath)
    if (-not (Test-Path -LiteralPath $outDir)) {
        New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    }
    Start-NodeCommand (Build-OptimizeArgs) "开始优化。" $outputPath
})

$inspectButton.Add_Click({
    $inputPath = $inputText.Text.Trim()
    if (-not (Test-Path -LiteralPath $inputPath)) {
        [System.Windows.Forms.MessageBox]::Show("请选择有效的 .glb 或 .gltf 输入文件。", "GLB 优化工具") | Out-Null
        return
    }
    $inspectArgs = @($script:CliPath, "inspect", $inputPath)
    Start-NodeCommand $inspectArgs "开始读取模型信息。" $null
})

$cancelButton.Add_Click({
    if ($script:CurrentProcess -and -not $script:CurrentProcess.HasExited) {
        $script:CurrentProcess.Kill()
        Append-Log $logText "已取消。"
    }
})

$openOutputButton.Add_Click({
    $path = $outputText.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($path)) { return }
    $dir = [System.IO.Path]::GetDirectoryName($path)
    if (Test-Path -LiteralPath $dir) {
        Start-Process explorer.exe -ArgumentList (Quote-Arg $dir)
    }
})

$inputText.Add_TextChanged({
    if ([string]::IsNullOrWhiteSpace($outputText.Text) -and (Test-Path -LiteralPath $inputText.Text.Trim())) {
        $outputText.Text = Get-DefaultOutputPath $inputText.Text.Trim()
    }
})

$form.Add_FormClosing({
    $processTimer.Stop()
    if ($script:CurrentProcess -and -not $script:CurrentProcess.HasExited) {
        $script:CurrentProcess.Kill()
    }
})

if ($args.Count -gt 0 -and -not [string]::IsNullOrWhiteSpace([string]$args[0])) {
    Set-InputPath ([string]$args[0])
}

[void]$form.ShowDialog()
