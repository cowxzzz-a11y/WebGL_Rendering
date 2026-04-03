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
$script:SettingsDir = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "GLBSmartOptimize"
$script:SettingsPath = Join-Path $script:SettingsDir "ui-settings.json"
$script:LastAutoOutputPath = ""
$script:LastOutputPath = ""
$script:CurrentProcess = $null
$script:StdOutReader = $null
$script:StdErrReader = $null
$script:TextureFormatMap = [ordered]@{
    "WebP（推荐）" = "webp"
    "不压缩纹理"   = "none"
    "KTX2"         = "ktx2"
}
$script:GeometryModeMap = [ordered]@{
    "局部优化（推荐）" = "local"
    "关闭几何优化"     = "none"
}
$script:QualityProfileMap = [ordered]@{
    "质量优先" = "quality"
    "平衡"     = "balanced"
    "极限压缩" = "compact"
}
$script:UntaggedModeMap = [ordered]@{
    "只压几何，不减面（推荐）" = "compress"
    "压几何 + 减面"           = "local"
    "合并 + 压几何 + 减面"    = "merge-local"
    "不处理无前缀对象"        = "none"
}

function Get-DefaultSettings {
    return [ordered]@{
        textureFormat         = "webp"
        geometryMode          = "local"
        untaggedMode          = "compress"
        qualityProfile        = "balanced"
        colorMaxSize          = 512
        dataMaxSize           = 384
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
    }
}

function Get-ProfilePreset([string]$Name) {
    switch ($Name) {
        "quality"  { return @{ colorMaxSize = 768; dataMaxSize = 512 } }
        "compact"  { return @{ colorMaxSize = 288; dataMaxSize = 192 } }
        default    { return @{ colorMaxSize = 512; dataMaxSize = 384 } }
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
        [System.Windows.Forms.ComboBox]$UntaggedModeCombo,
        [System.Windows.Forms.ComboBox]$QualityProfileCombo,
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
        [System.Windows.Forms.TextBox]$KtxPathTextBox
    )

    return [ordered]@{
        textureFormat        = Get-ComboValue -Map $script:TextureFormatMap -SelectedItem $TextureFormatCombo.SelectedItem
        geometryMode         = Get-ComboValue -Map $script:GeometryModeMap -SelectedItem $GeometryModeCombo.SelectedItem
        untaggedMode         = Get-ComboValue -Map $script:UntaggedModeMap -SelectedItem $UntaggedModeCombo.SelectedItem
        qualityProfile       = Get-ComboValue -Map $script:QualityProfileMap -SelectedItem $QualityProfileCombo.SelectedItem
        colorMaxSize         = [int]$ColorMaxNumeric.Value
        dataMaxSize          = [int]$DataMaxNumeric.Value
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
        [System.Windows.Forms.ComboBox]$UntaggedModeCombo,
        [System.Windows.Forms.ComboBox]$QualityProfileCombo,
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
        [System.Windows.Forms.TextBox]$KtxPathTextBox
    )

    $TextureFormatCombo.SelectedItem = Get-ComboLabel -Map $script:TextureFormatMap -Value ([string]$Settings.textureFormat)
    $GeometryModeCombo.SelectedItem = Get-ComboLabel -Map $script:GeometryModeMap -Value ([string]$Settings.geometryMode)
    $UntaggedModeCombo.SelectedItem = Get-ComboLabel -Map $script:UntaggedModeMap -Value ([string]$Settings.untaggedMode)
    $QualityProfileCombo.SelectedItem = Get-ComboLabel -Map $script:QualityProfileMap -Value ([string]$Settings.qualityProfile)
    $ColorMaxNumeric.Value = [decimal]$Settings.colorMaxSize
    $DataMaxNumeric.Value = [decimal]$Settings.dataMaxSize
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
}

