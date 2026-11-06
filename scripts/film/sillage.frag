#version 300 es
// "Sillage": the film on the gate of Jin's Perfumery Library. An original little stop-motion
// scene: a snail whose shell is a stoppered glass flask, gliding along a garden path, leaving a
// silver trail on the ground and a thread of scent in the air. Sillage, the word for the trail a
// perfume leaves behind, means the wake of a boat.
//
// Everything is drawn by this shader; nothing comes from a photograph or from anyone else's film.
// The scene loops exactly, so it can be tiled and repeated forever.

precision highp float;
precision highp int;

uniform vec2 uRes;
uniform float uFrame;
uniform float uFrames;
uniform float uShutter;
uniform vec4 uU; // low-discrepancy numbers for this sample
uniform uint uSeed;
uniform sampler2D uLabel;

out vec4 fragColor;

const float TAU = 6.28318530718;

// ---------- random numbers ----------

uint rngState;
uint pcg() {
  uint s = rngState;
  rngState = s * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd() { return float(pcg()) / 4294967296.0; }
vec3 randDir() {
  float z = rnd() * 2.0 - 1.0;
  float a = rnd() * TAU;
  float r = sqrt(max(1.0 - z * z, 0.0));
  return vec3(r * cos(a), r * sin(a), z);
}

// ---------- noise, periodic in x so the ground can slide past forever ----------

float h21(vec2 p) {
  uvec2 q = uvec2(ivec2(p)) * uvec2(1597334677u, 3812015801u);
  uint h = (q.x ^ q.y) * 1597334677u;
  h ^= h >> 15u;
  h *= 2246822519u;
  return float(h) / 4294967295.0;
}

float vnoise(vec2 p, float per) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float x0 = mod(i.x, per);
  float x1 = mod(i.x + 1.0, per);
  return mix(mix(h21(vec2(x0, i.y)), h21(vec2(x1, i.y)), u.x), mix(h21(vec2(x0, i.y + 1.0)), h21(vec2(x1, i.y + 1.0)), u.x), u.y);
}

float fbm(vec2 p, float per, int octaves) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < octaves; i++) {
    s += a * vnoise(p, per);
    p = p * 2.0 + vec2(0.0, 17.3);
    per *= 2.0;
    a *= 0.5;
  }
  return s;
}

// Distance to the nearest cell point, and that cell's own random number.
vec2 worley(vec2 p, float per) {
  vec2 ip = floor(p);
  vec2 fp = p - ip;
  float best = 9.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(x, y);
      vec2 c = ip + g;
      c.x = mod(c.x, per);
      vec2 o = vec2(h21(c), h21(c + vec2(37.0, 91.0)));
      vec2 r = g + o - fp;
      float d = dot(r, r);
      if (d < best) {
        best = d;
        id = h21(c + vec2(11.0, 5.0));
      }
    }
  }
  return vec2(sqrt(best), id);
}

// ---------- shapes ----------

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * h * k / 6.0;
}

float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

float sdCylinder(vec3 p, vec3 a, vec3 b, float r) {
  vec3 ba = b - a;
  vec3 pa = p - a;
  float baba = dot(ba, ba);
  float paba = dot(pa, ba);
  float x = length(pa * baba - ba * paba) - r * baba;
  float y = abs(paba - baba * 0.5) - baba * 0.5;
  float x2 = x * x;
  float y2 = y * y * baba;
  float d = (max(x, y) < 0.0) ? -min(x2, y2) : (((x > 0.0) ? x2 : 0.0) + ((y > 0.0) ? y2 : 0.0));
  return sign(d) * sqrt(abs(d)) / baba;
}

// ---------- the scene's fixed numbers ----------

const float PER = 6.0;                    // how far the world slides past in one loop
const float K = 24.0;                     // noise cells in that distance
const float RF = 0.76;                    // the flask's radius
const vec3 FLASK = vec3(-0.2, 1.05, 0.0);
const vec3 NECK = vec3(-0.6508, 0.7593, 0.0); // the neck's direction, up and back
const float WALL = -6.5;                  // the far, out-of-focus garden

