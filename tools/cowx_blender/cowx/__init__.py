bl_info = {
    "name": "Cowx Bake Tool",
    "author": "Cowx",
    "version": (1, 0, 0),
    "blender": (5, 1, 0),
    "location": "View3D > Sidebar > Cowx",
    "description": "多通道纹理烘焙，自动 UV2/UV1 检测及正片叠底融合",
    "category": "Object",
}

import bpy
import numpy as np
from bpy.app.handlers import persistent

BAKE_TARGET_NODE_NAME = "Cowx_Bake_Target"

PASS_CONFIGS = (
    {
        "prop": "cowx_bake_pass_color",
        "label": "color",
        "suffix": "Color",
        "bake_type": "DIFFUSE",
        "bake_kwargs": {"pass_filter": {"COLOR"}},
        "colorspace": "sRGB",
        "use_alpha": True,
        "float_buffer": False,
        "generated_color": (0.0, 0.0, 0.0, 0.0),
    },
    {
        "prop": "cowx_bake_pass_normal",
        "label": "normal",
        "suffix": "Normal",
        "bake_type": "NORMAL",
        "bake_kwargs": {},
        "colorspace": "Non-Color",
        "use_alpha": False,
        "float_buffer": True,
        "generated_color": (0.5, 0.5, 1.0, 1.0),
    },
    {
        "prop": "cowx_bake_pass_roughness",
        "label": "roughness",
        "suffix": "Roughness",
        "bake_type": "ROUGHNESS",
        "bake_kwargs": {},
        "colorspace": "Non-Color",
        "use_alpha": False,
        "float_buffer": False,
        "generated_color": (1.0, 1.0, 1.0, 1.0),
    },
    {
        "prop": "cowx_bake_pass_ao",
        "label": "ao",
        "suffix": "AO",
        "bake_type": "AO",
        "bake_kwargs": {},
        "colorspace": "Non-Color",
        "use_alpha": False,
        "float_buffer": True,
        "generated_color": (1.0, 1.0, 1.0, 1.0),
    },
    {
        "prop": "cowx_bake_pass_light",
        "label": "light",
        "suffix": "Light",
        "bake_type": "DIFFUSE",
        "bake_kwargs": {"pass_filter": {"DIRECT", "INDIRECT"}},
        "colorspace": "sRGB",
        "use_alpha": False,
        "float_buffer": False,
        "generated_color": (0.0, 0.0, 0.0, 1.0),
    },
)

RESOLUTION_ITEMS = (
    ("512", "512", "512 × 512"),
    ("1024", "1024", "1024 × 1024"),
    ("2048", "2048", "2048 × 2048"),
    ("4096", "4096", "4096 × 4096"),
)

DEVICE_ITEMS = (
    ("CURRENT", "跟随当前", "使用场景当前设置的渲染设备"),
    ("CPU", "CPU", "使用 CPU 渲染"),
    ("GPU", "GPU", "使用 GPU 渲染"),
)


def _active_mesh(context):
    obj = context.active_object
    return obj if obj and obj.type == "MESH" else None


def _auto_set_uv(scene, obj):
    uv = obj.data.uv_layers if obj and obj.data else None
    if not uv or len(uv) == 0:
        return
    if len(uv) >= 2:
        scene.cowx_bake_uv_layer = uv[1].name
    else:
        scene.cowx_bake_uv_layer = uv[0].name


def _get_uv_layer(obj, scene):
    uv = obj.data.uv_layers if obj and obj.data else None
    if not uv or len(uv) == 0:
        return None
    name = scene.cowx_bake_uv_layer
    if name and uv.get(name):
        return uv[name]
    if len(uv) >= 2:
        return uv[1]
    return uv[0]


def _collect_passes(scene):
    return [c for c in PASS_CONFIGS if getattr(scene, c["prop"], False)]


def _is_base_pass(config):
    return config["suffix"] in {"Color", "AO", "Light"}


def _set_colorspace(img, name):
    try:
        img.colorspace_settings.name = name
    except TypeError:
        pass


