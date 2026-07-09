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
_outliner_sync_pending = False
_active_object_poll_running = False


def _show_active_object_in_outliners():
    global _outliner_sync_pending
    _outliner_sync_pending = False

    context = bpy.context
    obj = getattr(context, "active_object", None)
    wm = getattr(context, "window_manager", None)
    if obj is None or wm is None:
        return None

    for window in wm.windows:
        screen = window.screen
        if screen is None:
            continue
        for area in screen.areas:
            if area.type != "OUTLINER":
                continue

            region = next((r for r in area.regions if r.type == "WINDOW"), None)
            if region is None:
                continue

            try:
                with context.temp_override(
                    window=window,
                    screen=screen,
                    area=area,
                    region=region,
                    space_data=area.spaces.active,
                ):
                    bpy.ops.outliner.show_active()
                area.tag_redraw()
            except Exception as exc:
                print(f"Cowx: failed to sync Outliner to active object: {exc}")

    return None


def _schedule_outliner_sync():
    global _outliner_sync_pending
    if _outliner_sync_pending:
        return
    _outliner_sync_pending = True
    bpy.app.timers.register(_show_active_object_in_outliners, first_interval=0.05)


def _handle_active_object_change():
    global _last_active_obj
    context = bpy.context
    obj = getattr(context, "active_object", None)
    if obj == _last_active_obj:
        return

    if obj and obj.type == "MESH":
        _auto_set_uv(context.scene, obj)

    _last_active_obj = obj
    if obj:
        _schedule_outliner_sync()


def _active_object_poll_timer():
    if not _active_object_poll_running:
        return None

    _handle_active_object_change()
    return 0.25


@persistent
def _on_depsgraph_update(scene):
    _handle_active_object_change()


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
    bl_description = "自动连接选中的图像纹理节点（或名称含AO的节点）至 glTF AO (遮挡) 输出，支持多物体批量"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return any(o.type == "MESH" for o in context.selected_objects)

    def execute(self, context):
        selected_meshes = [o for o in context.selected_objects if o.type == 'MESH']
        if not selected_meshes:
            self.report({"WARNING"}, "请选择至少一个网格物体")
            return {"CANCELLED"}

        connected_count = 0
        skipped_count = 0

        for obj in selected_meshes:
            # 1. Determine UV Map name
            uv_name = ""
            if obj.data.uv_layers:
                if len(obj.data.uv_layers) >= 2:
                    uv_name = obj.data.uv_layers[1].name
                else:
                    uv_name = obj.data.uv_layers[0].name
            if not uv_name:
                uv_name = context.scene.cowx_bake_uv_layer

            # 2. Find the AO image on this object's materials
            ao_image = None
            
            # Check slots
            for slot in obj.material_slots:
                mat = slot.material
                if not mat or not mat.use_nodes or not mat.node_tree:
                    continue
                
                nodes = mat.node_tree.nodes
                
                # Priority 1: active node if it's image and has image
                active_node = nodes.active
                if active_node and active_node.type == 'TEX_IMAGE' and active_node.image:
                    ao_image = active_node.image
                    break
                    
                # Priority 2: selected image node
                for n in nodes:
                    if n.type == 'TEX_IMAGE' and n.select and n.image:
                        ao_image = n.image
                        break
                if ao_image:
                    break
                    
                # Priority 3: any node with AO in image name or node name
                for n in nodes:
                    if n.type == 'TEX_IMAGE' and n.image:
                        img_name = n.image.name.upper()
                        node_name = n.name.upper()
                        if 'AO' in img_name or 'AO' in node_name:
                            ao_image = n.image
                            break
                if ao_image:
                    break
            
            if not ao_image:
                skipped_count += 1
                continue

            # 3. For all materials of this object, find/create the image node and connect it
            handled_mats = set()
            for slot in obj.material_slots:
                target_mat = slot.material
                if target_mat is None or not target_mat.use_nodes or target_mat.node_tree is None:
                    continue
                if target_mat.name in handled_mats:
                    continue
                handled_mats.add(target_mat.name)

                # Search if target_mat already has a ShaderNodeTexImage referencing `ao_image`
                target_img_node = None
                for node in target_mat.node_tree.nodes:
                    if node.type == 'TEX_IMAGE' and node.image == ao_image:
                        target_img_node = node
                        break

                # If not found, try to find any image node with "AO" in name/image name to reuse
                if target_img_node is None:
                    for node in target_mat.node_tree.nodes:
                        if node.type == 'TEX_IMAGE' and node.image:
                            img_name = node.image.name.upper()
                            node_name = node.name.upper()
                            if 'AO' in img_name or 'AO' in node_name:
                                target_img_node = node
                                target_img_node.image = ao_image
                                break

                # If still not found, create a new Image Texture node and assign `ao_image`
                if target_img_node is None:
                    target_img_node = target_mat.node_tree.nodes.new(type="ShaderNodeTexImage")
                    target_img_node.image = ao_image
                    target_img_node.location = (-300, 0)

                # Perform connection
                try:
                    self._connect_nodes(target_mat, target_img_node, uv_name)
                    connected_count += 1
                except Exception as e:
                    self.report({"WARNING"}, f"物体 {obj.name} 材质 {target_mat.name} 连接失败: {e}")

        # Summary reports
        if connected_count > 0:
            self.report({"INFO"}, f"AO节点已在 {connected_count} 个材质中自动连接完成")
        if skipped_count > 0:
            self.report({"WARNING"}, f"有 {skipped_count} 个物体未找到AO贴图，已跳过")
            
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

