import * as THREE from "three";

import { rippleVertexShader } from "./vertex.glsl.js";
import { rippleFragmentShader } from "./fragment.glsl.js";

export function createRippleMaterial(sourceMaterial) {
  const colorA = sourceMaterial?.color
    ? sourceMaterial.color.clone()
    : new THREE.Color("#f4b4a8");
  const colorB = colorA.clone().offsetHSL(-0.08, 0.08, -0.12);

  const material = new THREE.ShaderMaterial({
    vertexShader: rippleVertexShader,
    fragmentShader: rippleFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: colorA },
      uColorB: { value: colorB },
      uLightDirection: { value: new THREE.Vector3(0.4, 1, 0.6).normalize() },
      uWaveScale: { value: 12 },
      uSpeed: { value: 1.2 },
      uFresnelPower: { value: 3.2 },
      uGlow: { value: 0.28 },
    },
  });

  material.userData = material.userData || {};
  material.userData.materialPreset = "shader-ripple";
  material.userData.shaderLabel = "Shadertoy 风格波纹";

  return material;
}