function Update-KtxVisibility {
    param(
        [System.Windows.Forms.ComboBox]$TextureFormatCombo,
        [System.Windows.Forms.Label]$KtxPathLabel,
        [System.Windows.Forms.TextBox]$KtxPathTextBox,
        [System.Windows.Forms.Button]$KtxBrowseButton
    )

    $show = (Get-ComboValue -Map $script:TextureFormatMap -SelectedItem $TextureFormatCombo.SelectedItem) -eq "ktx2"
    $KtxPathLabel.Visible = $show
    $KtxPathTextBox.Visible = $show
    $KtxBrowseButton.Visible = $show
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

function Add-GuideTextBlock {
    param(
        [System.Windows.Forms.RichTextBox]$RichTextBox,
        [string]$Text,
        [System.Drawing.FontStyle]$Style,
        [System.Drawing.Color]$Color,
        [switch]$DoubleSpacing
    )

    $RichTextBox.SelectionStart = $RichTextBox.TextLength
    $RichTextBox.SelectionLength = 0
    $RichTextBox.SelectionFont = New-Object System.Drawing.Font("Microsoft YaHei UI", 10, $Style)
    $RichTextBox.SelectionColor = $Color
    $RichTextBox.AppendText($Text + [Environment]::NewLine)
    if ($DoubleSpacing) {
        $RichTextBox.AppendText([Environment]::NewLine)
    }
}

function Add-GuideCodeLine {
    param(
        [System.Windows.Forms.RichTextBox]$RichTextBox,
        [string]$Text
    )

    $RichTextBox.SelectionStart = $RichTextBox.TextLength
    $RichTextBox.SelectionLength = 0
    $RichTextBox.SelectionFont = New-Object System.Drawing.Font("Consolas", 10, [System.Drawing.FontStyle]::Regular)
    $RichTextBox.SelectionColor = [System.Drawing.Color]::FromArgb(25, 86, 180)
    $RichTextBox.AppendText($Text + [Environment]::NewLine)
}

function Show-RenameGuideDialog([System.Windows.Forms.Form]$Owner) {
    $guideForm = New-Object System.Windows.Forms.Form
    $guideForm.Text = "推荐改名教程"
    $guideForm.StartPosition = "CenterParent"
    $guideForm.Size = New-Object System.Drawing.Size(900, 760)
    $guideForm.MinimumSize = New-Object System.Drawing.Size(900, 760)
    $guideForm.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5)
    $guideForm.BackColor = [System.Drawing.Color]::White

    $headerPanel = New-Object System.Windows.Forms.Panel
    $headerPanel.Location = New-Object System.Drawing.Point(12, 12)
    $headerPanel.Size = New-Object System.Drawing.Size(860, 88)
    $headerPanel.BackColor = [System.Drawing.Color]::FromArgb(241, 246, 255)
    $headerPanel.BorderStyle = "FixedSingle"
    $guideForm.Controls.Add($headerPanel)

    $guideTitleLabel = New-Object System.Windows.Forms.Label
    $guideTitleLabel.Location = New-Object System.Drawing.Point(16, 12)
    $guideTitleLabel.Size = New-Object System.Drawing.Size(260, 28)
    $guideTitleLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 12, [System.Drawing.FontStyle]::Bold)
    $guideTitleLabel.Text = "推荐改名教程"
    $headerPanel.Controls.Add($guideTitleLabel)

    $guideSubLabel = New-Object System.Windows.Forms.Label
    $guideSubLabel.Location = New-Object System.Drawing.Point(16, 46)
    $guideSubLabel.Size = New-Object System.Drawing.Size(820, 24)
    $guideSubLabel.ForeColor = [System.Drawing.Color]::FromArgb(86, 94, 112)
    $guideSubLabel.Text = "按前缀整理对象名后，工具才能更准确地区分：哪些要保护，哪些能合并，哪些适合继续优化。"
    $headerPanel.Controls.Add($guideSubLabel)

    $guideRichText = New-Object System.Windows.Forms.RichTextBox
    $guideRichText.Location = New-Object System.Drawing.Point(12, 112)
    $guideRichText.Size = New-Object System.Drawing.Size(860, 576)
    $guideRichText.ReadOnly = $true
    $guideRichText.BorderStyle = "FixedSingle"
    $guideRichText.BackColor = [System.Drawing.Color]::FromArgb(252, 252, 252)
    $guideRichText.DetectUrls = $false
    $guideRichText.ScrollBars = "Vertical"
    $guideForm.Controls.Add($guideRichText)

    $sectionColor = [System.Drawing.Color]::FromArgb(35, 76, 180)
    $bodyColor = [System.Drawing.Color]::FromArgb(36, 41, 47)
    $mutedColor = [System.Drawing.Color]::FromArgb(86, 94, 112)

    Add-GuideTextBlock -RichTextBox $guideRichText -Text "命名规则" -Style ([System.Drawing.FontStyle]::Bold) -Color $sectionColor -DoubleSpacing
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "KEEP_：必须保留独立的" -Style ([System.Drawing.FontStyle]::Bold) -Color $bodyColor
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "比如要点击、显隐、挂数据的建筑和设备。" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor -DoubleSpacing
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "INST_：重复件，优先做实例" -Style ([System.Drawing.FontStyle]::Bold) -Color $bodyColor
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "比如围栏段、路灯、车位线、重复仓库、树。" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor -DoubleSpacing
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "MERGE_：静态装饰，可按材质合并" -Style ([System.Drawing.FontStyle]::Bold) -Color $bodyColor
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "比如地面、草坪、路沿石、普通围墙、装饰面。" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor -DoubleSpacing
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "DECAL_：细长高对比图形，谨慎处理" -Style ([System.Drawing.FontStyle]::Bold) -Color $bodyColor
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "比如马路中线、文字、标识、Logo。" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor -DoubleSpacing
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "LOD_：以后可能做远近层级" -Style ([System.Drawing.FontStyle]::Bold) -Color $bodyColor
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "围栏远景版本、树木、灌木、路灯、小景观、小设备、重复小构件。" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor -DoubleSpacing

    Add-GuideTextBlock -RichTextBox $guideRichText -Text "推荐实例" -Style ([System.Drawing.FontStyle]::Bold) -Color $sectionColor -DoubleSpacing
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "KEEP_办公楼_A"
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "KEEP_变电设备_01"
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "" -Style ([System.Drawing.FontStyle]::Regular) -Color $bodyColor
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "INST_围栏标准段"
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "INST_路灯_6米"
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "INST_树木_白杨_A"
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "" -Style ([System.Drawing.FontStyle]::Regular) -Color $bodyColor
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "MERGE_主路地面"
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "MERGE_草坪_A区"
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "MERGE_普通围墙_西侧"
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "" -Style ([System.Drawing.FontStyle]::Regular) -Color $bodyColor
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "DECAL_马路中线"
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "DECAL_厂区名称文字"
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "DECAL_企业Logo"
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "" -Style ([System.Drawing.FontStyle]::Regular) -Color $bodyColor
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "LOD_树木_远景版"
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "LOD_路灯_远景版"
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "" -Style ([System.Drawing.FontStyle]::Regular) -Color $bodyColor -DoubleSpacing

    Add-GuideTextBlock -RichTextBox $guideRichText -Text "多个前缀也可以一起用" -Style ([System.Drawing.FontStyle]::Bold) -Color $sectionColor -DoubleSpacing
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "MERGE_DECAL_围栏线条"
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "含义：允许归到合并逻辑里，但细长高对比图形仍按 DECAL 保护，不参与有损几何处理。" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor -DoubleSpacing
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "INST_LOD_树木_A"
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "含义：这是重复件，并且以后可能继续做远近层级。" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor -DoubleSpacing
    Add-GuideCodeLine -RichTextBox $guideRichText -Text "KEEP_DECAL_厂牌文字"
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "含义：对象保持独立，同时把细文字当成脆弱图形保护起来。" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor -DoubleSpacing

    Add-GuideTextBlock -RichTextBox $guideRichText -Text "不想改名也能直接用" -Style ([System.Drawing.FontStyle]::Bold) -Color $sectionColor -DoubleSpacing
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "如果模型里基本没有这些前缀，工具默认会：" -Style ([System.Drawing.FontStyle]::Regular) -Color $bodyColor
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "1. 压缩纹理" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "2. 压缩几何" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "3. 不主动合并" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "4. 不主动减面" -Style ([System.Drawing.FontStyle]::Regular) -Color $mutedColor -DoubleSpacing
    Add-GuideTextBlock -RichTextBox $guideRichText -Text "把前缀加对以后，工具就能更聪明地决定哪些该保护、哪些能合并、哪些适合继续优化。" -Style ([System.Drawing.FontStyle]::Regular) -Color $bodyColor

    $closeGuideButton = New-Object System.Windows.Forms.Button
    $closeGuideButton.Location = New-Object System.Drawing.Point(760, 698)
    $closeGuideButton.Size = New-Object System.Drawing.Size(112, 32)
    $closeGuideButton.Text = "关闭"
    $closeGuideButton.Add_Click({ $guideForm.Close() })
    $guideForm.Controls.Add($closeGuideButton)

    [void]$guideForm.ShowDialog($Owner)
}