const vec3 KEY = vec3(-4.2, 6.0, 5.0);
const vec3 RIM = vec3(4.5, 3.2, -4.5);

// ---------- the pose at this moment in the loop ----------

float gPhase;
float gScroll;
vec3 jA, jB, jH;                 // the neck and head
vec3 e0, e1, e2, g0, g1, g2;     // the near and far eye stalks
vec3 fN0, fN1, fF0, fF1;         // the lower feelers
vec3 gC;                         // the flask's centre
mat3 gR, gRi;                    // the flask's rocking
vec3 gLevelN;                    // the liquid's surface
float gLevelY;

mat3 rotZ(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

void pose(float ph) {
  gPhase = ph;
  gScroll = PER * ph;
  float w = TAU * ph;
  float stroke = sin(2.0 * w); // two crawling strokes per loop
  jA = vec3(1.04 + 0.025 * stroke, 0.30 + 0.01 * stroke, 0.0);
  jB = vec3(1.42 + 0.05 * sin(2.0 * w - 0.6), 0.66 + 0.03 * sin(2.0 * w + 0.5), 0.0);
  jH = jB + vec3(0.30 + 0.025 * sin(2.0 * w - 1.0), 0.07 + 0.02 * sin(2.0 * w + 0.9), 0.0);

  // The eye stalks sway, and the near one turns to look at us for a moment.
  vec3 base = jH + vec3(0.02, 0.08, 0.0);
  float sa = sin(w);
  float ca = cos(w);
  float look = smoothstep(0.1, 0.6, 0.5 + 0.5 * sin(w - 1.2));
  e0 = base + vec3(0.0, 0.0, 0.07);
  e1 = e0 + vec3(0.09 + 0.04 * sa, 0.34 + 0.01 * ca, 0.07 + 0.05 * look);
  e2 = e1 + vec3(0.1 + 0.08 * sa, 0.33 + 0.03 * ca, 0.07 + 0.13 * look);
  g0 = base + vec3(0.0, 0.0, -0.07);
  g1 = g0 + vec3(-0.03 - 0.03 * sa, 0.35 - 0.015 * ca, -0.06);
  g2 = g1 + vec3(-0.02 - 0.09 * sa, 0.33 - 0.04 * sin(2.0 * w), -0.08);

  fN0 = jH + vec3(0.11, -0.03, 0.08);
  fN1 = fN0 + vec3(0.19 + 0.03 * sin(2.0 * w), -0.13 + 0.025 * sin(3.0 * w), 0.09);
  fF0 = jH + vec3(0.11, -0.03, -0.08);
  fF1 = fF0 + vec3(0.19 + 0.03 * sin(2.0 * w + 1.5), -0.13 + 0.025 * sin(3.0 * w + 2.0), -0.09);

  // The flask rocks a little with each stroke, and the liquid slops after it.
  gC = FLASK + vec3(0.0, 0.012 * sin(2.0 * w + 0.3), 0.0);
  gR = rotZ(0.028 * sin(2.0 * w + 1.2));
  gRi = transpose(gR);
  gLevelN = normalize(vec3(0.07 * sin(2.0 * w + 0.5), 1.0, 0.03 * cos(2.0 * w)));
  gLevelY = 0.42;
}

// ---------- the snail ----------

// The grooved, pebbled skin.
float skinBumps(vec3 p) {
  vec2 g = vec2(p.x * 17.0 + p.y * 11.0, p.z * 24.0 + p.y * 15.0);
  g += 1.3 * sin(vec2(p.z * 9.0 + p.y * 7.0, p.x * 8.0 - p.y * 5.0));
  return sin(g.x) * sin(g.y) + 0.5 * sin(g.x * 2.3 + 1.3) * sin(g.y * 1.9 + 0.7);
}

float sdSkin(vec3 p) {
  if (length(p - vec3(0.0, 0.6, 0.0)) > 3.3) return length(p - vec3(0.0, 0.6, 0.0)) - 3.1;
  vec3 q = p;
  // A wave travels forward along the foot.
  q.y -= 0.016 * sin(q.x * 6.5 - 2.0 * TAU * gPhase) * smoothstep(1.3, 0.6, q.x);

  float d = sdRoundCone(q, vec3(-1.88, 0.03, 0.0), vec3(-1.15, 0.075, 0.0), 0.022, 0.10);
  d = smin(d, sdRoundCone(q, vec3(-1.15, 0.075, 0.0), vec3(-0.32, 0.15, 0.0), 0.10, 0.23), 0.06);
  d = smin(d, sdRoundCone(q, vec3(-0.32, 0.15, 0.0), vec3(0.55, 0.18, 0.0), 0.23, 0.245), 0.06);
  d = smin(d, sdRoundCone(q, vec3(0.55, 0.18, 0.0), jA, 0.245, 0.225), 0.08);
  d = smin(d, sdRoundCone(q, jA, jB, 0.225, 0.175), 0.08);
  d = smin(d, sdRoundCone(q, jB, jH, 0.175, 0.14), 0.06);
  // The foot's wide, flat skirt.
  d = smin(d, sdEllipsoid(q - vec3(-0.25, 0.01, 0.0), vec3(1.66, 0.075, 0.33)), 0.05);
  // The cup of flesh the flask sits in; the flask itself stays hollow of snail.
  float cup = sdEllipsoid(q - vec3(-0.15, 0.40, 0.0), vec3(0.72, 0.24, 0.42));
  d = smin(d, cup, 0.14);
  d = max(d, -(length(p - gC) - RF - 0.004));

  // Eye stalks, with a small dark eye on the end of each.
  float s = sdRoundCone(p, e0, e1, 0.05, 0.034);
  s = smin(s, sdRoundCone(p, e1, e2, 0.034, 0.026), 0.02);
  s = smin(s, length(p - e2 - normalize(e2 - e1) * 0.01) - 0.05, 0.025);
  float s2 = sdRoundCone(p, g0, g1, 0.05, 0.034);
  s2 = smin(s2, sdRoundCone(p, g1, g2, 0.034, 0.026), 0.02);
  s2 = smin(s2, length(p - g2 - normalize(g2 - g1) * 0.01) - 0.05, 0.025);
  d = smin(d, min(s, s2), 0.05);
  // Lower feelers.
  d = smin(d, sdRoundCone(p, fN0, fN1, 0.042, 0.018), 0.04);
  d = smin(d, sdRoundCone(p, fF0, fF1, 0.042, 0.018), 0.04);

  if (d < 0.06) d += 0.0065 * skinBumps(q);
  return d;
}

// ---------- the flask ----------

float sdGlass(vec3 p) {
  vec3 q = gRi * (p - gC);
  float d = length(q) - RF;
  d = smin(d, sdCylinder(q, NECK * RF * 0.82, NECK * (RF + 0.30), 0.145), 0.09);
  d = min(d, sdCylinder(q, NECK * (RF + 0.29), NECK * (RF + 0.335), 0.185) - 0.012);
  return d;
}

float sdStopper(vec3 p) {
  vec3 q = gRi * (p - gC);
  float d = sdCylinder(q, NECK * (RF + 0.30), NECK * (RF + 0.42), 0.11);
  return smin(d, length(q - NECK * (RF + 0.56)) - 0.165, 0.03);
}

const int M_SKIN = 1;
const int M_GLASS = 2;
const int M_STOPPER = 3;

float mapOpaque(vec3 p) {
  return min(sdSkin(p), sdStopper(p));
}
float mapAll(vec3 p) {
  return min(mapOpaque(p), sdGlass(p));
}

int materialAt(vec3 p) {
  float a = sdSkin(p);
  float b = sdGlass(p);
  float c = sdStopper(p);
  if (b < a && b < c) return M_GLASS;
  return c < a ? M_STOPPER : M_SKIN;
}

vec3 normalAt(vec3 p, int m) {
  const vec2 e = vec2(1.0, -1.0) * 0.0012;
  if (m == M_GLASS) {
    return normalize(e.xyy * sdGlass(p + e.xyy) + e.yyx * sdGlass(p + e.yyx) + e.yxy * sdGlass(p + e.yxy) + e.xxx * sdGlass(p + e.xxx));
  }
  return normalize(e.xyy * mapOpaque(p + e.xyy) + e.yyx * mapOpaque(p + e.yyx) + e.yxy * mapOpaque(p + e.yxy) + e.xxx * mapOpaque(p + e.xxx));
}

// Everything solid fits in this sphere, so most rays don't need marching at all.
const vec3 BC = vec3(0.0, 0.95, 0.0);
const float BR = 2.9;
bool bounds(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 oc = ro - BC;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + BR * BR;
  if (h < 0.0) return false;
  h = sqrt(h);
  t0 = max(-b - h, 0.0);
  t1 = -b + h;
  return t1 > 0.0;
}

float marchOpaque(vec3 ro, vec3 rd, float tmax) {
  float t0;
  float t1;
  if (!bounds(ro, rd, t0, t1)) return -1.0;
  float t = t0;
  tmax = min(tmax, t1);
  for (int i = 0; i < 120; i++) {
    float d = mapOpaque(ro + rd * t);
    if (d < 0.0007) return t;
    t += d * 0.85;
    if (t > tmax) break;
  }
  return -1.0;
}

float marchAll(vec3 ro, vec3 rd, float tmax) {
  float t0;
  float t1;
  if (!bounds(ro, rd, t0, t1)) return -1.0;
  float t = t0;
  tmax = min(tmax, t1);
  for (int i = 0; i < 140; i++) {
    float d = mapAll(ro + rd * t);
    if (d < 0.0007) return t;
    t += d * 0.85;
    if (t > tmax) break;
  }
  return -1.0;
}

// ---------- light ----------

// The window and the room, as reflected in the glass and the wet trail.
float env(vec3 d) {
  float up = 0.5 + 0.5 * d.y;
  float c = mix(0.035, 0.42, up * up);
  // A paned window, up and to the left.
  vec3 wn = normalize(vec3(-0.55, 0.62, 0.56));
  float f = dot(d, wn);
  if (f > 0.0) {
    vec3 wu = normalize(cross(vec3(0.0, 1.0, 0.0), wn));
    vec3 wv = cross(wn, wu);
    vec2 w = vec2(dot(d, wu), dot(d, wv)) / f;
    vec2 a = abs(w) - vec2(0.42, 0.56);
    if (a.x < 0.0 && a.y < 0.0) {
      vec2 pane = abs(fract(w * vec2(2.38, 2.68) + 0.5) - 0.5);
      if (min(pane.x, pane.y) > 0.045) c += 15.0 * smoothstep(-0.8, 0.5, w.y);
    }
  }
  // A long, soft strip of light behind and to the right.
  vec3 sn = normalize(vec3(0.75, 0.28, -0.6));
  c += 1.4 * smoothstep(0.86, 0.985, dot(d, sn));
  // Daylight low over the far end of the path, which is what the wet trail catches.
  c += 1.5 * smoothstep(-0.02, 0.12, d.y) * smoothstep(0.42, 0.14, d.y) * smoothstep(-0.2, -0.8, d.z);
  return c;
}

// How much light gets through the flask on its way to a point: it's mostly in shadow, but the
// liquid works as a lens and throws a bright spot.
float throughFlask(vec3 ro, vec3 l) {
  vec3 oc = ro - gC;
  float b = dot(oc, l);
  if (b > 0.0) return 1.0;
  float dist2 = dot(oc, oc) - b * b;
  if (dist2 > RF * RF) return 1.0;
  float imp = dist2 / (RF * RF);
  return 0.24 + 1.7 * exp(-imp / 0.07);
}

float shadow(vec3 ro, vec3 l, float maxT) {
  if (marchOpaque(ro, l, maxT) > 0.0) return 0.0;
  return throughFlask(ro, l);
}

// Key and rim light on a surface, each from a random point on its lamp: soft shadows, once
// enough samples are averaged.
float lit(vec3 p, vec3 n, vec3 rd, float albedo, float wrap, float gloss, float shine) {
  float sum = 0.0;
  for (int i = 0; i < 2; i++) {
    vec3 lp = (i == 0) ? KEY : RIM;
    float lr = (i == 0) ? 1.5 : 1.0;
    float I = (i == 0) ? 1.45 : 1.15;
    vec3 L = lp + lr * randDir() - p;
    float dist = length(L);
    vec3 l = L / dist;
    float nl = (dot(n, l) + wrap) / (1.0 + wrap);
    if (nl <= 0.0) continue;
    float vis = shadow(p + n * 0.006, l, dist);
    if (vis <= 0.0) continue;
    vec3 h = normalize(l - rd);
    float spec = pow(max(dot(n, h), 0.0), gloss) * shine;
    sum += (nl * albedo + spec) * vis * I;
  }
  return sum;
}

float occlusion(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.015 + 0.075 * float(i);
    occ += (h - min(mapOpaque(p + n * h), p.y + n.y * h)) * sca;
    sca *= 0.65;
  }
  return clamp(1.0 - 1.9 * occ, 0.0, 1.0);
}