def _resolve_device(scene):
    d = scene.cowx_bake_device
    return None if d == "CURRENT" else d


def _apply_device(scene):
    d = _resolve_device(scene)
    if d is not None and hasattr(scene, "cycles"):
        scene.cycles.device = d


def _find_image(obj_name, suffix):
    exact = f"{obj_name}_{suffix}"
    img = bpy.data.images.get(exact)
    if img:
        return img
    import re
    pat = re.compile(rf"^{re.escape(exact)}(?:_(\d{{3}}))?$")
    best, best_n = None, -1
    for im in bpy.data.images:
        m = pat.match(im.name)
        if not m:
            continue
        n = int(m.group(1)) if m.group(1) else 0
        if n > best_n:
            best, best_n = im, n
    return best


def _make_image(obj_name, config, res):
    base = f"{obj_name}_{config['suffix']}"
    img = bpy.data.images.get(base)
    if img is None:
        img = bpy.data.images.new(
            name=base, width=res, height=res,
            alpha=config["use_alpha"],
            float_buffer=config["float_buffer"],
        )
        img.generated_color = config["generated_color"]
    elif img.size[0] != res or img.size[1] != res:
        idx = 1
        while True:
            name = f"{base}_{idx:03d}"
            cand = bpy.data.images.get(name)
            if cand is None:
                img = bpy.data.images.new(
                    name=name, width=res, height=res,
                    alpha=config["use_alpha"],
                    float_buffer=config["float_buffer"],
                )
                img.generated_color = config["generated_color"]
                break
            if cand.size[0] == res and cand.size[1] == res:
                img = cand
                break
            idx += 1
    img.alpha_mode = "STRAIGHT"
    _set_colorspace(img, config["colorspace"])
    img.pack()
    return img


def _make_output_img(name, w, h, alpha=False, float_buf=False):
    img = bpy.data.images.get(name)
    if img is None:
        return bpy.data.images.new(
            name=name, width=w, height=h, alpha=alpha, float_buffer=float_buf
        )
    if img.size[0] == w and img.size[1] == h:
        return img
    idx = 1
    while True:
        cand = f"{name}_{idx:03d}"
        existing = bpy.data.images.get(cand)
        if existing is None:
            return bpy.data.images.new(
                name=cand, width=w, height=h, alpha=alpha, float_buffer=float_buf
            )
        if existing.size[0] == w and existing.size[1] == h:
            return existing
        idx += 1


def _ensure_bake_node(mat, img):
    nodes = mat.node_tree.nodes
    node = nodes.get(BAKE_TARGET_NODE_NAME)
    if node is None or node.bl_idname != "ShaderNodeTexImage":
        node = nodes.new(type="ShaderNodeTexImage")
        node.name = BAKE_TARGET_NODE_NAME
    node.label = "Bake Target"
    node.image = img
    for n in nodes:
        n.select = False
    node.select = True
    nodes.active = node
    return node


def _assign_to_materials(obj, img):
    handled = set()
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes or mat.node_tree is None:
            continue
        if mat.as_pointer() in handled:
            continue
        handled.add(mat.as_pointer())
        _ensure_bake_node(mat, img)


def _clean_bake_nodes(obj):
    handled = set()
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes or mat.node_tree is None:
            continue
        if mat.as_pointer() in handled:
            continue
        handled.add(mat.as_pointer())
        nodes = mat.node_tree.nodes
        node = nodes.get(BAKE_TARGET_NODE_NAME)
        if node and node.bl_idname == "ShaderNodeTexImage" and not any(
            o.is_linked for o in node.outputs
        ):
            nodes.remove(node)