$savedSettings = Load-UiSettings

$form = New-Object System.Windows.Forms.Form
$form.Text = "GLB 模型优化工具"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(920, 824)
$form.MinimumSize = New-Object System.Drawing.Size(920, 824)
$form.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 249, 252)

$summaryPanel = New-Object System.Windows.Forms.Panel
$summaryPanel.Location = New-Object System.Drawing.Point(12, 12)
$summaryPanel.Size = New-Object System.Drawing.Size(876, 64)
$summaryPanel.BackColor = [System.Drawing.Color]::White
$summaryPanel.BorderStyle = "FixedSingle"
$form.Controls.Add($summaryPanel)

$headerTitleLabel = New-Object System.Windows.Forms.Label
$headerTitleLabel.Location = New-Object System.Drawing.Point(14, 10)
$headerTitleLabel.Size = New-Object System.Drawing.Size(200, 24)
$headerTitleLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10.5, [System.Drawing.FontStyle]::Bold)
$headerTitleLabel.Text = "当前默认安全线"
$summaryPanel.Controls.Add($headerTitleLabel)

$headerLabel = New-Object System.Windows.Forms.Label
$headerLabel.Location = New-Object System.Drawing.Point(14, 34)
$headerLabel.Size = New-Object System.Drawing.Size(620, 22)
$headerLabel.ForeColor = [System.Drawing.Color]::FromArgb(86, 94, 112)
$headerLabel.Text = "WebP + 局部几何优化。DECAL_* 对象不会参与有损几何处理。"
$summaryPanel.Controls.Add($headerLabel)

