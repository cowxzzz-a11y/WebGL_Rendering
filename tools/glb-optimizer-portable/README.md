# 便携 GLB 优化工具

双击 `Start-GLB-Optimizer.vbs` 打开界面。VBS 会隐藏 PowerShell 控制台，只显示工具窗口。

这个文件夹是 Windows 便携版。把整个 `glb-optimizer-portable` 文件夹复制到任意 Windows 电脑、任意路径后运行即可。

已包含：

- `node.exe`
- glTF-Transform CLI 4.4.1
- Draco、Meshopt、Sharp 和相关 npm 依赖
- `bin/` 里的 KTX-Software 命令行工具

常用选择：

- `几何压缩 = meshopt`：适合支持 `EXT_meshopt_compression` 的现代 WebGL 引擎。
- `几何压缩 = draco`：几何压缩率好，但运行时需要 Draco 解码支持。
- `几何压缩 = quantize`：只做量化，不使用 Draco 或 Meshopt 压缩扩展。
- `纹理格式 = webp`：适合减小 GLB 传输体积。
- `纹理格式 = ktx2`：适合优化 GPU 显存和加载性能，运行时需要 KTX2/Basis 支持。

界面内部调用：

```powershell
node app\node_modules\@gltf-transform\cli\bin\cli.js optimize input.glb output.glb
```

并附加界面里选择的参数。