class COWX_OT_FixNormals(bpy.types.Operator):
    bl_idname = "cowx.fix_normals"
    bl_label = "修复法线"
    bl_description = "通过极简几何启发式规则，自动修复选中模型的所有反转（红色）面法线"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return any(o.type == "MESH" for o in context.selected_objects)

    def execute(self, context):
        selected_meshes = [o for o in context.selected_objects if o.type == 'MESH']
        if not selected_meshes:
            self.report({"WARNING"}, "请选择至少一个网格物体")
            return {"CANCELLED"}

        import bmesh
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree

        orig_active = context.view_layer.objects.active
        orig_mode = orig_active.mode if orig_active else 'OBJECT'

        total_flipped = 0

        for obj in selected_meshes:
            if obj.mode != 'OBJECT':
                bpy.ops.object.mode_set(mode='OBJECT')

            mesh = obj.data

            # Create bmesh and BVH tree
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bm.faces.ensure_lookup_table()
            bvh = BVHTree.FromBMesh(bm, epsilon=0.0001)

            # Calculate local geometric center of the mesh
            if bm.verts:
                local_center = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
            else:
                local_center = Vector((0, 0, 0))

            faces_to_flip = set()

            for face in bm.faces:
                N = face.normal
                center = face.calc_center_median()

                # Check if face is mostly horizontal
                is_horizontal = abs(N.z) > 0.5

                if is_horizontal:
                    # Cast ray straight UP (+Z) in local space
                    start_up = center + 0.001 * Vector((0, 0, 1))
                    _, _, _, dist_up = bvh.ray_cast(start_up, Vector((0, 0, 1)))
                    d_up = dist_up if dist_up is not None else float('inf')

                    # Cast ray straight DOWN (-Z) in local space
                    start_down = center - 0.001 * Vector((0, 0, 1))
                    _, _, _, dist_down = bvh.ray_cast(start_down, Vector((0, 0, -1)))
                    d_down = dist_down if dist_down is not None else float('inf')

                    # Ceiling判定：上方极近距离有顶挡住（< 0.4m）且下方空旷（> 1.0m），法线应朝下 (z < 0)
                    is_ceiling = (d_up < 0.4) and (d_down > 1.0)

                    if is_ceiling:
                        if N.z > 0.0:
                            faces_to_flip.add(face.index)
                    else:
                        # 地板、窗台板、屋顶：法线一律朝上 (z > 0)
                        if N.z < 0.0:
                            faces_to_flip.add(face.index)
                else:
                    # Vertical face (walls, side panels)
                    # Cast ray along normal (Side A)
                    start_A = center + 0.001 * N
                    _, _, _, dist_A = bvh.ray_cast(start_A, N)
                    d_A = dist_A if dist_A is not None else float('inf')

                    # Cast ray opposite to normal (Side B)
                    start_B = center - 0.001 * N
                    _, _, _, dist_B = bvh.ray_cast(start_B, -N)
                    d_B = dist_B if dist_B is not None else float('inf')

                    if d_A != d_B:
                        # One side hits something closer, indicating it points inwards
                        if d_A < d_B:
                            faces_to_flip.add(face.index)
                    else:
                        # Both sides go to infinity (e.g., floating vertical plate)
                        # We point the normal outwards from the geometric center of the object
                        vector_from_center = center - local_center
                        # Project onto XY plane for vertical faces comparison
                        vector_from_center.z = 0.0
                        N_xy = Vector((N.x, N.y, 0.0))
                        
                        if N_xy.length > 0.001 and vector_from_center.length > 0.001:
                            if N_xy.dot(vector_from_center) < -0.01:
                                faces_to_flip.add(face.index)

            flipped_count = len(faces_to_flip)
            if flipped_count > 0:
                for idx in faces_to_flip:
                    bm.faces[idx].normal_flip()
                bm.to_mesh(mesh)
                total_flipped += flipped_count
            
            bm.free()
            mesh.update()

        # Restore original active object and mode
        if orig_active:
            context.view_layer.objects.active = orig_active
            try:
                bpy.ops.object.mode_set(mode=orig_mode)
            except:
                pass

        if total_flipped > 0:
            self.report({"INFO"}, f"法线修复完成！共反转了 {total_flipped} 个红色面")
        else:
            self.report({"INFO"}, "未检测到需要修复的红色面")

        return {"FINISHED"}


