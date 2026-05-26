# -*- coding: utf-8 -*-
import re
import numpy as np
import bpy
from . import cowx__tools

PASS_CONFIGS = (
    {
        "prop": "cowx_bake_pass_combined",
        "label": "color",
        "image_suffix": "Color",
        "bake_type": "DIFFUSE",
        "bake_kwargs": {"pass_filter": {"COLOR"}},
        "colorspace": "sRGB",
        "use_alpha": True,
        "float_buffer": False,
        "generated_color": (0.0, 0.0, 0.0, 0.0),
    },
    {
        "prop": "cowx_bake_pass_ao",
        "label": "ao",
        "image_suffix": "AO",
        "bake_type": "AO",
        "bake_kwargs": {},
        "colorspace": "Non-Color",
        "use_alpha": False,
        "float_buffer": True,
        "generated_color": (1.0, 1.0, 1.0, 1.0),
    },
    {
        "prop": "cowx_bake_pass_normal",
        "label": "normal",
        "image_suffix": "Normal",
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
        "image_suffix": "Roughness",
        "bake_type": "ROUGHNESS",
        "bake_kwargs": {},
        "colorspace": "Non-Color",
        "use_alpha": False,
        "float_buffer": False,
        "generated_color": (1.0, 1.0, 1.0, 1.0),
    },
    {
        "prop": "cowx_bake_pass_light",
        "label": "light",
        "image_suffix": "Light",
        "bake_type": "DIFFUSE",
        "bake_kwargs": {"pass_filter": {"DIRECT", "INDIRECT"}},
        "colorspace": "sRGB",
        "use_alpha": False,
        "float_buffer": False,
        "generated_color": (0.0, 0.0, 0.0, 1.0),
    },
)

BAKE_TARGET_NODE_NAME = "Cowx_Bake_Target"
LEGACY_BAKE_TARGET_NODE_NAME = "Bake_Target_Node"
LIGHTING_OUTPUT_NODE_NAME = "Baked_Lighting"
COMPOSITE_IMAGE_KEY = "cowx_bake_composite_image"
LAST_PASS_SUFFIXES_KEY = "cowx_bake_last_pass_suffixes"
BASE_COLOR_IMAGE_SUFFIXES = ("Color", "AO", "Light")

RESOLUTION_ITEMS = (
    ("512", "512", "512 x 512"),
    ("1024", "1024", "1024 x 1024"),
    ("2048", "2048", "2048 x 2048"),
    ("4096", "4096", "4096 x 4096"),
    ("8192", "8192", "8192 x 8192"),
)

def _active_mesh_object(context):
    obj = getattr(context, "active_object", None)
    if obj and obj.type == "MESH":
        return obj
    return None

def _resolve_uv_layer(scene, obj):
    uv_layers = getattr(obj.data, "uv_layers", None)
    if not uv_layers:
        return None, False
    selected_name = getattr(scene, "cowx_bake_uv_layer", "")
    layer = uv_layers.get(selected_name) if selected_name else None
    if layer:
        return layer, False
    active_layer = getattr(uv_layers, "active", None)
    if active_layer:
        return active_layer, bool(selected_name)
    if len(uv_layers) > 0:
        return uv_layers[0], bool(selected_name)
    return None, False

def _collect_selected_passes(scene):
    return [config for config in PASS_CONFIGS if getattr(scene, config["prop"], False)]

def _set_image_colorspace(image, colorspace_name):
    try:
        image.colorspace_settings.name = colorspace_name
    except TypeError:
        pass

def _pack_image(image):
    try:
        image.pack()
    except RuntimeError:
        pass

def _resolve_bake_device(scene):
    if not hasattr(scene, "cycles"):
        return None
    requested_device = getattr(scene, "cowx_bake_device", "CURRENT")
    if requested_device == "CURRENT":
        return None
    return "GPU" if requested_device == "GPU" else "CPU"

def _apply_bake_device(scene):
    device = _resolve_bake_device(scene)
    if device is None:
        return None
    scene.cycles.device = device
    return device

