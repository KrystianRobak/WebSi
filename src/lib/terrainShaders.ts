export const SEA_WATER_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vShoreDamp;
  varying float vWaveCrest;

  uniform float uTime;
  uniform sampler2D uHeightMap;
  uniform float uHasHeightMap;
  uniform float uTerrainSize;
  uniform float uDisplacementScale;
  uniform float uSeaY;
  uniform float uWaveHeight;
  uniform float uWaveScale;
  uniform float uWaveSpeed;
  uniform float uChoppiness;
  uniform vec2 uWindDir;

  vec2 rotConst(vec2 v, float c, float s) {
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);

    float shoreDamp = 1.0;
    if (uHasHeightMap > 0.5) {
      vec2 tUv = vec2(wp.x / uTerrainSize + 0.5, wp.z / uTerrainSize + 0.5);
      float inBox = step(0.0, tUv.x) * step(tUv.x, 1.0) * step(0.0, tUv.y) * step(tUv.y, 1.0);
      float terrainH = texture2D(uHeightMap, clamp(tUv, 0.002, 0.998)).r * uDisplacementScale;
      float depth = mix(5.0, max(0.0, uSeaY - terrainH), inBox);
      shoreDamp = smoothstep(0.04, 1.55, depth);
    }
    vShoreDamp = shoreDamp;

    // 4 directional Gerstner swell waves using precomputed cos/sin offsets
    vec2 p = wp.xz * uWaveScale;
    float t = uTime * uWaveSpeed;
    vec2 d1 = normalize(uWindDir);
    vec2 d2 = rotConst(d1, 0.9131, 0.4078);
    vec2 d3 = rotConst(d1, 0.8727, -0.4882);
    vec2 d4 = rotConst(d1, 0.6372, 0.7707);

    float p1 = dot(p, d1) * 0.34 + t * 1.18;
    float p2 = dot(p, d2) * 0.56 + t * 1.48;
    float p3 = dot(p, d3) * 0.86 - t * 1.72;
    float p4 = dot(p, d4) * 1.32 + t * 2.08;

    float s1 = sin(p1);
    float s2 = sin(p2);
    float s3 = sin(p3);
    float s4 = sin(p4);

    float amp = uWaveHeight * shoreDamp;
    float dy = (s1 * 0.12 + s2 * 0.075 + s3 * 0.048 + s4 * 0.030) * amp;

    float chop = uChoppiness * amp;
    vec2 dxz = (
      d1 * cos(p1) * 0.095 +
      d2 * cos(p2) * 0.062 +
      d3 * cos(p3) * 0.040 +
      d4 * cos(p4) * 0.024
    ) * chop;

    float crest = (s1 * 0.42 + s2 * 0.28 + s3 * 0.19 + s4 * 0.11) * amp;
    vWaveCrest = clamp(crest * 0.85 + 0.25, 0.0, 1.5);

    wp.y += dy;
    wp.xz += dxz;
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const SEA_WATER_FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying float vShoreDamp;
  varying float vWaveCrest;

  uniform float uTime;
  uniform sampler2D uHeightMap;
  uniform float uHasHeightMap;
  uniform sampler2D uFogTex;
  uniform float uHasFogTex;
  uniform float uFogGmAlpha;
  uniform float uTerrainSize;
  uniform float uDisplacementScale;
  uniform float uSeaY;
  uniform float uWaveHeight;
  uniform float uWaveScale;
  uniform float uWaveSpeed;
  uniform float uChoppiness;
  uniform float uFoamAmount;
  uniform float uShoreWaves;
  uniform float uClarity;
  uniform vec2 uWindDir;
  uniform vec3 uSunDir;
  uniform vec3 uFillDir;
  uniform vec3 uDeepColor;
  uniform vec3 uMidColor;
  uniform vec3 uShallowColor;
  uniform vec3 uSunColor;
  uniform vec3 uFillColor;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;
  uniform vec3 uFoamColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uWireframe;

  vec2 rotConst(vec2 v, float c, float s) {
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm2(vec2 p) {
    float v = 0.65 * vnoise(p);
    p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.1;
    v += 0.35 * vnoise(p);
    return v;
  }

  // Analytic surface normal with distance LOD gating
  vec3 computeWaterNormal(vec2 xz, float detailFade, float shoreDamp, out float microCrest) {
    float t = uTime * uWaveSpeed;
    vec2 p = xz * uWaveScale;
    float ampScale = mix(0.38, 1.0, shoreDamp) * max(0.15, uWaveHeight);

    vec2 d1 = normalize(uWindDir);
    vec2 d2 = rotConst(d1, 0.9131, 0.4078);
    vec2 d3 = rotConst(d1, 0.8727, -0.4882);

    float k1 = dot(p, d1) * 0.52 + t * 1.18;
    float k2 = dot(p, d2) * 0.96 + t * 1.48;
    float k3 = dot(p, d3) * 1.68 - t * 1.82;

    vec2 grad = d1 * cos(k1) * 0.165 + d2 * cos(k2) * 0.125 + d3 * cos(k3) * 0.092;
    float crestAccum = sin(k1) * 0.38 + sin(k2) * 0.30 + sin(k3) * 0.20;

    if (detailFade > 0.02) {
      vec2 d4 = rotConst(d1, 0.6372, 0.7707);
      vec2 d5 = rotConst(d1, 0.5062, -0.8624);
      float k4 = dot(p, d4) * 2.85 + t * 2.25;
      float k5 = dot(p, d5) * 4.65 - t * 2.85;
      grad += (d4 * cos(k4) * 0.072 + d5 * cos(k5) * 0.052) * detailFade;
      crestAccum += sin(k4) * 0.12 * detailFade;

      vec2 r1 = rotConst(p, 0.8021, 0.5972);
      float c1 = sin(r1.x * 5.2 + r1.y * 3.4 + t * 2.9);
      float c2 = cos(r1.x * -4.3 + r1.y * 5.8 - t * 2.5);
      grad += vec2(c1, c2) * 0.042 * detailFade;
    }

    grad *= ampScale * (0.65 + 0.55 * uChoppiness);
    microCrest = crestAccum * 0.5 + 0.5;
    return normalize(vec3(-grad.x, 1.0, -grad.y));
  }

  void main() {
    if (uWireframe > 0.5) {
      gl_FragColor = vec4(0.11, 0.42, 0.48, 0.42);
      return;
    }

    vec2 tUv = vec2(vWorldPos.x / uTerrainSize + 0.5, vWorldPos.z / uTerrainSize + 0.5);
    vec2 clampedUv = clamp(tUv, 0.002, 0.998);
    float outsideEdge = max(
      max(-tUv.x, tUv.x - 1.0),
      max(-tUv.y, tUv.y - 1.0)
    );

    float terrainH = uSeaY - 4.0;
    if (uHasHeightMap > 0.5) {
      terrainH = texture2D(uHeightMap, clampedUv).r * uDisplacementScale;
    }

    float rawDepth = uSeaY - terrainH;
    if (uHasHeightMap > 0.5 && outsideEdge <= 0.0 && rawDepth < -0.06) {
      discard;
    }
    float outsideBlend = smoothstep(0.0, 0.018, outsideEdge);
    float waterDepth = mix(rawDepth, max(rawDepth, 4.5), outsideBlend);
    float depthPos = max(0.0, waterDepth);

    vec3 toCam = cameraPosition - vWorldPos;
    float camDist = length(toCam);
    vec3 V = toCam / max(camDist, 0.0001);

    float sizeScale = max(1.0, uTerrainSize / 100.0);
    float detailFade = 1.0 - smoothstep(45.0 * sizeScale, 155.0 * sizeScale, camDist);
    float microCrest = 0.5;
    vec3 N = computeWaterNormal(vWorldPos.xz, detailFade, vShoreDamp, microCrest);
    float NdotV = max(dot(N, V), 0.001);

    // Beer-Lambert exponential depth absorption with clarity control
    float clarityInv = 1.0 / max(0.25, uClarity);
    float shallowFactor = exp(-depthPos * 0.82 * clarityInv);
    float midFactor = exp(-depthPos * 0.28 * clarityInv);
    vec3 col = mix(uDeepColor, uMidColor, midFactor);
    col = mix(col, uShallowColor, shallowFactor * 0.92);

    // Subsurface turquoise wave-crest scattering
    float backSun = pow(max(0.0, dot(V, -uSunDir) * 0.6 + 0.4), 2.0);
    float sssFactor = clamp((vWaveCrest * 0.65 + microCrest * 0.35) - 0.35, 0.0, 1.0) * vShoreDamp;
    col += uShallowColor * sssFactor * (0.28 + 0.32 * backSun) * min(1.4, uWaveHeight);

    // Dual-rotated underwater caustics in shoals & lagoons
    if (detailFade > 0.02) {
      float causticMask = exp(-depthPos * 1.10 * clarityInv) * smoothstep(0.03, 0.30, depthPos) * detailFade * min(1.5, uClarity);
      if (causticMask > 0.015) {
        vec2 c1 = vWorldPos.xz * 0.72;
        vec2 c2 = vec2(c1.x * 0.8 - c1.y * 0.6, c1.x * 0.6 + c1.y * 0.8) * 1.37;
        float wA = sin(c1.x + sin(c1.y * 1.15 + uTime * 0.95));
        float wB = cos(c2.y - sin(c2.x * 1.12 - uTime * 1.05));
        float caustic = pow(clamp(1.0 - abs(wA + wB) * 0.52, 0.0, 1.0), 3.6);
        col += (uShallowColor * 1.25 + vec3(0.18, 0.35, 0.36)) * caustic * causticMask * 0.24;
      }
    }

    // Schlick Fresnel + sky reflection
    float fresnel = 0.03 + 0.97 * pow(1.0 - NdotV, 5.0);
    vec3 R = reflect(-V, N);
    float skyT = pow(clamp(R.y, 0.0, 1.0), 0.55);
    vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, skyT);
    float sunHalo = pow(max(dot(R, uSunDir), 0.0), 7.0);
    float fillHalo = pow(max(dot(R, uFillDir), 0.0), 5.0);
    skyRefl += uSunColor * sunHalo * 0.38 + uFillColor * fillHalo * 0.18;
    col = mix(col, skyRefl, clamp(fresnel * 0.84, 0.0, 0.88));

    // Dual light specular glints
    vec3 Hsun = normalize(uSunDir + V);
    float NdotHsun = max(dot(N, Hsun), 0.0);
    float sunGlint = pow(NdotHsun, 210.0) * 1.65 * detailFade;
    float sunSheen = pow(NdotHsun, 26.0) * 0.20;

    vec3 Hfill = normalize(uFillDir + V);
    float NdotHfill = max(dot(N, Hfill), 0.0);
    float fillGlint = pow(NdotHfill, 96.0) * 0.58 * detailFade;

    float specMask = smoothstep(0.0, 0.18, depthPos);
    col += (uSunColor * (sunGlint + sunSheen) + uFillColor * fillGlint) * specMask;

    // 1) Open-water wind-driven wave-crest whitecaps (distance faded)
    float totalFoam = 0.0;
    if (detailFade > 0.02 && uFoamAmount > 0.01 && uWaveHeight > 0.15) {
      vec2 windFlow = normalize(uWindDir) * uTime * 0.32 * uWaveSpeed;
      float fbmFoam = fbm2(vWorldPos.xz * 0.55 * uWaveScale - windFlow);
      float crestScore = (vWaveCrest * 0.58 + microCrest * 0.42) * min(1.35, uWaveHeight * 0.85) + fbmFoam * 0.40;
      float whitecap = smoothstep(0.92 - min(0.32, uFoamAmount * 0.16), 1.28, crestScore) * vShoreDamp;
      float lacyWake = smoothstep(0.76, 1.12, crestScore) * smoothstep(0.40, 0.80, fbmFoam) * 0.42 * vShoreDamp;
      totalFoam += clamp((whitecap + lacyWake) * uFoamAmount * detailFade, 0.0, 0.95);
    }

    // 2) Multi-band animated shoreline surf breakers & lacy receding beach foam
    float shoreZone = (1.0 - smoothstep(0.02, 1.05, depthPos)) * smoothstep(-0.04, 0.04, waterDepth);
    if (shoreZone > 0.005 && (uFoamAmount > 0.01 || uShoreWaves > 0.01)) {
      float fn1 = vnoise(vWorldPos.xz * 1.35 + vec2(uTime * 0.18, -uTime * 0.14));
      float fn2 = vnoise(vWorldPos.xz * 4.4 - vec2(uTime * 0.24, uTime * 0.20));
      float fNoise = fn1 * 0.62 + fn2 * 0.38;

      float surfPhase = depthPos * 13.5 - uTime * (2.35 * max(0.35, uWaveSpeed)) + fNoise * 4.2;
      float breaker1 = pow(clamp(sin(surfPhase) * 0.5 + 0.5, 0.0, 1.0), 3.2);
      float breaker2 = pow(clamp(sin(surfPhase * 0.55 + 1.7) * 0.5 + 0.5, 0.0, 1.0), 4.0);
      float surfBands = (breaker1 * 0.72 + breaker2 * 0.48) * smoothstep(1.05, 0.06, depthPos) * uShoreWaves;

      float waterline = (1.0 - smoothstep(0.0, 0.16, depthPos)) * (0.55 + 0.45 * fNoise);
      float lacyWeb = smoothstep(0.46, 0.78, fn2) * (1.0 - smoothstep(0.05, 0.65, depthPos)) * 0.52;

      float shoreFoam = clamp(
        (surfBands * (0.55 + 0.45 * fNoise) + waterline * 0.85 + lacyWeb) * shoreZone * max(0.25, uFoamAmount),
        0.0,
        1.0
      );
      totalFoam = clamp(totalFoam + shoreFoam, 0.0, 1.0);
    }

    // Lit foam with subtle sun warmth
    vec3 litFoam = uFoamColor * (0.78 + 0.28 * max(0.0, uSunDir.y)) + uSunColor * 0.10;
    col = mix(col, litFoam, totalFoam * 0.82);

    // Soft coastal translucency -> deep pelagic opacity
    float shoreAlpha = smoothstep(-0.04, 0.12, waterDepth);
    float depthAlpha = mix(0.54, 0.95, 1.0 - exp(-depthPos * 0.85));
    float alpha = clamp((depthAlpha + totalFoam * 0.35) * shoreAlpha, 0.0, 0.97);

    // Per-Player Fog of War shroud
    if (uHasFogTex > 0.5) {
      float revealed = texture2D(uFogTex, clampedUv).r;
      float fogShade = (1.0 - revealed) * uFogGmAlpha;
      vec3 shroudColor = vec3(0.025, 0.03, 0.045);
      col = mix(col, shroudColor, clamp(fogShade * 0.95, 0.0, 0.95));
      alpha = mix(alpha, 0.98, clamp(fogShade, 0.0, 0.95));
    }

    // Seamless scene distance fog
    float fogFactor = smoothstep(uFogNear, uFogFar, camDist);
    col = mix(col, uFogColor, fogFactor);
    alpha = mix(alpha, 1.0, fogFactor * 0.85);

    gl_FragColor = vec4(col, alpha);
  }
