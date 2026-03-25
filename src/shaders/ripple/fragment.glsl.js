export const rippleFragmentShader = `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uLightDirection;
uniform float uWaveScale;
uniform float uSpeed;
uniform float uFresnelPower;
uniform float uGlow;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vec2 uv = vUv * 3.0;

  float waveA = sin((uv.x + uTime * uSpeed) * uWaveScale);
  float waveB = sin((uv.y * 1.37 - uTime * uSpeed * 0.82) * (uWaveScale * 1.15));
  float waveC = sin(((uv.x + uv.y) * 0.5 + uTime * uSpeed * 0.4) * (uWaveScale * 0.7));

  float wave = waveA * 0.5 + waveB * 0.35 + waveC * 0.15;
  wave = wave * 0.5 + 0.5;
  wave = smoothstep(0.15, 0.85, wave);

  vec3 normal = normalize(vWorldNormal);
  vec3 lightDir = normalize(uLightDirection);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);

  float diffuse = max(dot(normal, lightDir), 0.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), uFresnelPower);

  vec3 baseColor = mix(uColorA, uColorB, wave);
  vec3 color = baseColor * (0.28 + diffuse * 0.72);
  color += fresnel * uGlow;

  gl_FragColor = vec4(color, 1.0);
}
`;
