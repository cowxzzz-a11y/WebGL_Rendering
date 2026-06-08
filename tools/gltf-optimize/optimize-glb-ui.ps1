param(
    [string]$InputPath
)

[void][System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms")
[void][System.Reflection.Assembly]::LoadWithPartialName("System.Drawing")

$ErrorActionPreference = "Stop"

trap {
    $message = if ($_.Exception) { $_.Exception.Message } else { $_.ToString() }
    [System.Windows.Forms.MessageBox]::Show($message, "启动失败", "OK", "Error") | Out-Null
    break
}

$script:ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:NodeScriptPath = Join-Path $script:ScriptDir "smart-optimize.mjs"
$script:LightmapConvertScriptPath = Join-Path $script:ScriptDir "lightmap-to-ktx2.mjs"
$script:SettingsDir = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "GLBSmartOptimize"
$script:SettingsPath = Join-Path $script:SettingsDir "ui-settings.json"
$script:LastAutoOutputPath = ""
$script:LastOutputPath = ""
$script:LastObjectReportPath = ""
$script:LastObjectPolicyPath = ""
$script:CurrentProcess = $null
$script:StdOutReader = $null
$script:StdErrReader = $null
$script:TextureFormatMap = [ordered]@{
    "KTX2（推荐）" = "ktx2"
    "WebP"         = "webp"
    "不压缩纹理"   = "none"
}
$script:Ktx2ModeMap = [ordered]@{
    "ETC1S（高压缩率）"   = "etc1s"
    "UASTC（高保真画质）" = "uastc"
}
$script:GeometryModeMap = [ordered]@{
    "局部优化（推荐）" = "local"
    "关闭几何优化"     = "none"
}
$script:SizePresets = @(512, 1024, 2048, 4096)
function Get-DefaultSettings {
    return [ordered]@{
        textureFormat         = "ktx2"
        geometryMode          = "local"
        qualityProfile        = "balanced"
        colorMaxSize          = 2048
        dataMaxSize           = 1024
        webpQualityBase       = 92
        webpQualityEmissive   = 94
        webpQualityOther      = 90
        webpEffort            = 5
        enablePalette         = $true
        paletteMin            = 5
        simplifyScale         = 1.0
        simplifyMinTriangles  = 500
        quantizeMinTriangles  = 2000
        ktxPath               = ""
        ktx2Mode              = "uastc"
        enableKtx2Zstd        = $true
        enableFixTextureSize  = $false
    }
}

function Load-UiSettings {
    $defaults = Get-DefaultSettings
    if (-not (Test-Path -LiteralPath $script:SettingsPath)) {
        return $defaults
    }

    try {
        $raw = Get-Content -LiteralPath $script:SettingsPath -Raw -Encoding UTF8
        $loaded = $raw | ConvertFrom-Json
        foreach ($key in $defaults.Keys) {
            if ($null -ne $loaded.$key) {
                $defaults[$key] = $loaded.$key
            }
        }
    } catch {
    }

    return $defaults
}

function Save-UiSettings([hashtable]$Settings) {
    try {
        if (-not (Test-Path -LiteralPath $script:SettingsDir)) {
            $null = New-Item -ItemType Directory -Path $script:SettingsDir -Force
        }
        $Settings | ConvertTo-Json | Set-Content -LiteralPath $script:SettingsPath -Encoding UTF8
    } catch {
    }
}

function Get-DefaultOutputPath([string]$PathValue) {
    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return ""
    }

    $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction Stop
    $item = Get-Item -LiteralPath $resolved.Path
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($item.Name)
    return (Join-Path $item.DirectoryName ($baseName + ".smart-pack.glb"))
}

function Append-Log([System.Windows.Forms.TextBox]$TextBox, [string]$Text) {
    if ([string]::IsNullOrEmpty($Text)) {
        return
    }

    $TextBox.AppendText($Text)
    if (-not $Text.EndsWith([Environment]::NewLine) -and -not $Text.EndsWith("`n")) {
        $TextBox.AppendText([Environment]::NewLine)
    }
    $TextBox.SelectionStart = $TextBox.TextLength
    $TextBox.ScrollToCaret()
}

function Read-LogDelta([string]$PathValue, [string]$Snapshot) {
    if ([string]::IsNullOrWhiteSpace($PathValue) -or -not (Test-Path -LiteralPath $PathValue)) {
        return @{ Content = ""; Snapshot = $Snapshot }
    }

    try {
        $content = [System.IO.File]::ReadAllText($PathValue)
    } catch {
        return @{ Content = ""; Snapshot = $Snapshot }
    }

    if ([string]::IsNullOrEmpty($Snapshot)) {
        return @{ Content = $content; Snapshot = $content }
    }

    if ($content.Length -lt $Snapshot.Length) {
        return @{ Content = $content; Snapshot = $content }
    }

    return @{
        Content  = $content.Substring($Snapshot.Length)
        Snapshot = $content
    }
}

function Flush-ProcessReaders([System.Windows.Forms.TextBox]$TextBox) {
    if ($script:StdOutReader) {
        while (-not $script:StdOutReader.EndOfStream) {
            $line = $script:StdOutReader.ReadLine()
            if ($null -ne $line) {
                Append-Log -TextBox $TextBox -Text $line
            }
        }
    }

    if ($script:StdErrReader) {
        while (-not $script:StdErrReader.EndOfStream) {
            $line = $script:StdErrReader.ReadLine()
            if ($null -ne $line) {
                Append-Log -TextBox $TextBox -Text $line
            }
        }
    }
}

function Collect-SettingsFromControls {
    param(
        [System.Windows.Forms.ComboBox]$TextureFormatCombo,
        [System.Windows.Forms.ComboBox]$GeometryModeCombo,
        [System.Windows.Forms.NumericUpDown]$ColorMaxNumeric,
        [System.Windows.Forms.NumericUpDown]$DataMaxNumeric,
        [System.Windows.Forms.NumericUpDown]$WebPBaseNumeric,
        [System.Windows.Forms.NumericUpDown]$WebPEmissiveNumeric,
        [System.Windows.Forms.NumericUpDown]$WebPOtherNumeric,
        [System.Windows.Forms.NumericUpDown]$WebPEffortNumeric,
        [System.Windows.Forms.CheckBox]$PaletteCheckBox,
        [System.Windows.Forms.NumericUpDown]$PaletteMinNumeric,
        [System.Windows.Forms.NumericUpDown]$SimplifyScaleNumeric,
        [System.Windows.Forms.NumericUpDown]$SimplifyMinNumeric,
        [System.Windows.Forms.NumericUpDown]$QuantizeMinNumeric,
        [System.Windows.Forms.TextBox]$KtxPathTextBox,
        [System.Windows.Forms.ComboBox]$Ktx2ModeCombo,
        [System.Windows.Forms.CheckBox]$Ktx2ZstdCheckBox,
        [System.Windows.Forms.CheckBox]$FixTextureSizeCheckBox
    )

    $format = Get-ComboValue -Map $script:TextureFormatMap -SelectedItem $TextureFormatCombo.SelectedItem

    return [ordered]@{
        textureFormat        = $format
        geometryMode         = Get-ComboValue -Map $script:GeometryModeMap -SelectedItem $GeometryModeCombo.SelectedItem
        colorMaxSize         = if ($format -eq "ktx2") { [int]$ColorMaxNumeric2.Value } else { [int]$ColorMaxNumeric.Value }
        dataMaxSize          = if ($format -eq "ktx2") { [int]$DataMaxNumeric2.Value } else { [int]$DataMaxNumeric.Value }
        webpQualityBase      = [int]$WebPBaseNumeric.Value
        webpQualityEmissive  = [int]$WebPEmissiveNumeric.Value
        webpQualityOther     = [int]$WebPOtherNumeric.Value
        webpEffort           = [int]$WebPEffortNumeric.Value
        enablePalette        = [bool]$PaletteCheckBox.Checked
        paletteMin           = [int]$PaletteMinNumeric.Value
        simplifyScale        = [double]$SimplifyScaleNumeric.Value
        simplifyMinTriangles = [int]$SimplifyMinNumeric.Value
        quantizeMinTriangles = [int]$QuantizeMinNumeric.Value
        ktxPath              = $KtxPathTextBox.Text.Trim()
        ktx2Mode             = if ($Ktx2ModeCombo) { Get-ComboValue -Map $script:Ktx2ModeMap -SelectedItem $Ktx2ModeCombo.SelectedItem } else { $script:Ktx2ModeMap.Values | Select-Object -First 1 }
        enableKtx2Zstd       = if ($Ktx2ZstdCheckBox) { [bool]$Ktx2ZstdCheckBox.Checked } else { $true }
        enableFixTextureSize = if ($FixTextureSizeCheckBox) { [bool]$FixTextureSizeCheckBox.Checked } else { $true }
    }
}

function Get-ComboValue([hashtable]$Map, $SelectedItem) {
    $key = [string]$SelectedItem
    if ($Map.Contains($key)) {
        return [string]$Map[$key]
    }
    return $key
}

function Get-ComboLabel([hashtable]$Map, [string]$Value) {
    foreach ($entry in $Map.GetEnumerator()) {
        if ($entry.Value -eq $Value) {
            return [string]$entry.Key
        }
    }
    return $Value
}