class COWX_OT_FlipNormals(bpy.types.Operator):
    bl_idname = "cowx.flip_normals"
    bl_label = "法线反转"
    bl_description = "反转选中的面法线（编辑模式下反转选区，物体模式下反转整个网格）"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return any(o.type == "MESH" for o in context.selected_objects)

    def execute(self, context):
        selected_meshes = [o for o in context.selected_objects if o.type == 'MESH']
        if not selected_meshes:
            self.report({"WARNING"}, "请选择至少一个网格物体")
            return {"CANCELLED"}

        active_obj = context.active_object
        
        # If in Edit Mode, run the flip operator on the active mesh
        if active_obj and active_obj.mode == 'EDIT':
            try:
                bpy.ops.mesh.flip_normals()
                self.report({"INFO"}, "已反转选中面的法线朝向")
            except Exception as e:
                self.report({"ERROR"}, f"法线反转失败: {e}")
                return {"CANCELLED"}
        else:
            # If in Object Mode, flip all normals of selected meshes
            orig_active = context.view_layer.objects.active
            total_flipped = 0
            
            for o in selected_meshes:
                context.view_layer.objects.active = o
                try:
                    bpy.ops.object.mode_set(mode='EDIT')
                    bpy.ops.mesh.select_all(action='SELECT')
                    bpy.ops.mesh.flip_normals()
                    bpy.ops.object.mode_set(mode='OBJECT')
                    total_flipped += 1
                except Exception as e:
                    self.report({"WARNING"}, f"物体 {o.name} 反转失败: {e}")
                    try:
                        bpy.ops.object.mode_set(mode='OBJECT')
                    except:
                        pass
            
            if orig_active:
                context.view_layer.objects.active = orig_active
            
            self.report({"INFO"}, f"已反转 {total_flipped} 个物体的全部法线")

        return {"FINISHED"}


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