// ---------- the ground and the garden ----------

// Damp, fine gravel with the odd bigger stone. .x is height, .y is how pale the stone is.
vec2 groundHeight(vec2 w) {
  vec2 u = w * (K / PER);
  float base = fbm(u * 1.5, K * 1.5, 5);
  vec2 cell = worley(u * 0.75, K * 0.75);
  float r = cell.x / 0.34;
  float dome = sqrt(max(1.0 - r * r, 0.0)) * smoothstep(0.74, 0.92, cell.y);
  vec2 grit = worley(u * 3.0, K * 3.0);
  float g = sqrt(max(1.0 - grit.x * grit.x * 4.0, 0.0)) * grit.y;
  return vec2(base * 0.5 + dome * 0.6 + g * 0.16, dome * cell.y + g * 0.1);
}

float trailMask(float wx, vec3 p) {
  float zc = -0.02 + 0.09 * (vnoise(vec2(wx * (6.0 / PER), 3.0), 6.0) - 0.5);
  float width = 0.26 + 0.07 * (vnoise(vec2(wx * (12.0 / PER), 9.0), 12.0) - 0.5);
  float m = smoothstep(width, width - 0.07, abs(p.z - zc));
  m *= smoothstep(-1.6, -1.9, p.x);
  float dry = smoothstep(-1.9, -4.2, p.x);
  m *= mix(1.0, smoothstep(0.34, 0.62, vnoise(vec2(wx * (24.0 / PER), p.z * 7.0), 24.0)), dry * 0.75);
  return m;
}

