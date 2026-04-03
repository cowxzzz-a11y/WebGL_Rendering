import * as THREE from "three";

import { waterVertexShader } from "./vertex.glsl.js";
import { waterFragmentShader } from "./fragment.glsl.js";

export function createWaterMaterial() {
  const material = new THREE.ShaderMaterial({
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color("#0f5f7b") },
      uShallowColor: { value: new THREE.Color("#66d9ff") },
      uHighlightColor: { value: new THREE.Color("#f3fdff") },
      uLightDirection: { value: new THREE.Vector3(0.4, 1, 0.6).normalize() },
      uFlowSpeed: { value: 0.9 },
      uNoiseScale: { value: 1.5 },
      uNormalStrength: { value: 1.8 },
      uFresnelPower: { value: 4.4 },
      uSpecularStrength: { value: 1.3 },
      uOpacity: { value: 0.74 },
      uFoamAmount: { value: 0.55 },
      uSurfaceMotion: { value: 0.035 },
    },
  });

  material.userData = material.userData || {};
  material.userData.materialPreset = "shader-water";
  material.userData.shaderLabel = "自定义 Shader 流动水";

  return material;
}

export function updateWaterMaterial(material, app, time) {
  material.uniforms.uTime.value = time;
  material.uniforms.uLightDirection.value
    .copy(app.runtime.dirLight.position)
    .sub(app.runtime.dirLight.target.position)
    .normalize();
}
