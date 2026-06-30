-- 开启撤销功能，如果结果不满意可以 Ctrl+Z 恢复
undo "Rename Children to Parent" on
(
    -- 遍历场景中所有的对象
    for obj in objects do
    -- 排除掉没有父对象的根节点
    if obj.parent != undefined do
    (
        local p = obj.parent
        
        -- 情况 1：如果父级是一个 3ds Max 标准的“组”（Group Head）
        -- 或者情况 2：如果父级只是普通的层级结构（比如导入的 Helper/Dummy），并且其子对象名字包含乱码特征
        -- 这里通过判断子对象名字里是否含有非主流字符（如 'Í' 或 'À' 或 '½'）
        -- 如果你确定要粗暴地把【所有】子对象都改成父组的名字，可以去掉这个特殊字符判断
        if isGroupHead p or (matchPattern obj.name pattern:"*Í*" or matchPattern obj.name pattern:"*À*" or matchPattern obj.name pattern:"*½*") then
        (
            -- 获取父级的名称
            local parentName = p.name
            
            -- 如果子对象有同级兄弟，直接改一模一样的名字 max 会自动在后面加 [1], [2] 序号
            -- 这样正好符合你图中的 零件3^总装_5 -> [1], [2], [3] 的预期
            obj.name = parentName
        )
    )
)