float shadeGround(vec3 ro, vec3 rd, vec3 p) {
  float wx = p.x + gScroll;
  vec2 w = vec2(wx, p.z);
  const float e = 0.012;
  vec2 g0 = groundHeight(w);
  float h0 = g0.x;
  float hx = groundHeight(w + vec2(e, 0.0)).x;
  float hz = groundHeight(w + vec2(0.0, e)).x;
  float bump = 0.1;
  vec3 n = normalize(vec3(-(hx - h0) * bump / e, 1.0, -(hz - h0) * bump / e));

  float trail = trailMask(wx, p);
  float patches = fbm(w * (6.0 / PER), 6.0, 3);
  float albedo = (0.06 + 0.075 * smoothstep(0.22, 0.56, h0) + 0.03 * g0.y) * mix(0.55, 1.45, smoothstep(0.3, 0.7, patches));
  albedo = mix(albedo, albedo * 0.45, trail);

  float L = lit(p, mix(n, vec3(0.0, 1.0, 0.0), trail * 0.8), rd, albedo, 0.0, 40.0, 0.04 + trail * 0.3);
  L += albedo * 0.3 * occlusion(p, vec3(0.0, 1.0, 0.0));

  // The trail is wet: it mirrors the room, in glints broken up by what's under it.
  if (trail > 0.001) {
    float g = fbm(vec2(wx * (K * 2.0 / PER), p.z * 30.0), K * 2.0, 3) - 0.5;
    float g2 = vnoise(vec2(wx * (K * 8.0 / PER), p.z * 80.0), K * 8.0) - 0.5;
    vec3 nw = normalize(vec3(g * 0.55 + g2 * 0.3, 1.0, (g2 - g) * 0.5));
    float ndv = max(dot(-rd, nw), 0.0);
    float F = 0.05 + 0.95 * pow(1.0 - ndv, 4.0);
    float glints = smoothstep(0.34, 0.6, fbm(vec2(wx * (K / PER), p.z * 16.0 + 40.0), K, 3));
    L = mix(L, env(reflect(rd, nw)) * mix(0.25, 1.25, glints), trail * clamp(F * 1.5, 0.0, 0.9));
  }
  // The path disappears into the distance.
  float far = smoothstep(-0.5, WALL * 0.92, p.z);
  return mix(L, 0.045, far);
}