def _find_or_create_bake_image(obj_name, pass_config, resolution):
    base_name = f"{obj_name}_{pass_config['image_suffix']}"
    candidate_name = base_name
    suffix_index = 1
    while True:
        image = bpy.data.images.get(candidate_name)
        if image is None:
            image = bpy.data.images.new(
                name=candidate_name, width=resolution, height=resolution,
                alpha=pass_config["use_alpha"], float_buffer=pass_config["float_buffer"]
            )
            image.generated_color = pass_config["generated_color"]
            break
        if image.size[0] == resolution and image.size[1] == resolution:
            break
        candidate_name = f"{base_name}_{suffix_index:03d}"
        suffix_index += 1
    image.alpha_mode = "STRAIGHT"
    _set_image_colorspace(image, pass_config["colorspace"])
    _pack_image(image)
    return image

def _get_or_create_bake_node(material, image):
    nodes = material.node_tree.nodes
    bake_node = nodes.get(BAKE_TARGET_NODE_NAME)
    if bake_node is None or bake_node.bl_idname != "ShaderNodeTexImage":
        legacy_node = nodes.get(LEGACY_BAKE_TARGET_NODE_NAME)
        if legacy_node and legacy_node.bl_idname == "ShaderNodeTexImage" and not any(o.is_linked for o in legacy_node.outputs):
            bake_node = legacy_node
            bake_node.name = BAKE_TARGET_NODE_NAME
        else:
            bake_node = nodes.new(type="ShaderNodeTexImage")
            bake_node.name = BAKE_TARGET_NODE_NAME

    bake_node.label = "Bake Target"
    bake_node.location = (400, 0)
    for node in nodes:
        node.select = False
    bake_node.image = image
    bake_node.select = True
    nodes.active = bake_node
    return bake_node

def _assign_bake_targets(obj, image, reporter):
    if len(obj.material_slots) == 0:
        return
    handled_materials = set()
    for mat_slot in obj.material_slots:
        material = mat_slot.material
        if material is None or not material.use_nodes or material.node_tree is None:
            continue
        mat_ptr = material.as_pointer()
        if mat_ptr in handled_materials:
            continue
        handled_materials.add(mat_ptr)
        _get_or_create_bake_node(material, image)

def _iter_unique_node_materials(obj):
    handled_materials = set()
    for mat_slot in obj.material_slots:
        material = mat_slot.material
        if material is None or not material.use_nodes or material.node_tree is None:
            continue
        mat_ptr = material.as_pointer()
        if mat_ptr in handled_materials:
            continue
        handled_materials.add(mat_ptr)
        yield material

def _remove_unused_bake_target_node(material):
    if material is None or not material.use_nodes or material.node_tree is None:
        return
    nodes = material.node_tree.nodes
    bake_node = nodes.get(BAKE_TARGET_NODE_NAME)
    if bake_node and bake_node.bl_idname == "ShaderNodeTexImage" and not any(o.is_linked for o in bake_node.outputs):
        nodes.remove(bake_node)

def _find_baked_image(obj_name, suffix):
    exact_name = f"{obj_name}_{suffix}"
    exact_image = bpy.data.images.get(exact_name)
    if exact_image:
        return exact_image
    pattern = re.compile(rf"^{re.escape(exact_name)}(?:_(\d{{3}}))?$")
    best_match, best_suffix = None, -1
    for image in bpy.data.images:
        match = pattern.match(image.name)
        if not match:
            continue
        val = int(match.group(1)) if match.group(1) else 0
        if val > best_suffix:
            best_match, best_suffix = image, val
    return best_match

def _parse_stored_pass_suffixes(value):
    return [item for item in value.split(",") if item] if value else []

def _create_or_reuse_output_image(name, width, height, *, alpha=True, float_buffer=False):
    image = bpy.data.images.get(name)
    if image is None:
        return bpy.data.images.new(name=name, width=width, height=height, alpha=alpha, float_buffer=float_buffer)
    if image.size[0] == width and image.size[1] == height:
        return image
    suffix_index = 1
    while True:
        candidate_name = f"{name}_{suffix_index:03d}"
        image = bpy.data.images.get(candidate_name)
        if image is None:
            return bpy.data.images.new(name=candidate_name, width=width, height=height, alpha=alpha, float_buffer=float_buffer)
        if image.size[0] == width and image.size[1] == height:
            return image
        suffix_index += 1

