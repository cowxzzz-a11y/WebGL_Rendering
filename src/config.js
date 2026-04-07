import { CUSTOM_SHADER_PRESET_OPTIONS } from "./shaders/index.js";

export const DEFAULT_SCENE_PATH = new URL("../assets/scene.glb", import.meta.url).href;
export const DEFAULT_TEA_PATH = "./assets/tea.glb";
export const DEFAULT_HDR_PATH = new URL(
  "../assets/studio_small_09_4k.hdr",
  import.meta.url
).href;

export const MATERIAL_PRESET_OPTIONS = [
  { value: "original", label: "原始材质" },
  { value: "basic", label: "MeshBasicMaterial" },
  { value: "lambert", label: "MeshLambertMaterial" },
  { value: "phong", label: "MeshPhongMaterial" },
  { value: "standard", label: "MeshStandardMaterial" },
  { value: "physical", label: "MeshPhysicalMaterial" },
  ...CUSTOM_SHADER_PRESET_OPTIONS,
];