function Apply-SettingsToControls {
    param(
        [hashtable]$Settings,
        [System.Windows.Forms.ComboBox]$TextureFormatCombo,
        [System.Windows.Forms.ComboBox]$GeometryModeCombo,
        [System.Windows.Forms.NumericUpDown]$ColorMaxNumeric,
        [System.Windows.Forms.NumericUpDown]$DataMaxNumeric,
        [System.Windows.Forms.NumericUpDown]$WebPBaseNumeric,
        [System.Windows.Forms.NumericUpDown]$WebPEmissiveNumeric,
        [System.Windows.Forms.NumericUpDown]$WebPOtherNumeric,
        [System.Windows.Forms.NumericUpDown]$WebPEffortNumeric,
        [System.Windows.Forms.CheckBox]$PaletteCheckBox,
        [System.Windows.Forms.NumericUpDown]$PaletteMinNumeric,
        [System.Windows.Forms.NumericUpDown]$SimplifyScaleNumeric,
        [System.Windows.Forms.NumericUpDown]$SimplifyMinNumeric,
        [System.Windows.Forms.NumericUpDown]$QuantizeMinNumeric,
        [System.Windows.Forms.TextBox]$KtxPathTextBox,
        [System.Windows.Forms.ComboBox]$Ktx2ModeCombo,
        [System.Windows.Forms.CheckBox]$Ktx2ZstdCheckBox,
        [System.Windows.Forms.CheckBox]$FixTextureSizeCheckBox
    )

    $TextureFormatCombo.SelectedItem = Get-ComboLabel -Map $script:TextureFormatMap -Value ([string]$Settings.textureFormat)
    $GeometryModeCombo.SelectedItem = Get-ComboLabel -Map $script:GeometryModeMap -Value ([string]$Settings.geometryMode)
    $ColorMaxNumeric.Value = [decimal]$Settings.colorMaxSize
    $ColorMaxNumeric2.Value = [decimal]$Settings.colorMaxSize
    $DataMaxNumeric.Value = [decimal]$Settings.dataMaxSize
    $DataMaxNumeric2.Value = [decimal]$Settings.dataMaxSize
    $WebPBaseNumeric.Value = [decimal]$Settings.webpQualityBase
    $WebPEmissiveNumeric.Value = [decimal]$Settings.webpQualityEmissive
    $WebPOtherNumeric.Value = [decimal]$Settings.webpQualityOther
    $WebPEffortNumeric.Value = [decimal]$Settings.webpEffort
    $PaletteCheckBox.Checked = [bool]$Settings.enablePalette
    $PaletteMinNumeric.Value = [decimal]$Settings.paletteMin
    $SimplifyScaleNumeric.Value = [decimal]$Settings.simplifyScale
    $SimplifyMinNumeric.Value = [decimal]$Settings.simplifyMinTriangles
    $QuantizeMinNumeric.Value = [decimal]$Settings.quantizeMinTriangles
    $KtxPathTextBox.Text = [string]$Settings.ktxPath
    $Ktx2ModeCombo.SelectedItem = Get-ComboLabel -Map $script:Ktx2ModeMap -Value ([string]$Settings.ktx2Mode)
    $Ktx2ZstdCheckBox.Checked = [bool]$Settings.enableKtx2Zstd
    $FixTextureSizeCheckBox.Checked = [bool]$Settings.enableFixTextureSize
}

function Update-TextureGroupVisibility {
    param(
        [System.Windows.Forms.ComboBox]$TextureFormatCombo
    )

    $format = Get-ComboValue -Map $script:TextureFormatMap -SelectedItem $TextureFormatCombo.SelectedItem
    $webpTextureGroup.Visible = ($format -eq "webp")
    $ktx2TextureGroup.Visible = ($format -eq "ktx2")
}

function Update-PaletteControls {
    param(
        [System.Windows.Forms.CheckBox]$PaletteCheckBox,
        [System.Windows.Forms.Label]$PaletteMinLabel,
        [System.Windows.Forms.NumericUpDown]$PaletteMinNumeric
    )

    $enabled = [bool]$PaletteCheckBox.Checked
    $PaletteMinLabel.Enabled = $enabled
    $PaletteMinNumeric.Enabled = $enabled
}

function Update-AdvancedLayout {
    param(
        [bool]$Expanded
    )

    $textureInfoVisible = $textureInfoGroup.Visible
    $webpTextureGroup.Visible = $Expanded -and ((Get-ComboValue -Map $script:TextureFormatMap -SelectedItem $textureFormatCombo.SelectedItem) -eq "webp")
    $ktx2TextureGroup.Visible = $Expanded -and ((Get-ComboValue -Map $script:TextureFormatMap -SelectedItem $textureFormatCombo.SelectedItem) -eq "ktx2")
    $geometryGroup.Visible = $Expanded

    if ($Expanded) {
        $textureInfoToggleButton.Location = New-Object System.Drawing.Point(136, 160)
        $textureInfoToggleButton.Visible = $true

        $objectGroup.Location = New-Object System.Drawing.Point(12, 422)
        $objectGroup.Size = New-Object System.Drawing.Size(876, 280)
        $objectTitleLabel.Location = New-Object System.Drawing.Point(10, 8)
        $objectGrid.Location = New-Object System.Drawing.Point(14, 34)
        $objectGrid.Size = New-Object System.Drawing.Size(848, 200)
        $scanObjectsButton.Location = New-Object System.Drawing.Point(14, 244)
        $objectSummaryLabel.Location = New-Object System.Drawing.Point(140, 247)
        $textureInfoToggleButton.Location = New-Object System.Drawing.Point(136, 244)

        if ($textureInfoVisible) {
            $textureInfoGroup.Location = New-Object System.Drawing.Point(12, 710)
            $buttonPanel.Location = New-Object System.Drawing.Point(12, 898)
            $logGroup.Location = New-Object System.Drawing.Point(12, 946)
        } else {
            $buttonPanel.Location = New-Object System.Drawing.Point(12, 710)
            $logGroup.Location = New-Object System.Drawing.Point(12, 758)
        }

        $logGroup.Size = New-Object System.Drawing.Size(876, 188)
        $logTextBox.Size = New-Object System.Drawing.Size(848, 150)
        $form.AutoScrollMinSize = New-Object System.Drawing.Size(0, 1160)
        return
    }

    $objectGroup.Location = New-Object System.Drawing.Point(12, 160)
    $objectGroup.Size = New-Object System.Drawing.Size(876, 432)
    $objectTitleLabel.Location = New-Object System.Drawing.Point(10, 8)
    $objectGrid.Location = New-Object System.Drawing.Point(14, 34)
    $objectGrid.Size = New-Object System.Drawing.Size(848, 328)
    $scanObjectsButton.Location = New-Object System.Drawing.Point(14, 370)
    $objectSummaryLabel.Location = New-Object System.Drawing.Point(140, 373)
    $textureInfoToggleButton.Visible = $false
    $textureInfoGroup.Visible = $false
    $buttonPanel.Location = New-Object System.Drawing.Point(12, 600)
    $logGroup.Location = New-Object System.Drawing.Point(12, 648)
    $logGroup.Size = New-Object System.Drawing.Size(876, 200)
    $logTextBox.Size = New-Object System.Drawing.Size(848, 162)
    $form.AutoScrollMinSize = New-Object System.Drawing.Size(0, 0)
}

function Resolve-NodePath {
    $bundledCandidates = @(
        (Join-Path $script:ScriptDir "node.exe"),
        (Join-Path $script:ScriptDir "runtime\\node.exe")
    )

    foreach ($candidate in $bundledCandidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    $command = Get-Command node -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "没有找到可用的 Node 运行时。请确认工具目录里的 node.exe 没被删掉，或安装 Node.js。"
    }
    return $command.Source
}

function Test-ToolDependencyPath([string]$RelativePath) {
    return (Test-Path -LiteralPath (Join-Path $script:ScriptDir $RelativePath))
}

function Assert-ToolRuntimeDependencies {
    $required = @(
        "node_modules\\sharp",
        "node_modules\\draco3dgltf",
        "node_modules\\meshoptimizer",
        "node_modules\\gl-matrix",
        "node_modules\\@gltf-transform\\core",
        "node_modules\\@gltf-transform\\extensions",
        "node_modules\\@gltf-transform\\functions"
    )

    $missing = @()
    foreach ($item in $required) {
        if (-not (Test-ToolDependencyPath -RelativePath $item)) {
            $missing += $item
        }
    }

    if ($missing.Count -gt 0) {
        throw "当前工具目录缺少运行依赖。请把整个工具文件夹连同 node_modules 一起复制，或在该目录执行 npm install。"
    }
}

function Quote-CmdArgument([string]$Value) {
    if ([string]::IsNullOrEmpty($Value)) {
        return '""'
    }

    if ($Value -match '[\s"]') {
        return '"' + ($Value -replace '"', '\"') + '"'
    }

    return $Value
}

function Start-LoggedProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$StdOutPath,
        [string]$StdErrPath,
        [string]$WorkingDirectory
    )

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = ($ArgumentList | ForEach-Object { Quote-CmdArgument $_ }) -join " "
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $null = $proc.Start()
    $script:StdOutReader = $proc.StandardOutput
    $script:StdErrReader = $proc.StandardError
    return $proc
}

function Set-ObjectGridFromReport {
    param(
        [System.Windows.Forms.DataGridView]$Grid,
        [System.Windows.Forms.Label]$SummaryLabel,
        [string]$ReportPath
    )

    $report = Get-Content -LiteralPath $ReportPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $Grid.Rows.Clear()

    foreach ($item in $report.objects) {
        $reason = if ([string]::IsNullOrWhiteSpace([string]$item.reason)) { "建议可优化" } else { [string]$item.reason }
        $rowIndex = $Grid.Rows.Add(
            [bool]$item.recommendedSimplify,
            [bool]$item.recommendedQuantize,
            [string]$item.name,
            [string]$item.triangleCount,
            $reason,
            [string]$item.id
        )
        if (-not [bool]$item.recommendedSimplify) {
            $Grid.Rows[$rowIndex].DefaultCellStyle.ForeColor = [System.Drawing.Color]::FromArgb(104, 112, 130)
        }
    }

    $SummaryLabel.Text = "对象 $($report.summary.objectCount) 个，三角面 $($report.summary.triangleCount)，建议减面 $($report.summary.recommendedSimplifyCount) 个，建议量化 $($report.summary.recommendedQuantizeCount) 个。"
}