`;

export const TERRAIN_SHADER_COMMON = `
  varying vec3 vTerrWorldPos;
  varying vec3 vTerrWorldNormal;
  uniform float uSeaY;
  uniform float uDispScale;
  uniform float uTerrainSize;
  uniform float uShowBiome;
  uniform sampler2D uPaintMap;
  uniform float uHasPaintMap;
  uniform sampler2D uFogTex;
  uniform float uHasFogTex;
  uniform float uFogGmAlpha;
  uniform float uColorRichness;
  uniform float uSnowLine;
  uniform float uRockContrast;
  uniform float uBeachWidth;
  uniform float uAridity;
  uniform float uLushness;
  vec2 tFineGrad = vec2(0.0);
  float tStrataVal = 0.5;
  float tBumpFade = 1.0;

  float tHash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float tNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = tHash21(i);
    float b = tHash21(i + vec2(1.0, 0.0));
    float c = tHash21(i + vec2(0.0, 1.0));
    float d = tHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float tFbm2(vec2 p) {
    float v = 0.65 * tNoise(p);
    p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.07;
    v += 0.35 * tNoise(p);
    return v;
  }

  vec3 tNoiseD(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = tHash21(i);
    float b = tHash21(i + vec2(1.0, 0.0));
    float c = tHash21(i + vec2(0.0, 1.0));
    float d = tHash21(i + vec2(1.0, 1.0));
    float k1 = b - a;
    float k2 = c - a;
    float k3 = a - b - c + d;
    float val = a + k1 * u.x + k2 * u.y + k3 * u.x * u.y;
    vec2 grad = du * vec2(k1 + k3 * u.y, k2 + k3 * u.x);
    return vec3(val, grad);
  }

  vec3 tFbm2D(vec2 p) {
    vec3 n0 = tNoiseD(p);
    vec3 n1 = tNoiseD(p * 2.07 + vec2(19.3, -7.1));
    return vec3(
      n0.x * 0.64 + n1.x * 0.36,
      n0.yz * 0.64 + n1.yz * (0.36 * 2.07)
    );
  }
