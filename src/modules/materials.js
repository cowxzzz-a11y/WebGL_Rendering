import * as THREE from "three";

import {
  createCustomShaderMaterial,
  isCustomShaderPreset,
  updateCustomShaderMaterial,
} from "../shaders/index.js";

export function createMaterialsModule(app) {
  function getPrimaryMaterial(material) {
    if (Array.isArray(material)) {
      return material[0] || null;
    }

    return material || null;
  }

  function cloneMaterial(material) {
    if (!material) {
      return null;
    }

    if (Array.isArray(material)) {
      return material.map((item) => item.clone());
    }

    return material.clone();
  }

  function disposeMaterial(material) {
    if (!material) {
      return;
    }

    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }

    for (const key of Object.keys(material)) {
      const value = material[key];
      if (value && typeof value === "object" && "isTexture" in value) {
        value.dispose();
      }
    }

    material.dispose();
  }

  function disposeObject3D(root) {
    if (!root) {
      return;
    }

    root.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      if (child.geometry) {
        child.geometry.dispose();
      }

      if (child.material) {
        disposeMaterial(child.material);
      }
    });
  }

  function rememberOriginalMaterial(mesh) {
    if (!mesh.userData.originalMaterial) {
      mesh.userData.originalMaterial = cloneMaterial(mesh.material);
    }

    const currentMaterial = getPrimaryMaterial(mesh.material);
    if (!currentMaterial) {
      return;
    }

    currentMaterial.userData = currentMaterial.userData || {};
    if (!currentMaterial.userData.materialPreset) {
      currentMaterial.userData.materialPreset = "original";
    }
  }

  function copyCommonMaterialProps(sourceMaterial, targetMaterial) {
    if (!sourceMaterial || !targetMaterial) {
      return;
    }

    if (sourceMaterial.color && targetMaterial.color) {
      targetMaterial.color.copy(sourceMaterial.color);
    }

    if (sourceMaterial.emissive && targetMaterial.emissive) {
      targetMaterial.emissive.copy(sourceMaterial.emissive);
    }

    if ("emissiveIntensity" in sourceMaterial && "emissiveIntensity" in targetMaterial) {
      targetMaterial.emissiveIntensity = sourceMaterial.emissiveIntensity;
    }

    if ("roughness" in sourceMaterial && "roughness" in targetMaterial) {
      targetMaterial.roughness = sourceMaterial.roughness;
    }

    if ("metalness" in sourceMaterial && "metalness" in targetMaterial) {
      targetMaterial.metalness = sourceMaterial.metalness;
    }

    if ("envMapIntensity" in sourceMaterial && "envMapIntensity" in targetMaterial) {
      targetMaterial.envMapIntensity = sourceMaterial.envMapIntensity;
    }

    if ("opacity" in sourceMaterial && "opacity" in targetMaterial) {
      targetMaterial.opacity = sourceMaterial.opacity;
    }

    targetMaterial.transparent = !!sourceMaterial.transparent;
    targetMaterial.side = sourceMaterial.side;
    targetMaterial.wireframe = !!sourceMaterial.wireframe;

    if ("map" in targetMaterial) {
      targetMaterial.map = sourceMaterial.map || null;
    }

    if ("normalMap" in targetMaterial) {
      targetMaterial.normalMap = sourceMaterial.normalMap || null;
    }

    if ("roughnessMap" in targetMaterial) {
      targetMaterial.roughnessMap = sourceMaterial.roughnessMap || null;
    }

    if ("metalnessMap" in targetMaterial) {
      targetMaterial.metalnessMap = sourceMaterial.metalnessMap || null;
    }

    if ("aoMap" in targetMaterial) {
      targetMaterial.aoMap = sourceMaterial.aoMap || null;
    }

    if ("emissiveMap" in targetMaterial) {
      targetMaterial.emissiveMap = sourceMaterial.emissiveMap || null;
    }

    if ("clearcoat" in sourceMaterial && "clearcoat" in targetMaterial) {
      targetMaterial.clearcoat = sourceMaterial.clearcoat;
    }

    if (
      "clearcoatRoughness" in sourceMaterial &&
      "clearcoatRoughness" in targetMaterial
    ) {
      targetMaterial.clearcoatRoughness = sourceMaterial.clearcoatRoughness;
    }

    if ("transmission" in sourceMaterial && "transmission" in targetMaterial) {
      targetMaterial.transmission = sourceMaterial.transmission;
    }

    if ("ior" in sourceMaterial && "ior" in targetMaterial) {
      targetMaterial.ior = sourceMaterial.ior;
    }

    if ("thickness" in sourceMaterial && "thickness" in targetMaterial) {
      targetMaterial.thickness = sourceMaterial.thickness;
    }

    targetMaterial.needsUpdate = true;
  }

  function prepareMaterial(material) {
    if (!material) {
      return;
    }

    if (material.map) {
      material.map.colorSpace = THREE.SRGBColorSpace;
    }

    if ("needsUpdate" in material) {
      material.needsUpdate = true;
    }
  }

  function prepareModel(root) {
    root.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;
      rememberOriginalMaterial(child);

      if (Array.isArray(child.material)) {
        child.material.forEach(prepareMaterial);
        return;
      }

      prepareMaterial(child.material);
    });
  }

  function createMaterialFromPreset(presetKey, sourceMaterial) {
    let material = null;

    if (presetKey === "basic") {
      material = new THREE.MeshBasicMaterial();
    }

    if (presetKey === "lambert") {
      material = new THREE.MeshLambertMaterial();
    }

    if (presetKey === "phong") {
      material = new THREE.MeshPhongMaterial({ shininess: 80 });
    }

    if (presetKey === "standard") {
      material = new THREE.MeshStandardMaterial();
    }

    if (presetKey === "physical") {
      material = new THREE.MeshPhysicalMaterial();
    }

    if (isCustomShaderPreset(presetKey)) {
      return createCustomShaderMaterial(presetKey, sourceMaterial);
    }

    if (!material) {
      return null;
    }

    copyCommonMaterialProps(sourceMaterial, material);
    material.userData = material.userData || {};
    material.userData.materialPreset = presetKey;
    return material;
  }

  function replaceSelectedMaterial(presetKey) {
    const { selectedObject } = app.state;

    if (!selectedObject || !selectedObject.isMesh) {
      return;
    }

    const previousMaterial = selectedObject.material;
    const previousPrimaryMaterial = getPrimaryMaterial(previousMaterial);
    const sourceMaterial =
      getPrimaryMaterial(selectedObject.userData.originalMaterial) ||
      previousPrimaryMaterial;

    let nextMaterial = null;

    if (presetKey === "original") {
      nextMaterial = cloneMaterial(selectedObject.userData.originalMaterial);
    } else {
      nextMaterial = createMaterialFromPreset(presetKey, sourceMaterial);
    }

    if (!nextMaterial) {
      return;
    }

    selectedObject.material = nextMaterial;

    if (Array.isArray(nextMaterial)) {
      nextMaterial.forEach(prepareMaterial);
    } else {
      prepareMaterial(nextMaterial);
    }

    if (
      previousMaterial &&
      previousMaterial !== selectedObject.userData.originalMaterial
    ) {
      disposeMaterial(previousMaterial);
    }

    app.selection.selectObject(selectedObject);
  }

  function updateCustomShaderMaterials(root) {
    if (!root) {
      return false;
    }

    let hasAnimatedMaterial = false;

    root.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const material = getPrimaryMaterial(child.material);
      if (!material || !isCustomShaderPreset(material.userData?.materialPreset)) {
        return;
      }

      hasAnimatedMaterial = true;
      updateCustomShaderMaterial(material, app, performance.now() * 0.001);
    });

    return hasAnimatedMaterial;
  }

  return {
    getPrimaryMaterial,
    cloneMaterial,
    disposeMaterial,
    disposeObject3D,
    rememberOriginalMaterial,
    copyCommonMaterialProps,
    prepareMaterial,
    prepareModel,
    createMaterialFromPreset,
    replaceSelectedMaterial,
    updateCustomShaderMaterials,
  };
}