function Write-ObjectPolicyFromGrid {
    param(
        [System.Windows.Forms.DataGridView]$Grid,
        [string]$PolicyPath
    )

    $objects = @()
    foreach ($row in $Grid.Rows) {
        if ($row.IsNewRow) {
            continue
        }

        $objects += [ordered]@{
            id       = [string]$row.Cells["id"].Value
            simplify = [bool]$row.Cells["simplify"].Value
            quantize = [bool]$row.Cells["quantize"].Value
            weld     = $true
        }
    }

    [ordered]@{ objects = $objects } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $PolicyPath -Encoding UTF8
}

function Invoke-ObjectScan {
    param(
        [System.Windows.Forms.TextBox]$InputTextBox,
        [System.Windows.Forms.DataGridView]$Grid,
        [System.Windows.Forms.Label]$SummaryLabel,
        [System.Windows.Forms.Label]$StatusLabel
    )

    $nodePath = Resolve-NodePath
    Assert-ToolRuntimeDependencies
    $inputValue = $InputTextBox.Text.Trim()

    if ([string]::IsNullOrWhiteSpace($inputValue) -or -not (Test-Path -LiteralPath $inputValue)) {
        throw "请先选择有效的 .glb 或 .gltf 输入文件。"
    }

    $inputItem = Get-Item -LiteralPath (Resolve-Path -LiteralPath $inputValue).Path
    if ($inputItem.PSIsContainer) {
        throw "输入必须是文件，不能是文件夹。"
    }

    $reportPath = Join-Path ([System.IO.Path]::GetTempPath()) ("gltf-optimize-objects-" + [guid]::NewGuid().ToString() + ".json")
    $settings = Collect-SettingsFromControls `
        -TextureFormatCombo $textureFormatCombo `
        -GeometryModeCombo $geometryModeCombo `
        -ColorMaxNumeric $colorMaxNumeric `
        -DataMaxNumeric $dataMaxNumeric `
        -WebPBaseNumeric $webpBaseNumeric `
        -WebPEmissiveNumeric $webpEmissiveNumeric `
        -WebPOtherNumeric $webpOtherNumeric `
        -WebPEffortNumeric $webpEffortNumeric `
        -PaletteCheckBox $paletteCheckBox `
        -PaletteMinNumeric $paletteMinNumeric `
        -SimplifyScaleNumeric $simplifyScaleNumeric `
        -SimplifyMinNumeric $simplifyMinNumeric `
        -QuantizeMinNumeric $quantizeMinNumeric `
        -KtxPathTextBox $ktxPathTextBox

    $args = @(
        $script:NodeScriptPath,
        $inputItem.FullName,
        "--analyze-json=$reportPath",
        "--simplify-min-triangles=$($settings.simplifyMinTriangles)",
        "--quantize-min-triangles=$($settings.quantizeMinTriangles)"
    )

    $StatusLabel.Text = "正在扫描对象..."
    $process = Start-Process -FilePath $nodePath -ArgumentList $args -WorkingDirectory $script:ScriptDir -NoNewWindow -Wait -PassThru
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $reportPath)) {
        throw "对象扫描失败。"
    }

    $script:LastObjectReportPath = $reportPath
    Set-ObjectGridFromReport -Grid $Grid -SummaryLabel $SummaryLabel -ReportPath $reportPath
    $StatusLabel.Text = "对象扫描完成。"
}

$savedSettings = Load-UiSettings

$form = New-Object System.Windows.Forms.Form
$form.Text = "GLB 模型优化工具"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(920, 900)
$form.MinimumSize = New-Object System.Drawing.Size(920, 900)
$form.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$form.MaximizeBox = $false
$form.AutoScroll = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 249, 252)
$form.HorizontalScroll.Enabled = $false
$form.HorizontalScroll.Visible = $false

$summaryPanel = New-Object System.Windows.Forms.Panel
$summaryPanel.Location = New-Object System.Drawing.Point(12, 12)
$summaryPanel.Size = New-Object System.Drawing.Size(876, 64)
$summaryPanel.BackColor = [System.Drawing.Color]::White
$summaryPanel.BorderStyle = "FixedSingle"
$summaryPanel.Visible = $false

$headerTitleLabel = New-Object System.Windows.Forms.Label
$headerTitleLabel.Location = New-Object System.Drawing.Point(14, 10)
$headerTitleLabel.Size = New-Object System.Drawing.Size(200, 24)
$headerTitleLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10.5, [System.Drawing.FontStyle]::Bold)
$headerTitleLabel.Text = "当前默认安全线"
$summaryPanel.Controls.Add($headerTitleLabel)

$headerLabel = New-Object System.Windows.Forms.Label
$headerLabel.Location = New-Object System.Drawing.Point(14, 34)
$headerLabel.Size = New-Object System.Drawing.Size(820, 22)
$headerLabel.ForeColor = [System.Drawing.Color]::FromArgb(86, 94, 112)
$headerLabel.Text = "KTX2 + 局部几何优化。几何优化按模型内容自动判断。"
$summaryPanel.Controls.Add($headerLabel)

$inputLabel = New-Object System.Windows.Forms.Label
$inputLabel.Location = New-Object System.Drawing.Point(12, 18)
$inputLabel.Size = New-Object System.Drawing.Size(78, 24)
$inputLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$inputLabel.Text = "输入文件"
$form.Controls.Add($inputLabel)

$inputTextBox = New-Object System.Windows.Forms.TextBox
$inputTextBox.Location = New-Object System.Drawing.Point(96, 17)
$inputTextBox.Size = New-Object System.Drawing.Size(672, 24)
$inputTextBox.AllowDrop = $true
$inputTextBox.Add_DragEnter({
    if ($_.Data.GetDataPresent("FileNameDrop")) {
        $_.Effect = "Copy"
    }
})
$inputTextBox.Add_DragDrop({
    $files = $_.Data.GetData("FileNameDrop")
    if ($files -and $files.Length -gt 0) {
        $path = $files[0]
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $inputTextBox.Text = (Resolve-Path -LiteralPath $path).Path
            $defaultOutput = Get-DefaultOutputPath -PathValue $inputTextBox.Text
            $outputTextBox.Text = $defaultOutput
            $script:LastAutoOutputPath = $defaultOutput
        }
    }
})
$form.Controls.Add($inputTextBox)

$inputBrowseButton = New-Object System.Windows.Forms.Button
$inputBrowseButton.Location = New-Object System.Drawing.Point(778, 16)
$inputBrowseButton.Size = New-Object System.Drawing.Size(110, 26)
$inputBrowseButton.Text = "浏览..."
$form.Controls.Add($inputBrowseButton)

$outputLabel = New-Object System.Windows.Forms.Label
$outputLabel.Location = New-Object System.Drawing.Point(12, 50)
$outputLabel.Size = New-Object System.Drawing.Size(78, 24)
$outputLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$outputLabel.Text = "输出文件"
$form.Controls.Add($outputLabel)

$outputTextBox = New-Object System.Windows.Forms.TextBox
$outputTextBox.Location = New-Object System.Drawing.Point(96, 49)
$outputTextBox.Size = New-Object System.Drawing.Size(672, 24)
$form.Controls.Add($outputTextBox)

$outputBrowseButton = New-Object System.Windows.Forms.Button
$outputBrowseButton.Location = New-Object System.Drawing.Point(778, 48)
$outputBrowseButton.Size = New-Object System.Drawing.Size(110, 26)
$outputBrowseButton.Text = "浏览..."
$form.Controls.Add($outputBrowseButton)

$basicGroup = New-Object System.Windows.Forms.GroupBox
$basicGroup.Location = New-Object System.Drawing.Point(12, 84)
$basicGroup.Size = New-Object System.Drawing.Size(876, 66)
$basicGroup.Text = "基础设置"
$basicGroup.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($basicGroup)

$textureFormatLabel = New-Object System.Windows.Forms.Label
$textureFormatLabel.Location = New-Object System.Drawing.Point(16, 30)
$textureFormatLabel.Size = New-Object System.Drawing.Size(70, 24)
$textureFormatLabel.Text = "纹理格式"
$basicGroup.Controls.Add($textureFormatLabel)

$textureFormatCombo = New-Object System.Windows.Forms.ComboBox
$textureFormatCombo.Location = New-Object System.Drawing.Point(90, 27)
$textureFormatCombo.Size = New-Object System.Drawing.Size(140, 24)
$textureFormatCombo.DropDownStyle = "DropDownList"
[void]$textureFormatCombo.Items.AddRange([object[]]$script:TextureFormatMap.Keys)
$basicGroup.Controls.Add($textureFormatCombo)

$geometryModeLabel = New-Object System.Windows.Forms.Label
$geometryModeLabel.Location = New-Object System.Drawing.Point(252, 30)
$geometryModeLabel.Size = New-Object System.Drawing.Size(70, 24)
$geometryModeLabel.Text = "几何模式"
$basicGroup.Controls.Add($geometryModeLabel)

$geometryModeCombo = New-Object System.Windows.Forms.ComboBox
$geometryModeCombo.Location = New-Object System.Drawing.Point(326, 27)
$geometryModeCombo.Size = New-Object System.Drawing.Size(140, 24)
$geometryModeCombo.DropDownStyle = "DropDownList"
[void]$geometryModeCombo.Items.AddRange([object[]]$script:GeometryModeMap.Keys)
$basicGroup.Controls.Add($geometryModeCombo)

