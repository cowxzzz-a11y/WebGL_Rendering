rollout TA_InstanceTool "TA 实例替换工具" width:200 height:215
(
	button btnPickMaster "1. 指定源物体 (母体)" width:180 height:35 toolTip:"点击后，在视口中点击那个最完美的源头物体"
	label lblMaster "【未指定源母体】" align:#center
	
	-- ===== 旋转偏移控制 UI =====
	groupBox grpOffset "旋转偏移 (局部坐标系)" width:180 height:50 align:#center
	spinner spnRotX "X:" range:[-360,360,0] type:#float fieldwidth:30 width:52 across:3 align:#center
	spinner spnRotY "Y:" range:[-360,360,0] type:#float fieldwidth:30 width:52 align:#center
	spinner spnRotZ "Z:" range:[-360,360,0] type:#float fieldwidth:30 width:52 align:#center
	-- =================================
	
	button btnReplace "2. 替换当前选中的物体" width:180 height:35 enabled:false toolTip:"先在场景中框选一堆独立Mesh，再点我"
	
	local masterObj -- 存储源物体
	
	fn getWorldBoxSize node =
	(
		local bb = nodeGetBoundingBox node (matrix3 1)
		local size = bb[2] - bb[1]
		[abs size.x, abs size.y, abs size.z]
	)
	
	fn safeDiv a b =
	(
		if (abs b) < 0.00001 then 1.0 else a / b
	)
	
	fn getBoxUniformScaleRatio targetNode sourceNode =
	(
		local targetSize = getWorldBoxSize targetNode
		local sourceSize = getWorldBoxSize sourceNode
		local targetDiag = length targetSize
		local sourceDiag = length sourceSize
		safeDiv targetDiag sourceDiag
	)
	
	on btnPickMaster pressed do
	(
		masterObj = pickObject prompt:"鼠标点击：选择场景中的【源目标实例物体(Master)】"
		if isValidNode masterObj then 
		(
			lblMaster.text = ("已指定: " + masterObj.name)
			btnReplace.enabled = true
		)
		else 
		(
			lblMaster.text = "【未指定源母体】"
			btnReplace.enabled = false
		)
	)
	
	on btnReplace pressed do
	(
		if not isValidNode masterObj then (
			messageBox "源母体失效，请重新指定！" title:"错误"
			return false
		)
		
		local targets = selection as array
		if targets.count == 0 then (
			messageBox "请先在场景中【框选】需要被替换的那一堆独立Mesh！" title:"提示"
			return false
		)
		
		-- 开启历史记录，支持 Ctrl+Z 一键撤销
		undo "TA_批量原地替换实例" on
		(
			local replacedCount = 0
			-- 禁用屏幕刷新，极大加快运行速度
			disableSceneRedraw()
			
			-- 获取 UI 设定的旋转偏移量
			local offsetRot = (eulerangles spnRotX.value spnRotY.value spnRotZ.value) as quat
			
			-- 在后台创建一个100%干净、无缩放污染的临时辅助点
			local tempPivot = point pos:[0,0,0] name:"TA_TempPivot"
			hide tempPivot -- 隐藏它，不让它在视口闪烁
			
			try (
				for obj in targets do (
					if obj != masterObj and isValidNode obj do (
						-- 创建实例
						local newInst = instance masterObj
						
						-- 1. 先完整复制目标物体世界矩阵，确保位置、旋转、父级场景关系仍按原逻辑稳定落位。
						newInst.transform = obj.transform
						
						-- 2. 再按当前实际包围盒做统一缩放补偿。
						-- 这样可以修正导入模型“节点缩放很小但网格尺寸很大”造成的替换后过小问题，
						-- 同时不再分开写 pos/rotation/scale，避免发生跑位。
						local sizeFix = getBoxUniformScaleRatio obj newInst
						in coordsys local scale newInst [sizeFix, sizeFix, sizeFix]
						
						-- 3. 让没有任何缩放的辅助点，对齐到目标物体的位置和朝向
						tempPivot.transform = matrix3 1 -- 重置矩阵确保缩放为1
						tempPivot.rotation = obj.rotation
						tempPivot.pos = obj.pos
						
						-- 4. 建立临时的父子层级（把新实例绑在辅助点上）
						newInst.parent = tempPivot
						
						-- 5. 旋转这个绝对干净的辅助点（因为辅助点缩放是1,1,1，Max底层的缩放崩溃Bug死活都不会被触发！）
						in coordsys local rotate tempPivot offsetRot
						
						-- 6. 脱离父子关系，恢复物体原有的父级（Max会自动帮新物体换算并保持住旋转后的崭世界坐标）
						newInst.parent = obj.parent
						
						-- 恢复原本的名字和图层
						newInst.name = obj.name
						if obj.layer != undefined do (
							obj.layer.addNode newInst
						)
						
						-- 物理删除旧物体
						delete obj
						replacedCount += 1
					)
				)
				
				-- 摧毁临时工具人辅助点
				if isValidNode tempPivot do delete tempPivot
				
				enableSceneRedraw() -- 恢复屏幕刷新
				forceCompleteRedraw() -- 强制重绘
				messageBox ("替换完成！\n已成功将 " + (replacedCount as string) + " 个独立网格转换为实例。") title:"成功"
			) 
			catch (
				if isValidNode tempPivot do delete tempPivot
				enableSceneRedraw()
				messageBox "运行中出现未知错误，请检查目标物体是否被锁定或处于关闭的组(Group)当中！" title:"错误"
			)
		)
	)
)

-- 创建独立浮动窗口
createDialog TA_InstanceTool style:#(#style_titlebar, #style_sysmenu, #style_toolwindow)