def _store_bake_result_metadata(obj, selected_passes, composite_image=None):
    selected_suffixes = [config["image_suffix"] for config in selected_passes]
    if selected_suffixes:
        obj[LAST_PASS_SUFFIXES_KEY] = ",".join(selected_suffixes)
    if composite_image is not None:
        obj[COMPOSITE_IMAGE_KEY] = composite_image.name

def _multiply_images_to_output(source_entries, output_image, width, height):
    if not source_entries:
        return False
    _set_image_colorspace(output_image, "sRGB")
    num_channels = 4
    merged_pixels = np.ones(width * height * num_channels, dtype=np.float32)

    try:
        for i, entry in enumerate(source_entries):
            img = entry["image"]
            if img is None:
                continue
            img_w, img_h = img.size[0], img.size[1]
            src_arr = np.empty(img_w * img_h * num_channels, dtype=np.float32)
            img.pixels.foreach_get(src_arr)

            if (img_w, img_h) != (width, height):
                src_grid = src_arr.reshape((img_h, img_w, num_channels))
                x_indices = np.linspace(0, img_w - 1, width).astype(np.int32)
                y_indices = np.linspace(0, img_h - 1, height).astype(np.int32)
                src_arr = src_grid[y_indices[:, None], x_indices].ravel()

            if i == 0:
                merged_pixels = src_arr.copy()
            else:
                merged_pixels[0::4] *= src_arr[0::4]
                merged_pixels[1::4] *= src_arr[1::4]
                merged_pixels[2::4] *= src_arr[2::4]

        merged_pixels[3::4] = 1.0
        output_image.pixels.foreach_set(merged_pixels)
        output_image.update()
        return True
    except Exception as e:
        print(f"融合贴图时发生异常: {e}")
        return False

def _clear_material_slots(context, obj):
    if obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    while obj.material_slots:
        obj.active_material_index = len(obj.material_slots) - 1
        bpy.ops.object.material_slot_remove()

def _link_if_present(links, from_socket, to_socket):
    if from_socket and to_socket:
        links.new(from_socket, to_socket)

def _copy_texture_node_settings(source_node, target_node):
    for attr in ("interpolation", "projection", "projection_blend", "extension"):
        if hasattr(source_node, attr) and hasattr(target_node, attr):
            setattr(target_node, attr, getattr(source_node, attr))

def _get_shader_editor_tree(context, obj):
    screen = getattr(context, "screen", None)
    if screen:
        for area in screen.areas:
            if area.type == "NODE_EDITOR":
                for space in area.spaces:
                    if space.type == "NODE_EDITOR" and space.tree_type == "ShaderNodeTree":
                        tree = getattr(space, "edit_tree", None) or getattr(space, "node_tree", None)
                        if tree: return tree
    material = getattr(obj, "active_material", None)
    return material.node_tree if (material and material.use_nodes) else None

def _add_image_to_shader_editor(context, obj, image, *, label=None, select=False):
    node_tree = _get_shader_editor_tree(context, obj)
    if node_tree is None:
        return None
    nodes = node_tree.nodes
    existing_node = next((n for n in nodes if n.bl_idname == "ShaderNodeTexImage" and getattr(n, "image", None) == image), None)
    if existing_node:
        if select:
            for n in nodes: n.select = False
            existing_node.select = True
            nodes.active = existing_node
        return existing_node

    x_positions = [n.location.x for n in nodes] or [0.0]
    image_nodes = [n for n in nodes if n.bl_idname == "ShaderNodeTexImage"]
    texture_node = nodes.new(type="ShaderNodeTexImage")
    texture_node.image = image
    texture_node.name = image.name
    texture_node.label = label or image.name
    texture_node.location = (max(x_positions) + 260.0, 120.0 - (220.0 * len(image_nodes)))

    if select:
        for n in nodes: n.select = False
        texture_node.select = True
        nodes.active = texture_node
    return texture_node