$advancedToggleButton = New-Object System.Windows.Forms.Button
$advancedToggleButton.Location = New-Object System.Drawing.Point(488, 26)
$advancedToggleButton.Size = New-Object System.Drawing.Size(86, 26)
$advancedToggleButton.Text = "高级设置 ▼"
$advancedToggleButton.Tag = $false
$basicGroup.Controls.Add($advancedToggleButton)

# WebP 纹理参数组
$webpTextureGroup = New-Object System.Windows.Forms.GroupBox
$webpTextureGroup.Location = New-Object System.Drawing.Point(12, 158)
$webpTextureGroup.Size = New-Object System.Drawing.Size(876, 124)
$webpTextureGroup.Text = "WebP 纹理参数"
$webpTextureGroup.BackColor = [System.Drawing.Color]::White
$webpTextureGroup.Visible = $false
$form.Controls.Add($webpTextureGroup)

$colorMaxLabel = New-Object System.Windows.Forms.Label
$colorMaxLabel.Location = New-Object System.Drawing.Point(16, 28)
$colorMaxLabel.Size = New-Object System.Drawing.Size(120, 24)
$colorMaxLabel.Text = "颜色贴图最大边"
$webpTextureGroup.Controls.Add($colorMaxLabel)

$colorMaxNumeric = New-Object System.Windows.Forms.NumericUpDown
$colorMaxNumeric.Location = New-Object System.Drawing.Point(140, 26)
$colorMaxNumeric.Size = New-Object System.Drawing.Size(110, 24)
$colorMaxNumeric.Minimum = 16
$colorMaxNumeric.Maximum = 8192
$colorMaxNumeric.Increment = 16
$webpTextureGroup.Controls.Add($colorMaxNumeric)

$dataMaxLabel = New-Object System.Windows.Forms.Label
$dataMaxLabel.Location = New-Object System.Drawing.Point(280, 28)
$dataMaxLabel.Size = New-Object System.Drawing.Size(120, 24)
$dataMaxLabel.Text = "数据贴图最大边"
$webpTextureGroup.Controls.Add($dataMaxLabel)

$dataMaxNumeric = New-Object System.Windows.Forms.NumericUpDown
$dataMaxNumeric.Location = New-Object System.Drawing.Point(404, 26)
$dataMaxNumeric.Size = New-Object System.Drawing.Size(110, 24)
$dataMaxNumeric.Minimum = 16
$dataMaxNumeric.Maximum = 8192
$dataMaxNumeric.Increment = 16
$webpTextureGroup.Controls.Add($dataMaxNumeric)

$webpBaseLabel = New-Object System.Windows.Forms.Label
$webpBaseLabel.Location = New-Object System.Drawing.Point(544, 28)
$webpBaseLabel.Size = New-Object System.Drawing.Size(120, 24)
$webpBaseLabel.Text = "WebP 主颜色"
$webpTextureGroup.Controls.Add($webpBaseLabel)

$webpBaseNumeric = New-Object System.Windows.Forms.NumericUpDown
$webpBaseNumeric.Location = New-Object System.Drawing.Point(668, 26)
$webpBaseNumeric.Size = New-Object System.Drawing.Size(70, 24)
$webpBaseNumeric.Minimum = 0
$webpBaseNumeric.Maximum = 100
$webpTextureGroup.Controls.Add($webpBaseNumeric)

$webpEmissiveLabel = New-Object System.Windows.Forms.Label
$webpEmissiveLabel.Location = New-Object System.Drawing.Point(748, 28)
$webpEmissiveLabel.Size = New-Object System.Drawing.Size(100, 24)
$webpEmissiveLabel.Text = "自发光"
$webpTextureGroup.Controls.Add($webpEmissiveLabel)

$webpEmissiveNumeric = New-Object System.Windows.Forms.NumericUpDown
$webpEmissiveNumeric.Location = New-Object System.Drawing.Point(806, 26)
$webpEmissiveNumeric.Size = New-Object System.Drawing.Size(56, 24)
$webpEmissiveNumeric.Minimum = 0
$webpEmissiveNumeric.Maximum = 100
$webpTextureGroup.Controls.Add($webpEmissiveNumeric)

$webpOtherLabel = New-Object System.Windows.Forms.Label
$webpOtherLabel.Location = New-Object System.Drawing.Point(16, 64)
$webpOtherLabel.Size = New-Object System.Drawing.Size(120, 24)
$webpOtherLabel.Text = "WebP 其它"
$webpTextureGroup.Controls.Add($webpOtherLabel)

$webpOtherNumeric = New-Object System.Windows.Forms.NumericUpDown
$webpOtherNumeric.Location = New-Object System.Drawing.Point(140, 62)
$webpOtherNumeric.Size = New-Object System.Drawing.Size(110, 24)
$webpOtherNumeric.Minimum = 0
$webpOtherNumeric.Maximum = 100
$webpTextureGroup.Controls.Add($webpOtherNumeric)

$webpEffortLabel = New-Object System.Windows.Forms.Label
$webpEffortLabel.Location = New-Object System.Drawing.Point(280, 64)
$webpEffortLabel.Size = New-Object System.Drawing.Size(120, 24)
$webpEffortLabel.Text = "WebP 编码强度"
$webpTextureGroup.Controls.Add($webpEffortLabel)

$webpEffortNumeric = New-Object System.Windows.Forms.NumericUpDown
$webpEffortNumeric.Location = New-Object System.Drawing.Point(404, 62)
$webpEffortNumeric.Size = New-Object System.Drawing.Size(110, 24)
$webpEffortNumeric.Minimum = 0
$webpEffortNumeric.Maximum = 6
$webpTextureGroup.Controls.Add($webpEffortNumeric)

# WebP 尺寸预设按钮
$webpPresetLabel = New-Object System.Windows.Forms.Label
$webpPresetLabel.Location = New-Object System.Drawing.Point(16, 92)
$webpPresetLabel.Size = New-Object System.Drawing.Size(70, 24)
$webpPresetLabel.Text = "预设尺寸"
$webpTextureGroup.Controls.Add($webpPresetLabel)

$webpPresetX = 90
foreach ($size in $script:SizePresets) {
    $btn = New-Object System.Windows.Forms.Button
    $btn.Location = New-Object System.Drawing.Point($webpPresetX, 92)
    $btn.Size = New-Object System.Drawing.Size(56, 24)
    $btn.Text = [string]$size
    $btn.Tag = $size
    $btn.Add_Click({
        $s = [int]$this.Tag
        $colorMaxNumeric.Value = [decimal]$s
        $dataMaxNumeric.Value = [decimal]$s
    })
    $webpTextureGroup.Controls.Add($btn)
    $webpPresetX += 62
}

# KTX2 纹理参数组
$ktx2TextureGroup = New-Object System.Windows.Forms.GroupBox
$ktx2TextureGroup.Location = New-Object System.Drawing.Point(12, 158)
$ktx2TextureGroup.Size = New-Object System.Drawing.Size(876, 130)
$ktx2TextureGroup.Text = "KTX2 纹理参数"
$ktx2TextureGroup.BackColor = [System.Drawing.Color]::White
$ktx2TextureGroup.Visible = $true
$form.Controls.Add($ktx2TextureGroup)

$ktx2ModeLabel = New-Object System.Windows.Forms.Label
$ktx2ModeLabel.Location = New-Object System.Drawing.Point(16, 28)
$ktx2ModeLabel.Size = New-Object System.Drawing.Size(120, 24)
$ktx2ModeLabel.Text = "KTX2 模式"
$ktx2TextureGroup.Controls.Add($ktx2ModeLabel)

$ktx2ModeCombo = New-Object System.Windows.Forms.ComboBox
$ktx2ModeCombo.Location = New-Object System.Drawing.Point(140, 26)
$ktx2ModeCombo.Size = New-Object System.Drawing.Size(200, 24)
$ktx2ModeCombo.DropDownStyle = "DropDownList"
[void]$ktx2ModeCombo.Items.AddRange([object[]]$script:Ktx2ModeMap.Keys)
$ktx2TextureGroup.Controls.Add($ktx2ModeCombo)

$colorMaxLabel2 = New-Object System.Windows.Forms.Label
$colorMaxLabel2.Location = New-Object System.Drawing.Point(360, 28)
$colorMaxLabel2.Size = New-Object System.Drawing.Size(120, 24)
$colorMaxLabel2.Text = "颜色贴图最大边"
$ktx2TextureGroup.Controls.Add($colorMaxLabel2)

$colorMaxNumeric2 = New-Object System.Windows.Forms.NumericUpDown
$colorMaxNumeric2.Location = New-Object System.Drawing.Point(484, 26)
$colorMaxNumeric2.Size = New-Object System.Drawing.Size(110, 24)
$colorMaxNumeric2.Minimum = 16
$colorMaxNumeric2.Maximum = 8192
$colorMaxNumeric2.Increment = 16
$ktx2TextureGroup.Controls.Add($colorMaxNumeric2)

$dataMaxLabel2 = New-Object System.Windows.Forms.Label
$dataMaxLabel2.Location = New-Object System.Drawing.Point(620, 28)
$dataMaxLabel2.Size = New-Object System.Drawing.Size(120, 24)
$dataMaxLabel2.Text = "数据贴图最大边"
$ktx2TextureGroup.Controls.Add($dataMaxLabel2)

$dataMaxNumeric2 = New-Object System.Windows.Forms.NumericUpDown
$dataMaxNumeric2.Location = New-Object System.Drawing.Point(744, 26)
$dataMaxNumeric2.Size = New-Object System.Drawing.Size(110, 24)
$dataMaxNumeric2.Minimum = 16
$dataMaxNumeric2.Maximum = 8192
$dataMaxNumeric2.Increment = 16
$ktx2TextureGroup.Controls.Add($dataMaxNumeric2)

