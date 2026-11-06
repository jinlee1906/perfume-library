// Shared by the door films (shelf, ledger, drop): random numbers, noise, shapes and the camera.

precision highp float;
precision highp int;

uniform vec2 uRes;
uniform float uFrame;
uniform float uFrames;
uniform float uShutter;
uniform vec4 uU;
uniform uint uSeed;
uniform sampler2D uNames;

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
vec3 randDir() {
  float z = rnd() * 2.0 - 1.0;
  float a = rnd() * TAU;
  float r = sqrt(max(1.0 - z * z, 0.0));
  return vec3(r * cos(a), r * sin(a), z);
}

float h21(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334677u, 3812015801u);
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

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * h * k / 6.0;
}
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdCappedCylinderY(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// The room, as reflected in glass: a paned window up and to the left, and a soft dome.
float windowLight(vec3 d, vec3 wn, float bright) {
  float f = dot(d, wn);
  if (f <= 0.0) return 0.0;
  vec3 wu = normalize(cross(vec3(0.0, 1.0, 0.0), wn));
  vec3 wv = cross(wn, wu);
  vec2 w = vec2(dot(d, wu), dot(d, wv)) / f;
  vec2 a = abs(w) - vec2(0.42, 0.56);
  if (a.x >= 0.0 || a.y >= 0.0) return 0.0;
  vec2 pane = abs(fract(w * vec2(2.38, 2.68) + 0.5) - 0.5);
  return min(pane.x, pane.y) > 0.045 ? bright * smoothstep(-0.8, 0.5, w.y) : 0.0;
}