`;

export const TERRAIN_MAP_CHUNK = `
  vec3 tWPos = vTerrWorldPos;
  vec3 tWNorm = normalize(vTerrWorldNormal);
  float tSlope = clamp(1.0 - tWNorm.y, 0.0, 1.0);
  float tAboveSea = tWPos.y - uSeaY;
  float tHNorm = clamp(tWPos.y / max(uDispScale, 0.001), 0.0, 1.0);
  vec2 tWorldUv = clamp(vec2(tWPos.x / max(uTerrainSize, 1.0) + 0.5, tWPos.z / max(uTerrainSize, 1.0) + 0.5), 0.001, 0.999);

  float tCamDist = length(cameraPosition - tWPos);
  tBumpFade = 1.0 - smoothstep(45.0, 150.0, tCamDist);

  float fMacro = tFbm2(tWPos.xz * 0.045 + vec2(4.2, -3.1));
  float fMoisture = tFbm2(tWPos.xz * 0.075 + vec2(-11.4, 8.7));
  float fLarge = tFbm2(tWPos.xz * 0.18);
  vec3 fineSample = tFbm2D(tWPos.xz * 0.95);
  float fFine = fineSample.x;
  tFineGrad = fineSample.yz;
  tStrataVal = fLarge;
  float strata = sin(tWPos.y * 3.8 + fLarge * 3.4) * 0.5 + 0.5;

  if (uShowBiome > 0.5) {
    // Rich multi-biome procedural palette in linear RGB
    vec3 lushGrass = mix(vec3(0.022, 0.068, 0.018), vec3(0.055, 0.115, 0.026), fFine);
    vec3 meadowGold = vec3(0.095, 0.110, 0.024);
    vec3 borealForest = vec3(0.012, 0.042, 0.018);
    vec3 savannaOchre = mix(vec3(0.115, 0.075, 0.022), vec3(0.155, 0.088, 0.028), fFine);
    vec3 autumnAmber = vec3(0.135, 0.048, 0.014);
    vec3 highlandHeather = mix(vec3(0.048, 0.036, 0.046), vec3(0.068, 0.058, 0.032), fFine);

    // Blend baked albedo with rich world-space biome zones
    vec3 vegCol = mix(lushGrass, meadowGold, smoothstep(0.52, 0.80, fLarge) * 0.55);
    vegCol = mix(vegCol, borealForest, smoothstep(0.46, 0.76, fMoisture) * smoothstep(0.20, 0.55, tHNorm) * 0.72);

    // Aridity / Savanna & Autumn forest patches
    float dryZone = clamp((1.0 - fMoisture) * 0.75 + uAridity * 0.85 - 0.35, 0.0, 1.0);
    vegCol = mix(vegCol, savannaOchre, dryZone * (1.0 - smoothstep(0.45, 0.68, tHNorm)) * 0.78);
    float autumnPatch = smoothstep(0.62, 0.84, fMacro) * smoothstep(0.24, 0.52, tHNorm);
    vegCol = mix(vegCol, autumnAmber, autumnPatch * 0.52 * uColorRichness);

    // Highland heather & alpine tundra transition
    float heatherZone = smoothstep(0.44, 0.64, tHNorm) * (1.0 - smoothstep(0.66, 0.80, tHNorm));
    vegCol = mix(vegCol, highlandHeather, heatherZone * 0.75);

    vec3 baseCol = mix(diffuseColor.rgb * mix(0.84, 1.28, fFine), vegCol, clamp(0.48 * uLushness * uColorRichness, 0.0, 0.88));

    // Golden sandy beaches on gentle coastal slopes + wet coastal shingle
    float beachBand = (1.0 - smoothstep(-0.15, 1.15 * max(0.2, uBeachWidth), tAboveSea)) * (1.0 - smoothstep(0.08, 0.22, tSlope));
    vec3 drySand = mix(vec3(0.145, 0.112, 0.058), vec3(0.195, 0.152, 0.082), fFine);
    baseCol = mix(baseCol, drySand, beachBand * 0.85);

    float shoreWet = 1.0 - smoothstep(-0.25, 0.52, tAboveSea);
    vec3 wetShore = mix(vec3(0.016, 0.022, 0.026), vec3(0.055, 0.044, 0.028), beachBand) * (0.8 + 0.4 * fFine);
    baseCol = mix(baseCol, wetShore, shoreWet * 0.76);

    // Hand-painted custom biome layer (blended before steep cliff rock so cliffs stay crisp)
    if (uHasPaintMap > 0.5) {
      vec4 pSample = texture2D(uPaintMap, tWorldUv);
      if (pSample.a > 0.01) {
        vec3 paintLin = pow(pSample.rgb, vec3(2.2)) * mix(0.82, 1.22, fFine);
        baseCol = mix(baseCol, paintLin, clamp(pSample.a * 0.92, 0.0, 0.95));
      }
    }

    // Stratified basalt, granite & warm canyon sandstone on steep slopes
    float rockMask = smoothstep(0.12, 0.33, tSlope);
    vec3 rockDark = mix(vec3(0.016, 0.018, 0.024), vec3(0.042, 0.022, 0.014), dryZone * 0.65);
    vec3 rockLit = mix(vec3(0.062, 0.064, 0.074), vec3(0.125, 0.068, 0.036), dryZone * 0.70);
    vec3 rockCol = mix(rockDark, rockLit, clamp((strata * 0.72 + fFine * 0.28) * uRockContrast, 0.0, 1.0));
    baseCol = mix(baseCol, rockCol, rockMask * 0.90);

    // Wind-swept alpine snow & glacial ice above snowLine
    float snowStart = clamp(uSnowLine - 0.08, 0.15, 0.95);
    float snowEnd = clamp(uSnowLine + 0.12, snowStart + 0.05, 1.02);
    float snowFactor = smoothstep(snowStart, snowEnd, tHNorm + (fLarge - 0.5) * 0.14 - tSlope * 0.44);
    vec3 snowCol = mix(vec3(0.34, 0.40, 0.48), vec3(0.64, 0.68, 0.74), fFine);
    baseCol = mix(baseCol, snowCol, snowFactor * 0.94);

    // Subtle color richness boost
    float luma = dot(baseCol, vec3(0.2126, 0.7152, 0.0722));
    baseCol = max(vec3(0.0), mix(vec3(luma), baseCol, clamp(uColorRichness, 0.4, 2.0)));

    diffuseColor.rgb = baseCol;
  } else {
    // Architectural cartographic slate mode when Vegetation/Biome is toggled OFF (linear RGB)
    vec3 clay = mix(vec3(0.018, 0.022, 0.032), vec3(0.065, 0.075, 0.095), tHNorm);
    float contour = 1.0 - smoothstep(0.0, 0.055, abs(fract(tWPos.y * 0.85) - 0.5));
    clay = mix(clay, vec3(0.38, 0.22, 0.05), contour * 0.55);
    diffuseColor.rgb = clay;
  }

  // Per-Player Fog of War shroud
  if (uHasFogTex > 0.5) {
    float fogRevealed = texture2D(uFogTex, tWorldUv).r;
    float fogShade = (1.0 - fogRevealed) * uFogGmAlpha;
    vec3 fogShroudCol = vec3(0.012, 0.015, 0.024);
    diffuseColor.rgb = mix(diffuseColor.rgb, fogShroudCol, clamp(fogShade * 0.94, 0.0, 0.94));
  }