float shadeWall(vec3 p) {
  float wx = p.x + gScroll;
  vec2 u = vec2(wx, p.y * 1.0) * (6.0 / PER);
  float leaves = fbm(u, 6.0, 4);
  float L = mix(0.006, 0.085, smoothstep(0.36, 0.68, leaves));
  L *= mix(0.45, 1.7, smoothstep(-0.5, 7.0, p.y - p.x * 0.35));
  // Light through the leaves: the lens turns these into soft discs.
  vec2 c = worley(vec2(wx, p.y) * (5.0 / PER), 5.0);
  L += 0.62 * smoothstep(0.17, 0.12, c.x) * smoothstep(0.55, 0.95, c.y) * smoothstep(0.8, 2.6, p.y);
  return L;
}

float backgroundAlong(vec3 ro, vec3 rd, float tG, float tW) {
  if (tG < tW) return shadeGround(ro, rd, ro + rd * tG);
  if (tW < 1e4) return shadeWall(ro + rd * tW);
  return 0.1;
}

// ---------- surfaces ----------

float shadeSurface(vec3 p, vec3 rd, int m) {
  vec3 n = normalAt(p, m);
  float ao = occlusion(p, n);
  if (m == M_STOPPER) {
    // Ground glass: pale and soft, lit almost from inside.
    float L = lit(p, n, rd, 0.5, 0.35, 24.0, 0.3);
    return L + 0.16 * ao * mix(0.35, 1.0, 0.5 + 0.5 * n.y);
  }
  // Skin: mottled, darker on top of the head and stalks, wet everywhere.
  float spots = fbm(vec2(p.x + p.y * 0.6, p.z + p.y * 0.4) * 26.0 + 50.0, 1e4, 4);
  float albedo = mix(0.2, 0.4, smoothstep(0.32, 0.68, spots));
  albedo *= mix(1.0, 0.62, smoothstep(0.55, 1.2, p.y) * smoothstep(1.0, 1.4, p.x));
  albedo *= mix(1.0, 0.85 + 0.15 * sin(p.x * 46.0 + sin(p.z * 9.0) * 2.0), smoothstep(0.13, 0.04, p.y));
  float L = lit(p, n, rd, albedo, 0.28, 80.0, 0.9);
  L += albedo * 0.34 * ao * mix(0.3, 1.0, 0.5 + 0.5 * n.y);
  // A wet sheen at the edges.
  float ndv = max(dot(-rd, n), 0.0);
  L += env(reflect(rd, n)) * (0.03 + 0.5 * pow(1.0 - ndv, 4.0)) * ao;
  // The eyes.
  if (length(p - e2) < 0.058 || length(p - g2) < 0.058) {
    vec3 tip = length(p - e2) < 0.058 ? e2 : g2;
    vec3 axis = normalize(tip - (length(p - e2) < 0.058 ? e1 : g1));
    float cap = dot(normalize(p - tip), normalize(axis + vec3(0.25, 0.0, 0.55)));
    L *= mix(1.0, 0.06, smoothstep(0.62, 0.74, cap));
  }
  return L;
}

