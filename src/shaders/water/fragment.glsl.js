export const waterFragmentShader = `
uniform float uTime;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uHighlightColor;
uniform vec3 uLightDirection;
uniform float uFlowSpeed;
uniform float uNoiseScale;
uniform float uNormalStrength;
uniform float uFresnelPower;
uniform float uSpecularStrength;
uniform float uOpacity;
uniform float uFoamAmount;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 smoothLocal = local * local * (3.0 - 2.0 * local);

  float n00 = hash(cell + vec2(0.0, 0.0));
  float n10 = hash(cell + vec2(1.0, 0.0));
  float n01 = hash(cell + vec2(0.0, 1.0));
  float n11 = hash(cell + vec2(1.0, 1.0));

  float nx0 = mix(n00, n10, smoothLocal.x);
  float nx1 = mix(n01, n11, smoothLocal.x);
  return mix(nx0, nx1, smoothLocal.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i++) {
    value += noise(p) * amplitude;
    p = p * 2.02 + vec2(11.7, 5.3);
    amplitude *= 0.5;
  }

  return value;
}

float sampleWaterHeight(vec3 worldPosition) {
  vec2 flowUv = worldPosition.xz * uNoiseScale;
  vec2 driftA = vec2(uTime * uFlowSpeed * 0.22, -uTime * uFlowSpeed * 0.08);
  vec2 driftB = vec2(-uTime * uFlowSpeed * 0.11, uTime * uFlowSpeed * 0.16);

  vec2 warp = vec2(
    fbm(flowUv * 0.8 + driftA),
    fbm(flowUv * 0.8 - driftB)
  );

  float broad = fbm(flowUv + warp * 1.2 + driftA);
  float detail = fbm(flowUv * 2.1 - warp * 0.9 + driftB);
  float micro = fbm(flowUv * 4.2 + vec2(-uTime * uFlowSpeed * 0.15, uTime * uFlowSpeed * 0.1));

  return broad * 0.58 + detail * 0.28 + micro * 0.14;
}

vec3 getWaterNormal(vec3 worldPosition, vec3 baseNormal) {
  float epsilon = 0.06;

  float center = sampleWaterHeight(worldPosition);
  float sampleX = sampleWaterHeight(worldPosition + vec3(epsilon, 0.0, 0.0));
  float sampleZ = sampleWaterHeight(worldPosition + vec3(0.0, 0.0, epsilon));

  vec3 tangentX = vec3(epsilon, (sampleX - center) * uNormalStrength, 0.0);
  vec3 tangentZ = vec3(0.0, (sampleZ - center) * uNormalStrength, epsilon);
  vec3 warpedNormal = normalize(cross(tangentZ, tangentX));

  return normalize(mix(baseNormal, warpedNormal, 0.8));
}

void main() {
  vec3 baseNormal = normalize(vWorldNormal);
  vec3 normal = getWaterNormal(vWorldPosition, baseNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 lightDirection = normalize(uLightDirection);
  vec3 halfDirection = normalize(lightDirection + viewDirection);

  float flow = sampleWaterHeight(vWorldPosition);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), uFresnelPower);
  float specular = pow(max(dot(normal, halfDirection), 0.0), 84.0) * uSpecularStrength;
  float rim = pow(1.0 - max(dot(baseNormal, viewDirection), 0.0), 2.8);
  float foam = smoothstep(0.72, 0.95, flow + rim * 0.08) * uFoamAmount;
  float shimmer = smoothstep(0.82, 0.98, flow) * specular * 0.8;

  vec3 waterColor = mix(uDeepColor, uShallowColor, smoothstep(0.22, 0.8, flow));
  vec3 color = waterColor * (0.38 + diffuse * 0.62);
  color += waterColor * fresnel * 0.25;
  color += uHighlightColor * specular;
  color += uHighlightColor * shimmer;
  color = mix(color, uHighlightColor, foam * 0.22);

  float alpha = clamp(uOpacity + fresnel * 0.12 + foam * 0.04, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;