def _build_base_color_input(nodes, links, bsdf_node, image_entries):
    if not image_entries: return
    texture_nodes = []
    for index, entry in enumerate(image_entries):
        node = nodes.new(type="ShaderNodeTexImage")
        node.name = entry["node_name"]
        node.label = entry["label"]
        node.location = (-720, 120 - (index * 220))
        node.image = entry["image"]
        _set_image_colorspace(entry["image"], entry["colorspace"])
        texture_nodes.append(node)

    if len(texture_nodes) == 1:
        _link_if_present(links, texture_nodes[0].outputs.get("Color"), bsdf_node.inputs.get("Base Color"))
        return

    current_socket = texture_nodes[0].outputs.get("Color")
    for index, node in enumerate(texture_nodes[1:], start=1):
        mix_node = nodes.new(type="ShaderNodeMixRGB")
        mix_node.name = f"Baked_BaseColor_Multiply_{index}"
        mix_node.label = "Base Color Multiply"
        mix_node.location = (-320 + ((index - 1) * 220), 40 - ((index - 1) * 80))
        mix_node.blend_type = "MULTIPLY"
        mix_node.inputs[0].default_value = 1.0
        _link_if_present(links, current_socket, mix_node.inputs[1])
        _link_if_present(links, node.outputs.get("Color"), mix_node.inputs[2])
        current_socket = mix_node.outputs.get("Color")
    _link_if_present(links, current_socket, bsdf_node.inputs.get("Base Color"))

def _build_baked_material(material, baked_images):
    node_tree = material.node_tree
    nodes, links = node_tree.nodes, node_tree.links
    nodes.clear()

    output_node = nodes.new(type="ShaderNodeOutputMaterial")
    output_node.location = (780, 0)
    bsdf_node = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf_node.location = (420, 0)
    _link_if_present(links, bsdf_node.outputs.get("BSDF"), output_node.inputs.get("Surface"))

    composite_image = baked_images.get("Composite")
    base_color_entries = []
    if composite_image:
        base_color_entries.append({"node_name": "Baked_Composite", "label": "Baked Composite", "image": composite_image, "colorspace": "sRGB"})
    else:
        for sfx, space in [("Color", "sRGB"), ("AO", "Non-Color"), ("Light", "sRGB")]:
            img = baked_images.get(sfx)
            if img: base_color_entries.append({"node_name": f"Baked_{sfx}", "label": f"Baked {sfx}", "image": img, "colorspace": space})

    _build_base_color_input(nodes, links, bsdf_node, base_color_entries)

    for sfx, node_id, loc in [("Normal", "Baked_Normal", (-520, -340)), ("Roughness", "Baked_Roughness", (-520, -560))]:
        img = baked_images.get(sfx)
        if not img: continue
        node = nodes.new(type="ShaderNodeTexImage")
        node.name, node.label, node.location, node.image = node_id, f"Baked {sfx}", loc, img
        _set_image_colorspace(img, "Non-Color")
        if sfx == "Normal":
            nm_node = nodes.new(type="ShaderNodeNormalMap")
            nm_node.location = (-120, -280)
            _link_if_present(links, node.outputs.get("Color"), nm_node.inputs.get("Color"))
            _link_if_present(links, nm_node.outputs.get("Normal"), bsdf_node.inputs.get("Normal"))
        else:
            _link_if_present(links, node.outputs.get("Color"), bsdf_node.inputs.get("Roughness"))

