#version 300 es
// "The ledger": a book of formulas, open on a dark table, its pages riffling over by themselves.
// The lines on the pages are laid out like a formula: a name on the left, an amount on the right.
#include "common.glsl"

const float W = 1.75;       // page width
const float D = 1.28;       // half the page's height (along the spine)
const int FLIPPING = 6;

float gPhase;

float pageAngle(int i) {
  // Each page lifts off the right-hand stack, sweeps over, and lands on the left.
  float t = fract(gPhase + float(i) / float(FLIPPING));
  float e = t * t * (3.0 - 2.0 * t);
  return mix(0.06, TAU * 0.5 - 0.06, e);
}

// Distance to one curved sheet, in the book's x-y cross-section around the spine.
float sdPage(vec3 p, float angle, float bend) {
  vec2 q = p.xy;
  float r = length(q);
  float a = atan(q.y, q.x);
  // The sheet curls: its angle changes along its width.
  float target = angle + bend * sin(r / W * 3.14159) * 0.36;
  float da = a - target;
  da = atan(sin(da), cos(da));
  float d = abs(da) * max(r, 0.02);
  d = max(d, r - W);
  return max(d - 0.006, abs(p.z) - D);
}

float stackHeight(float x) {
  // The two resting stacks swell up to the spine, like a real open book.
  float ax = abs(x);
  return 0.2 + 0.1 * exp(-ax * 1.5) - 0.06 * smoothstep(1.2, 1.8, ax);
}

float mapStacks(vec3 p) {
  float h = stackHeight(p.x);
  vec3 q = p - vec3(0.0, h * 0.5 - 0.21, 0.0);
  float d = sdBox(vec3(p.x, p.y - (h - 0.2) * 0.5 - 0.0, p.z), vec3(W, max(h * 0.5, 0.01), D));
  // The gutter between the stacks.
  d = max(d, -(length(p.xy - vec2(0.0, stackHeight(0.0) - 0.08)) - 0.07));
  return d * 0.8;
}

float mapPages(vec3 p, out int which) {
  which = -1;
  float best = 1e3;
  vec3 q = p - vec3(0.0, stackHeight(0.0) - 0.19, 0.0);
  for (int i = 0; i < FLIPPING; i++) {
    float t = fract(gPhase + float(i) / float(FLIPPING));
    float bend = sin(t * 3.14159) * (t < 0.5 ? 1.0 : 0.6);
    float d = sdPage(q, pageAngle(i), bend);
    if (d < best) {
      best = d;
      which = i;
    }
  }
  return best;
}

float map(vec3 p) {
  int w;
  return min(mapStacks(p), mapPages(p, w));
}

