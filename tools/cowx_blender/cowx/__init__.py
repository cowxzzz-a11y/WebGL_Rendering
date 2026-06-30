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


def _place_images_on_materials(obj, images, saved_nodes):
    handled = set()
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes or mat.node_tree is None:
            continue
        if mat.as_pointer() in handled:
            continue
        handled.add(mat.as_pointer())
        for img in images:
            if not img:
                continue
            
            matched_base = None
            import re
            for base in saved_nodes.keys():
                pat = re.compile(rf"^{re.escape(base)}(?:_(\d{{3}}))?$")
                if pat.match(img.name):
                    matched_base = base
                    break
                    
            node_updated = False
            if matched_base:
                for saved_mat_name, saved_node_name in saved_nodes[matched_base]:
                    if saved_mat_name == mat.name:
                        node = mat.node_tree.nodes.get(saved_node_name)
                        if node and node.type == 'TEX_IMAGE':
                            node.image = img
                            node_updated = True
                            break
                            
            if not node_updated:
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
def _clear_existing_images(obj_name, passes, obj):
    import re
    deleted_any = False
    target_bases = []
    for cfg in passes:
        target_bases.append(f"{obj_name}_{cfg['suffix']}")
        
    base_configs = [c for c in passes if _is_base_pass(c)]
    if len(base_configs) >= 2:
        labels = [c["label"] for c in base_configs]
        target_bases.append(f"{obj_name}_{'_'.join(labels)}")
        
    # Walk through materials of the object to find existing texture nodes using these images
    saved_nodes = {}
    for base in target_bases:
        saved_nodes[base] = []
        
    handled_mats = set()
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes or mat.node_tree is None:
            continue
        if mat.name in handled_mats:
            continue
        handled_mats.add(mat.name)
        
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                for base in target_bases:
                    pat = re.compile(rf"^{re.escape(base)}(?:_(\d{{3}}))?$")
                    if pat.match(node.image.name):
                        saved_nodes[base].append((mat.name, node.name))
                        break
                        
    to_delete = []
    for base in target_bases:
        pat = re.compile(rf"^{re.escape(base)}(?:_(\d{{3}}))?$")
        for img in bpy.data.images:
            if pat.match(img.name):
                to_delete.append(img)
                
    for img in to_delete:
        try:
            if img.name in bpy.data.images:
                bpy.data.images.remove(img)
                deleted_any = True
        except Exception as e:
            print(f"Error removing image {img.name}: {e}")
            
    if deleted_any:
        try:
            bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
        except Exception as e:
            try:
                bpy.ops.outliner.orphans_purge()
            except Exception as e2:
                print(f"Failed to purge orphans: {e2}")
                
    return saved_nodes


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
        orig_active = context.view_layer.objects.active
        orig_selected = list(context.selected_objects)

        # Get all selected mesh objects
        selected_meshes = [o for o in orig_selected if o.type == 'MESH']
        if not selected_meshes:
            self.report({"WARNING"}, "请选择至少一个网格物体")
            return {"CANCELLED"}

        if not bpy.app.build_options.cycles:
            self.report({"ERROR"}, "当前 Blender 未启用 Cycles")
            return {"CANCELLED"}

        passes = _collect_passes(scene)
        if not passes:
            self.report({"WARNING"}, "请至少选择一个烘焙通道")
            return {"CANCELLED"}

        restore_global = {
            "engine": scene.render.engine,
            "samples": scene.cycles.samples if hasattr(scene, "cycles") else 0,
            "device": scene.cycles.device if hasattr(scene, "cycles") else None,
            "margin": scene.render.bake.margin,
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

        total_count = len(selected_meshes)
        self.report({"INFO"}, f"开始批量烘焙，共 {total_count} 个物体...")

        for idx, obj in enumerate(selected_meshes):
            self.report({"INFO"}, f"正在烘焙 ({idx + 1}/{total_count}): {obj.name}")

            uv = _get_uv_layer(obj, scene)
            if uv is None:
                self.report({"WARNING"}, f"物体 {obj.name} 没有 UV 层，已跳过")
                continue

            restore_obj = {
                "uv": obj.data.uv_layers.active.name if obj.data.uv_layers.active else "",
                "mode": obj.mode,
            }

            # Select ONLY this object
            for o in context.view_layer.objects:
                try:
                    o.select_set(False)
                except:
                    pass
            obj.select_set(True)
            context.view_layer.objects.active = obj

            if obj.mode != "OBJECT":
                try:
                    bpy.ops.object.mode_set(mode="OBJECT")
                except:
                    pass

            obj.data.uv_layers.active = uv

            saved_nodes = _clear_existing_images(obj.name, passes, obj)

            res = int(scene.cowx_bake_resolution)

            bake_success = True
            for i, cfg in enumerate(passes):
                self.report({"INFO"}, f"物体 {obj.name} 烘焙 ({i + 1}/{len(passes)}): {cfg['label']}")
                img = _make_image(obj.name, cfg, res)
                _assign_to_materials(obj, img)
                bpy.ops.wm.redraw_timer(type="DRAW_WIN_SWAP", iterations=1)
                try:
                    bpy.ops.object.bake(type=cfg["bake_type"], **cfg["bake_kwargs"])
                except Exception as e:
                    self.report({"ERROR"}, f"{obj.name} 的 {cfg['label']} 烘焙失败: {e}")
                    bake_success = False
                    break

            _clean_bake_nodes(obj)

            if not bake_success:
                # Restore UV and mode
                old_uv = obj.data.uv_layers.get(restore_obj["uv"])
                if old_uv:
                    obj.data.uv_layers.active = old_uv
                if obj.mode != restore_obj["mode"]:
                    try:
                        bpy.ops.object.mode_set(mode=restore_obj["mode"])
                    except:
                        pass
                continue

            base_configs = [c for c in passes if _is_base_pass(c)]
            other_configs = [c for c in passes if not _is_base_pass(c)]

            final_images = []
            if len(base_configs) >= 2:
                comp_img, msg = _composite_passes(scene, obj, base_configs)
                if comp_img:
                    self.report({"INFO"}, f"融合完成: {msg}")
                    _place_images_on_materials(obj, [comp_img], saved_nodes)
                    final_images.append(comp_img)
                else:
                    self.report({"WARNING"}, msg)
                    imgs = [_find_image(obj.name, cfg["suffix"]) for cfg in base_configs]
                    imgs = [im for im in imgs if im]
                    _place_images_on_materials(obj, imgs, saved_nodes)
                    final_images.extend(imgs)
            elif len(base_configs) == 1:
                img = _find_image(obj.name, base_configs[0]["suffix"])
                if img:
                    _place_images_on_materials(obj, [img], saved_nodes)
                    final_images.append(img)

            other_imgs = []
            for cfg in other_configs:
                img = _find_image(obj.name, cfg["suffix"])
                if img:
                    other_imgs.append(img)
            if other_imgs:
                _place_images_on_materials(obj, other_imgs, saved_nodes)
                final_images.extend(other_imgs)

            # Pack final images immediately to save in blend file memory
            for img in final_images:
                if img:
                    try:
                        img.update()
                        if img.packed_file:
                            img.unpack(method='REMOVE')
                        img.pack()
                    except Exception as e:
                        self.report({"WARNING"}, f"打包图像 {img.name} 失败: {e}")

            # Restore UV and mode
            old_uv = obj.data.uv_layers.get(restore_obj["uv"])
            if old_uv:
                obj.data.uv_layers.active = old_uv
            if obj.mode != restore_obj["mode"]:
                try:
                    bpy.ops.object.mode_set(mode=restore_obj["mode"])
                except:
                    pass

        # Restore global settings
        scene.render.engine = restore_global["engine"]
        scene.render.bake.margin = restore_global["margin"]
        if hasattr(scene, "cycles"):
            scene.cycles.samples = restore_global["samples"]
            if restore_global["device"]:
                scene.cycles.device = restore_global["device"]

        # Restore selection
        for o in context.view_layer.objects:
            try:
                o.select_set(False)
            except:
                pass
        for o in orig_selected:
            try:
                o.select_set(True)
            except:
                pass
        if orig_active:
            try:
                context.view_layer.objects.active = orig_active
            except:
                pass

        self.report({"INFO"}, "所有选择的物体烘焙完成")
        return {"FINISHED"}


class COWX_OT_ConnectAO(bpy.types.Operator):
    bl_idname = "cowx.connect_ao"
    bl_label = "连接AO"
    bl_description = "自动连接选中的图像纹理节点至 glTF AO (遮挡) 输出，同时自动应用到模型的所有材质上"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        obj = context.active_object
        return obj and obj.type == "MESH" and obj.active_material and obj.active_material.use_nodes

    def execute(self, context):
        obj = context.active_object
        mat = obj.active_material
        if not mat or not mat.use_nodes or not mat.node_tree:
            self.report({"WARNING"}, "当前材质未启用节点")
            return {"CANCELLED"}

        nodes = mat.node_tree.nodes
        img_node = nodes.active

        # If active node is not image texture, try to find a selected one
        if not img_node or img_node.type != 'TEX_IMAGE':
            img_nodes = [n for n in nodes if n.select and n.type == 'TEX_IMAGE']
            if img_nodes:
                img_node = img_nodes[0]
            else:
                self.report({"WARNING"}, "请在材质中先选中要连接的图像纹理节点")
                return {"CANCELLED"}

        # Ensure image is loaded in the node
        img = img_node.image
        if not img:
            self.report({"WARNING"}, "选中的图像纹理节点中没有加载图像")
            return {"CANCELLED"}

        # Determine UV Map name
        uv_name = ""
        if obj and obj.type == "MESH" and obj.data.uv_layers:
            if len(obj.data.uv_layers) >= 2:
                uv_name = obj.data.uv_layers[1].name
            else:
                uv_name = obj.data.uv_layers[0].name
        if not uv_name:
            uv_name = context.scene.cowx_bake_uv_layer

        # Walk through all materials of the object
        handled_mats = set()
        connected_count = 0
        for slot in obj.material_slots:
            target_mat = slot.material
            if target_mat is None or not target_mat.use_nodes or target_mat.node_tree is None:
                continue
            if target_mat.name in handled_mats:
                continue
            handled_mats.add(target_mat.name)

            # Search if target_mat already has a ShaderNodeTexImage referencing `img`
            target_img_node = None
            for node in target_mat.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image == img:
                    target_img_node = node
                    break

            # If not found, create a new Image Texture node and assign `img`
            if target_img_node is None:
                target_img_node = target_mat.node_tree.nodes.new(type="ShaderNodeTexImage")
                target_img_node.image = img
                target_img_node.location = (img_node.location.x, img_node.location.y)

            # Perform connection
            try:
                self._connect_nodes(target_mat, target_img_node, uv_name)
                connected_count += 1
            except Exception as e:
                self.report({"WARNING"}, f"材质 {target_mat.name} 连接失败: {e}")

        self.report({"INFO"}, f"AO节点已在 {connected_count} 个材质中自动连接完成")
        return {"FINISHED"}

    def _connect_nodes(self, mat, img_node, uv_name):
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links

        # 1. UV Map node
        uv_node = None
        if img_node.inputs['Vector'].is_linked:
            linked_node = img_node.inputs['Vector'].links[0].from_node
            if linked_node.type == 'UV_MAP':
                uv_node = linked_node
                
        if uv_node is None:
            uv_node = nodes.new(type="ShaderNodeUVMap")
            uv_node.location = (img_node.location.x - 280, img_node.location.y)
        
        uv_node.uv_map = uv_name
        
        try:
            links.new(uv_node.outputs['UV'], img_node.inputs['Vector'])
        except Exception as e:
            print(f"Error linking UV Map: {e}")

        # 2. Separate Color node
        sep_node = None
        if img_node.outputs['Color'].is_linked:
            for link in img_node.outputs['Color'].links:
                if link.to_node.type == 'SEPARATE_COLOR':
                    sep_node = link.to_node
                    break
                    
        if sep_node is None:
            sep_node = nodes.new(type="ShaderNodeSeparateColor")
            sep_node.location = (img_node.location.x + 280, img_node.location.y)
            
        try:
            links.new(img_node.outputs['Color'], sep_node.inputs['Color'])
        except Exception as e:
            print(f"Error linking Separate Color: {e}")

        # 3. glTF Material Output node
        gltf_node = None
        for n in nodes:
            if n.type == 'GROUP' and n.node_tree and n.node_tree.name == 'glTF Material Output':
                gltf_node = n
                break

        if gltf_node is None:
            import bpy
            group = bpy.data.node_groups.get('glTF Material Output')
            if group is None:
                group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
                if hasattr(group, "interface"):
                    group.interface.new_socket(name="Occlusion", socket_type="NodeSocketColor", in_out="INPUT")
                    group.interface.new_socket(name="Thickness", socket_type="NodeSocketFloat", in_out="INPUT")
                else:
                    group.inputs.new('NodeSocketColor', "Occlusion")
                    group.inputs.new('NodeSocketFloat', "Thickness")
            gltf_node = nodes.new('ShaderNodeGroup')
            gltf_node.node_tree = group
            gltf_node.name = "glTF Material Output"
            gltf_node.label = "glTF Material Output"
            gltf_node.location = (img_node.location.x + 560, img_node.location.y)

        try:
            red_output = sep_node.outputs.get("Red") or sep_node.outputs.get("R") or sep_node.outputs[0]
            occlusion_input = gltf_node.inputs.get("Occlusion") or gltf_node.inputs[0]
            links.new(red_output, occlusion_input)
        except Exception as e:
            print(f"Error linking glTF: {e}")


class COWX_OT_PurgeUnused(bpy.types.Operator):
    bl_idname = "cowx.purge_unused"
    bl_label = "清理"
    bl_description = "清除所有孤立的数据块（如未使用的材质、贴图等）"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        try:
            bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
            self.report({"INFO"}, "清理未使用数据完成")
        except Exception as e:
            try:
                bpy.ops.outliner.orphans_purge()
                self.report({"INFO"}, "清理未使用数据完成")
            except Exception as e2:
                self.report({"ERROR"}, f"清理失败: {e2}")
                return {"CANCELLED"}
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
        if obj and obj.type == "MESH":
            return True
        return any(o.type == "MESH" for o in context.selected_objects)

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        
        # Get active mesh or first selected mesh
        obj = context.active_object
        if not (obj and obj.type == "MESH"):
            mesh_objs = [o for o in context.selected_objects if o.type == "MESH"]
            if mesh_objs:
                obj = mesh_objs[0]

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

        # Get count of selected mesh objects
        selected_meshes = [o for o in context.selected_objects if o.type == 'MESH']
        count = len(selected_meshes)

        layout.separator()
        if count > 1:
            layout.operator("cowx.bake", icon="RENDER_STILL", text=f"开始批量烘焙 (共 {count} 个物体)")
        else:
            layout.operator("cowx.bake", icon="RENDER_STILL", text="开始烘焙")

        # Spacing
        layout.separator(factor=2.0)
        
        # Helper buttons
        layout.operator("cowx.connect_ao", icon="LINKED", text="连接AO")
        layout.operator("cowx.purge_unused", icon="TRASH", text="清理")


classes = (
    COWX_OT_SmartIsolate,
    COWX_OT_Bake,
    COWX_OT_ConnectAO,
    COWX_OT_PurgeUnused,
    COWX_PT_BakePanel,
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
    ]
    for prop in props:
        if hasattr(bpy.types.Scene, prop):
            delattr(bpy.types.Scene, prop)