def _connect_image_to_base_color(material, image):
    if material is None or not material.use_nodes or material.node_tree is None: return
    nodes, links = material.node_tree.nodes, material.node_tree.links
    color_node = nodes.get(LIGHTING_OUTPUT_NODE_NAME)
    if color_node is None or color_node.bl_idname != "ShaderNodeTexImage":
        color_node = nodes.new(type="ShaderNodeTexImage")
        color_node.name, color_node.location = LIGHTING_OUTPUT_NODE_NAME, (-120, 120)
    color_node.label, color_node.image = "Baked Lighting", image
    _set_image_colorspace(image, "sRGB")

    for node in nodes:
        if node.bl_idname == "ShaderNodeBsdfPrincipled":
            bc_input = node.inputs.get("Base Color")
            if bc_input:
                while bc_input.is_linked: links.remove(bc_input.links[0])
                _link_if_present(links, color_node.outputs.get("Color"), bc_input)

def _restore_bake_state(data):
    scene = data["scene"]
    wm = data["wm"]
    wm.progress_end()

    workspace = getattr(bpy.context, "workspace", None)
    if workspace:
        workspace.status_text_set(None)

    scene.render.engine = data["restore"]["engine"]
    scene.render.bake.margin = data["restore"]["margin"]
    if hasattr(scene.render.bake, "target"): scene.render.bake.target = data["restore"]["bake_target"]
    if hasattr(scene.render.bake, "use_selected_to_active"): scene.render.bake.use_selected_to_active = data["restore"]["selected_to_active"]
    if hasattr(scene, "cycles"):
        scene.cycles.samples = data["restore"]["samples"]
        if data["restore"]["device"]: scene.cycles.device = data["restore"]["device"]

    obj = bpy.data.objects.get(data["object_name"])
    if obj and obj.type == "MESH":
        uv_name = data["restore"]["uv_name"]
        uv = obj.data.uv_layers.get(uv_name) if uv_name else None
        if uv:
            obj.data.uv_layers.active = uv
        if obj.mode != data["restore"]["mode"]:
            try: bpy.ops.object.mode_set(mode=data["restore"]["mode"])
            except: pass
        bpy.context.view_layer.objects.active = obj

# 🟢 智能通用通道融合核心函数（完美契合动态命名规范：模型名_通道1_通道2）
def _perform_generic_composite_core(scene, obj, base_color_configs, all_selected_passes):
    source_entries = []
    names_fused = []
    
    # 按照设定的主列表顺序提取烘焙完的贴图数据
    for config in base_color_configs:
        img = _find_baked_image(obj.name, config["image_suffix"])
        if img:
            source_entries.append({"image": img})
            names_fused.append(config["label"]) # 获取小写的 label（如 'color', 'ao', 'light'）
    
    if len(source_entries) < 2:
        return False, "未找到足够的已烘焙基础色单图进行融合。"

    # 🟢 动态拼接后缀：模型名_ao_light / 模型名_color_light / 模型名_color_ao_light
    composite_suffix = "_".join(names_fused)
    composite_name = f"{obj.name}_{composite_suffix}"
    
    resolution = int(scene.cowx_bake_resolution)
    composite_image = _create_or_reuse_output_image(
        composite_name, resolution, resolution, alpha=False, float_buffer=False
    )
    composite_image.generated_color = (1.0, 1.0, 1.0, 1.0)
    _set_image_colorspace(composite_image, "sRGB")

    if not _multiply_images_to_output(source_entries, composite_image, resolution, resolution):
        return False, "多通道正片叠底合并计算失败。"

    # 元数据存盘，以便后续材质整理能顺利抓取
    obj[COMPOSITE_IMAGE_KEY] = composite_image.name
    obj[LAST_PASS_SUFFIXES_KEY] = ",".join([c["image_suffix"] for c in all_selected_passes])
    cowx__tools.set_target_image(scene, composite_image)
    
    # 自动置为激活状态并选中，使其完美显示在屏幕左边的 Image 视口和 Shader 中
    _add_image_to_shader_editor(bpy.context, obj, composite_image, label=composite_image.name, select=True)
    return True, composite_image.name