// What a ray sees if it ignores the glass: the snail, the ground, the garden.
float traceOpaque(vec3 ro, vec3 rd) {
  float tG = rd.y < 0.0 ? -ro.y / rd.y : 1e5;
  float tW = rd.z < 0.0 ? (WALL - ro.z) / rd.z : 1e5;
  float tBack = min(tG, tW);
  float t = marchOpaque(ro, rd, tBack);
  if (t > 0.0) {
    vec3 p = ro + rd * t;
    float a = sdSkin(p);
    float c = sdStopper(p);
    return shadeSurface(p, rd, c < a ? M_STOPPER : M_SKIN);
  }
  return backgroundAlong(ro, rd, tG, tW);
}

// ---------- inside the flask ----------

// A slow double spiral of pale oil, the snail's shell drawn in liquid. q is in flask units.
float swirl(vec3 q) {
  float r = length(q.xy);
  float a = atan(q.y, q.x);
  float wob = (vnoise(q.xy * 3.1 + 7.0, 1e4) - 0.5) * 1.5 + (vnoise(q.xy * 7.3 + q.z * 3.0, 1e4) - 0.5) * 0.7;
  float th = 2.0 * a + 5.4 * log(r + 0.07) + TAU * gPhase + wob;
  float s = 0.5 + 0.5 * sin(th);
  float arms = smoothstep(0.42, 0.93, s);
  float threads = vnoise(vec2(cos(th), sin(th)) * 2.4 + r * 15.0 + 31.0, 1e4);
  arms *= 0.35 + 0.95 * smoothstep(0.25, 0.72, threads);
  float fade = smoothstep(1.0, 0.72, length(q)) * exp(-q.z * q.z * 4.5);
  return arms * fade;
}

