#version 300 es
// "The organ": a slow tracking shot along Jin's shelf. Three shelves of stoppered bottles slide
// past, each with a paper label carrying a real name from the library.
#include "common.glsl"

const float CELL = 1.25;      // the width of one bottle's place on the shelf
const float CELLS = 6.0;      // how many places slide past in one loop
const float PER = CELL * CELLS;
const float SHELF_H = 2.75;   // the height between shelves

float gScroll;

// Bottle n's proportions: x body radius, y body height, z neck radius, w neck height.
vec4 proportions(float id) {
  float a = h21(vec2(id, 3.0));
  float b = h21(vec2(id, 7.0));
  float c = h21(vec2(id, 11.0));
  return vec4(0.32 + 0.16 * a, 0.5 + 0.42 * b, 0.1 + 0.05 * c, 0.16 + 0.14 * a);
}

// A bottle with its base at y = 0.
float sdBottle(vec3 p, vec4 b) {
  float body = sdCappedCylinderY(p - vec3(0.0, b.y, 0.0), b.x - 0.07, b.y - 0.07) - 0.07;
  float neck = sdCappedCylinderY(p - vec3(0.0, b.y * 2.0 + b.w * 0.5, 0.0), b.z, b.w * 0.5 + 0.08);
  float d = smin(body, neck, 0.1);
  float lip = sdCappedCylinderY(p - vec3(0.0, b.y * 2.0 + b.w, 0.0), b.z + 0.03, 0.022) - 0.008;
  return min(d, lip);
}
float sdStopper(vec3 p, vec4 b) {
  vec3 q = p - vec3(0.0, b.y * 2.0 + b.w + 0.13, 0.0);
  return min(length(q) - (b.z + 0.035), sdCappedCylinderY(q + vec3(0.0, 0.1, 0.0), b.z * 0.72, 0.09));
}

// Which shelf and which place on it a point is nearest to.
void locate(vec3 p, out float row, out float id, out vec3 q) {
  row = floor((p.y + 0.0) / SHELF_H);
  float x = p.x + gScroll + row * 0.61;
  float i = floor(x / CELL);
  id = mod(i, CELLS) + 10.0 * mod(row + 8.0, 4.0);
  q = vec3((fract(x / CELL) - 0.5) * CELL, p.y - row * SHELF_H, p.z);
}

float mapGlass(vec3 p) {
  float row;
  float id;
  vec3 q;
  locate(p, row, id, q);
  return sdBottle(q, proportions(id));
}
float mapStopper(vec3 p) {
  float row;
  float id;
  vec3 q;
  locate(p, row, id, q);
  return sdStopper(q, proportions(id));
}
float mapWood(vec3 p) {
  float y = p.y - floor(p.y / SHELF_H + 0.5) * SHELF_H;
  return sdBox(vec3(0.0, y + 0.06, p.z), vec3(10.0, 0.06, 0.82)) - 0.012;
}
float mapAll(vec3 p) {
  return min(min(mapGlass(p), mapStopper(p)), mapWood(p));
}
float mapSolid(vec3 p) {
  return min(mapStopper(p), mapWood(p));
}

vec3 normalOf(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * mapAll(p + e.xyy) + e.yyx * mapAll(p + e.yyx) + e.yxy * mapAll(p + e.yxy) + e.xxx * mapAll(p + e.xxx));
}

const vec3 WN = vec3(-0.6, 0.1, 0.79);

float envL(vec3 d) {
  float up = 0.5 + 0.5 * d.y;
  return mix(0.015, 0.18, up * up) + windowLight(d, WN, 11.0);
}

float wallBehind(vec3 p) {
  float x = p.x + gScroll;
  float g = fbm(vec2(x * (4.0 / PER), p.y * 0.4 + 3.0), 4.0, 4);
  float py = (p.y - 3.8) * 0.28;
  float pool = exp(-py * py);
  return (0.04 + 0.2 * g) * (0.5 + pool);
}

float shadowOf(vec3 p, vec3 l) {
  float t = 0.03;
  float res = 1.0;
  for (int i = 0; i < 40; i++) {
    float d = mapSolid(p + l * t);
    if (d < 0.001) return 0.0;
    t += max(d, 0.02);
    if (t > 7.0) break;
  }
  // Bottles only part-shade what's behind them.
  t = 0.03;
  for (int i = 0; i < 26; i++) {
    float d = mapGlass(p + l * t);
    if (d < 0.002) {
      res = 0.55;
      break;
    }
    t += max(d, 0.03);
    if (t > 5.0) break;
  }
  return res;
}

float shadeSolid(vec3 p, vec3 n, vec3 rd, bool wood) {
  vec3 L = vec3(-2.6, 3.6 + p.y, 5.0) + 1.0 * randDir() - p;
  vec3 l = normalize(L);
  float x = p.x + gScroll;
  float albedo;
  if (wood) {
    float grain = fbm(vec2(x * (16.0 / PER), p.z * 24.0 + p.y * 40.0), 16.0, 4);
    albedo = 0.05 + 0.12 * grain;
  } else {
    albedo = 0.5;
  }
  float diff = max(dot(n, l), 0.0) * shadowOf(p + n * 0.01, l);
  vec3 h = normalize(l - rd);
  float spec = pow(max(dot(n, h), 0.0), 40.0) * 0.35;
  return (diff * albedo + spec * diff) * 1.5 + albedo * 0.13;
}