`;

export const TERRAIN_NORMAL_CHUNK = `
  if (tBumpFade > 0.01) {
    float tSlopeN = clamp(1.0 - normalize(vTerrWorldNormal).y, 0.0, 1.0);
    float strataN = cos(vTerrWorldPos.y * 3.8 + tStrataVal * 3.4);
    float microStrength = mix(0.28, 0.90, smoothstep(0.10, 0.36, tSlopeN)) * uRockContrast * tBumpFade;
    vec3 gradWorld = vec3(
      -tFineGrad.x * microStrength * 0.38,
      strataN * tSlopeN * 0.18 * uRockContrast * tBumpFade,
      -tFineGrad.y * microStrength * 0.38
    );
    normal = normalize(normal + (viewMatrix * vec4(gradWorld, 0.0)).xyz);
  }
`;

export const TERRAIN_ROUGHNESS_CHUNK = `
  {
    float tSlopeR = clamp(1.0 - normalize(vTerrWorldNormal).y, 0.0, 1.0);
    float tAboveR = vTerrWorldPos.y - uSeaY;
    float tHNormR = clamp(vTerrWorldPos.y / max(uDispScale, 0.001), 0.0, 1.0);
    float wetR = 1.0 - smoothstep(-0.15, 0.55, tAboveR);
    float snowR = smoothstep(uSnowLine - 0.05, uSnowLine + 0.12, tHNormR - tSlopeR * 0.45);
    roughnessFactor = mix(0.88, 0.70, smoothstep(0.15, 0.4, tSlopeR));
    roughnessFactor = mix(roughnessFactor, 0.52, snowR);
    roughnessFactor = mix(roughnessFactor, 0.24, wetR * 0.85);
  }
`;