float shadeGlass(vec3 ro, vec3 rd, vec3 p) {
  vec3 n = normalAt(p, M_GLASS);
  float ndv = max(dot(-rd, n), 0.0);
  float F = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
  float refl = env(reflect(rd, n));
  vec3 rel = p - gC;
  vec3 local = gRi * rel;
  bool ball = length(local) < RF + 0.02 && dot(local, NECK) < RF * 0.8;

  float trans;
  if (ball) {
    // The paper label, stuck on the front.
    vec3 c0 = normalize(vec3(0.34, -0.42, 0.84));
    vec3 tu = normalize(cross(vec3(0.0, 1.0, 0.0), c0));
    vec3 tv = cross(c0, tu);
    vec3 d = local / RF;
    vec2 luv = vec2(dot(d, tu), dot(d, tv)) / vec2(0.40, 0.265);
    if (dot(d, c0) > 0.0 && abs(luv.x) < 1.0 && abs(luv.y) < 1.0) {
      float ink = texture(uLabel, luv * 0.5 + 0.5).r;
      float paper = mix(0.05, 0.78, ink);
      float L = lit(p + n * 0.01, n, rd, paper, 0.25, 30.0, 0.04);
      return L + paper * 0.55;
    }

    // Filled up to the level; the liquid bends the view, the air above it doesn't.
    float above = dot(rel, gLevelN) - gLevelY;
    bool wet = above < 0.0;
    vec3 dir = wet ? refract(rd, n, 1.0 / 1.36) : rd;
    vec3 oc = p - gC;
    float b = dot(oc, dir);
    float h = b * b - (dot(oc, oc) - RF * RF);
    float tx = -b + sqrt(max(h, 0.0));

    float T = 1.0;
    float glow = 0.0;
    const int N = 18;
    float ds = tx / float(N);
    float j = rnd();
    vec3 toKey = normalize(KEY - gC);
    for (int i = 0; i < N; i++) {
      vec3 v = p + dir * (float(i) + j) * ds;
      vec3 r = v - gC;
      float lev = dot(r, gLevelN) - gLevelY;
      if (lev < 0.0) {
        float dens = swirl(gRi * r / RF);
        float light = 0.45 + 0.85 * smoothstep(-0.9, 0.9, dot(normalize(r), toKey));
        glow += T * dens * ds * 7.0 * light;
        glow += T * ds * 0.05 * light;
        T *= exp(-ds * (2.1 + dens * 4.0));
      }
      // The bright skin of the surface.
      glow += T * exp(-lev * lev / (0.016 * 0.016)) * ds * 3.0;
    }

    vec3 pe = p + dir * tx;
    vec3 ne = normalize(pe - gC);
    vec3 outDir = dir;
    if (dot(pe - gC, gLevelN) < gLevelY) {
      outDir = refract(dir, -ne, 1.36);
      if (dot(outDir, outDir) < 0.5) outDir = reflect(dir, -ne);
    }
    trans = traceOpaque(pe + outDir * 0.012, outDir) * T + glow;
  } else {
    // The neck: mostly just what's behind it.
    vec3 dir = refract(rd, n, 1.0 / 1.12);
    trans = traceOpaque(p + dir * 0.34, dir) * 0.8;
  }
  // Glass seen edge-on goes dark.
  trans *= mix(0.32, 1.0, smoothstep(0.0, 0.42, ndv));
  return mix(trans, refl, F);
}

