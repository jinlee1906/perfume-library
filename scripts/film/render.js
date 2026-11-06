// Renders a fragment shader sample by sample, averages the samples and posts the raw
// floating-point result to serve.mjs. Each sample has its own point on the lens and its own
// moment within the shutter, which is what gives real depth of field and motion blur.

const canvas = document.getElementById("canvas");
const statusLine = document.getElementById("status");
const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true });
if (!gl) throw new Error("WebGL2 isn't available");
if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("Can't render to float textures");
gl.getExtension("EXT_float_blend");

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

const programs = new Map();
async function program(url) {
  if (programs.has(url)) return programs.get(url);
  let source = await (await fetch(`${url}?t=${Date.now()}`)).text();
  if (source.includes('#include "common.glsl"')) {
    source = source.replace('#include "common.glsl"', await (await fetch(`./common.glsl?t=${Date.now()}`)).text());
  }
  const started = performance.now();
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, source));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  console.log(`compiled ${url} in ${Math.round(performance.now() - started)} ms`);
  programs.set(url, p);
  return p;
}

// The label on the flask, drawn with the site's own display font.
async function labelTexture() {
  const face = new FontFace(
    "Bodoni Label",
    "url(/node_modules/@fontsource-variable/bodoni-moda/files/bodoni-moda-latin-opsz-italic.woff2)",
    { style: "italic", weight: "400 900" },
  );
  await face.load();
  document.fonts.add(face);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 340;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = "#000";
  x.lineWidth = 7;
  x.strokeRect(20, 20, c.width - 40, c.height - 40);
  x.lineWidth = 2.5;
  x.strokeRect(34, 34, c.width - 68, c.height - 68);
  x.fillStyle = "#000";
  x.textAlign = "center";
  x.textBaseline = "alphabetic";
  x.font = "italic 500 172px 'Bodoni Label'";
  x.fillText("Jin's", c.width / 2, 228);
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}
let label = null;

// A strip of bottle labels, for the shelf: real names from Jin's library.
const BOTTLE_NAMES = ["Hedione", "Iso E Super", "Ambrofix", "Habanolide", "Javanol", "Coumarin", "Galaxolide", "Vanillin"];
async function namesTexture() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#fff";
  x.fillRect(0, 0, c.width, c.height);
  const cell = c.width / BOTTLE_NAMES.length;
  BOTTLE_NAMES.forEach((name, n) => {
    x.strokeStyle = "#000";
    x.lineWidth = 3;
    x.strokeRect(n * cell + 9, 9, cell - 18, c.height - 18);
    x.fillStyle = "#000";
    x.textAlign = "center";
    x.textBaseline = "middle";
    let size = 92;
    x.font = `italic 500 ${size}px 'Bodoni Label'`;
    while (x.measureText(name).width > cell - 44) {
      size -= 2;
      x.font = `italic 500 ${size}px 'Bodoni Label'`;
    }
    x.fillText(name, (n + 0.5) * cell, c.height / 2);
  });
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}
let names = null;

const halton = (i, base) => {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
};

// Lets the browser breathe between samples, even when this tab is in the background.
const yieldToBrowser = () =>
  new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => resolve();
    port2.postMessage(0);
  });

function target(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, w, h);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Framebuffer incomplete");
  return { tex, fbo };
}

const film = {
  status: "idle",

  /** Draws one frame and posts it as raw 32-bit floats. channels: 1 (film) or 3 (seals). */
  async render({ shader = "./sillage.frag", name, frame = 0, frames = 32, w = 800, h = 600, spp = 32, shutter = 0.5, channels = 1, seed = 0, uniforms = {} }) {
    const started = performance.now();
    const p = await program(shader);
    if (!label) label = await labelTexture();
    if (!names) names = await namesTexture();
    canvas.width = w;
    canvas.height = h;
    const { tex, fbo } = target(w, h);
    gl.useProgram(p);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, label);
    const u = (n) => gl.getUniformLocation(p, n);
    gl.uniform1i(u("uLabel"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, names);
    gl.uniform1i(u("uNames"), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(u("uRes"), w, h);
    gl.uniform1f(u("uFrame"), frame);
    gl.uniform1f(u("uFrames"), frames);
    gl.uniform1f(u("uShutter"), shutter);
    for (const [key, value] of Object.entries(uniforms)) {
      if (Array.isArray(value)) gl[`uniform${value.length}fv`](u(key), value);
      else gl.uniform1f(u(key), value);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    for (let s = 0; s < spp; s++) {
      gl.blendColor(0, 0, 0, 1 / (s + 1)); // a running average
      gl.uniform4f(u("uU"), halton(s + 1, 2), halton(s + 1, 3), halton(s + 1, 5), halton(s + 1, 7));
      gl.uniform1ui(u("uSeed"), s + 1 + seed * 1009);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.finish();
      if (s % 2 === 1) await yieldToBrowser();
    }
    gl.disable(gl.BLEND);

    const rgba = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, rgba);
    const out = new Float32Array(w * h * channels);
    for (let i = 0; i < w * h; i++) for (let c = 0; c < channels; c++) out[i * channels + c] = rgba[i * 4 + c];
    await fetch(`/save?name=${encodeURIComponent(name)}`, { method: "POST", body: out });
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    const ms = Math.round(performance.now() - started);
    statusLine.textContent = `${name}: ${w}×${h}, ${spp} spp, ${ms} ms`;
    return { name, ms };
  },

  /** Renders a whole loop in the background; poll film.status to follow it. */
  async renderLoop({ prefix = "sillage", frames = 32, ...options }) {
    film.status = "running";
    const started = performance.now();
    try {
      for (let frame = 0; frame < frames; frame++) {
        const name = `${prefix}_${String(frame).padStart(3, "0")}.f32`;
        await film.render({ ...options, name, frame, frames });
        film.status = `running: ${frame + 1}/${frames}`;
      }
      film.status = `done in ${Math.round((performance.now() - started) / 1000)} s`;
    } catch (e) {
      film.status = `failed: ${e.message}`;
    }
    return film.status;
  },

  /** Renders the 22 odor-family seals. */
  async renderSeals({ size = 640, spp = 48 } = {}) {
    const families = ["aldehydic", "amber", "animalic", "balsamic", "citrus", "earthy", "floral", "fresh", "fruity", "gourmand", "green", "herbal", "leathery", "marine", "mossy", "musk", "powdery", "smoky", "spicy", "tea", "tobacco", "woody"];
    film.status = "running";
    for (let n = 0; n < families.length; n++) {
      await film.render({ shader: "./seals.frag", name: `seal_${families[n]}.f32`, w: size, h: size, spp, uniforms: { uFamily: n } });
      film.status = `running: ${n + 1}/${families.length}`;
    }
    film.status = "done";
    return film.status;
  },

  /** Forget compiled shaders, to pick up edits without reloading. */
  reset() {
    programs.clear();
  },
};
window.film = film;