class COWX_OT_MultiBake(bpy.types.Operator):
    """顺序自动多通道烘焙（修复原生进度条与卡死问题）"""
    bl_idname = "cowx.multi_bake"
    bl_label = "开始多通道烘焙"
    bl_options = {"REGISTER"}

    def execute(self, context):
        import sys
        if sys.platform == "win32":
            import ctypes
            try: ctypes.windll.user32.DisableProcessWindowsGhosting()
            except: pass

        obj = _active_mesh_object(context)
        if obj is None:
            self.report({"WARNING"}, "请先选中一个网格物体。")
            return {"CANCELLED"}

        if not bpy.app.build_options.cycles:
            self.report({"ERROR"}, "当前 Blender 未启用 Cycles，无法执行自动烘焙。")
            return {"CANCELLED"}

        selected_passes = _collect_selected_passes(context.scene)
        if not selected_passes:
            self.report({"WARNING"}, "至少选择一个烘焙通道。")
            return {"CANCELLED"}

        uv_layer, fell_back = _resolve_uv_layer(context.scene, obj)
        if uv_layer is None:
            self.report({"WARNING"}, "当前对象没有可用于烘焙的 UV 层。")
            return {"CANCELLED"}

        scene = context.scene
        
        restore = {
            "engine": scene.render.engine,
            "samples": scene.cycles.samples if hasattr(scene, "cycles") else 0,
            "device": scene.cycles.device if hasattr(scene, "cycles") else None,
            "margin": scene.render.bake.margin,
            "bake_target": getattr(scene.render.bake, "target", "IMAGE_TEXTURES"),
            "selected_to_active": getattr(scene.render.bake, "use_selected_to_active", False),
            "uv_name": getattr(obj.data.uv_layers.active, "name", ""),
            "mode": obj.mode,
        }

        scene.render.engine = "CYCLES"
        if hasattr(scene, "cycles"):
            scene.cycles.samples = scene.cowx_bake_samples
        _apply_bake_device(scene)
        scene.render.bake.margin = scene.cowx_bake_margin
        if hasattr(scene.render.bake, "target"): scene.render.bake.target = "IMAGE_TEXTURES"
        if hasattr(scene.render.bake, "use_selected_to_active"): scene.render.bake.use_selected_to_active = False

        obj.data.uv_layers.active = uv_layer
        context.view_layer.objects.active = obj
        if obj.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")

        resolution = int(scene.cowx_bake_resolution)

        # 顺序推进烘焙序列
        for index, pass_config in enumerate(selected_passes):
            self.report({"INFO"}, f"正在顺序烘焙 ({index + 1}/{len(selected_passes)}): {pass_config['label']}")
            
            image = _find_or_create_bake_image(obj.name, pass_config, resolution)
            cowx__tools.set_target_image(scene, image)
            _assign_bake_targets(obj, image, self.report)

            # 刷新视口
            bpy.ops.wm.redraw_timer(type='DRAW_WIN_SWAP', iterations=1)

            try:
                bpy.ops.object.bake(type=pass_config["bake_type"], **pass_config["bake_kwargs"])
            except Exception as e:
                self.report({"ERROR"}, f"{pass_config['label']} 烘焙中断异常: {e}")
                break

            # 单步解耦节点挂载（先静默刷出节点，不强制激活干扰流程）
            _add_image_to_shader_editor(context, obj, image, label=image.name, select=False)
            for material in _iter_unique_node_materials(obj):
                _remove_unused_bake_target_node(material)
            if pass_config.get("connect_base_color_after_bake"):
                for material in _iter_unique_node_materials(obj):
                    _connect_image_to_base_color(material, image)

        # 还原渲染状态
        scene.render.engine = restore["engine"]
        scene.render.bake.margin = restore["margin"]
        if hasattr(scene.render.bake, "target"): scene.render.bake.target = restore["bake_target"]
        if hasattr(scene.render.bake, "use_selected_to_active"): scene.render.bake.use_selected_to_active = restore["selected_to_active"]
        if hasattr(scene, "cycles"):
            scene.cycles.samples = restore["samples"]
            if restore["device"]: scene.cycles.device = restore["device"]
        
        old_uv = obj.data.uv_layers.get(restore["uv_name"])
        if old_uv: obj.data.uv_layers.active = old_uv
        if obj.mode != restore["mode"]:
            try: bpy.ops.object.mode_set(mode=restore["mode"])
            except: pass
        context.view_layer.objects.active = obj

        # 数据入库更新
        _store_bake_result_metadata(obj, selected_passes, None)
        
        # 🟢 【核心优化】：按 PASS_CONFIGS 标准顺序筛选本次勾选的基础色子项
        base_color_configs = [
            c for c in PASS_CONFIGS 
            if getattr(scene, c["prop"], False) and c["image_suffix"] in BASE_COLOR_IMAGE_SUFFIXES
        ]

        # 🟢 如果任意勾选了两个或两个以上基础色通道（color, ao, light），自动触发智能通用融合
        if len(base_color_configs) >= 2:
            success, final_name = _perform_generic_composite_core(scene, obj, base_color_configs, selected_passes)
            if success:
                self.report({"INFO"}, f"🎉 多通道自动烘焙完毕，已完美生成融合图: {final_name}")
            else:
                self.report({"WARNING"}, f"烘焙完成，但自动管道融合失败: {final_name}")
        else:
            # 🟢 没有发生融合（可能只勾选了单个通道，或者是法线、粗糙度等通道）
            if selected_passes:
                # 强行提取最后一张烘焙图，显式将其设为 active 并高亮选中！
                # 这一步能让单通道烘焙完后，图像死死锁定在左边的图像编辑器中，绝不“消失”
                last_config = selected_passes[-1]
                last_img = _find_baked_image(obj.name, last_config["image_suffix"])
                if last_img:
                    cowx__tools.set_target_image(scene, last_img)
                    _add_image_to_shader_editor(context, obj, last_img, label=last_img.name, select=True)
            self.report({"INFO"}, "单通道/独立贴图烘焙序列执行完毕。")

        return {"FINISHED"}


