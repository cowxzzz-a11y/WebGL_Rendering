// Procedural River Water Shader
// Adapted from "Where the River Goes" by P_Malin (Shadertoy Xl2XRW)
//
// Fully procedural - no textures required.
// Designed for use on a flat plane mesh (works with any mesh).
// Water flow computed from virtual terrain (procedural river bed).
// All visual parameters exposed as uniforms.
//
// Usage:
//   Vertex shader: pass worldPos, worldNormal, worldUV to fragment
//   Fragment shader: outputs water surface color + alpha

// ============================================================
// VERTEX SHADER
// ============================================================
#ifdef VERTEX

uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewProjMatrix;

attribute vec3 a_Position;
attribute vec3 a_Normal;
attribute vec2 a_TexCoord;

varying vec3 v_WorldPos;
varying vec3 v_WorldNormal;
varying vec2 v_UV;

void main() {
    v_WorldPos = (u_ModelMatrix * vec4(a_Position, 1.0)).xyz;
    v_WorldNormal = normalize(mat3(u_ModelMatrix) * a_Normal);
    v_UV = a_TexCoord;
    gl_Position = u_ViewProjMatrix * vec4(a_Position, 1.0);
}

#endif

// ============================================================
// FRAGMENT SHADER
// ============================================================
#ifdef FRAGMENT

precision highp float;

// ---- time ----
uniform float u_Time;

// ---- camera ----
uniform vec3  u_CameraPos;

// ---- water color ----
uniform vec3  u_ShallowColor;         // shallow water tint         default: vec3(0.08, 0.35, 0.25)
uniform vec3  u_DeepColor;            // deep water tint             default: vec3(0.0, 0.08, 0.12)
uniform float u_DepthFalloff;         // shallow->deep transition    default: 3.0
uniform vec3  u_ExtinctionColor;      // light absorption per depth  default: vec3(0.5, 0.4, 0.1)

// ---- normals ----
uniform float u_NormalStrength;       // normal map intensity        default: 1.0
uniform float u_NormalTiling;         // noise scale                 default: 20.0
uniform float u_NormalSpeed;          // animation speed             default: 0.5

// ---- flow ----
uniform float u_FlowSpeed;            // overall flow speed          default: 0.6
uniform float u_MeanderFreq;          // river bend frequency        default: 0.3
uniform float u_MeanderAmp;           // river bend amplitude        default: 1.5
uniform float u_RiverWidth;           // river channel width         default: 2.0
uniform float u_RiverDepth;           // river channel depth         default: 0.5
uniform float u_ChannelMask;          // 1: procedural channel alpha, 0: use the supplied mesh shape

// ---- foam ----
uniform vec3  u_FoamColor;            // foam tint                   default: vec3(1.0)
uniform float u_FoamAmount;           // overall foam intensity      default: 0.5
uniform float u_FoamDistScale;        // foam distance scale         default: 1.5

// ---- fresnel ----
uniform float u_FresnelPower;         // fresnel exponent            default: 5.0
uniform float u_FresnelStrength;      // fresnel mix strength        default: 0.8

// ---- lighting ----
uniform vec3  u_LightDir;             // sun direction (normalized)  default: normalize(vec3(-1, 0.7, 0.25))
uniform vec3  u_LightColor;           // sun color                   default: vec3(1.0, 0.85, 0.5)
uniform vec3  u_SkyColor;             // sky/environment color       default: vec3(0.1, 0.5, 1.0)

// ---- transparency ----
uniform float u_Opacity;              // water opacity               default: 0.9

varying vec3  v_WorldPos;
varying vec3  v_WorldNormal;
varying vec2  v_UV;

// ============================================================
// OUTPUT
// ============================================================
// WebGL 2.0 / GLES 3.0:  out vec4 fragColor;
// WebGL 1.0 / GLES 2.0:  use gl_FragColor (built-in)
// Uncomment the appropriate line below:
// layout(location = 0) out vec4 fragColor;
#define FRAG_COLOR gl_FragColor

// ============================================================
// NOISE HELPERS (from original shader)
// ============================================================

#define MOD2 vec2(4.438975, 3.972973)

