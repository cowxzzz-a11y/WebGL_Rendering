import { createRippleMaterial, updateRippleMaterial } from "./ripple/index.js";
import { createWaterMaterial, updateWaterMaterial } from "./water/index.js";

export const CUSTOM_SHADER_PRESET_OPTIONS = [
  { value: "shader-ripple", label: "自定义 Shader 波纹" },
  { value: "shader-water", label: "自定义 Shader 流动水" },
];

const CUSTOM_SHADER_DEFINITIONS = {
  "shader-ripple": {
    createMaterial: createRippleMaterial,
    updateMaterial: updateRippleMaterial,
  },
  "shader-water": {
    createMaterial: createWaterMaterial,
    updateMaterial: updateWaterMaterial,
  },
};

export function createCustomShaderMaterial(presetKey, sourceMaterial) {
  return CUSTOM_SHADER_DEFINITIONS[presetKey]?.createMaterial(sourceMaterial) || null;
}

export function updateCustomShaderMaterial(material, app, time) {
  const presetKey = material?.userData?.materialPreset;
  CUSTOM_SHADER_DEFINITIONS[presetKey]?.updateMaterial?.(material, app, time);
}

export function isCustomShaderPreset(presetKey) {
  return presetKey in CUSTOM_SHADER_DEFINITIONS;
}