$guideButton = New-Object System.Windows.Forms.Button
$guideButton.Location = New-Object System.Drawing.Point(718, 14)
$guideButton.Size = New-Object System.Drawing.Size(140, 34)
$guideButton.Text = "查看改名教程"
$guideButton.BackColor = [System.Drawing.Color]::FromArgb(38, 99, 235)
$guideButton.ForeColor = [System.Drawing.Color]::White
$guideButton.FlatStyle = "Flat"
$guideButton.FlatAppearance.BorderSize = 0
$guideButton.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5, [System.Drawing.FontStyle]::Bold)
$summaryPanel.Controls.Add($guideButton)

$guideHintLabel = New-Object System.Windows.Forms.Label
$guideHintLabel.Location = New-Object System.Drawing.Point(646, 50)
$guideHintLabel.Size = New-Object System.Drawing.Size(212, 12)
$guideHintLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 7.5)
$guideHintLabel.ForeColor = [System.Drawing.Color]::FromArgb(104, 112, 130)
$guideHintLabel.Text = "前缀命名好，压缩会更稳"
$summaryPanel.Controls.Add($guideHintLabel)

$inputLabel = New-Object System.Windows.Forms.Label
$inputLabel.Location = New-Object System.Drawing.Point(12, 90)
$inputLabel.Size = New-Object System.Drawing.Size(78, 24)
$inputLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$inputLabel.Text = "输入文件"
$form.Controls.Add($inputLabel)

$inputTextBox = New-Object System.Windows.Forms.TextBox
$inputTextBox.Location = New-Object System.Drawing.Point(96, 89)
$inputTextBox.Size = New-Object System.Drawing.Size(672, 24)
$form.Controls.Add($inputTextBox)