float Hash(float p) {
    vec2 p2 = fract(vec2(p) * MOD2);
    p2 += dot(p2.yx, p2.xy + 19.19);
    return fract(p2.x * p2.y);
}

vec2 Hash2(float p) {
    vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract((p3.xx + p3.yz) * p3.zy);
}

float SmoothNoise(vec2 o) {
    vec2 p = floor(o);
    vec2 f = fract(o);
    float n = p.x + p.y * 57.0;

    float a = Hash(n + 0.0);
    float b = Hash(n + 1.0);
    float c = Hash(n + 57.0);
    float d = Hash(n + 58.0);

    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    vec2 t = 3.0 * f2 - 2.0 * f3;

    float u = t.x;
    float v = t.y;

    return a + (b - a) * u + (c - a) * v + (a - b + d - c) * u * v;
}

vec3 SmoothNoise_DXY(vec2 o) {
    vec2 p = floor(o);
    vec2 f = fract(o);
    float n = p.x + p.y * 57.0;

    float a = Hash(n + 0.0);
    float b = Hash(n + 1.0);
    float c = Hash(n + 57.0);
    float d = Hash(n + 58.0);

    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    vec2 t = 3.0 * f2 - 2.0 * f3;
    vec2 dt = 6.0 * f - 6.0 * f2;

    float u = t.x;
    float v = t.y;
    float du = dt.x;
    float dv = dt.y;

    float res = a + (b - a) * u + (c - a) * v + (a - b + d - c) * u * v;
    float dx = (b - a) * du + (a - b + d - c) * du * v;
    float dy = (c - a) * dv + (a - b + d - c) * u * dv;

    return vec3(dx, dy, res);
}

vec3 FBM_DXY(vec2 p, vec2 flow, float ps, float df, int steps) {
    vec3 f = vec3(0.0);
    float tot = 0.0;
    float a = 1.0;
    for (int i = 0; i < 8; i++) {
        if (i >= steps) break;
        p += flow;
        flow *= -0.75;
        vec3 v = SmoothNoise_DXY(p);
        f += v * a;
        p += v.xy * df;
        p *= 2.0;
        tot += a;
        a *= ps;
    }
    return f / tot;
}

float FBM(vec2 p, float ps) {
    float f = 0.0;
    float tot = 0.0;
    float a = 1.0;
    for (int i = 0; i < 6; i++) {
        f += SmoothNoise(p) * a;
        p *= 2.0;
        tot += a;
        a *= ps;
    }
    return f / tot;
}

float FBM_Simple(vec2 p, float ps) {
    float f = 0.0;
    float tot = 0.0;
    float a = 1.0;
    for (int i = 0; i < 3; i++) {
        f += SmoothNoise(p) * a;
        p *= 2.0;
        tot += a;
        a *= ps;
    }
    return f / tot;
}

// ============================================================
// VIRTUAL RIVER TERRAIN (procedural, no mesh needed)
// ============================================================

float GetRiverMeander(float x) {
    return sin(x * u_MeanderFreq) * u_MeanderAmp;
}

float GetRiverMeanderDx(float x) {
    return cos(x * u_MeanderFreq) * u_MeanderAmp * u_MeanderFreq;
}

float GetRiverBedOffset(vec2 pos) {
    float bedDepth = u_RiverDepth * (0.75 + 0.25 * sin(pos.x * 0.001 + 3.0));
    float bedWidth = u_RiverWidth + cos(pos.x * 0.1) * (u_RiverWidth * 0.45);
    float distFromRiver = abs(pos.y - GetRiverMeander(pos.x));
    float bedAmount = smoothstep(bedWidth, bedWidth * 0.5, distFromRiver);
    return bedAmount * bedDepth;
}

float GetVirtualHeight(vec2 pos) {
    float fbm = FBM(pos * vec2(0.5, 1.0), 0.5);
    float terrain = fbm * fbm;
    terrain -= GetRiverBedOffset(pos);
    return terrain;
}

