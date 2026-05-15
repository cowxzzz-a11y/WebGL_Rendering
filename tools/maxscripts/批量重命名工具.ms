global BatchRenameWithPrefixUI_Floater

try (destroyDialog BatchRenameWithPrefixUI_Rollout) catch()
try (closeRolloutFloater BatchRenameWithPrefixUI_Floater) catch()

fn BRWPU_trim s =
(
    if s == undefined then return ""
    trimRight (trimLeft (s as string))
)

fn BRWPU_normalizePrefix prefixText =
(
    local p = BRWPU_trim prefixText
    if p == "" then return ""
    if (substring p p.count 1) != "_" then p += "_"
    p
)

fn BRWPU_padNumber value digits =
(
    local numberText = value as string
    if digits <= 0 then return numberText
    while numberText.count < digits do numberText = "0" + numberText
    numberText
)

fn BRWPU_compareNodeName a b =
(
    local an = toLower a.name
    local bn = toLower b.name
    if an < bn then
    (
        -1
    )
    else if an > bn then
    (
        1
    )
    else
    (
        0
    )
)

rollout BatchRenameWithPrefixUI_Rollout "批量重命名" width:320 height:230
(
    label lblTip "按当前选择批量改名：前缀 + 名字 + 序号" pos:[16,12] width:260 height:18

    label lblPrefix "前缀：" pos:[16,42] width:60 height:18
    editText edtPrefix "" pos:[76,40] width:220 height:22 text:"MERGE_"

    label lblBaseName "名字：" pos:[16,76] width:60 height:18
    editText edtBaseName "" pos:[76,74] width:220 height:22 text:"对象"

    label lblStart "起始序号：" pos:[16,110] width:60 height:18
    spinner spnStart "" pos:[76,108] width:90 height:16 range:[0,999999,1] type:#integer scale:1

    label lblPadding "补零位数：" pos:[176,110] width:60 height:18
    spinner spnPadding "" pos:[236,108] width:60 height:16 range:[0,6,3] type:#integer scale:1

    checkbox chkAddLOD "附加 LOD_ 前缀" pos:[16,140] width:140 checked:false
    checkbox chkSortByName "按当前名字排序后再重命名" pos:[16,164] width:220 checked:true

    button btnRename "重命名选中对象" pos:[16,190] width:280 height:28

    fn BRWPU_flashButton newText =
    (
        local oldText = btnRename.text
        btnRename.text = newText
        windows.processPostedMessages()
        sleep 0.6
        btnRename.text = oldText
        windows.processPostedMessages()
    )

    on btnRename pressed do
    (
        if selection.count == 0 then
        (
            BRWPU_flashButton "请先选择对象"
            return false
        )

        local baseName = BRWPU_trim edtBaseName.text
        if baseName == "" then
        (
            BRWPU_flashButton "名字不能为空"
            return false
        )

        local prefix = BRWPU_normalizePrefix edtPrefix.text
        if chkAddLOD.checked then
        (
            prefix += "LOD_"
        )
        local startIndex = spnStart.value
        local padding = spnPadding.value

        local nodes = for obj in selection collect obj

        if chkSortByName.checked then
        (
            qsort nodes BRWPU_compareNodeName
        )

        undo "Batch Rename With Prefix" on
        (
            for i = 1 to nodes.count do
            (
                local indexValue = startIndex + (i - 1)
                local suffix = BRWPU_padNumber indexValue padding
                nodes[i].name = prefix + baseName + suffix
            )
        )

        BRWPU_flashButton "重命名成功"
    )
)

BatchRenameWithPrefixUI_Floater = newRolloutFloater "批量重命名工具" 340 290
addRollout BatchRenameWithPrefixUI_Rollout BatchRenameWithPrefixUI_Floater