$ktx2ZstdCheckBox = New-Object System.Windows.Forms.CheckBox
$ktx2ZstdCheckBox.Location = New-Object System.Drawing.Point(20, 64)
$ktx2ZstdCheckBox.Size = New-Object System.Drawing.Size(200, 24)
$ktx2ZstdCheckBox.Text = "✓ 启用 ZSTD 传输压缩"
$ktx2TextureGroup.Controls.Add($ktx2ZstdCheckBox)

$fixTextureSizeCheckBox = New-Object System.Windows.Forms.CheckBox
$fixTextureSizeCheckBox.Location = New-Object System.Drawing.Point(20, 94)
$fixTextureSizeCheckBox.Size = New-Object System.Drawing.Size(300, 24)
$fixTextureSizeCheckBox.Text = "修正纹理为 4 的倍数宽高"
$fixTextureSizeCheckBox.Checked = $false
$fixTextureSizeCheckBox.Enabled = $true
$ktx2TextureGroup.Controls.Add($fixTextureSizeCheckBox)

# KTX2 尺寸预设按钮
$ktx2PresetLabel = New-Object System.Windows.Forms.Label
$ktx2PresetLabel.Location = New-Object System.Drawing.Point(340, 94)
$ktx2PresetLabel.Size = New-Object System.Drawing.Size(70, 24)
$ktx2PresetLabel.Text = "预设尺寸"
$ktx2TextureGroup.Controls.Add($ktx2PresetLabel)

$ktx2PresetX = 414
foreach ($size in $script:SizePresets) {
    $btn = New-Object System.Windows.Forms.Button
    $btn.Location = New-Object System.Drawing.Point($ktx2PresetX, 94)
    $btn.Size = New-Object System.Drawing.Size(56, 24)
    $btn.Text = [string]$size
    $btn.Tag = $size
    $btn.Add_Click({
        $s = [int]$this.Tag
        $colorMaxNumeric2.Value = [decimal]$s
        $dataMaxNumeric2.Value = [decimal]$s
    })
    $ktx2TextureGroup.Controls.Add($btn)
    $ktx2PresetX += 62
}

# 几何参数组
$geometryGroup = New-Object System.Windows.Forms.GroupBox
$geometryGroup.Location = New-Object System.Drawing.Point(12, 306)
$geometryGroup.Size = New-Object System.Drawing.Size(876, 108)
$geometryGroup.Text = "几何参数"
$geometryGroup.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($geometryGroup)

$simplifyScaleLabel = New-Object System.Windows.Forms.Label
$simplifyScaleLabel.Location = New-Object System.Drawing.Point(16, 30)
$simplifyScaleLabel.Size = New-Object System.Drawing.Size(120, 24)
$simplifyScaleLabel.Text = "简化强度"
$geometryGroup.Controls.Add($simplifyScaleLabel)

$simplifyScaleNumeric = New-Object System.Windows.Forms.NumericUpDown
$simplifyScaleNumeric.Location = New-Object System.Drawing.Point(140, 28)
$simplifyScaleNumeric.Size = New-Object System.Drawing.Size(110, 24)
$simplifyScaleNumeric.Minimum = 0
$simplifyScaleNumeric.Maximum = 4
$simplifyScaleNumeric.DecimalPlaces = 2
$simplifyScaleNumeric.Increment = [decimal]0.05
$geometryGroup.Controls.Add($simplifyScaleNumeric)

$simplifyMinLabel = New-Object System.Windows.Forms.Label
$simplifyMinLabel.Location = New-Object System.Drawing.Point(280, 30)
$simplifyMinLabel.Size = New-Object System.Drawing.Size(120, 24)
$simplifyMinLabel.Text = "简化最小三角面"
$geometryGroup.Controls.Add($simplifyMinLabel)

$simplifyMinNumeric = New-Object System.Windows.Forms.NumericUpDown
$simplifyMinNumeric.Location = New-Object System.Drawing.Point(404, 28)
$simplifyMinNumeric.Size = New-Object System.Drawing.Size(110, 24)
$simplifyMinNumeric.Minimum = 0
$simplifyMinNumeric.Maximum = 10000000
$simplifyMinNumeric.Increment = 100
$geometryGroup.Controls.Add($simplifyMinNumeric)

$quantizeMinLabel = New-Object System.Windows.Forms.Label
$quantizeMinLabel.Location = New-Object System.Drawing.Point(544, 30)
$quantizeMinLabel.Size = New-Object System.Drawing.Size(120, 24)
$quantizeMinLabel.Text = "量化最小三角面"
$geometryGroup.Controls.Add($quantizeMinLabel)

$quantizeMinNumeric = New-Object System.Windows.Forms.NumericUpDown
$quantizeMinNumeric.Location = New-Object System.Drawing.Point(668, 28)
$quantizeMinNumeric.Size = New-Object System.Drawing.Size(110, 24)
$quantizeMinNumeric.Minimum = 0
$quantizeMinNumeric.Maximum = 10000000
$quantizeMinNumeric.Increment = 100
$geometryGroup.Controls.Add($quantizeMinNumeric)

$paletteCheckBox = New-Object System.Windows.Forms.CheckBox
$paletteCheckBox.Location = New-Object System.Drawing.Point(20, 66)
$paletteCheckBox.Size = New-Object System.Drawing.Size(180, 24)
$paletteCheckBox.Text = "启用纯色调色板"
$geometryGroup.Controls.Add($paletteCheckBox)

$paletteMinLabel = New-Object System.Windows.Forms.Label
$paletteMinLabel.Location = New-Object System.Drawing.Point(280, 66)
$paletteMinLabel.Size = New-Object System.Drawing.Size(120, 24)
$paletteMinLabel.Text = "调色板最小数量"
$geometryGroup.Controls.Add($paletteMinLabel)

$paletteMinNumeric = New-Object System.Windows.Forms.NumericUpDown
$paletteMinNumeric.Location = New-Object System.Drawing.Point(404, 64)
$paletteMinNumeric.Size = New-Object System.Drawing.Size(110, 24)
$paletteMinNumeric.Minimum = 2
$paletteMinNumeric.Maximum = 4096
$paletteMinNumeric.Increment = 1
$geometryGroup.Controls.Add($paletteMinNumeric)

# 隐藏的 KTX 路径控件（保留兼容性，自动发现路径）
$ktxPathTextBox = New-Object System.Windows.Forms.TextBox
$ktxPathTextBox.Visible = $false
$form.Controls.Add($ktxPathTextBox)

# 对象组（扫描/网格/清单切换）
$objectGroup = New-Object System.Windows.Forms.Panel
$objectGroup.Location = New-Object System.Drawing.Point(12, 160)
$objectGroup.Size = New-Object System.Drawing.Size(876, 432)
$objectGroup.BackColor = [System.Drawing.Color]::White
$objectGroup.BorderStyle = "FixedSingle"
$form.Controls.Add($objectGroup)

$objectTitleLabel = New-Object System.Windows.Forms.Label
$objectTitleLabel.Location = New-Object System.Drawing.Point(10, 8)
$objectTitleLabel.Size = New-Object System.Drawing.Size(200, 20)
$objectTitleLabel.Text = "对象列表"
$objectTitleLabel.BackColor = [System.Drawing.Color]::White
$objectGroup.Controls.Add($objectTitleLabel)

$objectGrid = New-Object System.Windows.Forms.DataGridView
$objectGrid.Location = New-Object System.Drawing.Point(14, 34)
$objectGrid.Size = New-Object System.Drawing.Size(848, 328)
$objectGrid.AllowUserToAddRows = $false
$objectGrid.AllowUserToDeleteRows = $false
$objectGrid.RowHeadersVisible = $false
$objectGrid.MultiSelect = $false
$objectGrid.SelectionMode = "FullRowSelect"
$objectGrid.AutoSizeColumnsMode = "None"
$objectGrid.ScrollBars = "Both"
$objectGrid.BackgroundColor = [System.Drawing.Color]::White
$objectGrid.BorderStyle = "FixedSingle"
$objectGrid.ReadOnly = $false
$objectGrid.ColumnHeadersHeightSizeMode = "DisableResizing"
$objectGrid.ColumnHeadersHeight = 24
$objectGroup.Controls.Add($objectGrid)

$simplifyColumn = New-Object System.Windows.Forms.DataGridViewCheckBoxColumn
$simplifyColumn.Name = "simplify"
$simplifyColumn.HeaderText = "简化"
$simplifyColumn.Width = 50
$simplifyColumn.ReadOnly = $false
[void]$objectGrid.Columns.Add($simplifyColumn)

$quantizeColumn = New-Object System.Windows.Forms.DataGridViewCheckBoxColumn
$quantizeColumn.Name = "quantize"
$quantizeColumn.HeaderText = "量化"
$quantizeColumn.Width = 50
$quantizeColumn.ReadOnly = $false
[void]$objectGrid.Columns.Add($quantizeColumn)

$objNameColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$objNameColumn.Name = "name"
$objNameColumn.HeaderText = "对象"
$objNameColumn.Width = 200
$objNameColumn.ReadOnly = $true
[void]$objectGrid.Columns.Add($objNameColumn)

$objTriColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$objTriColumn.Name = "triangleCount"
$objTriColumn.HeaderText = "三角面"
$objTriColumn.Width = 100
$objTriColumn.ReadOnly = $true
[void]$objectGrid.Columns.Add($objTriColumn)

$objReasonColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$objReasonColumn.Name = "reason"
$objReasonColumn.HeaderText = "建议"
$objReasonColumn.Width = 180
$objReasonColumn.ReadOnly = $true
[void]$objectGrid.Columns.Add($objReasonColumn)

$objIdColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$objIdColumn.Name = "id"
$objIdColumn.HeaderText = "ID"
$objIdColumn.Visible = $false
[void]$objectGrid.Columns.Add($objIdColumn)
$objectGrid.Add_DataError({ $_.ThrowException = $false })

$scanObjectsButton = New-Object System.Windows.Forms.Button
$scanObjectsButton.Location = New-Object System.Drawing.Point(14, 370)
$scanObjectsButton.Size = New-Object System.Drawing.Size(120, 26)
$scanObjectsButton.Text = "扫描对象"
$scanObjectsButton.UseVisualStyleBackColor = $true
$objectGroup.Controls.Add($scanObjectsButton)

$objectSummaryLabel = New-Object System.Windows.Forms.Label
$objectSummaryLabel.Location = New-Object System.Drawing.Point(140, 373)
$objectSummaryLabel.Size = New-Object System.Drawing.Size(500, 20)
$objectSummaryLabel.Text = "尚未扫描对象。"
$objectSummaryLabel.BackColor = [System.Drawing.Color]::White
$objectGroup.Controls.Add($objectSummaryLabel)

# 贴图优化清单（默认收起）
$textureInfoToggleButton = New-Object System.Windows.Forms.Button
$textureInfoToggleButton.Location = New-Object System.Drawing.Point(136, 370)
$textureInfoToggleButton.Size = New-Object System.Drawing.Size(120, 26)
$textureInfoToggleButton.Text = "贴图清单 ▼"
$textureInfoToggleButton.Tag = $false
$objectGroup.Controls.Add($textureInfoToggleButton)

$textureInfoGroup = New-Object System.Windows.Forms.Panel
$textureInfoGroup.Location = New-Object System.Drawing.Point(12, 418)
$textureInfoGroup.Size = New-Object System.Drawing.Size(876, 180)
$textureInfoGroup.BackColor = [System.Drawing.Color]::White
$textureInfoGroup.BorderStyle = "FixedSingle"
$textureInfoGroup.Visible = $false
$form.Controls.Add($textureInfoGroup)

$textureInfoTitleLabel = New-Object System.Windows.Forms.Label
$textureInfoTitleLabel.Location = New-Object System.Drawing.Point(10, 8)
$textureInfoTitleLabel.Size = New-Object System.Drawing.Size(200, 20)
$textureInfoTitleLabel.Text = "贴图压缩模式覆盖"
$textureInfoTitleLabel.BackColor = [System.Drawing.Color]::White
$textureInfoGroup.Controls.Add($textureInfoTitleLabel)

$textureGrid = New-Object System.Windows.Forms.DataGridView
$textureGrid.Location = New-Object System.Drawing.Point(14, 34)
$textureGrid.Size = New-Object System.Drawing.Size(848, 112)
$textureGrid.AllowUserToAddRows = $false
$textureGrid.AllowUserToDeleteRows = $false
$textureGrid.RowHeadersVisible = $false
$textureGrid.MultiSelect = $false
$textureGrid.SelectionMode = "FullRowSelect"
$textureGrid.AutoSizeColumnsMode = "None"
$textureGrid.ScrollBars = "Both"
$textureGrid.BackgroundColor = [System.Drawing.Color]::White
$textureGrid.BorderStyle = "FixedSingle"
$textureGrid.ReadOnly = $false
$textureGrid.ColumnHeadersHeightSizeMode = "DisableResizing"
$textureGrid.ColumnHeadersHeight = 24
$textureInfoGroup.Controls.Add($textureGrid)
$textureGrid.Add_DataError({ $_.ThrowException = $false })

$texNameColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$texNameColumn.Name = "texName"
$texNameColumn.HeaderText = "贴图"
$texNameColumn.Width = 200
$texNameColumn.ReadOnly = $true
[void]$textureGrid.Columns.Add($texNameColumn)

$texSizeColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$texSizeColumn.Name = "texSize"
$texSizeColumn.HeaderText = "尺寸"
$texSizeColumn.Width = 100
$texSizeColumn.ReadOnly = $true
[void]$textureGrid.Columns.Add($texSizeColumn)

$texSlotColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$texSlotColumn.Name = "texSlot"
$texSlotColumn.HeaderText = "绑定槽位"
$texSlotColumn.Width = 200
$texSlotColumn.ReadOnly = $true
[void]$textureGrid.Columns.Add($texSlotColumn)

$texModeColumn = New-Object System.Windows.Forms.DataGridViewComboBoxColumn
$texModeColumn.Name = "texMode"
$texModeColumn.HeaderText = "压缩覆盖"
$texModeColumn.Width = 180
$texModeColumn.Items.AddRange(@("默认", "WebP", "KTX2 ETC1S", "KTX2 UASTC"))
$texModeColumn.DefaultCellStyle.NullValue = "默认"
[void]$textureGrid.Columns.Add($texModeColumn)

$texIndexColumn = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
$texIndexColumn.Name = "texIndex"
$texIndexColumn.HeaderText = "Index"
$texIndexColumn.Visible = $false
$texIndexColumn.ReadOnly = $true
[void]$textureGrid.Columns.Add($texIndexColumn)

$scanTexturesButton = New-Object System.Windows.Forms.Button
$scanTexturesButton.Location = New-Object System.Drawing.Point(14, 150)
$scanTexturesButton.Size = New-Object System.Drawing.Size(112, 26)
$scanTexturesButton.Text = "扫描贴图"
$textureInfoGroup.Controls.Add($scanTexturesButton)

$textureSummaryLabel = New-Object System.Windows.Forms.Label
$textureSummaryLabel.Location = New-Object System.Drawing.Point(140, 153)
$textureSummaryLabel.Size = New-Object System.Drawing.Size(720, 22)
$textureSummaryLabel.ForeColor = [System.Drawing.Color]::FromArgb(86, 94, 112)
$textureSummaryLabel.Text = "先选择 GLB，然后扫描贴图；可覆盖每张贴图的压缩模式。"
$textureInfoGroup.Controls.Add($textureSummaryLabel)

$buttonPanel = New-Object System.Windows.Forms.Panel
$buttonPanel.Location = New-Object System.Drawing.Point(12, 600)
$buttonPanel.Size = New-Object System.Drawing.Size(876, 42)
$buttonPanel.BackColor = [System.Drawing.Color]::Transparent
$form.Controls.Add($buttonPanel)

$runButton = New-Object System.Windows.Forms.Button
$runButton.Location = New-Object System.Drawing.Point(0, 6)
$runButton.Size = New-Object System.Drawing.Size(144, 30)
$runButton.Text = "开始优化"
$runButton.BackColor = [System.Drawing.Color]::FromArgb(19, 163, 127)
$runButton.ForeColor = [System.Drawing.Color]::White
$runButton.FlatStyle = "Flat"
$runButton.FlatAppearance.BorderSize = 0
$runButton.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5, [System.Drawing.FontStyle]::Bold)
$buttonPanel.Controls.Add($runButton)

$resetButton = New-Object System.Windows.Forms.Button
$resetButton.Location = New-Object System.Drawing.Point(154, 6)
$resetButton.Size = New-Object System.Drawing.Size(120, 30)
$resetButton.Text = "恢复默认"
$buttonPanel.Controls.Add($resetButton)

$openOutputButton = New-Object System.Windows.Forms.Button
$openOutputButton.Location = New-Object System.Drawing.Point(284, 6)
$openOutputButton.Size = New-Object System.Drawing.Size(130, 30)
$openOutputButton.Text = "打开输出"
$openOutputButton.Enabled = $false
$buttonPanel.Controls.Add($openOutputButton)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Location = New-Object System.Drawing.Point(424, 6)
$closeButton.Size = New-Object System.Drawing.Size(100, 30)
$closeButton.Text = "关闭"
$buttonPanel.Controls.Add($closeButton)

$convertLightmapButton = New-Object System.Windows.Forms.Button
$convertLightmapButton.Location = New-Object System.Drawing.Point(534, 6)
$convertLightmapButton.Size = New-Object System.Drawing.Size(150, 30)
$convertLightmapButton.Text = "转换光照图 KTX2"
$buttonPanel.Controls.Add($convertLightmapButton)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(696, 11)
$statusLabel.Size = New-Object System.Drawing.Size(168, 24)
$statusLabel.Text = "就绪。"
$buttonPanel.Controls.Add($statusLabel)

$logGroup = New-Object System.Windows.Forms.GroupBox
$logGroup.Location = New-Object System.Drawing.Point(12, 648)
$logGroup.Size = New-Object System.Drawing.Size(876, 200)
$logGroup.Text = "日志"
$logGroup.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($logGroup)

$logTextBox = New-Object System.Windows.Forms.TextBox
$logTextBox.Location = New-Object System.Drawing.Point(14, 24)
$logTextBox.Size = New-Object System.Drawing.Size(848, 162)
$logTextBox.Multiline = $true
$logTextBox.ScrollBars = "Vertical"
$logTextBox.ReadOnly = $true
$logTextBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$logGroup.Controls.Add($logTextBox)