$inputBrowseButton = New-Object System.Windows.Forms.Button
$inputBrowseButton.Location = New-Object System.Drawing.Point(778, 88)
$inputBrowseButton.Size = New-Object System.Drawing.Size(110, 26)
$inputBrowseButton.Text = "浏览..."
$form.Controls.Add($inputBrowseButton)

$outputLabel = New-Object System.Windows.Forms.Label
$outputLabel.Location = New-Object System.Drawing.Point(12, 122)
$outputLabel.Size = New-Object System.Drawing.Size(78, 24)
$outputLabel.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$outputLabel.Text = "输出文件"
$form.Controls.Add($outputLabel)

$outputTextBox = New-Object System.Windows.Forms.TextBox
$outputTextBox.Location = New-Object System.Drawing.Point(96, 121)
$outputTextBox.Size = New-Object System.Drawing.Size(672, 24)
$form.Controls.Add($outputTextBox)

$outputBrowseButton = New-Object System.Windows.Forms.Button
$outputBrowseButton.Location = New-Object System.Drawing.Point(778, 120)
$outputBrowseButton.Size = New-Object System.Drawing.Size(110, 26)
$outputBrowseButton.Text = "浏览..."
$form.Controls.Add($outputBrowseButton)

$basicGroup = New-Object System.Windows.Forms.GroupBox
$basicGroup.Location = New-Object System.Drawing.Point(12, 158)
$basicGroup.Size = New-Object System.Drawing.Size(876, 116)
$basicGroup.Text = "基础设置"
$basicGroup.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($basicGroup)

$textureFormatLabel = New-Object System.Windows.Forms.Label
$textureFormatLabel.Location = New-Object System.Drawing.Point(16, 30)
$textureFormatLabel.Size = New-Object System.Drawing.Size(100, 24)
$textureFormatLabel.Text = "纹理格式"
$basicGroup.Controls.Add($textureFormatLabel)

$textureFormatCombo = New-Object System.Windows.Forms.ComboBox
$textureFormatCombo.Location = New-Object System.Drawing.Point(120, 27)
$textureFormatCombo.Size = New-Object System.Drawing.Size(140, 24)
$textureFormatCombo.DropDownStyle = "DropDownList"
[void]$textureFormatCombo.Items.AddRange([object[]]$script:TextureFormatMap.Keys)
$basicGroup.Controls.Add($textureFormatCombo)

$geometryModeLabel = New-Object System.Windows.Forms.Label
$geometryModeLabel.Location = New-Object System.Drawing.Point(286, 30)
$geometryModeLabel.Size = New-Object System.Drawing.Size(100, 24)
$geometryModeLabel.Text = "几何模式"
$basicGroup.Controls.Add($geometryModeLabel)

$geometryModeCombo = New-Object System.Windows.Forms.ComboBox
$geometryModeCombo.Location = New-Object System.Drawing.Point(390, 27)
$geometryModeCombo.Size = New-Object System.Drawing.Size(140, 24)
$geometryModeCombo.DropDownStyle = "DropDownList"
[void]$geometryModeCombo.Items.AddRange([object[]]$script:GeometryModeMap.Keys)
$basicGroup.Controls.Add($geometryModeCombo)

$qualityProfileLabel = New-Object System.Windows.Forms.Label
$qualityProfileLabel.Location = New-Object System.Drawing.Point(556, 30)
$qualityProfileLabel.Size = New-Object System.Drawing.Size(100, 24)
$qualityProfileLabel.Text = "质量档位"
$basicGroup.Controls.Add($qualityProfileLabel)

$qualityProfileCombo = New-Object System.Windows.Forms.ComboBox
$qualityProfileCombo.Location = New-Object System.Drawing.Point(660, 27)
$qualityProfileCombo.Size = New-Object System.Drawing.Size(140, 24)
$qualityProfileCombo.DropDownStyle = "DropDownList"
[void]$qualityProfileCombo.Items.AddRange([object[]]$script:QualityProfileMap.Keys)
$basicGroup.Controls.Add($qualityProfileCombo)

$applyProfileButton = New-Object System.Windows.Forms.Button
$applyProfileButton.Location = New-Object System.Drawing.Point(804, 26)
$applyProfileButton.Size = New-Object System.Drawing.Size(58, 26)
$applyProfileButton.Text = "套用"
$basicGroup.Controls.Add($applyProfileButton)