// ---------- the thread of scent ----------

vec2 stopperTop() {
  vec3 t = gC + gR * (NECK * (RF + 0.70));
  return t.xy;
}

float wisp(vec2 xy) {
  vec2 s0 = stopperTop();
  float s = s0.x - xy.x;
  if (s < -0.02) return 0.0;
  s = max(s, 0.0);
  float w = TAU * gPhase;
  float y0 = s0.y + 0.03 * s + (0.05 + 0.11 * s) * sin(s * 2.1 - 2.0 * w) + 0.05 * s * sin(s * 4.7 - 3.0 * w);
  float width = 0.012 + 0.07 * s;
  float dy = (xy.y - y0) / width;
  float core = exp(-dy * dy);
  float fil = fbm(vec2((xy.x + gScroll * 1.0) * (K / PER), dy * 1.1 + 9.0), K, 3);
  float a = core * smoothstep(0.24, 0.66, fil) * 1.05;
  return clamp(a * (1.0 / (1.0 + s * 0.9)), 0.0, 0.62);
}

// ---------- one ray ----------

float radiance(vec3 ro, vec3 rd) {
  float tG = rd.y < 0.0 ? -ro.y / rd.y : 1e5;
  float tW = rd.z < 0.0 ? (WALL - ro.z) / rd.z : 1e5;
  float tBack = min(tG, tW);
  float t = marchAll(ro, rd, tBack);
  float L;
  float tHit = tBack;
  if (t > 0.0) {
    vec3 p = ro + rd * t;
    tHit = t;
    int m = materialAt(p);
    L = m == M_GLASS ? shadeGlass(ro, rd, p) : shadeSurface(p, rd, m);
  } else {
    L = backgroundAlong(ro, rd, tG, tW);
  }
  // The scent drifts through the middle of the scene.
  float tw = -ro.z / rd.z;
  if (tw > 0.0 && tw < tHit) {
    vec2 q = (ro + rd * tw).xy;
    L = mix(L, 1.25, wisp(q));
  }
  return L;
}

void main() {
  rngState = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uSeed * 26699u + 1u;
  pcg();

  // A moment within this frame's shutter.
  float ph = mod((uFrame + uShutter * fract(uU.z + rnd())) / uFrames, 1.0);
  pose(ph);

  vec2 sub = fract(uU.xy + vec2(rnd(), rnd()));
  vec2 uv = ((floor(gl_FragCoord.xy) + sub) * 2.0 - uRes) / uRes.y;

  // The camera: low, a touch ahead of the snail, tracking along with it.
  vec3 target = vec3(-0.34, 1.14, 0.0);
  float yaw = 0.24;
  vec3 cam = target + vec3(sin(yaw) * 5.7, 0.5, cos(yaw) * 5.7);
  vec3 fw = normalize(target - cam);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  const float zoom = 2.62;
  vec3 rd0 = normalize(uv.x * rt + uv.y * up + zoom * fw);

  // A small lens, focused on the snail: the garden and near ground fall out of focus.
  const float aperture = 0.12;
  float focus = 5.25;
  vec3 pf = cam + rd0 * (focus / dot(rd0, fw));
  float la = fract(uU.w + rnd()) * TAU;
  float lr = sqrt(fract(uU.x * 7.0 + rnd())) * aperture;
  vec3 ro = cam + rt * (cos(la) * lr) + up * (sin(la) * lr);
  vec3 rd = normalize(pf - ro);

  float L = radiance(ro, rd);
  L = (isnan(L) || isinf(L)) ? 0.0 : clamp(L, 0.0, 40.0); // a stray bad ray mustn't poison the average
  fragColor = vec4(L, L, L, 1.0);
}
