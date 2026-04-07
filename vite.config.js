import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    entries: ["index.html", "src/**/*.js"],
    exclude: [
      "canvas-capture",
      "@lookingglass/webxr",
      "@monogrid/gainmap-js/encode",
      "three-mesh-bvh",
      "three-mesh-bvh/worker",
    ],
  },
  server: {
    watch: {
      ignored: ["**/案例——请抄袭它两/**"],
    },
  },
});