$untaggedModeLabel = New-Object System.Windows.Forms.Label
$untaggedModeLabel.Location = New-Object System.Drawing.Point(16, 68)
$untaggedModeLabel.Size = New-Object System.Drawing.Size(100, 24)
$untaggedModeLabel.Text = "无前缀对象"
$basicGroup.Controls.Add($untaggedModeLabel)

$untaggedModeCombo = New-Object System.Windows.Forms.ComboBox
$untaggedModeCombo.Location = New-Object System.Drawing.Point(120, 65)
$untaggedModeCombo.Size = New-Object System.Drawing.Size(260, 24)
$untaggedModeCombo.DropDownStyle = "DropDownList"
[void]$untaggedModeCombo.Items.AddRange([object[]]$script:UntaggedModeMap.Keys)
$basicGroup.Controls.Add($untaggedModeCombo)

$untaggedHintLabel = New-Object System.Windows.Forms.Label
$untaggedHintLabel.Location = New-Object System.Drawing.Point(400, 68)
$untaggedHintLabel.Size = New-Object System.Drawing.Size(448, 24)
$untaggedHintLabel.Text = "没有 KEEP_/MERGE_/DECAL_ 前缀时，默认只压几何，不主动减面和合并。"
$basicGroup.Controls.Add($untaggedHintLabel)

$textureGroup = New-Object System.Windows.Forms.GroupBox
$textureGroup.Location = New-Object System.Drawing.Point(12, 282)
$textureGroup.Size = New-Object System.Drawing.Size(876, 140)
$textureGroup.Text = "纹理参数"
$textureGroup.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($textureGroup)

$colorMaxLabel = New-Object System.Windows.Forms.Label
$colorMaxLabel.Location = New-Object System.Drawing.Point(16, 28)
$colorMaxLabel.Size = New-Object System.Drawing.Size(120, 24)
$colorMaxLabel.Text = "颜色贴图最大边"
$textureGroup.Controls.Add($colorMaxLabel)

$colorMaxNumeric = New-Object System.Windows.Forms.NumericUpDown
$colorMaxNumeric.Location = New-Object System.Drawing.Point(140, 26)
$colorMaxNumeric.Size = New-Object System.Drawing.Size(110, 24)
$colorMaxNumeric.Minimum = 16
$colorMaxNumeric.Maximum = 8192
$colorMaxNumeric.Increment = 16
$textureGroup.Controls.Add($colorMaxNumeric)

$dataMaxLabel = New-Object System.Windows.Forms.Label
$dataMaxLabel.Location = New-Object System.Drawing.Point(280, 28)
$dataMaxLabel.Size = New-Object System.Drawing.Size(120, 24)
$dataMaxLabel.Text = "数据贴图最大边"
$textureGroup.Controls.Add($dataMaxLabel)

$dataMaxNumeric = New-Object System.Windows.Forms.NumericUpDown
$dataMaxNumeric.Location = New-Object System.Drawing.Point(404, 26)
$dataMaxNumeric.Size = New-Object System.Drawing.Size(110, 24)
$dataMaxNumeric.Minimum = 16
$dataMaxNumeric.Maximum = 8192
$dataMaxNumeric.Increment = 16
$textureGroup.Controls.Add($dataMaxNumeric)

$webpBaseLabel = New-Object System.Windows.Forms.Label
$webpBaseLabel.Location = New-Object System.Drawing.Point(544, 28)
$webpBaseLabel.Size = New-Object System.Drawing.Size(120, 24)
$webpBaseLabel.Text = "WebP 主颜色"
$textureGroup.Controls.Add($webpBaseLabel)

$webpBaseNumeric = New-Object System.Windows.Forms.NumericUpDown
$webpBaseNumeric.Location = New-Object System.Drawing.Point(668, 26)
$webpBaseNumeric.Size = New-Object System.Drawing.Size(70, 24)
$webpBaseNumeric.Minimum = 0
$webpBaseNumeric.Maximum = 100
$textureGroup.Controls.Add($webpBaseNumeric)