def _multiply_blend(entries, out_img, w, h):
    if not entries:
        return False
    _set_colorspace(out_img, "sRGB")
    num_c = 4
    pixels = np.ones(w * h * num_c, dtype=np.float32)
    for i, entry in enumerate(entries):
        img = entry["image"]
        if img is None:
            continue
        iw, ih = img.size[0], img.size[1]
        arr = np.empty(iw * ih * num_c, dtype=np.float32)
        img.pixels.foreach_get(arr)
        if (iw, ih) != (w, h):
            grid = arr.reshape((ih, iw, num_c))
            xs = np.linspace(0, iw - 1, w).astype(np.int32)
            ys = np.linspace(0, ih - 1, h).astype(np.int32)
            arr = grid[ys[:, None], xs].ravel()
        if i == 0:
            pixels = arr.copy()
        else:
            pixels[0::4] *= arr[0::4]
            pixels[1::4] *= arr[1::4]
            pixels[2::4] *= arr[2::4]
    pixels[3::4] = 1.0
    out_img.pixels.foreach_set(pixels)
    out_img.update()
    return True


def _delete_image(img):
    if img and img.name in bpy.data.images:
        bpy.data.images.remove(img)


def _composite_passes(scene, obj, configs):
    entries = []
    labels = []
    for cfg in configs:
        img = _find_image(obj.name, cfg["suffix"])
        if img:
            entries.append({"image": img})
            labels.append(cfg["label"])
    if len(entries) < 2:
        return None, "需要至少 2 张基础色贴图才能融合"
    res = int(scene.cowx_bake_resolution)
    comp_name = f"{obj.name}_{'_'.join(labels)}"
    comp_img = _make_output_img(comp_name, res, res, alpha=False, float_buf=False)
    comp_img.generated_color = (1.0, 1.0, 1.0, 1.0)
    _set_colorspace(comp_img, "sRGB")
    if not _multiply_blend(entries, comp_img, res, res):
        return None, "正片叠底融合失败"
    for entry in entries:
        _delete_image(entry["image"])
    return comp_img, comp_name


def _place_image_node(mat, img, loc):
    nodes = mat.node_tree.nodes
    x_positions = [n.location.x for n in nodes] or [0.0]
    tex = nodes.new(type="ShaderNodeTexImage")
    tex.image = img
    tex.location = (max(x_positions) + 200, loc[1])
    return tex


def _place_images_on_materials(obj, images):
    handled = set()
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes or mat.node_tree is None:
            continue
        if mat.as_pointer() in handled:
            continue
        handled.add(mat.as_pointer())
        for img in images:
            if img:
                _place_image_node(mat, img, (-600, 0))


_last_active_obj = None


@persistent
def _on_depsgraph_update(scene):
    global _last_active_obj
    context = bpy.context
    obj = getattr(context, "active_object", None)
    if obj and obj.type == "MESH" and obj != _last_active_obj:
        _auto_set_uv(context.scene, obj)
        _last_active_obj = obj


class COWX_OT_SmartIsolate(bpy.types.Operator):
    bl_idname = "cowx.smart_isolate"
    bl_label = "隔离选中"
    bl_description = "隔离选中物体 / 退出隔离"
    bl_options = {"REGISTER"}

    @classmethod
    def poll(cls, context):
        return context.area and context.area.type == "VIEW_3D"

    def execute(self, context):
        space_data = context.space_data
        if space_data and space_data.local_view:
            bpy.ops.view3d.localview()
            return {"FINISHED"}
        if context.selected_objects:
            bpy.ops.view3d.localview()
            return {"FINISHED"}
        self.report({"INFO"}, "没有选中物体用于隔离")
        return {"CANCELLED"}