float behindGlass(vec3 ro, vec3 rd) {
  // Past the bottle: the shelf board, or the wall.
  float t = 0.02;
  for (int i = 0; i < 40; i++) {
    float d = mapWood(ro + rd * t);
    if (d < 0.002) {
      vec3 p = ro + rd * t;
      return shadeSolid(p, vec3(0.0, sign(rd.y) * -1.0, 0.0), rd, true);
    }
    t += d;
    if (t > 8.0) break;
  }
  float tw = (-1.2 - ro.z) / min(rd.z, -0.001);
  return wallBehind(ro + rd * tw);
}

float shadeGlass(vec3 p, vec3 n, vec3 rd) {
  float row;
  float id;
  vec3 q;
  locate(p, row, id, q);
  vec4 b = proportions(id);
  float ndv = max(dot(-rd, n), 0.0);
  float F = 0.045 + 0.95 * pow(1.0 - ndv, 5.0);
  float refl = envL(reflect(rd, n));

  // The paper label on the front of the body.
  float top = b.y * 2.0;
  float a = atan(q.x, q.z);
  float span = 0.95;
  float lh = min(b.y * 0.42, 0.26);
  float lc = b.y * 0.86;
  if (q.z > 0.0 && abs(a) < span && abs(q.y - lc) < lh && abs(length(q.xz) - b.x) < 0.03) {
    float n8 = mod(floor(id * 3.0 + row * 5.0), 8.0);
    vec2 uv = vec2((a / span) * 0.5 + 0.5, (q.y - lc) / lh * 0.5 + 0.5);
    uv.x = (n8 + uv.x) / 8.0;
    float ink = texture(uNames, uv).r;
    vec3 l = normalize(vec3(-2.6, 3.6 + p.y, 5.0) - p);
    float diff = max(dot(n, l), 0.0);
    return mix(0.02, 0.62, ink) * (0.24 + 1.0 * diff);
  }

  // Oil up to a line, darker in some bottles than others.
  float fill = top * (0.62 + 0.26 * h21(vec2(id, 21.0)));
  float dark = 0.05 + 0.85 * h21(vec2(id, 23.0));
  vec3 dir = refract(rd, n, 1.0 / 1.33);
  float through = behindGlass(p + rd * 0.9, rd);
  float T = 1.0;
  float inner = 0.0;
  if (q.y < fill) {
    T = mix(0.9, 0.08, dark);
    inner = (1.0 - dark) * 0.26 * (0.35 + 0.65 * smoothstep(-0.6, 0.6, dir.x + 0.3));
    float meniscus = (q.y - fill) / 0.018;
    inner += 0.75 * exp(-meniscus * meniscus);
  }
  float rim = mix(0.4, 1.0, smoothstep(0.05, 0.45, ndv));
  return mix((through * T + inner) * rim, refl, F);
}

float radiance(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 90; i++) {
    float d = mapAll(ro + rd * t);
    if (d < 0.0012) break;
    t += d * 0.92;
    if (t > 14.0) break;
  }
  float tw = (-1.2 - ro.z) / min(rd.z, -0.001);
  if (t > min(14.0, tw)) return wallBehind(ro + rd * tw);
  vec3 p = ro + rd * t;
  vec3 n = normalOf(p);
  float g = mapGlass(p);
  float s = mapStopper(p);
  float w = mapWood(p);
  if (g < s && g < w) return shadeGlass(p, n, rd);
  return shadeSolid(p, n, rd, w < s);
}

void main() {
  rngState = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uSeed * 26699u + 1u;
  pcg();
  float ph = mod((uFrame + uShutter * fract(uU.z + rnd())) / uFrames, 1.0);
  gScroll = PER * ph;

  vec2 sub = fract(uU.xy + vec2(rnd(), rnd()));
  vec2 uv = ((floor(gl_FragCoord.xy) + sub) * 2.0 - uRes) / uRes.y;

  vec3 target = vec3(0.0, 3.1, 0.0);
  vec3 cam = target + vec3(0.9, 0.25, 7.2);
  vec3 fw = normalize(target - cam);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd0 = normalize(uv.x * rt + uv.y * up + 2.25 * fw);

  const float aperture = 0.14;
  float focus = 6.9;
  vec3 pf = cam + rd0 * (focus / dot(rd0, fw));
  float la = fract(uU.w + rnd()) * TAU;
  float lr = sqrt(fract(uU.x * 7.0 + rnd())) * aperture;
  vec3 ro = cam + rt * (cos(la) * lr) + up * (sin(la) * lr);
  vec3 rd = normalize(pf - ro);

  float L = radiance(ro, rd);
  L = (isnan(L) || isinf(L)) ? 0.0 : clamp(L, 0.0, 40.0);
  fragColor = vec4(L, L, L, 1.0);
}
