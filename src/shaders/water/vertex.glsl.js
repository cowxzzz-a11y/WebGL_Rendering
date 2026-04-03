export const waterVertexShader = `
uniform float uTime;
uniform float uFlowSpeed;
uniform float uSurfaceMotion;
uniform float uNoiseScale;

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

  for (int i = 0; i < 4; i++) {
    value += noise(p) * amplitude;
    p = p * 2.0 + vec2(13.1, 7.9);
    amplitude *= 0.5;
  }

  return value;
}

float getWaveOffset(vec3 localPosition) {
  vec2 flowUv = localPosition.xy * uNoiseScale * 0.75;
  vec2 driftA = vec2(uTime * uFlowSpeed * 0.18, -uTime * uFlowSpeed * 0.07);
  vec2 driftB = vec2(-uTime * uFlowSpeed * 0.09, uTime * uFlowSpeed * 0.12);

  float broad = fbm(flowUv + driftA);
  float detail = fbm(flowUv * 1.8 + driftB);
  float pulse = sin((localPosition.x + localPosition.y) * 0.45 + uTime * uFlowSpeed * 0.35) * 0.5 + 0.5;

  return ((broad * 0.7 + detail * 0.3) - 0.5) * 0.8 + (pulse - 0.5) * 0.08;
}

void main() {
  vUv = uv;

  vec3 displacedPosition = position + normal * getWaveOffset(position) * uSurfaceMotion;
  vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);

  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;
