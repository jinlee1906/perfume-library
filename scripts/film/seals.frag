#version 300 es
// The seals: one round specimen for each of the 22 odor families in Jin's spreadsheet, drawn as if
// under a macro lens. Each family is a height field lit from the upper left, in greys only; the
// site tints them with the family's scent-group colour (see src/families.ts).

precision highp float;
precision highp int;

uniform vec2 uRes;
uniform float uFamily;
uniform vec4 uU;
uniform uint uSeed;
out vec4 fragColor;

const float TAU = 6.28318530718;

uint rngState;
uint pcg() {
  uint s = rngState;
  rngState = s * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd() { return float(pcg()) / 4294967296.0; }

float h21(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334677u, 3812015801u);
  uint h = (q.x ^ q.y) * 1597334677u;
  h ^= h >> 15u;
  h *= 2246822519u;
  return float(h) / 4294967295.0;
}
vec2 h22(vec2 p) {
  return vec2(h21(p), h21(p + vec2(37.0, 91.0)));
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p, int n) {
  float s = 0.0;
  float a = 0.5;
  const mat2 R = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < n; i++) {
    s += a * vnoise(p);
    p = R * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return s;
}
// x: distance to the nearest point, y: to the second nearest, z: that cell's random number.
vec3 voronoi(vec2 p) {
  vec2 ip = floor(p);
  vec2 fp = p - ip;
  float d1 = 9.0;
  float d2 = 9.0;
  float id = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 g = vec2(x, y);
      vec2 r = g + h22(ip + g) - fp;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = h21(ip + g + vec2(11.0, 5.0));
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
float dome(float r) {
  return sqrt(max(1.0 - r * r, 0.0));
}

// ---------- the height fields. p runs from -1 to 1 across the seal. ----------

float citrus(vec2 p) {
  // A cross-section: rind, pith and wedges full of juice sacs.
  float r = length(p);
  float a = atan(p.y, p.x);
  float wedges = 10.0;
  float w = abs(fract(a / TAU * wedges + 0.5) - 0.5) / wedges * TAU * r;
  float wall = smoothstep(0.012, 0.045, w);
  float pith = smoothstep(0.1, 0.17, r) * smoothstep(0.86, 0.8, r);
  vec2 sac = vec2(a * 5.2, r * 21.0);
  sac.x += 0.5 * sin(r * 30.0);
  vec3 v = voronoi(sac);
  float juice = (0.55 + 0.45 * dome(v.x * 1.15)) * smoothstep(0.0, 0.07, v.y - v.x);
  float rind = smoothstep(0.84, 0.92, r) * (0.82 + 0.1 * vnoise(p * 60.0));
  return max(wall * pith * juice, rind * 0.95) + (1.0 - wall) * pith * 0.5;
}
float fresh(vec2 p) {
  // Frost: feathered ice crystals.
  float h = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 q = p * (2.0 + fi * 1.7) + fi * 3.1;
    vec3 v = voronoi(q);
    float a = atan(q.y - floor(q.y), q.x - floor(q.x)) * 3.0;
    h = max(h, smoothstep(0.1, 0.0, abs(sin(v.z * 30.0) * (fract(q.x) - 0.5) + cos(v.z * 30.0) * (fract(q.y) - 0.5)) - 0.002 * a) * (1.0 - fi * 0.18));
  }
  return h * 0.75 + 0.22 * fbm(p * 26.0, 3);
}
float aldehydic(vec2 p) {
  // Fizz: rising bubbles, sparse above and crowded below.
  float h = 0.08 * fbm(p * 8.0, 3);
  for (int i = 0; i < 3; i++) {
    float s = 7.0 + float(i) * 8.0;
    vec3 v = voronoi(p * s + float(i) * 13.0);
    float size = 0.16 + 0.34 * v.z * v.z;
    float r = v.x / size;
    if (r < 1.0) h = max(h, (0.25 + 0.75 * pow(r, 5.0)) * (1.0 - float(i) * 0.14));
  }
  return h;
}
float marine(vec2 p) {
  // Water: the bright net of light on a seabed.
  vec2 q = p * 3.4 + 2.0 * vec2(fbm(p * 1.6, 3), fbm(p * 1.6 + 5.0, 3));
  vec3 v = voronoi(q);
  float net = smoothstep(0.34, 0.0, v.y - v.x);
  vec3 v2 = voronoi(q * 1.9 + 3.0);
  return 0.18 + 0.55 * net + 0.24 * smoothstep(0.2, 0.0, v2.y - v2.x);
}
float green(vec2 p) {
  // A leaf: a midrib, side veins and the small veins between them.
  mat2 R = mat2(0.78, 0.62, -0.62, 0.78);
  vec2 q = R * p;
  float bend = q.x + 0.12 * sin(q.y * 2.6);
  float mid = exp(-bend * bend * 900.0);
  float y = q.y + abs(bend) * 0.72;
  float sv = abs(fract(y * 4.2) - 0.5) / 4.2;
  float side = exp(-sv * sv * 3200.0) * smoothstep(0.0, 0.05, abs(bend));
  vec3 v = voronoi(q * 19.0 + 4.0);
  float small = smoothstep(0.1, 0.0, v.y - v.x);
  float tissue = 0.5 + 0.28 * fbm(q * 7.0, 3) - 0.14 * small;
  return tissue + side * 0.34 + mid * 0.5;
}
float herbal(vec2 p) {
  // Sprigs: layers of thin, overlapping needles.
  float h = 0.1;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float a = fi * 2.4 + 0.5;
    mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
    vec2 q = R * p * (2.2 + fi * 0.5) + fi * 9.0;
    vec2 cell = floor(q * vec2(5.5, 1.0));
    vec2 f = fract(q * vec2(5.5, 1.0)) - 0.5;
    float keep = step(0.35, h21(cell + fi));
    float needle = dome(f.x * 2.6) * smoothstep(0.5, 0.25, abs(f.y + 0.22 * (h21(cell + 7.0) - 0.5)));
    h = max(h, needle * keep * (0.42 + fi * 0.08));
  }
  return h;
}
float tea(vec2 p) {
  // Tea in a cup: rings spreading out on dark liquid, with a rim of light.
  float r = length(p - vec2(0.12, -0.08));
  float rings = 0.5 + 0.5 * sin(r * 44.0 - 4.0 * fbm(p * 2.2, 3));
  float r2 = length(p + vec2(0.4, -0.34));
  float rings2 = 0.5 + 0.5 * sin(r2 * 60.0);
  return 0.32 + 0.22 * rings * exp(-r * 1.6) + 0.13 * rings2 * exp(-r2 * 3.2) + 0.2 * fbm(p * 2.0 + 8.0, 4);
}
float mossy(vec2 p) {
  // A cushion of moss: clumps of tiny fronds.
  vec3 big = voronoi(p * 3.4);
  float clump = dome(big.x * 0.9);
  vec3 v = voronoi(p * 30.0);
  float frond = dome(v.x * 1.25) * (0.6 + 0.4 * v.z);
  return clump * 0.62 + frond * 0.34 + 0.1 * fbm(p * 90.0, 2);
}
float fruity(vec2 p) {
  // Drupelets: a tight cluster of glossy, swollen beads, like a raspberry.
  vec3 v = voronoi(p * 4.6);
  float bead = dome(v.x * 1.28);
  float dent = exp(-v.x * v.x * 90.0);
  return bead * (0.86 + 0.14 * v.z) - dent * 0.07;
}
float floral(vec2 p) {
  // A rose from above: petals in a tightening spiral.
  float r = length(p);
  float a = atan(p.y, p.x);
  float h = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float rot = fi * 2.399;
    float rad = 0.16 + fi * 0.155;
    float petals = 3.0 + floor(fi * 0.7);
    float edge = rad * (1.0 + 0.2 * abs(sin((a + rot) * petals * 0.5)) + 0.03 * sin((a + rot) * 9.0));
    float d = (edge - r) / 0.2;
    float petal = smoothstep(0.0, 0.1, d) * (0.45 + 0.55 * exp(-d * 1.6));
    float lift = 1.0 - fi * 0.11;
    h = max(h, petal * lift * (0.82 + 0.18 * sin(a * petals + rot)));
  }
  return h + 0.03 * fbm(p * 30.0, 2);
}
float powdery(vec2 p) {
  // Powder: a soft drift, with the faint print of a puff in it.
  float drift = fbm(p * 2.1 + 3.0, 5);
  float ridge = 0.5 + 0.5 * sin((p.x * 0.7 + p.y) * 8.0 + 6.0 * drift);
  return 0.26 + 0.42 * drift + 0.14 * ridge + 0.085 * fbm(p * 70.0, 2);
}
float musk(vec2 p) {
  // Skin and silk: smooth folds and nothing else.
  vec2 q = p + 0.5 * vec2(fbm(p * 1.4 + 2.0, 3), fbm(p * 1.4 + 9.0, 3));
  float f = sin(q.x * 5.0 + q.y * 3.2 + 2.8 * sin(q.y * 2.3));
  return 0.5 + 0.34 * f + 0.1 * sin(q.x * 11.0 - q.y * 6.0 + 3.0 * f);
}
float animalic(vec2 p) {
  // Fur: thousands of hairs combed by a slow current.
  float h = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float flow = 3.2 * fbm(p * 1.5 + fi * 0.2, 2);
    mat2 R = mat2(cos(flow), sin(flow), -sin(flow), cos(flow));
    vec2 q = R * (p * (22.0 + fi * 12.0)) + fi * 17.0;
    vec2 cell = floor(q * vec2(1.0, 0.16));
    vec2 f = fract(q * vec2(1.0, 0.16)) - 0.5;
    float offset = h21(cell) - 0.5;
    h = max(h, dome((f.x + offset * 0.4) * 2.6) * (0.5 + 0.5 * h21(cell + 3.0)) * (1.0 - fi * 0.12));
  }
  return h * 0.82;
}
float amber(vec2 p) {
  // Resin: glassy, with trapped bubbles and old fracture lines.
  float flow = fbm(p * 1.8 + 1.0, 4);
  float h = 0.42 + 0.42 * flow;
  vec3 c = voronoi(p * 1.9 + 7.0);
  h += 0.035 * smoothstep(0.02, 0.0, c.y - c.x);
  vec3 b = voronoi(p * 5.5 + 2.0);
  float r = b.x / (0.06 + 0.3 * b.z * b.z);
  if (b.z > 0.42 && r < 1.0) h += 0.22 * (1.0 - r * r);
  return h;
}
float balsamic(vec2 p) {
  // Thick, slow balsam, folded over itself as it pours.
  vec2 q = p + 0.75 * vec2(fbm(p * 1.3 + 4.0, 3), fbm(p * 1.3 + 1.0, 3));
  float s = sin(q.y * 11.0 + 3.0 * sin(q.x * 2.6));
  return 0.5 + 0.36 * s * s * sign(s) + 0.05 * sin(q.y * 42.0);
}
float gourmand(vec2 p) {
  // Burnt sugar: a glaze crazed into plates.
  vec2 q = p * 3.9 + 0.7 * vec2(vnoise(p * 3.0), vnoise(p * 3.0 + 5.0));
  vec3 v = voronoi(q);
  float crack = smoothstep(0.0, 0.1, v.y - v.x);
  float bubbles = voronoi(p * 34.0).x;
  return crack * (0.55 + 0.28 * v.z + 0.14 * dome(v.x * 0.7)) - 0.05 * smoothstep(0.26, 0.1, bubbles);
}
float spicy(vec2 p) {
  // Peppercorns, wrinkled and packed tight.
  vec3 v = voronoi(p * 3.5);
  float corn = dome(v.x * 1.36);
  float wr = fbm(p * 15.0 + v.z * 10.0, 3);
  float wrinkle = abs(wr - 0.5) * 2.0;
  return corn * (0.62 + 0.38 * wrinkle);
}
float woody(vec2 p) {
  // End grain: the annual rings of a sawn log.
  vec2 q = p - vec2(0.3, -0.42);
  q *= mat2(1.0, 0.18, -0.08, 1.0);
  q += 0.08 * vec2(fbm(p * 2.0, 3), fbm(p * 2.0 + 6.0, 3));
  float r = length(q);
  float rings = fract(r * 12.0 + 0.5 * fbm(p * 3.0, 2));
  float late = smoothstep(0.55, 0.98, rings) * smoothstep(1.0, 0.98, rings);
  float a = atan(q.y, q.x);
  float rays = 0.05 * smoothstep(0.6, 1.0, vnoise(vec2(a * 40.0, r * 3.0)));
  return 0.62 - late * 0.34 + rays + 0.08 * fbm(p * 40.0, 2);
}
float earthy(vec2 p) {
  // Dry ground, split into big plates.
  vec2 q = p * 2.7 + 0.5 * vec2(fbm(p * 3.0, 3), fbm(p * 3.0 + 4.0, 3));
  vec3 v = voronoi(q);
  float crack = smoothstep(0.0, 0.07, v.y - v.x);
  return crack * (0.46 + 0.22 * v.z + 0.2 * fbm(p * 12.0, 3));
}
float smoky(vec2 p) {
  // Smoke: threads pulled through themselves.
  vec2 q = p * 1.4;
  vec2 w = vec2(fbm(q + vec2(0.0, 1.2), 4), fbm(q + vec2(5.2, 1.3), 4));
  vec2 w2 = vec2(fbm(q + 3.6 * w + vec2(1.7, 9.2), 4), fbm(q + 3.6 * w + vec2(8.3, 2.8), 4));
  float f = fbm(q + 3.2 * w2, 4);
  float threads = pow(1.0 - abs(f * 2.0 - 1.0), 7.0);
  return 0.1 + 0.8 * threads + 0.2 * w2.x;
}
float tobacco(vec2 p) {
  // Cut leaf: long, flat shreds thrown in a heap.
  float h = 0.08;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float a = fi * 1.31 + 0.35 * sin(fi * 2.1);
    mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
    vec2 q = R * p;
    q.y += 0.06 * sin(q.x * 5.0 + fi);
    q *= vec2(1.8, 11.0 + fi);
    q += fi * 7.3;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float keep = step(0.42, h21(cell));
    float shred = smoothstep(0.5, 0.32, abs(f.y)) * smoothstep(0.5, 0.46, abs(f.x));
    float tone = 0.32 + 0.09 * fi + 0.14 * h21(cell + 5.0);
    if (keep * shred > 0.5) h = tone + 0.07 * vnoise(q * vec2(9.0, 1.0));
  }
  return h;
}
float leathery(vec2 p) {
  // Hide: pebbled grain with a few deep creases.
  vec2 q = p * 8.5 + 0.8 * vec2(vnoise(p * 7.0), vnoise(p * 7.0 + 3.0));
  vec3 v = voronoi(q);
  float pebble = dome(v.x * 0.95) * smoothstep(0.0, 0.16, v.y - v.x) * (0.72 + 0.28 * v.z);
  float crease = abs(fbm(p * 1.7 + 2.0, 3) - 0.5);
  return pebble * (0.55 + 0.45 * smoothstep(0.0, 0.035, crease)) + 0.1;
}