class COWX_OT_GroupObjects(bpy.types.Operator):
    bl_idname = "cowx.group_objects"
    bl_label = "快速打组"
    bl_description = "将选中的物体打组（创建空物体作为父级并居于中心）"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return len(context.selected_objects) > 0

    def execute(self, context):
        import bpy
        from mathutils import Vector, Matrix

        selected_objs = list(context.selected_objects)
        if not selected_objs:
            self.report({"WARNING"}, "请选择至少一个物体")
            return {"CANCELLED"}

        def collection_in_view_layer(layer_collection, collection):
            if layer_collection.collection == collection:
                return True
            return any(
                collection_in_view_layer(child, collection)
                for child in layer_collection.children
            )

        active_obj = context.view_layer.objects.active
        collection_owner = active_obj if active_obj in selected_objs else selected_objs[0]
        target_collection = None
        for coll in collection_owner.users_collection:
            if collection_in_view_layer(context.view_layer.layer_collection, coll):
                target_collection = coll
                break
        if (
            target_collection is None
            and context.collection
            and collection_in_view_layer(context.view_layer.layer_collection, context.collection)
        ):
            target_collection = context.collection
        if target_collection is None:
            target_collection = context.scene.collection

        geometry_types = {"MESH", "CURVE", "SURFACE", "FONT", "META"}

        def iter_object_tree(obj):
            yield obj
            for child in obj.children:
                yield from iter_object_tree(child)

        def iter_geometry_objects(objects):
            seen = set()
            for root in objects:
                for obj in iter_object_tree(root):
                    ptr = obj.as_pointer()
                    if ptr in seen:
                        continue
                    seen.add(ptr)
                    if obj.type in geometry_types and getattr(obj, "bound_box", None):
                        yield obj

        def normalize_mesh_origin(obj):
            if obj.type != "MESH" or obj.data is None or not obj.bound_box:
                return

            world_matrix = obj.matrix_world.copy()
            corners = [world_matrix @ Vector(corner) for corner in obj.bound_box]
            min_coords = Vector((
                min(c.x for c in corners),
                min(c.y for c in corners),
                min(c.z for c in corners),
            ))
            max_coords = Vector((
                max(c.x for c in corners),
                max(c.y for c in corners),
                max(c.z for c in corners),
            ))
            world_center = (min_coords + max_coords) / 2
            local_center = world_matrix.inverted() @ world_center

            if local_center.length < 0.000001:
                return

            if obj.data.users > 1:
                obj.data = obj.data.copy()
            obj.data.transform(Matrix.Translation(-local_center))
            obj.data.update()
            obj.matrix_world = world_matrix @ Matrix.Translation(local_center)

        def move_empty_origin(obj, world_location):
            if obj.type != "EMPTY":
                return

            children_world = {
                child: child.matrix_world.copy()
                for child in iter_object_tree(obj)
                if child != obj
            }
            matrix = obj.matrix_world.copy()
            if (matrix.translation - world_location).length < 0.000001:
                return

            matrix.translation = world_location
            obj.matrix_world = matrix
            context.view_layer.update()
            for child, child_world in children_world.items():
                child.matrix_world = child_world

        geometry_objs = list(iter_geometry_objects(selected_objs))

        # 1. 计算真实模型几何中心，忽略 Empty 的原点位置
        world_corners = []
        for obj in geometry_objs:
            try:
                for corner in obj.bound_box:
                    world_corners.append(obj.matrix_world @ Vector(corner))
            except AttributeError:
                pass

        if not world_corners:
            for obj in selected_objs:
                world_corners.append(obj.matrix_world.translation)
        
        if not world_corners:
            self.report({"WARNING"}, "未找到有效的物体来计算中心点")
            return {"CANCELLED"}
            
        min_coords = Vector((min(c.x for c in world_corners), min(c.y for c in world_corners), min(c.z for c in world_corners)))
        max_coords = Vector((max(c.x for c in world_corners), max(c.y for c in world_corners), max(c.z for c in world_corners)))
        center = (min_coords + max_coords) / 2

        # 2. 创建 Empty 物体 (Plain Axes)
        empty_obj = bpy.data.objects.new("Group", None)
        empty_obj.empty_display_type = 'PLAIN_AXES'

        target_collection.objects.link(empty_obj)

        # 设置位置与世界矩阵
        empty_obj.location = center
        empty_obj.matrix_world = Matrix.Translation(center)

        for obj in selected_objs:
            move_empty_origin(obj, center)
        for obj in geometry_objs:
            normalize_mesh_origin(obj)
        context.view_layer.update()
        world_matrices = {obj: obj.matrix_world.copy() for obj in selected_objs}

        # Keep grouped objects in the same collection as the group Empty.
        # This avoids duplicated-looking entries in the Outliner root.
        for obj in selected_objs:
            if target_collection.objects.get(obj.name) is None:
                target_collection.objects.link(obj)
            for coll in list(obj.users_collection):
                if coll != target_collection:
                    coll.objects.unlink(obj)

        # 3. 建立父子绑定并保持变换
        for obj in selected_objs:
            obj.parent = empty_obj
            obj.matrix_parent_inverse = empty_obj.matrix_world.inverted()
            obj.matrix_world = world_matrices[obj]

        # 4. 更新选择：取消选中子物体，激活并选中空物体
        for obj in selected_objs:
            obj.select_set(False)

        # 使用 context.view_layer.objects.active 设置活动对象
        # select_set 在对象链接到根集合后可安全调用
        context.view_layer.update()
        context.view_layer.objects.active = empty_obj
        empty_obj.select_set(True)

        screen = getattr(context, "screen", None)
        if screen:
            for area in screen.areas:
                if area.type != "VIEW_3D":
                    continue
                for space in area.spaces:
                    if space.type == "VIEW_3D" and hasattr(space.overlay, "show_relationship_lines"):
                        space.overlay.show_relationship_lines = False

        self.report({"INFO"}, f"成功打组 {len(selected_objs)} 个物体")
        return {"FINISHED"}


