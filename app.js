import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js";

const params = new URLSearchParams(window.location.search);
const runLeft = params.get("runLeft") || "run_002";
const runRight = params.get("runRight") || "run_002_error";

async function loadMeta(runDir) {
  const metaUrl = `${runDir}/frames_meta.json`;
  const res = await fetch(metaUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load meta: ${metaUrl}`);
  return await res.json();
}

function parseFrameBuffer(buffer, nMax) {
  const posCount = nMax * 3;
  const posByteLen = posCount * 4;
  const posView = new Float32Array(buffer, 0, posCount);
  const colView = new Uint8Array(buffer, posByteLen, posCount);
  return { posView, colView };
}

/**
 * Soften FP (red) and FN (blue) in error-map visualization; leaves TP (green) roughly as-is.
 * Applied in the browser only — no need to re-export PLY.
 */
function softenErrorMapColors(colorsU8, nMax) {
  const n = nMax * 3;
  const blend = 0.5;
  for (let i = 0; i < n; i += 3) {
    const r = colorsU8[i];
    const g = colorsU8[i + 1];
    const b = colorsU8[i + 2];
    // FP: dominant red
    if (r > 180 && g < 130 && b < 130 && r > g + 35 && r > b + 35) {
      colorsU8[i] = Math.min(255, Math.round(r * (1 - blend) + 218 * blend));
      colorsU8[i + 1] = Math.min(255, Math.round(g * (1 - blend) + 135 * blend));
      colorsU8[i + 2] = Math.min(255, Math.round(b * (1 - blend) + 125 * blend));
    } else if (b > 180 && r < 130 && g < 130 && b > r + 35 && b > g + 35) {
      // FN: dominant blue
      colorsU8[i] = Math.min(255, Math.round(r * (1 - blend) + 125 * blend));
      colorsU8[i + 1] = Math.min(255, Math.round(g * (1 - blend) + 155 * blend));
      colorsU8[i + 2] = Math.min(255, Math.round(b * (1 - blend) + 218 * blend));
    }
  }
}

async function preloadBuffers(meta, framesBaseUrl, setStatus) {
  const nFrames = meta.frameCount;
  const buffers = new Array(nFrames);
  const concurrency = 8;
  let nextIdx = 0;
  let loaded = 0;

  async function worker() {
    while (true) {
      const cur = nextIdx;
      nextIdx += 1;
      if (cur >= nFrames) return;
      const f = meta.frames[cur];
      const url = `${framesBaseUrl}${f.bin}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load frame ${cur}: ${url}`);
      buffers[cur] = await res.arrayBuffer();
      loaded += 1;
      if (loaded === 1 || loaded % 10 === 0 || loaded === nFrames) {
        setStatus(`Preloading: ${loaded}/${nFrames}`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return buffers;
}

/**
 * @param {object} opts
 * @param {string} opts.containerId
 * @param {string} opts.runDir
 * @param {string} opts.statusId
 * @param {string} opts.sliderId
 * @param {string} opts.frameTextId
 * @param {string} opts.btnPlayId
 * @param {boolean} [opts.softenErrorColors]
 */
async function initViewer(opts) {
  const viewerEl = document.getElementById(opts.containerId);
  const statusEl = document.getElementById(opts.statusId);
  const sliderEl = document.getElementById(opts.sliderId);
  const frameTextEl = document.getElementById(opts.frameTextId);
  const btnPlayEl = document.getElementById(opts.btnPlayId);

  if (!viewerEl) throw new Error(`Missing #${opts.containerId}`);

  const framesBaseUrl = `${opts.runDir}/frames/`;

  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text;
  };

  const updateRangeUI = (idx, total) => {
    sliderEl.value = String(idx);
    frameTextEl.textContent = `${idx + 1}/${total}`;
  };

  setStatus("Loading metadata…");
  const meta = await loadMeta(opts.runDir);

  const fps = Number(meta.fps || 10.0);
  const frameCount = Number(meta.frameCount || 0);
  const nMax = Number(meta.nPointsMax || 0);
  const radius = Number(meta.radius || 1.0);

  if (!frameCount || !nMax) {
    throw new Error(`Bad meta for ${opts.runDir}: frameCount/nPointsMax missing`);
  }

  sliderEl.min = "0";
  sliderEl.max = String(frameCount - 1);
  sliderEl.value = "0";
  updateRangeUI(0, frameCount);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.07, 0.08, 0.1);

  // Slightly narrower FOV + closer eye = larger subject in the panel on first paint.
  const initialFov = 40;
  const camera = new THREE.PerspectiveCamera(
    initialFov,
    viewerEl.clientWidth / Math.max(1, viewerEl.clientHeight),
    0.01,
    Math.max(100, radius * 1000)
  );
  camera.position.set(radius * 1.05, radius * 0.58, radius * 1.05);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight, false);
  viewerEl.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.target.set(0, 0, 0);
  controls.update();
  controls.minDistance = Math.max(0.001, radius * 0.2);
  controls.maxDistance = Math.max(controls.minDistance * 2, radius * 50);

  const onResize = () => {
    const w = viewerEl.clientWidth;
    const h = viewerEl.clientHeight;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  window.addEventListener("resize", onResize);

  const positions = new Float32Array(nMax * 3);
  const colorsU8 = new Uint8Array(nMax * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3, false));
  geometry.setAttribute("color", new THREE.BufferAttribute(colorsU8, 3, true));

  const material = new THREE.PointsMaterial({
    vertexColors: true,
    size: 2.0,
    sizeAttenuation: false,
    depthTest: true,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  setStatus(`Preloading: 0/${frameCount}`);
  const buffers = await preloadBuffers(meta, framesBaseUrl, setStatus);
  setStatus("Playing…");

  let playing = true;
  btnPlayEl.textContent = "Pause";
  let frameIdx = 0;
  let lastRendered = -1;
  const frameMs = 1000 / fps;
  let startMs = performance.now();

  function renderFrame(i) {
    const buf = buffers[i];
    if (!buf) return;
    const { posView, colView } = parseFrameBuffer(buf, nMax);
    positions.set(posView);
    colorsU8.set(colView);
    if (opts.softenErrorColors) {
      softenErrorMapColors(colorsU8, nMax);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    lastRendered = i;
  }

  renderFrame(0);

  btnPlayEl.addEventListener("click", () => {
    playing = !playing;
    btnPlayEl.textContent = playing ? "Pause" : "Play";
    if (playing) {
      startMs = performance.now() - frameIdx * frameMs;
      setStatus("Playing…");
    } else {
      setStatus(`Paused at frame ${frameIdx + 1}`);
    }
  });

  sliderEl.addEventListener("input", () => {
    playing = false;
    btnPlayEl.textContent = "Play";
    frameIdx = Number(sliderEl.value);
    updateRangeUI(frameIdx, frameCount);
    renderFrame(frameIdx);
    setStatus(`Paused at frame ${frameIdx + 1}`);
  });

  function tick(now) {
    requestAnimationFrame(tick);
    if (playing) {
      const elapsed = now - startMs;
      const next = Math.floor(elapsed / frameMs) % frameCount;
      if (next !== frameIdx) {
        frameIdx = next;
        updateRangeUI(frameIdx, frameCount);
      }
      if (frameIdx !== lastRendered) renderFrame(frameIdx);
    }
    controls.update();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
}

async function main() {
  await Promise.all([
    initViewer({
      containerId: "viewer-left",
      runDir: runLeft,
      statusId: "status-left",
      sliderId: "slider-left",
      frameTextId: "frameText-left",
      btnPlayId: "btnPlay-left",
    }),
    initViewer({
      containerId: "viewer-right",
      runDir: runRight,
      statusId: "status-right",
      sliderId: "slider-right",
      frameTextId: "frameText-right",
      btnPlayId: "btnPlay-right",
      softenErrorColors: true,
    }),
  ]);
}

main().catch((err) => {
  console.error(err);
  const left = document.getElementById("status-left");
  const right = document.getElementById("status-right");
  const msg = `Error: ${err?.message || String(err)}`;
  if (left) left.textContent = msg;
  if (right) right.textContent = msg;
});