// In alphabetical order, as src/families.ts lists them.
float height(vec2 p) {
  int f = int(uFamily + 0.5);
  if (f == 0) return aldehydic(p);
  if (f == 1) return amber(p);
  if (f == 2) return animalic(p);
  if (f == 3) return balsamic(p);
  if (f == 4) return citrus(p);
  if (f == 5) return earthy(p);
  if (f == 6) return floral(p);
  if (f == 7) return fresh(p);
  if (f == 8) return fruity(p);
  if (f == 9) return gourmand(p);
  if (f == 10) return green(p);
  if (f == 11) return herbal(p);
  if (f == 12) return leathery(p);
  if (f == 13) return marine(p);
  if (f == 14) return mossy(p);
  if (f == 15) return musk(p);
  if (f == 16) return powdery(p);
  if (f == 17) return smoky(p);
  if (f == 18) return spicy(p);
  if (f == 19) return tea(p);
  if (f == 20) return tobacco(p);
  return woody(p);
}

// How glossy each family is, and how much relief it has.
vec2 finish() {
  int f = int(uFamily + 0.5);
  if (f == 0) return vec2(0.75, 0.16); // aldehydic
  if (f == 1) return vec2(1.0, 0.1);   // amber
  if (f == 2) return vec2(0.08, 0.1);  // animalic
  if (f == 3) return vec2(1.0, 0.16);  // balsamic
  if (f == 4) return vec2(0.6, 0.08);  // citrus
  if (f == 5) return vec2(0.03, 0.14); // earthy
  if (f == 6) return vec2(0.1, 0.32);  // floral
  if (f == 7) return vec2(0.5, 0.05);  // fresh
  if (f == 8) return vec2(1.0, 0.22);  // fruity
  if (f == 9) return vec2(0.8, 0.09);  // gourmand
  if (f == 10) return vec2(0.25, 0.05); // green
  if (f == 11) return vec2(0.12, 0.12); // herbal
  if (f == 12) return vec2(0.22, 0.07); // leathery
  if (f == 13) return vec2(0.0, 0.0);  // marine
  if (f == 14) return vec2(0.04, 0.14); // mossy
  if (f == 15) return vec2(0.25, 0.14); // musk
  if (f == 16) return vec2(0.0, 0.06); // powdery
  if (f == 17) return vec2(0.0, 0.0);  // smoky
  if (f == 18) return vec2(0.3, 0.3);  // spicy
  if (f == 19) return vec2(0.7, 0.03); // tea
  if (f == 20) return vec2(0.12, 0.09); // tobacco
  return vec2(0.15, 0.03);             // woody
}

void main() {
  rngState = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uSeed * 26699u + 1u;
  pcg();
  vec2 sub = fract(uU.xy + vec2(rnd(), rnd()));
  vec2 p = ((floor(gl_FragCoord.xy) + sub) * 2.0 - uRes) / uRes.y;

  vec2 fin = finish();
  const float e = 0.0035;
  float h = height(p);
  float hx = height(p + vec2(e, 0.0));
  float hy = height(p + vec2(0.0, e));
  vec3 n = normalize(vec3(-(hx - h) * fin.y / e, -(hy - h) * fin.y / e, 1.0));

  vec3 l = normalize(vec3(-0.58, 0.62, 0.62));
  float diff = max(dot(n, l), 0.0);
  vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, hv), 0.0), 48.0);
  float base = mix(0.32, 1.0, clamp(h, 0.0, 1.0));
  // Some families are mostly light on dark rather than relief.
  float L = base * (fin.y > 0.0 ? (0.22 + 1.05 * diff) : 1.0);
  L += fin.x * spec * 0.85;

  L = (isnan(L) || isinf(L)) ? 0.0 : clamp(L, 0.0, 8.0);
  fragColor = vec4(L, L, L, 1.0);
}