class COWX_PT_BakePanel(bpy.types.Panel):
    bl_label = "Cowx 烘焙工具"
    bl_idname = "COWX_PT_BakePanel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Cowx"

    @classmethod
    def poll(cls, context):
        return True

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
        layout.separator(factor=1.5)
        
        # AO Group
        box_ao = layout.box()
        box_ao.label(text="AO 辅助工具", icon="NODE_MATERIAL")
        box_ao.operator("cowx.connect_ao", icon="LINKED", text="连接AO")
        
        # Normals Group
        box_normals = layout.box()
        box_normals.label(text="法线工具", icon="MOD_NORMALEDIT")
        box_normals.operator("cowx.fix_normals", icon="AUTO", text="自动修复法线")
        box_normals.operator("cowx.flip_normals", icon="TRACKING_BACKWARDS", text="法线反转 (Flip)")

        # System Group
        box_sys = layout.box()
        box_sys.label(text="系统工具", icon="SYSTEM")
        box_sys.operator("cowx.group_objects", icon="EMPTY_AXIS", text="快速打组")
        box_sys.operator("cowx.purge_unused", icon="TRASH", text="清理")


classes = (
    COWX_OT_SmartIsolate,
    COWX_OT_Bake,
    COWX_OT_ConnectAO,
    COWX_OT_FixNormals,
    COWX_OT_FlipNormals,
    COWX_OT_PurgeUnused,
    COWX_OT_GroupObjects,
    COWX_PT_BakePanel,
)

_addon_keymaps = []


def register():
    global _active_object_poll_running

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

    _active_object_poll_running = True
    try:
        if not bpy.app.timers.is_registered(_active_object_poll_timer):
            bpy.app.timers.register(_active_object_poll_timer, first_interval=0.25, persistent=True)
    except Exception as exc:
        print(f"Cowx: failed to start active object polling: {exc}")

    try:
        kc = bpy.context.window_manager.keyconfigs.addon
        if kc:
            km = kc.keymaps.new(name="3D View", space_type="VIEW_3D")
            kmi = km.keymap_items.new("cowx.smart_isolate", type="Q", value="PRESS", alt=True)
            _addon_keymaps.append((km, kmi))
    except:
        pass


def unregister():
    global _active_object_poll_running, _outliner_sync_pending

    _active_object_poll_running = False
    _outliner_sync_pending = False
    try:
        if bpy.app.timers.is_registered(_active_object_poll_timer):
            bpy.app.timers.unregister(_active_object_poll_timer)
    except Exception as exc:
        print(f"Cowx: failed to stop active object polling: {exc}")

    try:
        if bpy.app.timers.is_registered(_show_active_object_in_outliners):
            bpy.app.timers.unregister(_show_active_object_in_outliners)
    except Exception:
        pass

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
