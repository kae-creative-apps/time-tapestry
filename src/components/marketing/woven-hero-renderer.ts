/*
 * Cloth constraint solver adapted from Meng To / ThreeUI, Woven Cloth (MIT):
 * https://21st.dev/@mengto/components/woven-cloth
 * https://threeui.com/three-js/woven-cloth
 * Copyright (c) 2026 ThreeUI / Meng To.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to
 * do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Adaptation: local WebGL, 825 vertices, bounded pointer forces, finite settling,
 * exact approved brand texture, no iframe, CDN, Three.js or animation dependency.
 */

const COLUMNS = 32;
const ROWS = 24;
const WIDTH = 4.4;
const HEIGHT = WIDTH * 0.76;
const COUNT = (COLUMNS + 1) * (ROWS + 1);
const STEP = 1 / 60;

const vertexSource = `
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec2 uv;
  uniform vec2 fit;
  varying vec2 textileUV;
  varying vec3 surfaceNormal;
  void main() {
    mat3 turn = mat3(.982, -.043, .183, .044, .999, -.004, -.183, .012, .983);
    vec3 p = turn * position;
    float perspective = 1.0 / (1.0 - p.z * .12);
    gl_Position = vec4(p.xy * fit * perspective, -p.z * .08, 1.0);
    textileUV = uv;
    surfaceNormal = turn * normal;
  }
`;

const fragmentSource = `
  precision mediump float;
  uniform sampler2D fabric;
  varying vec2 textileUV;
  varying vec3 surfaceNormal;
  void main() {
    vec3 n = normalize(surfaceNormal);
    if (!gl_FrontFacing) n = -n;
    float key = max(dot(n, normalize(vec3(-.75, .85, 1.1))), 0.0);
    float fill = max(dot(n, normalize(vec3(.85, -.2, .9))), 0.0);
    vec3 thread = texture2D(fabric, textileUV).rgb;
    vec3 light = vec3(.49) + vec3(.53, .51, .47) * key + vec3(.12, .13, .115) * fill;
    gl_FragColor = vec4(thread * light, 1.0);
  }
`;

function loadArtwork() {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => {
      image.onload = image.onerror = null;
      reject(new Error("Fabric artwork timed out"));
    }, 8000);
    image.onload = () => {
      window.clearTimeout(timer);
      image.onload = image.onerror = null;
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      image.onload = image.onerror = null;
      reject(new Error("Fabric artwork unavailable"));
    };
    image.src = "/brand/woven-hero-cloth.svg";
  });
}