class COWX_OT_CompositeAOAndLight(bpy.types.Operator):
    """根据场景中现有的已烘焙单图，智能通用融合基础色通道"""
    bl_idname = "cowx.composite_ao_light"
    bl_label = "融合基础色通道"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        obj = _active_mesh_object(context)
        if obj is None:
            self.report({"WARNING"}, "请先选中一个网格物体。")
            return {"CANCELLED"}

        # 自动检索当前场景里该模型已经烤出来的基础色贴图资产
        available_configs = []
        for c in PASS_CONFIGS:
            if c["image_suffix"] in BASE_COLOR_IMAGE_SUFFIXES:
                if _find_baked_image(obj.name, c["image_suffix"]):
                    available_configs.append(c)
        
        if len(available_configs) < 2:
            self.report({"WARNING"}, "未能在当前模型材质中找到至少两张已烘焙的单图（color/ao/light）用以融合。")
            return {"CANCELLED"}

        success, final_name = _perform_generic_composite_core(context.scene, obj, available_configs, available_configs)
        if not success:
            self.report({"ERROR"}, final_name)
            return {"CANCELLED"}

        self.report({"INFO"}, f"手动触发融合成功，已生成: {final_name}")
        return {"FINISHED"}


class COWX_OT_BakeFinalize(bpy.types.Operator):
    """Clear all materials and build one from selected shader texture nodes."""
    bl_idname = "cowx.bake_finalize"
    bl_label = "完成并创建新材质"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        obj = _active_mesh_object(context)
        if obj is None:
            self.report({"WARNING"}, "请先选中一个网格物体。")
            return {"CANCELLED"}

        stored_suffixes = set(_parse_stored_pass_suffixes(obj.get(LAST_PASS_SUFFIXES_KEY, "")))
        composite_name = obj.get(COMPOSITE_IMAGE_KEY, "")
        baked_images = {
            "Composite": bpy.data.images.get(composite_name) if composite_name else None,
            "Color": _find_baked_image(obj.name, "Color"),
            "AO": _find_baked_image(obj.name, "AO"),
            "Light": _find_baked_image(obj.name, "Light"),
            "Normal": _find_baked_image(obj.name, "Normal"),
            "Roughness": _find_baked_image(obj.name, "Roughness"),
        }

        if stored_suffixes:
            for suffix in ("Color", "AO", "Light", "Normal", "Roughness"):
                if suffix not in stored_suffixes: baked_images[suffix] = None

        if any(baked_images.values()):
            context.view_layer.objects.active = obj
            _clear_material_slots(context, obj)
            material = bpy.data.materials.new(name=f"{obj.name}_Baked")
            material.use_nodes = True
            _build_baked_material(material, baked_images)
            obj.data.materials.append(material)
            self.report({"INFO"}, f"已为 {obj.name} 创建并接入烘焙材质。")
            return {"FINISHED"}

        selected_textures = cowx__tools.get_selected_shader_textures(context)
        if not selected_textures:
            self.report({"WARNING"}, "请先在 Shader Editor 里选中 1 个或多个图片贴图节点。")
            return {"CANCELLED"}

        texture_sources = [
            {"node": n, "image": img, "label": getattr(n, "label", "") or getattr(n, "name", "")}
            for _, n, img in selected_textures if img is not None
        ]
        if not texture_sources:
            self.report({"WARNING"}, "当前选中的节点里没有可用的图片贴图。")
            return {"CANCELLED"}

        context.view_layer.objects.active = obj
        _clear_material_slots(context, obj)
        material = bpy.data.materials.new(name=f"{obj.name}_Baked")
        material.use_nodes = True
        _build_material_from_selected_textures(material, texture_sources)
        obj.data.materials.append(material)
        self.report({"INFO"}, f"已为 {obj.name} 创建新材质，并接入选中的贴图。")
        return {"FINISHED"}