float GetVirtualHeightSimple(vec2 pos) {
    float fbm = FBM_Simple(pos * vec2(0.5, 1.0), 0.5);
    float terrain = fbm * fbm;
    terrain -= GetRiverBedOffset(pos);
    return terrain;
}

float GetVirtualDepth(vec2 pos) {
    return max(0.0, -GetVirtualHeight(pos));
}

float GetFlowDistance(vec2 pos) {
    return -GetVirtualHeightSimple(pos);
}

vec2 GetBaseFlow(vec2 pos) {
    return vec2(1.0, GetRiverMeanderDx(pos.x));
}

vec2 GetGradient(vec2 pos) {
    float delta = 0.01;
    float dx = GetFlowDistance(pos + vec2(delta, 0.0)) - GetFlowDistance(pos - vec2(delta, 0.0));
    float dy = GetFlowDistance(pos + vec2(0.0, delta)) - GetFlowDistance(pos - vec2(0.0, delta));
    return vec2(dx, dy);
}

vec3 GetFlowRate(vec2 pos) {
    vec2 baseFlow = GetBaseFlow(pos);
    vec2 flow = baseFlow;
    float depth = GetFlowDistance(pos);
    float dist = max(0.001, depth);
    vec2 gradient = GetGradient(pos);

    flow += -gradient * 40.0 / (1.0 + dist * 1.5);
    flow *= 1.0 / (1.0 + dist * 0.5);

    float behindObstacle = 0.5 - dot(normalize(gradient + 0.0001), -normalize(flow + 0.0001)) * 0.5;
    float slowDist = clamp(depth * 5.0, 0.0, 1.0);
    slowDist = mix(slowDist * 0.9 + 0.1, 1.0, behindObstacle * 0.9);
    slowDist = 0.5 + slowDist * 0.5;
    flow *= slowDist;

    float foam = abs(length(flow)) * 0.5;
    foam += clamp(foam - 0.4, 0.0, 1.0);
    foam = 1.0 - pow(dist, foam * u_FoamDistScale * 0.35);

    return vec3(flow * u_FlowSpeed, foam);
}

// ============================================================
// WATER SURFACE (from original)
// ============================================================

vec4 SampleWaterNormal(vec2 uv, vec2 flowOffset, float fMag, float fFoam) {
    vec2 vFilterWidth = max(abs(dFdx(uv)), abs(dFdy(uv)));
    float fFilterWidth = max(vFilterWidth.x, vFilterWidth.y);

    float fScale = 1.0 / (1.0 + fFilterWidth * fFilterWidth * 2000.0);
    float fGradientAscent = 0.25 + fFoam * -1.5;
    vec3 dxy = FBM_DXY(uv * u_NormalTiling, flowOffset * u_NormalTiling, 0.75 + fFoam * 0.25, fGradientAscent, 4);
    fScale *= max(0.25, 1.0 - fFoam * 5.0);
    vec3 vBlended = mix(vec3(0.0, 1.0, 0.0), normalize(vec3(dxy.x, fMag, dxy.y)), fScale);
    return vec4(normalize(vBlended), dxy.z * fScale);
}

float SampleWaterFoam(vec2 uv, vec2 flowOffset, float fFoam) {
    float f = FBM_DXY(uv * 30.0, flowOffset * 50.0, 0.8, -0.5, 4).z;
    float fAmount = 0.2;
    f = max(0.0, (f - fAmount) / fAmount);
    return pow(0.5, f);
}

vec4 SampleFlowingNormal(vec2 uv, vec2 flowRate, float fFoam, float time, out float fOutFoamTex) {
    float fMag = 2.5 / (1.0 + dot(flowRate, flowRate) * 5.0);
    float t0 = fract(time);
    float t1 = fract(time + 0.5);

    float i0 = floor(time);
    float i1 = floor(time + 0.5);

    float o0 = t0 - 0.5;
    float o1 = t1 - 0.5;

    vec2 uv0 = uv + Hash2(i0);
    vec2 uv1 = uv + Hash2(i1);

    vec4 sample0 = SampleWaterNormal(uv0, flowRate * o0, fMag, fFoam);
    vec4 sample1 = SampleWaterNormal(uv1, flowRate * o1, fMag, fFoam);

    float weight = abs(t0 - 0.5) * 2.0;

    float foam0 = SampleWaterFoam(uv0, flowRate * o0 * 0.25, fFoam);
    float foam1 = SampleWaterFoam(uv1, flowRate * o1 * 0.25, fFoam);

    vec4 result = mix(sample0, sample1, weight);
    result.xyz = normalize(result.xyz);

    fOutFoamTex = mix(foam0, foam1, weight);

    return result;
}