export async function createWovenRenderer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  onUnavailable: () => void,
) {
  const artwork = await loadArtwork();
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("WebGL unavailable");

  const buffers: WebGLBuffer[] = [];
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const texture = gl.createTexture();
  if (!program || !texture) {
    if (program) gl.deleteProgram(program);
    if (texture) gl.deleteTexture(texture);
    throw new Error("WebGL resources unavailable");
  }
  const releaseGPU = () => {
    buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program);
    gl.deleteTexture(texture);
  };

  try {
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, fragmentSource],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error("Shader unavailable");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error("Fabric shader unavailable");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Fabric program unavailable");
    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      artwork,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, "fabric"), 0);
  } catch (error) {
    releaseGPU();
    throw error;
  }

  const positions = new Float32Array(COUNT * 3);
  const previous = new Float32Array(COUNT * 3);
  const rest = new Float32Array(COUNT * 3);
  const normals = new Float32Array(COUNT * 3);
  const uv = new Float32Array(COUNT * 2);
  const indices = new Uint16Array(COLUMNS * ROWS * 6);
  const edges: [number, number, number][] = [];
  const index = (x: number, y: number) => x + y * (COLUMNS + 1);

  // An already draped rest shape avoids a flat rectangle or a blank intro gate.
  for (let y = 0; y <= ROWS; y++) {
    for (let x = 0; x <= COLUMNS; x++) {
      const i = index(x, y);
      const u = x / COLUMNS;
      const v = y / ROWS;
      const fullness = 0.3 + v * 0.7;
      rest[i * 3] = (u - 0.5) * WIDTH;
      rest[i * 3 + 1] = (0.5 - v) * HEIGHT + Math.sin(u * Math.PI) * 0.045;
      rest[i * 3 + 2] =
        Math.sin(u * Math.PI * 5.5 + v * 1.4) * 0.18 * fullness +
        Math.sin(u * Math.PI * 2 - v * 2) * 0.12 * v;
      uv[i * 2] = u;
      uv[i * 2 + 1] = v;
      if (x < COLUMNS && y < ROWS) {
        const j = (y * COLUMNS + x) * 6;
        indices.set(
          [i, i + COLUMNS + 1, i + 1, i + 1, i + COLUMNS + 1, i + COLUMNS + 2],
          j,
        );
      }
    }
  }
  positions.set(rest);
  previous.set(rest);
  function edge(a: number, b: number) {
    const distance = Math.hypot(
      rest[a * 3] - rest[b * 3],
      rest[a * 3 + 1] - rest[b * 3 + 1],
      rest[a * 3 + 2] - rest[b * 3 + 2],
    );
    edges.push([a, b, distance]);
  }
  for (let y = 0; y <= ROWS; y++)
    for (let x = 0; x <= COLUMNS; x++) {
      const i = index(x, y);
      if (x < COLUMNS) edge(i, i + 1);
      if (y < ROWS) edge(i, i + COLUMNS + 1);
      if (x < COLUMNS && y < ROWS) edge(i, i + COLUMNS + 2);
    }

  function buffer(
    data: Float32Array | Uint16Array,
    attribute: string | null,
    size = 3,
  ) {
    const created = gl!.createBuffer();
    if (!created) throw new Error("Fabric buffer unavailable");
    buffers.push(created);
    const target = attribute ? gl!.ARRAY_BUFFER : gl!.ELEMENT_ARRAY_BUFFER;
    gl!.bindBuffer(target, created);
    gl!.bufferData(
      target,
      data,
      attribute === "position" || attribute === "normal"
        ? gl!.DYNAMIC_DRAW
        : gl!.STATIC_DRAW,
    );
    if (attribute) {
      const location = gl!.getAttribLocation(program!, attribute);
      gl!.enableVertexAttribArray(location);
      gl!.vertexAttribPointer(location, size, gl!.FLOAT, false, 0, 0);
    }
    return created;
  }
  let positionBuffer: WebGLBuffer;
  let normalBuffer: WebGLBuffer;
  try {
    positionBuffer = buffer(positions, "position");
    normalBuffer = buffer(normals, "normal");
    buffer(uv, "uv", 2);
    buffer(indices, null);
  } catch (error) {
    releaseGPU();
    throw error;
  }
  const fitLocation = gl.getUniformLocation(program, "fit");
  let fitX = 1;
  let fitY = 1;
  let active = false;
  let disposed = false;
  let frame = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let settleUntil = 0;
  let pointerUntil = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerDX = 0;
  let pointerDY = 0;

  function solve(a: number, b: number, distance: number) {
    const ai = a * 3;
    const bi = b * 3;
    const dx = positions[bi] - positions[ai];
    const dy = positions[bi + 1] - positions[ai + 1];
    const dz = positions[bi + 2] - positions[ai + 2];
    const length = Math.hypot(dx, dy, dz) || 1;
    const pinnedA = a <= COLUMNS;
    const pinnedB = b <= COLUMNS;
    const strength =
      (length - distance) / length / (pinnedA || pinnedB ? 1 : 2);
    if (!pinnedA) {
      positions[ai] += dx * strength;
      positions[ai + 1] += dy * strength;
      positions[ai + 2] += dz * strength;
    }
    if (!pinnedB) {
      positions[bi] -= dx * strength;
      positions[bi + 1] -= dy * strength;
      positions[bi + 2] -= dz * strength;
    }
  }

  function step(now: number) {
    elapsed += STEP;
    const pointerForce = Math.max(0, Math.min(1, (pointerUntil - now) / 600));
    const entrance = Math.max(0, 1 - elapsed / 2.2);
    for (let i = COLUMNS + 1; i < COUNT; i++) {
      const j = i * 3;
      const hanging = Math.floor(i / (COLUMNS + 1)) / ROWS;
      const distance =
        (positions[j] - pointerX) ** 2 + (positions[j + 1] - pointerY) ** 2;
      const influence = Math.exp(-distance * 2.4) * pointerForce * hanging;
      for (let axis = 0; axis < 3; axis++) {
        const k = j + axis;
        const velocity = (positions[k] - previous[k]) * 0.94;
        let force = (rest[k] - positions[k]) * 8;
        if (axis === 0) force += pointerDX * influence * 16;
        if (axis === 1) force += -0.32 + pointerDY * influence * 12;
        if (axis === 2)
          force +=
            -10 * influence +
            Math.sin(elapsed * 4 + rest[j] * 3 - hanging * 2) *
              entrance *
              hanging *
              1.8;
        previous[k] = positions[k];
        positions[k] += velocity + force * STEP * STEP;
      }
    }
    for (let iteration = 0; iteration < 3; iteration++) {
      for (const [a, b, distance] of edges) solve(a, b, distance);
    }
  }

  function draw() {
    if (disposed) return;
    normals.fill(0);
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3,
        b = indices[i + 1] * 3,
        c = indices[i + 2] * 3;
      const abX = positions[b] - positions[a],
        abY = positions[b + 1] - positions[a + 1],
        abZ = positions[b + 2] - positions[a + 2];
      const acX = positions[c] - positions[a],
        acY = positions[c + 1] - positions[a + 1],
        acZ = positions[c + 2] - positions[a + 2];
      const nx = abY * acZ - abZ * acY,
        ny = abZ * acX - abX * acZ,
        nz = abX * acY - abY * acX;
      for (const j of [a, b, c]) {
        normals[j] += nx;
        normals[j + 1] += ny;
        normals[j + 2] += nz;
      }
    }
    gl!.bindBuffer(gl!.ARRAY_BUFFER, positionBuffer);
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, positions);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, normalBuffer);
    gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, normals);
    gl!.uniform2f(fitLocation, fitX, fitY);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    gl!.enable(gl!.DEPTH_TEST);
    gl!.drawElements(gl!.TRIANGLES, indices.length, gl!.UNSIGNED_SHORT, 0);
  }

  function tick(now: number) {
    frame = 0;
    if (!active || disposed) return;
    // 30 rendered frames / second with two fixed, stable solver steps per frame.
    if (now - lastFrame >= 32) {
      step(now);
      step(now);
      draw();
      lastFrame = now;
    }
    if (now < settleUntil) frame = requestAnimationFrame(tick);
  }
  function wake(duration = 2400) {
    if (!active || disposed) return;
    settleUntil = performance.now() + duration;
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function resize() {
    if (disposed) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    const scale = Math.min((width * 0.84) / WIDTH, (height * 0.8) / HEIGHT);
    fitX = (2 * scale) / width;
    fitY = (2 * scale) / height;
    draw();
  }
  function move(event: PointerEvent) {
    if (!active || event.pointerType === "touch") return;
    const rect = host.getBoundingClientRect();
    const x = (((event.clientX - rect.left) / rect.width) * 2 - 1) / fitX;
    const y = (1 - ((event.clientY - rect.top) / rect.height) * 2) / fitY;
    pointerDX = Math.max(-0.3, Math.min(0.3, x - pointerX));
    pointerDY = Math.max(-0.3, Math.min(0.3, y - pointerY));
    pointerX = x;
    pointerY = y;
    pointerUntil = performance.now() + 900;
    wake();
  }
  function leave() {
    pointerUntil = 0;
    wake();
  }
  function lost() {
    dispose();
    onUnavailable();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  host.addEventListener("pointermove", move, { passive: true });
  host.addEventListener("pointerleave", leave, { passive: true });
  canvas.addEventListener("webglcontextlost", lost);
  resize();

  function dispose() {
    if (disposed) return;
    disposed = true;
    active = false;
    cancelAnimationFrame(frame);
    observer.disconnect();
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerleave", leave);
    canvas.removeEventListener("webglcontextlost", lost);
    releaseGPU();
    // Keep the empty context reusable when the motion preference changes.
    // The browser releases the context when its canvas is detached.
  }

  return {
    setActive(value: boolean) {
      if (disposed || active === value) return;
      active = value;
      if (active) wake(elapsed < 2.2 ? 2600 : 800);
      else {
        cancelAnimationFrame(frame);
        frame = 0;
        pointerUntil = 0;
      }
    },
    dispose,
  };
}
