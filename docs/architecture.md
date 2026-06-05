# Architecture

这个项目已经从单文件入口拆成按职责组织的工程结构。`src/main.ts` 现在负责应用组装、跨模块状态协调、模型导入流程和渲染循环；稳定、可复用、可单独演进的逻辑放到对应模块。

## 目录参考

```text
src/
|-- main.ts
|-- core/
|   |-- camera.ts
|   |-- engine.ts
|   |-- ktx2.ts
|   |-- lights.ts
|   `-- pipeline.ts
|-- features/
|   |-- assets/defaultAssets.ts
|   |-- billboard/billboardController.ts
|   |-- config/configMapping.ts
|   |-- config/viewerConfig.ts
|   |-- config/viewerConfigRuntime.ts
|   |-- details/dynamicDetailsRegistry.ts
|   |-- details/modelDetails.ts
|   |-- details/staticDetails.ts
|   |-- environment/environmentController.ts
|   |-- lightmap/lightmapController.ts
|   |-- lights/lightDirectionHelpers.ts
|   |-- material/materialUtils.ts
|   |-- material/importedMaterialRendering.ts
|   |-- metrics/frameMetrics.ts
|   |-- model/modelIdentity.ts
|   |-- model/modelImportControls.ts
|   |-- model/modelImportUtils.ts
|   |-- model/modelOutline.ts
|   |-- navigation/keyboardNavigation.ts
|   |-- panels/viewerPanels.ts
|   |-- rendering/realtimePanel.ts
|   |-- rendering/realtimeRuntime.ts
|   |-- selection/selectionController.ts
|   `-- share/wechatShare.ts
|-- shared/
|   |-- constants.ts
|   `-- types.ts
|-- ui/
|   |-- controls.ts
|   |-- detailPanel.ts
|   |-- dom.ts
|   `-- outliner.ts
|-- utils/
|   |-- color.ts
|   `-- math.ts
`-- styles/index.css
```

## 模块职责

`main.ts`
: 应用组装层。负责持有 Babylon 实例、当前导入模型集合、全局状态、模型导入、配置保存/恢复、tab 切换和 render loop。新增业务功能不要继续塞到这里，应优先做成 feature controller。

`core/`
: Babylon 基础设施。负责创建或配置 `Engine`、`Scene`、`ArcRotateCamera`、灯光、后处理管线和 KTX2 解码器路径。

`features/`
: 用户可感知的业务功能模块。每个功能尽量以 `createXxxController()` 暴露少量入口，内部保留自己的状态和 DOM 渲染。

`ui/`
: DOM 外壳和通用 UI 控件。该目录不直接依赖模型、材质或渲染运行时状态。

`shared/`
: 多个模块共同使用的常量和 TypeScript 类型。只被单个功能使用的类型应留在对应 feature 内。

`utils/`
: 无 DOM、无 Babylon 场景状态的纯函数工具。

`styles/`
: CSS 入口。后续样式继续膨胀时，可再拆成 `base.css`、`layout.css`、`panels.css`、`controls.css`、`overlays.css`。

## 依赖方向

推荐依赖方向：

```text
main.ts
  -> core/
  -> features/
  -> ui/
  -> shared/
  -> utils/
```

Feature 模块可以依赖 `ui/`、`shared/` 和 `utils/`，也可以依赖 Babylon 类型。任何模块都不要反向导入 `main.ts`。如果多个地方需要同一段逻辑，应先抽到独立模块。

## 当前拆分进度

已完成：

- `core/ktx2.ts`：KTX2 解码器配置。
- `core/engine.ts`、`core/camera.ts`、`core/lights.ts`、`core/pipeline.ts`：Babylon 初始化。
- `features/assets/defaultAssets.ts`：默认 GLB 和 HDR 资源发现。
- `features/config/`：ViewerConfig 类型、配置映射、配置快照创建/恢复和 localStorage 读取。
- `features/lights/lightDirectionHelpers.ts`：灯光方向辅助箭头。
- `features/material/materialUtils.ts`：材质收集、透明材质识别。
- `features/material/importedMaterialRendering.ts`：导入材质的玻璃、透明裁切、深度写入等渲染规范化。
- `features/details/`：网格、材质、相机、灯光、World、管线等静态/动态详情面板 descriptor 注册。
- `features/environment/environmentController.ts`：HDR 环境贴图加载、环境背景天空盒、旋转和环境强度状态。
- `features/model/`：模型签名、mesh/material key、导入按钮控件、导入进度、bounds、烘焙地面识别、outline 节点创建。
- `features/selection/selectionController.ts`：点击拾取、选中包围盒、聚焦动画。
- `features/navigation/keyboardNavigation.ts`：WASD/QE 导航、Escape 清选、Delete 删除快捷键。
- `features/metrics/frameMetrics.ts`：帧性能统计覆盖层。
- `features/share/wechatShare.ts`：微信二维码分享。
- `features/billboard/billboardController.ts`：广告牌贴图、序列帧切换、广告牌面板。
- `features/lightmap/lightmapController.ts`：光照贴图目标分组、材质去共享、贴图应用、烘焙面板。
- `features/rendering/`：实时渲染 runtime、阴影、SSAO、SSR 管线状态和面板。
- `features/panels/viewerPanels.ts`：通用环境/后期面板、视口相机/广告牌 tab 外壳。
- `ui/`：DOM 外壳、通用控件、详情面板、outliner。
- `shared/` 和 `utils/`：公共常量、共享类型、颜色和数学 helper。
- `styles/index.css`：CSS 入口。

## 后续拆分建议

- 模型导入、模型注册、outline 节点创建：继续收敛到 `features/model/`。
- 材质详情面板和调参工作流：继续收敛到 `features/material/`。
- 实时渲染面板、SSAO/SSR/shadow 状态：可以拆到 `features/rendering/`。
- 通用/视口面板：可以拆成 `features/panels/` 或更细的 `ui/panels/`。

每完成一轮拆分都运行 `npm run build`。当前项目开启了严格未使用检查，旧导入和未使用变量会在构建阶段暴露。
