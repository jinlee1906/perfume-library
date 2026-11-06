#version 300 es
// "The drop": a glass dropper lets one drop fall into a beaker of oil. Lit from behind, the way
// glass is photographed: dark outlines on a bright ground.
#include "common.glsl"

const float LIQ = 0.98;       // the liquid's surface
const float TIP = 3.0;        // the dropper's tip

float gPhase;
float gDropY;
float gDropR;
float gRippleT;               // time since the drop landed, or -1
float gStretch;
float gBounceY;

void pose(float ph) {
  gPhase = ph;
  // 0–0.5: a drop swells at the tip. 0.5–0.68: it falls. 0.68–1: rings spread and die away.
  const float FALL = 0.46;
  const float LAND = 0.68;
  if (ph < FALL) {
    float k = ph / FALL;
    gDropR = 0.022 + 0.078 * sqrt(k);
    gDropY = TIP - gDropR * 0.72 - 0.05 * k * k;
    gStretch = 1.0 + 0.3 * k * k;
    gRippleT = ph + 1.0 - LAND;
  } else if (ph < LAND) {
    float k = (ph - FALL) / (LAND - FALL);
    gDropR = 0.1;
    gDropY = mix(TIP - 0.127, LIQ - 0.02, k * k);
    gStretch = 1.0 + 0.45 * k + 0.2 * sin(k * 18.0) * (1.0 - k);
    gRippleT = ph + 1.0 - LAND;
  } else {
    gDropR = 0.0;
    gDropY = -10.0;
    gStretch = 1.0;
    gRippleT = ph - LAND;
  }
  // The little rebound after it lands.
  gBounceY = -10.0;
  if (ph >= LAND && ph < LAND + 0.13) {
    float k = (ph - LAND) / 0.13;
    gBounceY = LIQ + 0.62 * 4.0 * k * (1.0 - k);
  }
}

// The dropper, revolved around the y axis. A glass tube tapering to the tip.
float sdTube(vec3 p) {
  float y = p.y - TIP;
  float r = length(p.xz);
  float rad = mix(0.035, 0.16, smoothstep(0.0, 0.52, y));
  if (y > 0.52) rad = 0.16;
  float d = abs(r - rad) - 0.012;
  d = max(d, -y);
  return max(d * 0.85, y - 2.0);
}
float sdBulb(vec3 p) {
  // The rubber bulb, squeezed a little as the drop lets go.
  float sq = (gPhase - 0.42) * 9.0;
  float squeeze = 1.0 - 0.13 * exp(-sq * sq);
  vec3 q = (p - vec3(0.0, TIP + 2.3, 0.0));
  q.xz /= squeeze;
  float bulb = length(q / vec3(0.3, 0.52, 0.3)) - 1.0;
  float collar = sdCappedCylinderY(p - vec3(0.0, TIP + 1.76, 0.0), 0.21, 0.11) - 0.012;
  return min(bulb * 0.28, collar);
}
float sdBeaker(vec3 p) {
  float r = length(p.xz);
  const float R = 1.18;
  const float H = 1.7;
  // A wall, a thick foot and a rolled lip.
  vec2 q = vec2(r, p.y);
  float wall = max(abs(r - R) - 0.022, abs(p.y - H * 0.5) - H * 0.5);
  float base = sdCappedCylinderY(p - vec3(0.0, 0.05, 0.0), R, 0.05);
  float lip = length(q - vec2(R, H)) - 0.038;
  return min(min(wall, base), lip);
}
float sdDrop(vec3 p) {
  float b = gBounceY > -5.0 ? length(p - vec3(0.0, gBounceY, 0.0)) - 0.045 : 1e3;
  if (gDropR <= 0.0) return b;
  vec3 q = p - vec3(0.0, gDropY, 0.0);
  q.y /= gStretch;
  return min((length(q) - gDropR) * 0.75, b);
}

float mapGlass(vec3 p) {
  return min(sdTube(p), sdBeaker(p));
}
float map(vec3 p) {
  return min(min(mapGlass(p), sdBulb(p)), sdDrop(p));
}

