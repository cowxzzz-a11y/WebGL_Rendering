try(destroyDialog ObjectReplacerRollout)catch()

rollout ObjectReplacerRollout "模型快速替换器 V16 完整UI版" width:300 height:390
(
    group "第一步：指定源模型"
    (
        pickbutton btn_source "1. 选择简模 / 源模型" width:250 height:32 autoDisplay:true
    )

    group "第二步：旋转补偿"
    (
        spinner spn_rotX "X补偿:" range:[-360,360,0] type:#integer fieldwidth:60 align:#right
        spinner spn_rotY "Y补偿:" range:[-360,360,0] type:#integer fieldwidth:60 align:#right
        spinner spn_rotZ "Z补偿:" range:[-360,360,90] type:#integer fieldwidth:60 align:#right

        button btn_z90 "Z +90" width:58 height:24 align:#left across:4
        button btn_z_90 "Z -90" width:58 height:24
        button btn_z180 "Z 180" width:58 height:24
        button btn_z0 "Z 0" width:58 height:24
    )

    group "第三步：执行替换"
    (
        pickbutton btn_target "方式A：单点拾取目标" width:250 height:30 autoDisplay:true enabled:false
        label lbl_or "- 或者 -" align:#center
        button btn_batch "方式B：替换当前选中物体" width:250 height:35 enabled:false
    )

    group "替换选项"
    (
        checkbox chk_deleteTarget "替换后删除原目标模型" checked:true
        checkbox chk_keepSourceScale "保持源模型自身大小" checked:true
        checkbox chk_centerAlign "按模型中心对齐" checked:true
    )

    local sourceObj = undefined

    fn replaceOne source target keepSourceScale:true deleteTarget:true centerAlign:true rotX:0 rotY:0 rotZ:0 =
    (
        if not isValidNode source do return false
        if not isValidNode target do return false
        if source == target do return false

        local targetPos = target.position
        local targetRot = target.rotation
        local targetScale = target.scale
        local targetCenter = target.center
        local targetName = target.name

        local newObj = copy source

        newObj.position = targetPos

        -- 目标旋转 + 旋转补偿
        local offsetRot = (eulerAngles rotX rotY rotZ) as quat
        newObj.rotation = targetRot * offsetRot

        -- 缩放
        if keepSourceScale then
        (
            newObj.scale = source.scale
        )
        else
        (
            newObj.scale = targetScale
        )

        -- 旋转缩放后，再中心对齐
        if centerAlign do
        (
            local newCenter = newObj.center
            local moveOffset = targetCenter - newCenter
            newObj.position += moveOffset
        )

        newObj.name = targetName + "_替换"

        if deleteTarget do delete target

        true
    )

    fn doReplaceBatch =
    (
        if not isValidNode sourceObj then
        (
            messageBox "请先选择简模 / 源模型！" title:"提示"
            return false
        )

        local targets = selection as array

        -- 排除源模型
        for i = targets.count to 1 by -1 do
        (
            if targets[i] == sourceObj do deleteItem targets i
        )

        if targets.count == 0 then
        (
            messageBox "请先框选要被替换的目标模型，不要只选源模型。" title:"提示"
            return false
        )

        undo "批量模型替换" on
        (
            local count = 0

            for t in targets do
            (
                if isValidNode t do
                (
                    local ok = replaceOne sourceObj t \
                        keepSourceScale:chk_keepSourceScale.checked \
                        deleteTarget:chk_deleteTarget.checked \
                        centerAlign:chk_centerAlign.checked \
                        rotX:spn_rotX.value \
                        rotY:spn_rotY.value \
                        rotZ:spn_rotZ.value

                    if ok do count += 1
                )
            )

            messageBox ("替换完成，共替换 " + count as string + " 个模型。") title:"完成"
        )

        true
    )

    on btn_source picked obj do
    (
        if isValidNode obj then
        (
            sourceObj = obj
            btn_target.enabled = true
            btn_batch.enabled = true
            btn_source.text = obj.name
        )
    )

    on btn_target picked targetObj do
    (
        if not isValidNode sourceObj then
        (
            messageBox "请先选择简模 / 源模型！" title:"提示"
            return()
        )

        undo "单个模型替换" on
        (
            replaceOne sourceObj targetObj \
                keepSourceScale:chk_keepSourceScale.checked \
                deleteTarget:chk_deleteTarget.checked \
                centerAlign:chk_centerAlign.checked \
                rotX:spn_rotX.value \
                rotY:spn_rotY.value \
                rotZ:spn_rotZ.value
        )
    )

    on btn_batch pressed do
    (
        doReplaceBatch()
    )

    on btn_z90 pressed do spn_rotZ.value = 90
    on btn_z_90 pressed do spn_rotZ.value = -90
    on btn_z180 pressed do spn_rotZ.value = 180
    on btn_z0 pressed do spn_rotZ.value = 0
)

createDialog ObjectReplacerRollout pos:mouse.screenpos