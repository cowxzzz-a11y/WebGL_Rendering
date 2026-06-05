# WebGL Rendering Viewer

基于 Babylon.js、Vite、TypeScript 的 3D 模型查看器。项目支持 GLB 加载、HDR 环境光、材质调参、灯光/阴影、后处理、广告牌贴片、光照贴图、分享和帧性能统计。

## 快速开始

```bash
npm install
npm run dev
npm run build
```

`npm run build` 会先执行 TypeScript 类型检查，再通过 Vite 输出生产构建。

## 主要功能

- 模型加载：默认加载内置 GLB，支持替换导入或追加导入用户选择的 `.glb` 文件。
- 场景结构：浏览模型根节点、网格、材质、相机、灯光、环境和渲染管线。
- 材质编辑：支持 PBR 透明度、金属度、粗糙度、颜色、发光、折射、透射、次表面散射和 IOR 等参数。
- 灯光阴影：支持半球光、方向光、实时阴影、方向辅助箭头和阴影质量配置。
- 环境控制：切换内置 HDR 环境，调整背景显示、环境旋转和环境强度。
- 后处理：支持 image processing、FXAA、bloom、sharpen、grain、SSAO2、SSR。
- 广告牌：选择网格平面，加载序列帧贴图，按相机方向切换帧，并支持黑底遮罩。
- 光照贴图：选择烘焙目标组，按 UV 通道应用上传的 lightmap，支持强度调节和清除。
- 视图交互：轨道相机、触控参数、键盘移动、点击选择、聚焦动画和选中包围盒。
- 分享诊断：支持微信二维码分享覆盖层，以及 FPS、draw calls、active meshes、triangles、memory 统计。

## 源码布局

```text
src/
|-- main.ts                  # 应用组装入口，保留高层运行时流程
|-- core/                    # Babylon engine、scene、camera、lights、pipeline、KTX2
|-- features/                # 业务功能模块
|   |-- assets/              # 默认模型和 HDR 资源发现
|   |-- billboard/           # 广告牌运行时和面板
|   |-- config/              # ViewerConfig schema、映射和运行时应用
|   |-- details/             # 静态/动态详情面板描述和注册
|   |-- environment/         # HDR 环境贴图加载、天空盒和环境状态
|   |-- lightmap/            # 光照贴图运行时和烘焙面板
|   |-- lights/              # 灯光辅助工具
|   |-- material/            # 材质识别和工具函数
|   |-- metrics/             # 帧性能统计
|   |-- model/               # 模型标识、导入控件、导入辅助、bounds、outline 节点
|   |-- navigation/          # 键盘导航
|   |-- panels/              # 通用面板和视口面板外壳
|   |-- rendering/           # 实时渲染运行时和面板
|   |-- selection/           # 选择、聚焦、包围盒
|   `-- share/               # 微信分享
|-- shared/                  # 跨模块常量和共享类型
|-- ui/                      # DOM 外壳、通用控件、详情面板、outliner
|-- utils/                   # 纯函数工具
`-- styles/                  # CSS 入口
```

更详细的模块说明见 [docs/architecture.md](docs/architecture.md)。

## 资源说明

- 项目根目录 `assets/` 放源模型资源和离线处理结果，本轮代码拆分不修改这里。
- `src/assets/hdr/` 放前端内置 HDR 环境贴图，通过 `import.meta.glob` 自动发现。
- `tools/` 放离线资产处理脚本，应与运行时应用代码保持独立。