$pollTimer = New-Object System.Windows.Forms.Timer
$pollTimer.Interval = 400
$pollTimer.Add_Tick({
    Flush-ProcessReaders -TextBox $logTextBox
    if ($script:CurrentProcess -and $script:CurrentProcess.HasExited) {
        $exitCode = $script:CurrentProcess.ExitCode
        $script:CurrentProcess = $null
        $pollTimer.Stop()
        Flush-ProcessReaders -TextBox $logTextBox
        $script:StdOutReader = $null
        $script:StdErrReader = $null

        $runButton.Enabled = $true
        $resetButton.Enabled = $true

        if ($exitCode -eq 0) {
            $openOutputButton.Enabled = $true
            $statusLabel.Text = "完成。"
            [System.Windows.Forms.MessageBox]::Show("优化完成。", "完成", "OK", "Information") | Out-Null
        } else {
            $statusLabel.Text = "失败。"
            [System.Windows.Forms.MessageBox]::Show("优化失败，请查看下方日志。", "优化失败", "OK", "Error") | Out-Null
        }
    }
})

$advancedToggleButton.Add_Click({
    $expanded = -not [bool]$advancedToggleButton.Tag
    $advancedToggleButton.Tag = $expanded
    $advancedToggleButton.Text = if ($expanded) { "高级设置 ▲" } else { "高级设置 ▼" }
    Update-AdvancedLayout -Expanded $expanded
})
$textureFormatCombo.Add_SelectedIndexChanged({
    Update-TextureGroupVisibility -TextureFormatCombo $textureFormatCombo
})

$paletteCheckBox.Add_CheckedChanged({
    Update-PaletteControls -PaletteCheckBox $paletteCheckBox -PaletteMinLabel $paletteMinLabel -PaletteMinNumeric $paletteMinNumeric
})

$scanObjectsButton.Add_Click({
    try {
        Invoke-ObjectScan -InputTextBox $inputTextBox -Grid $objectGrid -SummaryLabel $objectSummaryLabel -StatusLabel $statusLabel
    } catch {
        $statusLabel.Text = "对象扫描失败。"
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "对象扫描失败", "OK", "Warning") | Out-Null
    }
})

$textureInfoToggleButton.Add_Click({
    $expanded = -not [bool]$textureInfoToggleButton.Tag
    $textureInfoToggleButton.Tag = $expanded
    $textureInfoToggleButton.Text = if ($expanded) { "贴图清单 ▲" } else { "贴图清单 ▼" }
    $textureInfoGroup.Visible = $expanded
    Update-AdvancedLayout -Expanded ([bool]$advancedToggleButton.Tag)
})

$scanTexturesButton.Add_Click({
    try {
        $nodePath = Resolve-NodePath
        Assert-ToolRuntimeDependencies
        $inputValue = $inputTextBox.Text.Trim()

        if ([string]::IsNullOrWhiteSpace($inputValue) -or -not (Test-Path -LiteralPath $inputValue)) {
            throw "请先选择有效的 .glb 或 .gltf 输入文件。"
        }

        $inputItem = Get-Item -LiteralPath (Resolve-Path -LiteralPath $inputValue).Path
        if ($inputItem.PSIsContainer) {
            throw "输入必须是文件，不能是文件夹。"
        }

        $textureInfoPath = Join-Path ([System.IO.Path]::GetTempPath()) ("gltf-optimize-textures-" + [guid]::NewGuid().ToString() + ".json")
        $script:LastTextureInfoPath = $textureInfoPath

        $args = @(
            $script:NodeScriptPath,
            $inputItem.FullName,
            "--texture-info=$textureInfoPath"
        )

        $statusLabel.Text = "正在扫描贴图..."
        $process = Start-Process -FilePath $nodePath -ArgumentList $args -WorkingDirectory $script:ScriptDir -NoNewWindow -Wait -PassThru
        if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $textureInfoPath)) {
            throw "贴图扫描失败。"
        }

        $textureInfo = Get-Content -LiteralPath $textureInfoPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $textureGrid.Rows.Clear()

        foreach ($tex in $textureInfo) {
            $slotText = if ($tex.slots -and $tex.slots.Count -gt 0) { ($tex.slots -join ", ") } else { "未使用" }
            $sizeText = "$($tex.width) x $($tex.height)"
            [void]$textureGrid.Rows.Add(
                [string]$tex.name,
                $sizeText,
                $slotText,
                "默认",
                [int]$tex.index
            )
        }

        $textureSummaryLabel.Text = "贴图 $($textureInfo.Count) 张。可覆盖每张贴图的压缩模式。"
        $statusLabel.Text = "贴图扫描完成。"
    } catch {
        $statusLabel.Text = "贴图扫描失败。"
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "贴图扫描失败", "OK", "Warning") | Out-Null
    }
})

$inputBrowseButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = "glTF 文件 (*.glb;*.gltf)|*.glb;*.gltf|所有文件 (*.*)|*.*"
    $dialog.Multiselect = $false
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $inputTextBox.Text = $dialog.FileName
        $defaultOutput = Get-DefaultOutputPath -PathValue $dialog.FileName
        if ([string]::IsNullOrWhiteSpace($outputTextBox.Text) -or $outputTextBox.Text -eq $script:LastAutoOutputPath) {
            $outputTextBox.Text = $defaultOutput
            $script:LastAutoOutputPath = $defaultOutput
        }
        $objectGrid.Rows.Clear()
        $objectSummaryLabel.Text = "输入文件已变化，请重新扫描对象。"
        $textureGrid.Rows.Clear()
        $textureSummaryLabel.Text = "先选择 GLB，然后扫描贴图；可覆盖每张贴图的压缩模式。"
    }
})

$outputBrowseButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.SaveFileDialog
    $dialog.Filter = "GLB 文件 (*.glb)|*.glb|所有文件 (*.*)|*.*"
    $dialog.OverwritePrompt = $true
    if (-not [string]::IsNullOrWhiteSpace($outputTextBox.Text)) {
        $dialog.FileName = [System.IO.Path]::GetFileName($outputTextBox.Text)
        $dir = Split-Path -Parent $outputTextBox.Text
        if ($dir -and (Test-Path -LiteralPath $dir)) {
            $dialog.InitialDirectory = $dir
        }
    }
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $outputTextBox.Text = $dialog.FileName
    }
})

$resetButton.Add_Click({
    $defaults = Get-DefaultSettings
    Apply-SettingsToControls -Settings $defaults `
        -TextureFormatCombo $textureFormatCombo `
        -GeometryModeCombo $geometryModeCombo `
        -ColorMaxNumeric $colorMaxNumeric `
        -DataMaxNumeric $dataMaxNumeric `
        -WebPBaseNumeric $webpBaseNumeric `
        -WebPEmissiveNumeric $webpEmissiveNumeric `
        -WebPOtherNumeric $webpOtherNumeric `
        -WebPEffortNumeric $webpEffortNumeric `
        -PaletteCheckBox $paletteCheckBox `
        -PaletteMinNumeric $paletteMinNumeric `
        -SimplifyScaleNumeric $simplifyScaleNumeric `
        -SimplifyMinNumeric $simplifyMinNumeric `
        -QuantizeMinNumeric $quantizeMinNumeric `
        -KtxPathTextBox $ktxPathTextBox `
        -Ktx2ModeCombo $ktx2ModeCombo `
        -Ktx2ZstdCheckBox $ktx2ZstdCheckBox `
        -FixTextureSizeCheckBox $fixTextureSizeCheckBox
    Update-TextureGroupVisibility -TextureFormatCombo $textureFormatCombo
    Update-PaletteControls -PaletteCheckBox $paletteCheckBox -PaletteMinLabel $paletteMinLabel -PaletteMinNumeric $paletteMinNumeric
    $statusLabel.Text = "已恢复默认参数。"
})

$openOutputButton.Add_Click({
    if (-not [string]::IsNullOrWhiteSpace($script:LastOutputPath) -and (Test-Path -LiteralPath $script:LastOutputPath)) {
        Start-Process explorer.exe "/select,`"$script:LastOutputPath`""
    }
})

$closeButton.Add_Click({
    $form.Close()
})

$convertLightmapButton.Add_Click({
    try {
        $nodePath = Resolve-NodePath
        Assert-ToolRuntimeDependencies

        if (-not (Test-Path -LiteralPath $script:LightmapConvertScriptPath)) {
            throw "缺少光照图转换脚本：lightmap-to-ktx2.mjs"
        }

        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Filter = "图片文件 (*.png;*.jpg;*.jpeg)|*.png;*.jpg;*.jpeg|所有文件 (*.*)|*.*"
        $dialog.Multiselect = $true
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
            return
        }

        $folderDialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $folderDialog.Description = "选择 KTX2 输出文件夹"
        $folderDialog.SelectedPath = [System.IO.Path]::GetDirectoryName($dialog.FileNames[0])
        if ($folderDialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
            return
        }

        $args = @(
            $script:LightmapConvertScriptPath,
            "--out-dir=$($folderDialog.SelectedPath)",
            "--mode=uastc"
        )

        if (-not [string]::IsNullOrWhiteSpace($ktxPathTextBox.Text.Trim())) {
            $args += "--ktx-path=$($ktxPathTextBox.Text.Trim())"
        }

        foreach ($fileName in $dialog.FileNames) {
            $args += $fileName
        }

        $logTextBox.Clear()
        Append-Log -TextBox $logTextBox -Text "开始转换光照图 KTX2..."
        $statusLabel.Text = "转换光照图..."
        $process = Start-Process -FilePath $nodePath -ArgumentList $args -WorkingDirectory $script:ScriptDir -NoNewWindow -Wait -PassThru
        if ($process.ExitCode -ne 0) {
            throw "光照图 KTX2 转换失败。"
        }

        $statusLabel.Text = "转换完成。"
        [System.Windows.Forms.MessageBox]::Show("光照图 KTX2 转换完成。", "完成", "OK", "Information") | Out-Null
    } catch {
        $statusLabel.Text = "转换失败。"
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "光照图转换失败", "OK", "Warning") | Out-Null
    }
})