$webpEmissiveLabel = New-Object System.Windows.Forms.Label
$webpEmissiveLabel.Location = New-Object System.Drawing.Point(748, 28)
$webpEmissiveLabel.Size = New-Object System.Drawing.Size(100, 24)
$webpEmissiveLabel.Text = "自发光"
$textureGroup.Controls.Add($webpEmissiveLabel)

$webpEmissiveNumeric = New-Object System.Windows.Forms.NumericUpDown
$webpEmissiveNumeric.Location = New-Object System.Drawing.Point(806, 26)
$webpEmissiveNumeric.Size = New-Object System.Drawing.Size(56, 24)
$webpEmissiveNumeric.Minimum = 0
$webpEmissiveNumeric.Maximum = 100
$textureGroup.Controls.Add($webpEmissiveNumeric)

$webpOtherLabel = New-Object System.Windows.Forms.Label
$webpOtherLabel.Location = New-Object System.Drawing.Point(16, 64)
$webpOtherLabel.Size = New-Object System.Drawing.Size(120, 24)
$webpOtherLabel.Text = "WebP 其它"
$textureGroup.Controls.Add($webpOtherLabel)

$webpOtherNumeric = New-Object System.Windows.Forms.NumericUpDown
$webpOtherNumeric.Location = New-Object System.Drawing.Point(140, 62)
$webpOtherNumeric.Size = New-Object System.Drawing.Size(110, 24)
$webpOtherNumeric.Minimum = 0
$webpOtherNumeric.Maximum = 100
$textureGroup.Controls.Add($webpOtherNumeric)

$webpEffortLabel = New-Object System.Windows.Forms.Label
$webpEffortLabel.Location = New-Object System.Drawing.Point(280, 64)
$webpEffortLabel.Size = New-Object System.Drawing.Size(120, 24)
$webpEffortLabel.Text = "WebP 编码强度"
$textureGroup.Controls.Add($webpEffortLabel)

$webpEffortNumeric = New-Object System.Windows.Forms.NumericUpDown
$webpEffortNumeric.Location = New-Object System.Drawing.Point(404, 62)
$webpEffortNumeric.Size = New-Object System.Drawing.Size(110, 24)
$webpEffortNumeric.Minimum = 0
$webpEffortNumeric.Maximum = 6
$textureGroup.Controls.Add($webpEffortNumeric)

$ktxPathLabel = New-Object System.Windows.Forms.Label
$ktxPathLabel.Location = New-Object System.Drawing.Point(16, 100)
$ktxPathLabel.Size = New-Object System.Drawing.Size(120, 24)
$ktxPathLabel.Text = "KTX 路径"
$textureGroup.Controls.Add($ktxPathLabel)

$ktxPathTextBox = New-Object System.Windows.Forms.TextBox
$ktxPathTextBox.Location = New-Object System.Drawing.Point(140, 98)
$ktxPathTextBox.Size = New-Object System.Drawing.Size(598, 24)
$textureGroup.Controls.Add($ktxPathTextBox)

$ktxBrowseButton = New-Object System.Windows.Forms.Button
$ktxBrowseButton.Location = New-Object System.Drawing.Point(748, 97)
$ktxBrowseButton.Size = New-Object System.Drawing.Size(114, 26)
$ktxBrowseButton.Text = "浏览 KTX..."
$textureGroup.Controls.Add($ktxBrowseButton)

$geometryGroup = New-Object System.Windows.Forms.GroupBox
$geometryGroup.Location = New-Object System.Drawing.Point(12, 430)
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

$buttonPanel = New-Object System.Windows.Forms.Panel
$buttonPanel.Location = New-Object System.Drawing.Point(12, 546)
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

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(540, 11)
$statusLabel.Size = New-Object System.Drawing.Size(320, 24)
$statusLabel.Text = "就绪。"
$buttonPanel.Controls.Add($statusLabel)

$logGroup = New-Object System.Windows.Forms.GroupBox
$logGroup.Location = New-Object System.Drawing.Point(12, 594)
$logGroup.Size = New-Object System.Drawing.Size(876, 188)
$logGroup.Text = "日志"
$logGroup.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($logGroup)