vec3 normalOf(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0012;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// The bright ground behind everything, with a soft edge of shadow around it.
float backdrop(vec3 ro, vec3 rd) {
  float t = (-5.0 - ro.z) / min(rd.z, -0.001);
  vec3 p = ro + rd * t;
  float d = length((p.xy - vec2(-0.3, 2.6)) * vec2(0.82, 0.62));
  return mix(1.25, 0.05, smoothstep(1.2, 5.6, d));
}

// How the surface of the oil tilts under the spreading rings.
float rippleH(vec2 xz) {
  if (gRippleT < 0.0) return 0.0;
  float r = length(xz);
  float front = gRippleT * 4.2;
  float ring = (r - front * 0.55) * 1.5;
  float env = exp(-ring * ring) * exp(-gRippleT * 7.5);
  return 0.035 * sin(r * 17.0 - gRippleT * 62.0) * env * (1.0 + 0.5 / (r + 0.3));
}

float liquidSeen(vec3 p, vec3 rd) {
  // The top of the oil: it mirrors the window and the bright ground.
  const float e = 0.01;
  float h0 = rippleH(p.xz);
  vec3 n = normalize(vec3(-(rippleH(p.xz + vec2(e, 0.0)) - h0) / e, 1.0, -(rippleH(p.xz + vec2(0.0, e)) - h0) / e));
  vec3 r = reflect(rd, n);
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  float above = backdrop(p, normalize(r + vec3(0.0, 0.0, -0.4))) * 0.8;
  above += windowLight(r, normalize(vec3(-0.5, 0.6, 0.62)), 7.0);
  return mix(0.012, above, clamp(F * 2.1, 0.0, 1.0));
}

// Where a ray first meets the oil: a cylinder inside the beaker. -1 if it misses.
float hitOil(vec3 ro, vec3 rd, out vec3 n) {
  const float R = 1.15;
  const float B = 0.1;
  float best = -1.0;
  n = vec3(0.0, 1.0, 0.0);
  // The top.
  if (rd.y < 0.0) {
    float t = (LIQ - ro.y) / rd.y;
    vec3 p = ro + rd * t;
    if (t > 0.0 && length(p.xz) < R) best = t;
  }
  // The side.
  float a = dot(rd.xz, rd.xz);
  float b = dot(ro.xz, rd.xz);
  float c = dot(ro.xz, ro.xz) - R * R;
  float h = b * b - a * c;
  if (h > 0.0) {
    float t = (-b - sqrt(h)) / a;
    vec3 p = ro + rd * t;
    if (t > 0.0 && p.y > B && p.y < LIQ && (best < 0.0 || t < best)) {
      best = t;
      n = normalize(vec3(p.x, 0.0, p.z));
    }
  }
  return best;
}

float radiance(vec3 ro, vec3 rd) {
  float T = 1.0;
  float L = 0.0;
  float t = 0.0;
  vec3 oilN;
  float tOil = hitOil(ro, rd, oilN);
  // Up to a few surfaces deep: glass adds its edges and lets the rest through.
  for (int bounce = 0; bounce < 6; bounce++) {
    bool hit = false;
    for (int i = 0; i < 80; i++) {
      vec3 p = ro + rd * t;
      float d = map(p);
      if (tOil > 0.0 && t >= tOil) {
        vec3 o = ro + rd * tOil;
        if (oilN.y > 0.5) return L + T * liquidSeen(o, rd);
        // Through the side, the oil is dark and catches the bright ground at its edges.
        float edge = 1.0 - abs(dot(rd, oilN));
        float glow = 0.03 + 0.42 * pow(edge, 3.0) + 0.05 * smoothstep(0.1, 0.98, o.y);
        return L + T * glow;
      }
      if (d < 0.001) {
        hit = true;
        break;
      }
      t += min(d * 0.9, 0.06 + d);
      if (tOil > 0.0 && t > tOil) t = tOil;
      if (t > 14.0) break;
    }
    if (!hit) break;
    vec3 p = ro + rd * t;
    vec3 n = normalOf(p);
    float ndv = abs(dot(rd, n));
    if (sdBulb(p) < 0.0015) {
      // Black rubber with a soft sheen.
      vec3 l = normalize(vec3(-1.6, 2.2, 3.0) - 0.1 * randDir());
      float diff = max(dot(n, l), 0.0);
      float spec = pow(max(dot(n, normalize(l - rd)), 0.0), 26.0);
      return L + T * (0.016 * diff + 0.45 * spec + 0.18 * pow(1.0 - ndv, 3.0));
    }
    float F = 0.05 + 0.95 * pow(1.0 - ndv, 5.0);
    if (sdDrop(p) < 0.0015) {
      // The falling drop is a tiny lens: bright ground turned upside down, dark at its rim.
      vec3 r = reflect(rd, n);
      float through = backdrop(p, normalize(rd + vec3(0.0, -n.y * 1.4, 0.0)));
      float seen = mix(through * 0.85, 0.03, smoothstep(0.55, 0.12, ndv));
      return L + T * (seen + F * windowLight(r, normalize(vec3(-0.5, 0.6, 0.62)), 8.0));
    }
    // Glass: thin walls show as dark lines where we see them edge-on.
    float edge = smoothstep(0.42, 0.04, ndv);
    vec3 r = reflect(rd, n);
    L += T * F * (windowLight(r, normalize(vec3(-0.5, 0.6, 0.62)), 7.5) + 0.05);
    T *= (1.0 - F) * mix(0.93, 0.1, edge);
    t += 0.05;
  }
  return L + T * backdrop(ro, rd);
}

void main() {
  rngState = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uSeed * 26699u + 1u;
  pcg();
  pose(mod((uFrame + uShutter * fract(uU.z + rnd())) / uFrames, 1.0));

  vec2 sub = fract(uU.xy + vec2(rnd(), rnd()));
  vec2 uv = ((floor(gl_FragCoord.xy) + sub) * 2.0 - uRes) / uRes.y;

  vec3 target = vec3(0.0, 2.45, 0.0);
  vec3 cam = target + vec3(0.0, 2.3, 10.8);
  vec3 fw = normalize(target - cam);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 3.25 * fw);

  float L = radiance(cam, rd);
  L = (isnan(L) || isinf(L)) ? 0.0 : clamp(L, 0.0, 40.0);
  fragColor = vec4(L, L, L, 1.0);
}