class COWX_OT_Bake(bpy.types.Operator):
    bl_idname = "cowx.bake"
    bl_label = "开始烘焙"
    bl_description = "多通道顺序烘焙，自动正片叠底融合 color/ao/light"
    bl_options = {"REGISTER"}

    def execute(self, context):
        import sys
        if sys.platform == "win32":
            import ctypes
            try:
                ctypes.windll.user32.DisableProcessWindowsGhosting()
            except:
                pass

        scene = context.scene
        obj = _active_mesh(context)
        if obj is None:
            self.report({"WARNING"}, "请选择一个网格物体")
            return {"CANCELLED"}

        if not bpy.app.build_options.cycles:
            self.report({"ERROR"}, "当前 Blender 未启用 Cycles")
            return {"CANCELLED"}

        passes = _collect_passes(scene)
        if not passes:
            self.report({"WARNING"}, "请至少选择一个烘焙通道")
            return {"CANCELLED"}

        uv = _get_uv_layer(obj, scene)
        if uv is None:
            self.report({"WARNING"}, "物体没有 UV 层")
            return {"CANCELLED"}

        restore = {
            "engine": scene.render.engine,
            "samples": scene.cycles.samples if hasattr(scene, "cycles") else 0,
            "device": scene.cycles.device if hasattr(scene, "cycles") else None,
            "margin": scene.render.bake.margin,
            "uv": obj.data.uv_layers.active.name if obj.data.uv_layers.active else "",
            "mode": obj.mode,
        }

        scene.render.engine = "CYCLES"
        if hasattr(scene, "cycles"):
            scene.cycles.samples = scene.cowx_bake_samples
        _apply_device(scene)
        scene.render.bake.margin = scene.cowx_bake_margin
        if hasattr(scene.render.bake, "target"):
            scene.render.bake.target = "IMAGE_TEXTURES"
        if hasattr(scene.render.bake, "use_selected_to_active"):
            scene.render.bake.use_selected_to_active = False

        obj.data.uv_layers.active = uv
        context.view_layer.objects.active = obj
        if obj.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")

        res = int(scene.cowx_bake_resolution)

        for i, cfg in enumerate(passes):
            self.report({"INFO"}, f"烘焙 ({i + 1}/{len(passes)}): {cfg['label']}")
            img = _make_image(obj.name, cfg, res)
            _assign_to_materials(obj, img)
            bpy.ops.wm.redraw_timer(type="DRAW_WIN_SWAP", iterations=1)
            try:
                bpy.ops.object.bake(type=cfg["bake_type"], **cfg["bake_kwargs"])
            except Exception as e:
                self.report({"ERROR"}, f"{cfg['label']} 烘焙失败: {e}")
                break

        _clean_bake_nodes(obj)

        base_configs = [c for c in passes if _is_base_pass(c)]
        other_configs = [c for c in passes if not _is_base_pass(c)]

        if len(base_configs) >= 2:
            comp_img, msg = _composite_passes(scene, obj, base_configs)
            if comp_img:
                self.report({"INFO"}, f"融合完成: {msg}")
                _place_images_on_materials(obj, [comp_img])
            else:
                self.report({"WARNING"}, msg)
                imgs = [_find_image(obj.name, cfg["suffix"]) for cfg in base_configs]
                _place_images_on_materials(obj, [im for im in imgs if im])
        elif len(base_configs) == 1:
            img = _find_image(obj.name, base_configs[0]["suffix"])
            if img:
                _place_images_on_materials(obj, [img])

        other_imgs = []
        for cfg in other_configs:
            img = _find_image(obj.name, cfg["suffix"])
            if img:
                other_imgs.append(img)
        if other_imgs:
            _place_images_on_materials(obj, other_imgs)

        scene.render.engine = restore["engine"]
        scene.render.bake.margin = restore["margin"]
        if hasattr(scene, "cycles"):
            scene.cycles.samples = restore["samples"]
            if restore["device"]:
                scene.cycles.device = restore["device"]
        old_uv = obj.data.uv_layers.get(restore["uv"])
        if old_uv:
            obj.data.uv_layers.active = old_uv
        if obj.mode != restore["mode"]:
            try:
                bpy.ops.object.mode_set(mode=restore["mode"])
            except:
                pass

        self.report({"INFO"}, "烘焙全部完成")
        return {"FINISHED"}


class COWX_OT_PickReplaceSource(bpy.types.Operator):
    bl_idname = "cowx.pick_replace_source"
    bl_label = "拾取替换源"
    bl_description = "把当前活动物体保存为批量替换源"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return context.active_object is not None

    def execute(self, context):
        context.scene.cowx_replace_source = context.active_object
        self.report({"INFO"}, f"已拾取替换源: {context.active_object.name}")
        return {"FINISHED"}