$runButton.Add_Click({
    try {
        $nodePath = Resolve-NodePath
        Assert-ToolRuntimeDependencies
        $inputValue = $inputTextBox.Text.Trim()
        $outputValue = $outputTextBox.Text.Trim()

        if ([string]::IsNullOrWhiteSpace($inputValue) -or -not (Test-Path -LiteralPath $inputValue)) {
            throw "请先选择有效的 .glb 或 .gltf 输入文件。"
        }

        $inputItem = Get-Item -LiteralPath (Resolve-Path -LiteralPath $inputValue).Path
        if ($inputItem.PSIsContainer) {
            throw "输入必须是文件，不能是文件夹。"
        }

        $inputExt = $inputItem.Extension.ToLowerInvariant()
        if ($inputExt -ne ".glb" -and $inputExt -ne ".gltf") {
            throw "输入文件必须是 .glb 或 .gltf。"
        }

        if ([string]::IsNullOrWhiteSpace($outputValue)) {
            throw "请先选择输出文件路径。"
        }

        $outputDir = Split-Path -Parent $outputValue
        if ([string]::IsNullOrWhiteSpace($outputDir) -or -not (Test-Path -LiteralPath $outputDir)) {
            throw "输出文件夹不存在。"
        }

        if ([System.IO.Path]::GetExtension($outputValue).ToLowerInvariant() -ne ".glb") {
            throw "输出文件必须以 .glb 结尾。"
        }

        $settings = Collect-SettingsFromControls `
            -TextureFormatCombo $textureFormatCombo `
            -GeometryModeCombo $geometryModeCombo `
            -ColorMaxNumeric $colorMaxNumeric `
            -DataMaxNumeric $dataMaxNumeric `
            -WebPBaseNumeric $webpBaseNumeric `
            -WebPEmissiveNumeric $webpEmissiveNumeric `
            -WebPOtherNumeric $webpOtherNumeric `
            -WebPEffortNumeric $webpEffortNumeric `
            -PaletteCheckBox $paletteCheckBox `
            -PaletteMinNumeric $paletteMinNumeric `
            -SimplifyScaleNumeric $simplifyScaleNumeric `
            -SimplifyMinNumeric $simplifyMinNumeric `
            -QuantizeMinNumeric $quantizeMinNumeric `
            -KtxPathTextBox $ktxPathTextBox `
            -Ktx2ModeCombo $ktx2ModeCombo `
            -Ktx2ZstdCheckBox $ktx2ZstdCheckBox `
            -FixTextureSizeCheckBox $fixTextureSizeCheckBox

        Save-UiSettings -Settings $settings

        $script:StdOutPath = Join-Path ([System.IO.Path]::GetTempPath()) ("gltf-optimize-ui-" + [guid]::NewGuid().ToString() + ".stdout.log")
        $script:StdErrPath = Join-Path ([System.IO.Path]::GetTempPath()) ("gltf-optimize-ui-" + [guid]::NewGuid().ToString() + ".stderr.log")
        $script:StdOutSnapshot = ""
        $script:StdErrSnapshot = ""
        $script:LastOutputPath = $outputValue
        Set-Content -LiteralPath $script:StdOutPath -Value "" -Encoding UTF8
        Set-Content -LiteralPath $script:StdErrPath -Value "" -Encoding UTF8

        $argumentArray = @(
            $script:NodeScriptPath,
            $inputItem.FullName,
            $outputValue,
            "--texture-format=$($settings.textureFormat)",
            "--geometry-mode=$($settings.geometryMode)",
            "--color-max-size=$($settings.colorMaxSize)",
            "--data-max-size=$($settings.dataMaxSize)",
            "--webp-quality-base=$($settings.webpQualityBase)",
            "--webp-quality-emissive=$($settings.webpQualityEmissive)",
            "--webp-quality-other=$($settings.webpQualityOther)",
            "--webp-effort=$($settings.webpEffort)",
            "--simplify-scale=$([System.String]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0:0.00}', $settings.simplifyScale))",
            "--simplify-min-triangles=$($settings.simplifyMinTriangles)",
            "--quantize-min-triangles=$($settings.quantizeMinTriangles)",
            "--ktx2-mode=$($settings.ktx2Mode)"
        )

        if (-not $settings.enablePalette) {
            $argumentArray += "--no-palette"
        } else {
            $argumentArray += "--palette-min=$($settings.paletteMin)"
        }

        if ($objectGrid.Rows.Count -gt 0) {
            $policyPath = Join-Path ([System.IO.Path]::GetTempPath()) ("gltf-optimize-policy-" + [guid]::NewGuid().ToString() + ".json")
            Write-ObjectPolicyFromGrid -Grid $objectGrid -PolicyPath $policyPath
            $script:LastObjectPolicyPath = $policyPath
            $argumentArray += "--object-policy=$policyPath"
        }

        if ($settings.textureFormat -eq "ktx2" -and -not [string]::IsNullOrWhiteSpace($settings.ktxPath)) {
            $argumentArray += "--ktx-path=$($settings.ktxPath)"
        }

        if ($settings.textureFormat -eq "ktx2") {
            if (-not $settings.enableKtx2Zstd) {
                $argumentArray += "--ktx2-zstd-level=0"
            }
            if (-not $settings.enableFixTextureSize) {
                $argumentArray += "--no-fix-texture-size"
            }
        }

        # 处理贴图覆盖
        if ($textureGrid.Rows.Count -gt 0) {
            $overrides = @()
            foreach ($row in $textureGrid.Rows) {
                if ($row.IsNewRow) { continue }
                $modeValue = [string]$row.Cells["texMode"].Value
                $texIndex = [int]$row.Cells["texIndex"].Value
                if ([string]::IsNullOrWhiteSpace($modeValue) -or $modeValue -eq "默认") { continue }
                $override = @{ index = $texIndex }
                if ($modeValue -eq "WebP") {
                    $override.format = "webp"
                } else {
                    $override.format = "ktx2"
                    if ($modeValue -eq "KTX2 ETC1S") {
                        $override.ktx2Mode = "etc1s"
                    } elseif ($modeValue -eq "KTX2 UASTC") {
                        $override.ktx2Mode = "uastc"
                    }
                }
                $overrides += $override
            }
            if ($overrides.Count -gt 0) {
                $overridePath = Join-Path ([System.IO.Path]::GetTempPath()) ("gltf-optimize-texture-override-" + [guid]::NewGuid().ToString() + ".json")
                @{ overrides = $overrides } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $overridePath -Encoding UTF8
                $argumentArray += "--texture-override=$overridePath"
                $script:LastTextureOverridePath = $overridePath
            }
        }

        $logTextBox.Clear()
        Append-Log -TextBox $logTextBox -Text "开始执行优化..."
        Append-Log -TextBox $logTextBox -Text ("输入: " + $inputItem.FullName)
        Append-Log -TextBox $logTextBox -Text ("输出: " + $outputValue)

        $runButton.Enabled = $false
        $resetButton.Enabled = $false
        $openOutputButton.Enabled = $false
        $statusLabel.Text = "正在执行..."

        $script:CurrentProcess = Start-LoggedProcess `
            -FilePath $nodePath `
            -ArgumentList $argumentArray `
            -StdOutPath $script:StdOutPath `
            -StdErrPath $script:StdErrPath `
            -WorkingDirectory $script:ScriptDir

        $pollTimer.Start()
    } catch {
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "参数错误", "OK", "Warning") | Out-Null
    }
})

Apply-SettingsToControls -Settings $savedSettings `
    -TextureFormatCombo $textureFormatCombo `
    -GeometryModeCombo $geometryModeCombo `
    -ColorMaxNumeric $colorMaxNumeric `
    -DataMaxNumeric $dataMaxNumeric `
    -WebPBaseNumeric $webpBaseNumeric `
    -WebPEmissiveNumeric $webpEmissiveNumeric `
    -WebPOtherNumeric $webpOtherNumeric `
    -WebPEffortNumeric $webpEffortNumeric `
    -PaletteCheckBox $paletteCheckBox `
    -PaletteMinNumeric $paletteMinNumeric `
    -SimplifyScaleNumeric $simplifyScaleNumeric `
    -SimplifyMinNumeric $simplifyMinNumeric `
    -QuantizeMinNumeric $quantizeMinNumeric `
    -KtxPathTextBox $ktxPathTextBox `
    -Ktx2ModeCombo $ktx2ModeCombo `
    -Ktx2ZstdCheckBox $ktx2ZstdCheckBox `
    -FixTextureSizeCheckBox $fixTextureSizeCheckBox

Update-TextureGroupVisibility -TextureFormatCombo $textureFormatCombo
Update-PaletteControls -PaletteCheckBox $paletteCheckBox -PaletteMinLabel $paletteMinLabel -PaletteMinNumeric $paletteMinNumeric
Update-AdvancedLayout -Expanded ([bool]$advancedToggleButton.Tag)

if (-not [string]::IsNullOrWhiteSpace($InputPath) -and (Test-Path -LiteralPath $InputPath)) {
    $resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
    $inputTextBox.Text = $resolvedInput
    $defaultOutput = Get-DefaultOutputPath -PathValue $resolvedInput
    $outputTextBox.Text = $defaultOutput
    $script:LastAutoOutputPath = $defaultOutput
} elseif (-not [string]::IsNullOrWhiteSpace($inputTextBox.Text) -and (Test-Path -LiteralPath $inputTextBox.Text)) {
    $defaultOutput = Get-DefaultOutputPath -PathValue $inputTextBox.Text
    if ([string]::IsNullOrWhiteSpace($outputTextBox.Text)) {
        $outputTextBox.Text = $defaultOutput
        $script:LastAutoOutputPath = $defaultOutput
    }
}

[void]$form.ShowDialog()