// ============================================================
// LIGHTING
// ============================================================

float GetFresnel(vec3 viewDir, vec3 normal) {
    float NdotV = max(0.0, dot(viewDir, normal));
    return pow(1.0 - NdotV, u_FresnelPower);
}

vec3 GetSunSpecular(vec3 viewDir, vec3 normal, vec3 lightDir, vec3 lightColor) {
    vec3 halfDir = normalize(viewDir + lightDir);
    float spec = pow(max(0.0, dot(normal, halfDir)), 80.0);
    return lightColor * spec;
}

// ============================================================
// MAIN
// ============================================================

void main() {
    vec3 V = normalize(u_CameraPos - v_WorldPos);
    vec3 vertexNormal = normalize(v_WorldNormal);
    vec2 pos = v_WorldPos.xz;

    // --- virtual terrain ---
    float depth = GetVirtualDepth(pos);
    float height = GetVirtualHeight(pos);

    // --- flow ---
    vec3 flowAndFoam = GetFlowRate(pos);
    vec2 flow = flowAndFoam.xy;

    // --- water normal ---
    float foamTex = 0.0;
    float foamAmount = clamp((flowAndFoam.z - 0.2) * 1.5, 0.0, 1.0);
    foamAmount = foamAmount * foamAmount * 0.5 * u_FoamAmount;

    vec4 waterNormalAndHeight = SampleFlowingNormal(pos, flow * u_NormalSpeed, foamAmount, u_Time, foamTex);
    vec3 waterNormal = waterNormalAndHeight.xyz;

    // --- surface normal ---
    vec3 tangentNormal = normalize(vec3(waterNormal.x, waterNormal.y * 1.25, waterNormal.z));
    vec3 N = normalize(vertexNormal * 0.65 + tangentNormal * u_NormalStrength);

    // --- fresnel ---
    float fresnel = GetFresnel(V, N);
    fresnel *= u_FresnelStrength;

    // --- water color ---
    float channelMask = smoothstep(0.0, 0.08, depth);
    float depthFactor = 1.0 - exp(-depth * u_DepthFalloff);
    vec3 waterColor = mix(u_ShallowColor, u_DeepColor, depthFactor);

    // --- extinction (light absorption) ---
    vec3 extinction = exp2(-depth * u_ExtinctionColor * 6.0);

    // --- reflection ---
    vec3 reflectDir = reflect(-V, N);
    float sunReflect = max(0.0, dot(reflectDir, u_LightDir));
    vec3 reflection = u_SkyColor + u_LightColor * pow(sunReflect, 40.0) * 0.5;

    // --- specular ---
    vec3 specular = GetSunSpecular(V, N, u_LightDir, u_LightColor);

    // --- foam ---
    float foamBlend = 1.0 - pow(foamTex, foamAmount * 5.0 + 0.001);
    vec3 foamColor = u_FoamColor * foamBlend;

    // --- combine ---
    vec3 baseLit = waterColor * extinction;
    baseLit += u_SkyColor * (0.08 + 0.22 * clamp(N.y, 0.0, 1.0));

    vec3 color = baseLit;
    color = mix(color, reflection, fresnel);
    color += specular;
    color += foamColor * u_FoamAmount;

    // --- alpha ---
    float edgeFade = smoothstep(0.0, 0.18, depth);
    float meshMask = mix(1.0, channelMask, u_ChannelMask);
    float meshEdgeFade = mix(1.0, edgeFade, u_ChannelMask);
    float alpha = mix(u_Opacity * meshEdgeFade, 1.0, fresnel);
    alpha *= meshMask;

    FRAG_COLOR = vec4(color, alpha);
}

#endif