class COWX_OT_ReplaceSelectedWithSource(bpy.types.Operator):
    bl_idname = "cowx.replace_selected_with_source"
    bl_label = "替换选中物体"
    bl_description = "用拾取的源物体替换当前选中物体，并完全继承每个目标的世界坐标、旋转和缩放"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        scene = context.scene
        return bool(getattr(scene, "cowx_replace_source", None)) and bool(context.selected_objects)

    def execute(self, context):
        scene = context.scene
        source = scene.cowx_replace_source
        if source is None:
            self.report({"WARNING"}, "请先拾取一个有效的替换源物体")
            return {"CANCELLED"}

        targets = [obj for obj in context.selected_objects if obj != source]
        if not targets:
            self.report({"WARNING"}, "请框选需要被替换的目标物体，替换源本身会被自动排除")
            return {"CANCELLED"}

        new_objects = []
        for target in targets:
            matrix = target.matrix_world.copy()
            parent = target.parent
            collections = list(target.users_collection) or [context.collection]

            new_obj = source.copy()
            if not scene.cowx_replace_use_instance_data and source.data:
                new_obj.data = source.data.copy()
            new_obj.name = f"{source.name}_to_{target.name}"
            new_obj.animation_data_clear()

            for collection in collections:
                try:
                    collection.objects.link(new_obj)
                except RuntimeError:
                    pass

            new_obj.parent = parent
            new_obj.matrix_world = matrix
            new_objects.append(new_obj)

        if scene.cowx_replace_delete_targets:
            for target in targets:
                bpy.data.objects.remove(target, do_unlink=True)
        else:
            for target in targets:
                target.hide_set(True)
                target.hide_render = True

        bpy.ops.object.select_all(action="DESELECT")
        for obj in new_objects:
            obj.select_set(True)
        if new_objects:
            context.view_layer.objects.active = new_objects[-1]

        self.report({"INFO"}, f"已替换 {len(new_objects)} 个物体")
        return {"FINISHED"}


class COWX_PT_BakePanel(bpy.types.Panel):
    bl_label = "Cowx 烘焙工具"
    bl_idname = "COWX_PT_BakePanel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Cowx"

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj and obj.type == "MESH"

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        obj = context.active_object

        box = layout.box()
        box.label(text="UV 通道", icon="UV")
        if obj and obj.data and obj.data.uv_layers:
            box.prop_search(scene, "cowx_bake_uv_layer", obj.data, "uv_layers", text="")
        else:
            box.label(text="无 UV 层", icon="ERROR")

        layout.prop(scene, "cowx_bake_resolution", text="分辨率")

        layout.prop(scene, "cowx_bake_device", text="烘焙设备")

        row = layout.row()
        row.prop(scene, "cowx_bake_samples", text="采样数")
        row.prop(scene, "cowx_bake_margin", text="边距")

        layout.separator()
        layout.label(text="烘焙通道:", icon="TEXTURE")
        split = layout.split(factor=0.5)
        col_left = split.column()
        col_left.prop(scene, "cowx_bake_pass_color", text="Color")
        col_left.prop(scene, "cowx_bake_pass_normal", text="Normal")
        col_left.prop(scene, "cowx_bake_pass_roughness", text="Roughness")
        col_right = split.column()
        col_right.prop(scene, "cowx_bake_pass_ao", text="AO")
        col_right.prop(scene, "cowx_bake_pass_light", text="Light")

        layout.separator()
        layout.operator("cowx.bake", icon="RENDER_STILL", text="开始烘焙")


class COWX_PT_ReplacePanel(bpy.types.Panel):
    bl_label = "Cowx 批量替换"
    bl_idname = "COWX_PT_ReplacePanel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Cowx"

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        source = scene.cowx_replace_source

        box = layout.box()
        box.label(text="源物体", icon="EYEDROPPER")
        box.prop(scene, "cowx_replace_source", text="")
        box.operator("cowx.pick_replace_source", icon="EYEDROPPER", text="拾取当前活动物体")

        layout.separator()
        layout.prop(scene, "cowx_replace_use_instance_data", text="实例化源数据")
        layout.prop(scene, "cowx_replace_delete_targets", text="删除被替换物体")

        selected_count = len([obj for obj in context.selected_objects if obj != source])
        row = layout.row()
        row.enabled = source is not None and selected_count > 0
        row.operator("cowx.replace_selected_with_source", icon="DUPLICATE", text=f"替换选中物体 ({selected_count})")

        if source is None:
            layout.label(text="先选择源物体并点击拾取", icon="INFO")
        elif selected_count == 0:
            layout.label(text="再框选需要替换的目标物体", icon="INFO")