vec3 normalOf(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// Ruled lines of writing on a page: a name, and an amount in its own column.
float writing(vec2 uv, float seed) {
  // uv.x runs from the spine (0) to the edge (1); uv.y from one end of the page to the other.
  if (uv.x < 0.1 || uv.x > 0.92 || abs(uv.y) > 0.86) return 0.0;
  float rows = 15.0;
  float row = floor((uv.y + 1.0) * rows);
  float f = fract((uv.y + 1.0) * rows);
  float line = smoothstep(0.34, 0.42, f) * smoothstep(0.66, 0.58, f);
  float n = h21(vec2(row, seed));
  float nameEnd = 0.26 + 0.34 * n;
  float x = uv.x;
  float name = step(x, nameEnd);
  float wobble = 0.62 + 0.38 * vnoise(vec2(x * 90.0, row * 3.0 + seed), 1e4);
  float amount = step(0.76, x) * step(x, 0.8 + 0.1 * h21(vec2(row, seed + 2.0)));
  if (mod(row, 6.0) == 0.0) return 0.0;
  return line * max(name, amount) * wobble;
}

float shadow(vec3 p, vec3 l) {
  float t = 0.02;
  for (int i = 0; i < 44; i++) {
    float d = map(p + l * t);
    if (d < 0.0015) return 0.0;
    t += max(d, 0.012);
    if (t > 7.0) break;
  }
  return 1.0;
}

float table(vec3 p, vec3 rd) {
  float g = fbm(vec2(p.x * 1.3, p.z * 7.0), 1e4, 5);
  float albedo = 0.012 + 0.03 * g;
  vec3 L = vec3(-2.4, 5.0, 3.0) + 0.9 * randDir() - p;
  vec3 l = normalize(L);
  float diff = max(l.y, 0.0) * shadow(p + vec3(0.0, 0.01, 0.0), l);
  vec3 n = normalize(vec3((g - 0.5) * 0.08, 1.0, 0.0));
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  float refl = mix(0.03, 0.2, smoothstep(0.0, 0.5, reflect(rd, n).y)) + windowLight(reflect(rd, n), normalize(vec3(-0.45, 0.6, -0.65)), 1.6);
  return diff * albedo * 2.0 + F * refl * 0.75;
}

float radiance(vec3 ro, vec3 rd) {
  float t = 0.0;
  float tg = rd.y < 0.0 ? (-0.21 - ro.y) / rd.y : 1e5;
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0012) {
      hit = true;
      break;
    }
    t += d * 0.8;
    if (t > min(tg, 14.0)) break;
  }
  if (!hit) {
    if (tg < 1e4) {
      vec3 g = ro + rd * tg;
      float fade = smoothstep(9.0, 3.5, length(g.xz));
      return mix(0.008, table(g, rd), fade);
    }
    return 0.008;
  }
  vec3 p = ro + rd * t;
  vec3 n = normalOf(p);
  if (dot(n, rd) > 0.0) n = -n;
  int w;
  float dp = mapPages(p, w);
  bool sheet = dp < mapStacks(p) + 0.001;
  float albedo = 0.78;
  if (sheet) {
    vec3 q = p - vec3(0.0, stackHeight(0.0) - 0.19, 0.0);
    vec2 uv = vec2(length(q.xy) / W, q.z / D);
    albedo *= 1.0 - 0.72 * writing(uv, float(w) + 3.0 + floor(uv.x * 0.0));
  } else if (abs(n.y) > 0.6) {
    // The top of a resting stack is a page too.
    vec2 uv = vec2(abs(p.x) / W, p.z / D);
    albedo *= 1.0 - 0.72 * writing(uv, p.x > 0.0 ? 1.0 : 2.0);
  } else {
    // The edges of the stack: hundreds of pages.
    albedo *= 0.62 + 0.25 * sin(p.y * 620.0);
  }
  albedo *= 0.94 + 0.08 * fbm(vec2(p.x, p.z) * 40.0, 1e4, 2);
  vec3 L = vec3(-2.4, 5.0, 3.0) + 0.9 * randDir() - p;
  vec3 l = normalize(L);
  float nl = dot(n, l);
  float diff = max(nl, 0.0) * shadow(p + n * 0.006, l);
  // Light comes through a thin sheet from behind.
  float back = sheet ? max(-nl, 0.0) * 0.34 : 0.0;
  float rim = pow(1.0 - max(dot(-rd, n), 0.0), 3.0) * 0.1;
  return albedo * (diff * 1.25 + back + 0.13 * (0.6 + 0.4 * n.y)) + rim;
}

void main() {
  rngState = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uSeed * 26699u + 1u;
  pcg();
  gPhase = mod((uFrame + uShutter * fract(uU.z + rnd())) / uFrames, 1.0);

  vec2 sub = fract(uU.xy + vec2(rnd(), rnd()));
  vec2 uv = ((floor(gl_FragCoord.xy) + sub) * 2.0 - uRes) / uRes.y;

  vec3 target = vec3(0.0, 0.42, -0.1);
  vec3 cam = target + vec3(0.55, 3.2, 5.7);
  vec3 fw = normalize(target - cam);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd0 = normalize(uv.x * rt + uv.y * up + 2.5 * fw);

  const float aperture = 0.1;
  float focus = 6.2;
  vec3 pf = cam + rd0 * (focus / dot(rd0, fw));
  float la = fract(uU.w + rnd()) * TAU;
  float lr = sqrt(fract(uU.x * 7.0 + rnd())) * aperture;
  vec3 ro = cam + rt * (cos(la) * lr) + up * (sin(la) * lr);
  vec3 rd = normalize(pf - ro);

  float L = radiance(ro, rd);
  L = (isnan(L) || isinf(L)) ? 0.0 : clamp(L, 0.0, 40.0);
  fragColor = vec4(L, L, L, 1.0);
}