$logTextBox = New-Object System.Windows.Forms.TextBox
$logTextBox.Location = New-Object System.Drawing.Point(14, 24)
$logTextBox.Size = New-Object System.Drawing.Size(848, 150)
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

$applyProfile = {
    $preset = Get-ProfilePreset -Name (Get-ComboValue -Map $script:QualityProfileMap -SelectedItem $qualityProfileCombo.SelectedItem)
    $colorMaxNumeric.Value = [decimal]$preset.colorMaxSize
    $dataMaxNumeric.Value = [decimal]$preset.dataMaxSize
}

$qualityProfileCombo.Add_SelectedIndexChanged($applyProfile)
$applyProfileButton.Add_Click($applyProfile)
$guideButton.Add_Click({
    Show-RenameGuideDialog -Owner $form
})

$textureFormatCombo.Add_SelectedIndexChanged({
    Update-KtxVisibility -TextureFormatCombo $textureFormatCombo -KtxPathLabel $ktxPathLabel -KtxPathTextBox $ktxPathTextBox -KtxBrowseButton $ktxBrowseButton
})

$paletteCheckBox.Add_CheckedChanged({
    Update-PaletteControls -PaletteCheckBox $paletteCheckBox -PaletteMinLabel $paletteMinLabel -PaletteMinNumeric $paletteMinNumeric
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

$ktxBrowseButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = "KTX 程序 (ktx.exe)|ktx.exe|可执行文件 (*.exe)|*.exe|所有文件 (*.*)|*.*"
    $dialog.Multiselect = $false
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $ktxPathTextBox.Text = $dialog.FileName
    }
})

$resetButton.Add_Click({
    $defaults = Get-DefaultSettings
    Apply-SettingsToControls -Settings $defaults `
        -TextureFormatCombo $textureFormatCombo `
        -GeometryModeCombo $geometryModeCombo `
        -UntaggedModeCombo $untaggedModeCombo `
        -QualityProfileCombo $qualityProfileCombo `
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
    & $applyProfile
    Update-KtxVisibility -TextureFormatCombo $textureFormatCombo -KtxPathLabel $ktxPathLabel -KtxPathTextBox $ktxPathTextBox -KtxBrowseButton $ktxBrowseButton
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
            -UntaggedModeCombo $untaggedModeCombo `
            -QualityProfileCombo $qualityProfileCombo `
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
            "--untagged-mode=$($settings.untaggedMode)",
            "--quality-profile=$($settings.qualityProfile)",
            "--color-max-size=$($settings.colorMaxSize)",
            "--data-max-size=$($settings.dataMaxSize)",
            "--webp-quality-base=$($settings.webpQualityBase)",
            "--webp-quality-emissive=$($settings.webpQualityEmissive)",
            "--webp-quality-other=$($settings.webpQualityOther)",
            "--webp-effort=$($settings.webpEffort)",
            "--simplify-scale=$([System.String]::Format([System.Globalization.CultureInfo]::InvariantCulture, '{0:0.00}', $settings.simplifyScale))",
            "--simplify-min-triangles=$($settings.simplifyMinTriangles)",
            "--quantize-min-triangles=$($settings.quantizeMinTriangles)"
        )

        if (-not $settings.enablePalette) {
            $argumentArray += "--no-palette"
        } else {
            $argumentArray += "--palette-min=$($settings.paletteMin)"
        }

        if ($settings.textureFormat -eq "ktx2" -and -not [string]::IsNullOrWhiteSpace($settings.ktxPath)) {
            $argumentArray += "--ktx-path=$($settings.ktxPath)"
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
    -UntaggedModeCombo $untaggedModeCombo `
    -QualityProfileCombo $qualityProfileCombo `
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

Update-KtxVisibility -TextureFormatCombo $textureFormatCombo -KtxPathLabel $ktxPathLabel -KtxPathTextBox $ktxPathTextBox -KtxBrowseButton $ktxBrowseButton
Update-PaletteControls -PaletteCheckBox $paletteCheckBox -PaletteMinLabel $paletteMinLabel -PaletteMinNumeric $paletteMinNumeric

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
