/*
===============================================================================
UV2一件展开
流程：选择模型 -> 添加 Unwrap UVW -> 通道2 -> 打开UV编辑器 -> 全选UV面
-> 快速剥离 -> 再全选 -> 通过平滑组展平 -> 可选转可编辑多边形
===============================================================================
*/

try(destroyDialog UV2AutoUnwrapRollout)catch()

rollout UV2AutoUnwrapRollout "UV2一件展开" width:340 height:285
(
    groupBox gb_param "参数" pos:[10,8] width:320 height:96
    spinner spn_padding "平滑组展开间距:" pos:[26,34] width:275 height:18 range:[0.0,0.2,0.01] type:#float scale:0.001 fieldwidth:70
    checkbox chk_closeEditor "完成后关闭 UV 编辑器" pos:[26,60] width:275 height:18 checked:false
    checkbox chk_collapse "完成后转为可编辑多边形" pos:[26,82] width:275 height:18 checked:false

    groupBox gb_flow "流程" pos:[10,114] width:320 height:112
    label lbl_flow1 "1  添加 Unwrap UVW，通道设为 2" pos:[24,136] width:290 height:16
    label lbl_flow2 "2  打开 UVW 编辑器，进入面模式，全选UV面" pos:[24,156] width:290 height:16
    label lbl_flow3 "3  点击：快速剥离" pos:[24,176] width:290 height:16
    label lbl_flow4 "4  再次全选UV面" pos:[24,196] width:290 height:16
    label lbl_flow5 "5  点击：通过平滑组展平" pos:[24,216] width:290 height:16

    button btn_process "▶ 生成 UV2" pos:[60,238] width:220 height:34
    label lbl_info "状态：等待选择模型" pos:[15,272] width:310 height:16 align:#center

    fn _str v =
    (
        if v == undefined then "" else (v as string)
    )

    fn _lower s =
    (
        try(toLower (_str s))catch(_str s)
    )

    fn _hasText hay needle =
    (
        local h = _lower hay
        local n = _lower needle
        (findString h n) != undefined
    )

    fn _allKeywordsMatch txt kws =
    (
        local ok = true
        for k in kws do
        (
            if not (_hasText txt k) do ok = false
        )
        ok
    )

    fn _actionText ai =
    (
        local t = ""
        local btn = ""
        local mnu = ""
        local desc = ""
        local cat = ""
        try(ai.getButtonText &btn)catch()
        try(ai.getMenuText &mnu)catch()
        try(ai.getDescription &desc)catch()
        try(ai.getCategory &cat)catch()
        t = (" " + (_str btn) + " " + (_str mnu) + " " + (_str desc) + " " + (_str cat))
        t
    )

    fn _actionID ai =
    (
        local aid = undefined
        try(aid = ai.id)catch()
        if aid == undefined do try(aid = ai.getID())catch()
        if aid == undefined do try(aid = ai.getId())catch()
        if aid == undefined then undefined else (aid as string)
    )

    fn _tableID tbl =
    (
        local tid = undefined
        try(tid = tbl.id)catch()
        if tid == undefined do try(tid = tbl.getID())catch()
        if tid == undefined do try(tid = tbl.getId())catch()
        if tid == undefined do try(tid = tbl.getContextID())catch()
        if tid == undefined do try(tid = tbl.getContextId())catch()
        tid
    )

    fn execActionByCandidateGroups groups labelName =
    (
        local done = false

        for kws in groups while not done do
        (
            for i = 1 to actionMan.numActionTables while not done do
            (
                local tbl = undefined
                try(tbl = actionMan.getActionTable i)catch()
                if tbl != undefined do
                (
                    local n = 0
                    try(n = tbl.numActionItems)catch()
                    for j = 1 to n while not done do
                    (
                        local ai = undefined
                        try(ai = tbl.getActionItem j)catch()
                        if ai != undefined do
                        (
                            local txt = _actionText ai
                            if (_allKeywordsMatch txt kws) do
                            (
                                local tid = _tableID tbl
                                local aid = _actionID ai
                                if tid != undefined and aid != undefined do
                                (
                                    try
                                    (
                                        actionMan.executeAction tid aid
                                        done = true
                                    )
                                    catch()
                                )
                            )
                        )
                    )
                )
            )
        )
        done
    )

    fn isGoodGeo n =
    (
        isValidNode n and (superClassOf n == GeometryClass) and (not isGroupHead n)
    )

    fn getFaceCountSafe obj uw =
    (
        local fc = 0
        try(fc = uw.numberPolygonsByNode obj)catch()
        if fc < 1 do try(fc = uw.numberPolygons())catch()
        if fc < 1 do try(fc = polyop.getNumFaces obj)catch()
        fc
    )

    fn selectAllUVFaces obj uw =
    (
        local fc = getFaceCountSafe obj uw
        if fc < 1 then false
        else
        (
            local allFaces = #{1..fc}

            max modify mode
            select obj
            modPanel.setCurrentObject uw

            subObjectLevel = 3
            try(uw.setTVSubObjectMode 3)catch()
            try(uw.setGeomSelectElementMode false)catch()
            try(uw.setFilterSelected false)catch()

            try(uw.selectPolygonsUpdateByNode allFaces true obj)catch()
            try(uw.selectPolygonsByNode allFaces obj)catch()
            try(uw.selectFacesByNode allFaces obj)catch()
            try(uw.selectFaces allFaces)catch()
            try(uw.selectPolygons allFaces)catch()
            try(uw.UpdateView())catch()
            windows.processPostedMessages()
            true
        )
    )

    fn doQuickPeelExact obj uw =
    (
        local ok = false

        ok = execActionByCandidateGroups #(
            #("快速", "剥"),
            #("quick", "peel")
        ) "快速剥离"

        if not ok do
        (
            try
            (
                uw.LSCMSolve()
                ok = true
            )
            catch()
        )
        windows.processPostedMessages()
        ok
    )

    fn doFlattenBySmoothExact obj uw padding =
    (
        local ok = false

        ok = execActionByCandidateGroups #(
            #("通过", "平滑", "展"),
            #("平滑组", "展"),
            #("smoothing", "flatten"),
            #("flatten", "smoothing"),
            #("smooth", "group", "flatten")
        ) "通过平滑组展平"

        if not ok do
        (
            try
            (
                uw.FlattenBySmoothingGroup true true padding
                ok = true
            )
            catch()
        )
        windows.processPostedMessages()
        ok
    )

    fn doOneObject obj padding closeEditor collapseResult =
    (
        local ok = true
        try
        (
            select obj
            max modify mode

            convertTo obj Editable_Poly

            local uw = Unwrap_UVW()
            try(uw.setVC false)catch()
            try(uw.setMapChannel 2)catch()
            try(uw.setApplyToWholeObject true)catch()
            try(uw.setNormalizeMap true)catch()
            try(uw.peelAutoEdit = true)catch()

            addModifier obj uw
            modPanel.setCurrentObject uw

            uw.edit()
            windows.processPostedMessages()

            selectAllUVFaces obj uw
            doQuickPeelExact obj uw

            selectAllUVFaces obj uw
            doFlattenBySmoothExact obj uw padding

            try(uw.UpdateView())catch()
            windows.processPostedMessages()

            subObjectLevel = 0
            try(uw.setTVSubObjectMode 0)catch()

            if closeEditor do try(uw.closeWindow())catch()
            if collapseResult do convertTo obj Editable_Poly
        )
        catch
        (
            ok = false
            format "[UV2一件展开] % 处理失败：%\n" obj.name (getCurrentException())
            try(subObjectLevel = 0)catch()
        )
        ok
    )

    on btn_process pressed do
    (
        if selection.count == 0 then
        (
            messageBox "请先选择至少一个模型。" title:"UV2一件展开"
        )
        else
        (
            local objs = for o in selection where isGoodGeo o collect o
            if objs.count == 0 then
            (
                messageBox "当前选择里没有可处理的几何模型。" title:"UV2一件展开"
            )
            else
            (
                local successCount = 0
                local failCount = 0

                lbl_info.text = "状态：处理中..."
                windows.processPostedMessages()

                with undo "UV2一件展开" on
                (
                    for o in objs do
                    (
                        local r = doOneObject o spn_padding.value chk_closeEditor.checked chk_collapse.checked
                        if r then successCount += 1 else failCount += 1
                    )
                )

                completeRedraw()
                lbl_info.text = ("状态：完成 " + successCount as string + " 个，失败 " + failCount as string + " 个")
            )
        )
    )
)

createDialog UV2AutoUnwrapRollout pos:mouse.pos