def draw_bake_pipeline_section(layout, context):
    scene = context.scene
    obj = _active_mesh_object(context)
    has_uv = bool(obj and getattr(obj.data, "uv_layers", None) and len(obj.data.uv_layers) > 0)

    bake_box = layout.box()
    bake_box.label(text="多通道烘焙", icon="RENDER_STILL")

    if not obj:
        bake_box.label(text="请先选中一个网格物体", icon="INFO")
    else:
        bake_box.label(text=f"当前对象: {obj.name}", icon="MESH_DATA")

    uv_row = bake_box.row()
    uv_row.enabled = has_uv
    if has_uv:
        uv_row.prop_search(scene, "cowx_bake_uv_layer", obj.data, "uv_layers", text="UV 通道")
    else:
        bake_box.label(text="当前对象没有可用 UV", icon="ERROR")
        uv_row.prop(scene, "cowx_bake_uv_layer", text="UV 通道")

    bake_box.prop(scene, "cowx_bake_resolution", text="贴图分辨率")
    bake_box.prop(scene, "cowx_bake_samples", text="采样数")
    bake_box.prop(scene, "cowx_bake_device", text="烘焙设备")
    bake_box.prop(scene, "cowx_bake_margin", text="边距")
    bake_box.separator()
    
    split = bake_box.split(factor=0.5)
    col_left = split.column()
    col_left.prop(scene, "cowx_bake_pass_combined", text="color")
    col_left.prop(scene, "cowx_bake_pass_ao", text="ao")
    col_left.prop(scene, "cowx_bake_pass_light", text="light")
    col_right = split.column()
    col_right.prop(scene, "cowx_bake_pass_normal", text="normal")
    col_right.prop(scene, "cowx_bake_pass_roughness", text="roughness")

    bake_button = bake_box.column()
    bake_button.enabled = has_uv
    bake_button.operator(COWX_OT_MultiBake.bl_idname, icon="RENDER_STILL")

    finalize_box = layout.box()
    finalize_box.label(text="材质整理", icon="MATERIAL")
    finalize_box.operator(COWX_OT_BakeFinalize.bl_idname, icon="NODE_MATERIAL")

classes = (
    COWX_OT_MultiBake,
    COWX_OT_CompositeAOAndLight,
    COWX_OT_BakeFinalize,
)

def register():
    for cls in classes: bpy.utils.register_class(cls)

def unregister():
    for cls in reversed(classes): bpy.utils.unregister_class(cls)