classes = (
    COWX_OT_SmartIsolate,
    COWX_OT_Bake,
    COWX_OT_PickReplaceSource,
    COWX_OT_ReplaceSelectedWithSource,
    COWX_PT_BakePanel,
    COWX_PT_ReplacePanel,
)

_addon_keymaps = []


def register():
    bpy.types.Scene.cowx_bake_uv_layer = bpy.props.StringProperty(
        name="UV 通道", default="",
    )
    bpy.types.Scene.cowx_bake_resolution = bpy.props.EnumProperty(
        name="分辨率", items=RESOLUTION_ITEMS, default="1024",
    )
    bpy.types.Scene.cowx_bake_device = bpy.props.EnumProperty(
        name="设备", items=DEVICE_ITEMS, default="CURRENT",
    )
    bpy.types.Scene.cowx_bake_samples = bpy.props.IntProperty(
        name="采样数", default=128, min=1, max=10000,
    )
    bpy.types.Scene.cowx_bake_margin = bpy.props.IntProperty(
        name="边距", default=16, min=0, max=100,
    )
    bpy.types.Scene.cowx_bake_pass_color = bpy.props.BoolProperty(
        name="Color", default=False,
    )
    bpy.types.Scene.cowx_bake_pass_normal = bpy.props.BoolProperty(
        name="Normal", default=False,
    )
    bpy.types.Scene.cowx_bake_pass_roughness = bpy.props.BoolProperty(
        name="Roughness", default=False,
    )
    bpy.types.Scene.cowx_bake_pass_ao = bpy.props.BoolProperty(
        name="AO", default=False,
    )
    bpy.types.Scene.cowx_bake_pass_light = bpy.props.BoolProperty(
        name="Light", default=False,
    )
    bpy.types.Scene.cowx_replace_source = bpy.props.PointerProperty(
        name="替换源物体", type=bpy.types.Object,
    )
    bpy.types.Scene.cowx_replace_use_instance_data = bpy.props.BoolProperty(
        name="实例化源数据", default=True,
        description="开启后复制出的物体共享同一份 Mesh/Light 数据，适合批量灯具替换并更省资源",
    )
    bpy.types.Scene.cowx_replace_delete_targets = bpy.props.BoolProperty(
        name="删除被替换物体", default=True,
        description="关闭后仅隐藏原目标物体，便于回退检查",
    )

    for cls in classes:
        bpy.utils.register_class(cls)

    bpy.app.handlers.depsgraph_update_post.append(_on_depsgraph_update)

    try:
        kc = bpy.context.window_manager.keyconfigs.addon
        if kc:
            km = kc.keymaps.new(name="3D View", space_type="VIEW_3D")
            kmi = km.keymap_items.new("cowx.smart_isolate", type="Q", value="PRESS", alt=True)
            _addon_keymaps.append((km, kmi))
    except:
        pass


def unregister():
    for km, kmi in _addon_keymaps:
        km.keymap_items.remove(kmi)
    _addon_keymaps.clear()

    if _on_depsgraph_update in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(_on_depsgraph_update)

    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

    props = [
        "cowx_bake_uv_layer", "cowx_bake_resolution", "cowx_bake_device",
        "cowx_bake_samples", "cowx_bake_margin",
        "cowx_bake_pass_color", "cowx_bake_pass_normal",
        "cowx_bake_pass_roughness", "cowx_bake_pass_ao",
        "cowx_bake_pass_light",
        "cowx_replace_source", "cowx_replace_use_instance_data",
        "cowx_replace_delete_targets",
    ]
    for prop in props:
        if hasattr(bpy.types.Scene, prop):
            delattr(bpy.types.Scene, prop)
