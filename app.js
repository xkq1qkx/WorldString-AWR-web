import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js";

const params = new URLSearchParams(window.location.search);
const runLeft = params.get("runLeft") || "run_002";
const runRight = params.get("runRight") || "run_002_error";
const runSmplLeft = params.get("runSmplLeft") || "smpl_run_003";
const runSmplRight = params.get("runSmplRight") || "smpl_run_003_error";
const runDoubleLeft = params.get("runDoubleLeft") || "web_double_stretch_run_001";
const runDoubleRight = params.get("runDoubleRight") || "web_double_stretch_run_001_error";
const runKpHand = params.get("runKpHand") || "run_002_kp";
const runKpSmpl = params.get("runKpSmpl") || "smpl_run_003_kp";
const runKpDouble = params.get("runKpDouble") || "web_double_stretch_run_001_kp";
const runEarLeft = params.get("runEarLeft") || "ear_run_001";
const runEarRight = params.get("runEarRight") || "ear_run_001_error";
const runKpEar = params.get("runKpEar") || "ear_run_001_kp";
const runGo2Left = params.get("runGo2Left") || "go2_run_004";
const runGo2Right = params.get("runGo2Right") || "go2_run_004_error";
const runKpGo2 = params.get("runKpGo2") || "go2_run_004_kp";
const runTrainProcess = params.get("runTrainProcess") || "training_process_visual_web";
const runTrainProcessH1 = params.get("runTrainProcessH1") || "visual_h1_process_web";
// Keypoint sphere radii are code-controlled constants (not URL-overridable).
const kpSphereHand = 0.005;
const kpSphereSmpl = 0.015;
const kpSphereDouble = 0.031;
const kpSphereEar = 0.031;
const kpSphereGo2 = 0.005;

/** Max concurrent frame .bin fetches across all viewers on the page. */
const GLOBAL_FRAME_FETCH_CONCURRENCY = Number(params.get("fetchConcurrency")) || 12;
/** Frames ahead/behind the playhead to prefetch (not the whole sequence). */
const PREFETCH_RADIUS = Number(params.get("prefetchRadius")) || 18;
/** Share frames_meta.json fetches across panels that use the same run folder. */
const metaCache = new Map();

let globalFrameFetchActive = 0;
const globalFrameFetchQueue = [];

function pumpGlobalFrameFetch() {
  while (globalFrameFetchActive < GLOBAL_FRAME_FETCH_CONCURRENCY && globalFrameFetchQueue.length) {
    const job = globalFrameFetchQueue.shift();
    globalFrameFetchActive += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        globalFrameFetchActive -= 1;
        pumpGlobalFrameFetch();
      });
  }
}

function runGlobalFrameFetch(task) {
  return new Promise((resolve, reject) => {
    globalFrameFetchQueue.push({ task, resolve, reject });
    pumpGlobalFrameFetch();
  });
}

async function loadMeta(runDir) {
  const metaUrl = `${runDir}/frames_meta.json`;
  const res = await fetch(metaUrl, { cache: "default" });
  if (!res.ok) throw new Error(`Failed to load meta: ${metaUrl}`);
  return await res.json();
}

function loadMetaCached(runDir) {
  if (!metaCache.has(runDir)) metaCache.set(runDir, loadMeta(runDir));
  return metaCache.get(runDir);
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
 * Moves red/blue hues toward a soft green anchor so the panel looks less harsh but still separable.
 * Applied in the browser only — no need to re-export PLY.
 */
function softenErrorMapColors(colorsU8, nMax) {
  const n = nMax * 3;
  const greenR = 120;
  const greenG = 200;
  const greenB = 120;
  const towardGreen = 0.55;
  const softenBlend = 0.38;
  for (let i = 0; i < n; i += 3) {
    const r = colorsU8[i];
    const g = colorsU8[i + 1];
    const b = colorsU8[i + 2];
    // FP: dominant red
    if (r > 180 && g < 130 && b < 130 && r > g + 35 && r > b + 35) {
      let r1 = Math.min(255, Math.round(r * (1 - softenBlend) + 218 * softenBlend));
      let g1 = Math.min(255, Math.round(g * (1 - softenBlend) + 135 * softenBlend));
      let b1 = Math.min(255, Math.round(b * (1 - softenBlend) + 125 * softenBlend));
      colorsU8[i] = Math.min(255, Math.round(r1 * (1 - towardGreen) + greenR * towardGreen));
      colorsU8[i + 1] = Math.min(255, Math.round(g1 * (1 - towardGreen) + greenG * towardGreen));
      colorsU8[i + 2] = Math.min(255, Math.round(b1 * (1 - towardGreen) + greenB * towardGreen));
    } else if (b > 180 && r < 130 && g < 130 && b > r + 35 && b > g + 35) {
      // FN: dominant blue
      let r1 = Math.min(255, Math.round(r * (1 - softenBlend) + 125 * softenBlend));
      let g1 = Math.min(255, Math.round(g * (1 - softenBlend) + 155 * softenBlend));
      let b1 = Math.min(255, Math.round(b * (1 - softenBlend) + 218 * softenBlend));
      colorsU8[i] = Math.min(255, Math.round(r1 * (1 - towardGreen) + greenR * towardGreen));
      colorsU8[i + 1] = Math.min(255, Math.round(g1 * (1 - towardGreen) + greenG * towardGreen));
      colorsU8[i + 2] = Math.min(255, Math.round(b1 * (1 - towardGreen) + greenB * towardGreen));
    }
  }
}

/**
 * Lazy frame loader: fetch on demand + optional background prefetch.
 * Uses HTTP cache (default) so GitHub Pages and repeat visits are much faster than cache: "no-store".
 */
function createFrameLoader(meta, framesBaseUrl) {
  const nFrames = meta.frameCount;
  const buffers = new Array(nFrames);
  const inflight = new Map();

  async function loadFrame(i) {
    if (i < 0 || i >= nFrames) throw new Error(`Bad frame index: ${i}`);
    if (buffers[i]) return buffers[i];
    if (inflight.has(i)) return inflight.get(i);
    const f = meta.frames[i];
    const url = `${framesBaseUrl}${f.bin}`;
    const p = runGlobalFrameFetch(() =>
      fetch(url, { cache: "default" }).then((res) => {
        if (!res.ok) throw new Error(`Failed to load frame ${i}: ${url}`);
        return res.arrayBuffer();
      })
    ).then((ab) => {
      buffers[i] = ab;
      inflight.delete(i);
      return ab;
    });
    inflight.set(i, p);
    return p;
  }

  const parsedCache = new Array(nFrames);

  function getParsed(i) {
    if (parsedCache[i]) return parsedCache[i];
    const buf = buffers[i];
    if (!buf) return null;
    parsedCache[i] = parseFrameBuffer(buf, meta.nPointsMax);
    return parsedCache[i];
  }

  /** Indices near `center` (playhead), closest first. */
  function windowIndices(center, radius = PREFETCH_RADIUS) {
    const out = [];
    const seen = new Set();
    const add = (i) => {
      const idx = ((i % nFrames) + nFrames) % nFrames;
      if (seen.has(idx)) return;
      seen.add(idx);
      out.push(idx);
    };
    add(center);
    for (let d = 1; d <= radius; d++) {
      add(center + d);
      add(center - d);
    }
    return out;
  }

  function prefetchWindow(center, radius = PREFETCH_RADIUS) {
    const todo = windowIndices(center, radius).filter((i) => !buffers[i]);
    if (!todo.length) return Promise.resolve();
    return Promise.all(todo.map((i) => loadFrame(i).catch((e) => console.error(e))));
  }

  let idlePrefetchToken = 0;
  function startIdlePrefetch(setStatus) {
    const token = ++idlePrefetchToken;
    (async () => {
      await new Promise((r) => setTimeout(r, 2500));
      if (token !== idlePrefetchToken) return;
      for (let i = 0; i < nFrames; i++) {
        if (token !== idlePrefetchToken) return;
        if (!buffers[i]) {
          await loadFrame(i).catch((e) => console.error(e));
          if (i % 20 === 0 && setStatus) setStatus(`Caching ${i + 1}/${nFrames}…`);
          await new Promise((r) => setTimeout(r, 40));
        }
      }
    })();
  }

  function cancelIdlePrefetch() {
    idlePrefetchToken += 1;
  }

  return {
    buffers,
    loadFrame,
    getParsed,
    prefetchWindow,
    startIdlePrefetch,
    cancelIdlePrefetch,
    frameCount: nFrames,
  };
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
 * @param {number} [opts.initialFov] vertical FOV in degrees (default 40)
 * @param {number} [opts.cameraDistanceScale] multiply initial eye distance from origin (default 1; >1 = smaller subject)
 * @param {number} [opts.pointSize] PointsMaterial size in pixels (default 2)
 * @param {boolean} [opts.keypointSpheres] use instanced spheres instead of screen-space points (keypoint panels)
 * @param {number} [opts.sphereRadiusScale] sphere radius = (alignFraming? framingRadius : kpRadius) * this
 * @param {string} [opts.alignFramingRunDir] sibling shape run (e.g. token panel) — use its radius for camera, clip planes, and sphere marker size; joint positions stay in true shape space (no extra scale)
 */
async function initViewer(opts) {
  const viewerEl = document.getElementById(opts.containerId);
  const statusEl = document.getElementById(opts.statusId);
  const sliderEl = document.getElementById(opts.sliderId);
  const frameTextEl = document.getElementById(opts.frameTextId);
  const btnPlayEl = document.getElementById(opts.btnPlayId);

  if (!viewerEl) throw new Error(`Missing #${opts.containerId}`);
  if (!sliderEl || !frameTextEl || !btnPlayEl) {
    throw new Error(`Missing controls for #${opts.containerId} (slider/frameText/play button)`);
  }

  const framesBaseUrl = `${opts.runDir}/frames/`;

  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text;
  };

  const updateRangeUI = (idx, total) => {
    sliderEl.value = String(idx);
    frameTextEl.textContent = `${idx + 1}/${total}`;
  };

  setStatus("Loading metadata…");
  const meta = await loadMetaCached(opts.runDir);

  let framingMeta = meta;
  if (opts.alignFramingRunDir) {
    framingMeta = await loadMetaCached(opts.alignFramingRunDir);
  }
  const fps = Number(meta.fps || 10.0);
  const frameCount = Number(meta.frameCount || 0);
  const nMax = Number(meta.nPointsMax || 0);
  const radius = Number(meta.radius || 1.0);
  const framingRadius = Number(framingMeta.radius || radius);
  // Keypoint bins are already in the same centered units as the sibling shape PLY (whatever voxel
  // resolution built them). Camera is copied from the shape panel, so joint positions must not be
  // multiplied by shapeRadius/kpRadius — that was wrongly inflating the skeleton vs the mesh.
  const positionScale = 1.0;

  if (!frameCount || !nMax) {
    throw new Error(`Bad meta for ${opts.runDir}: frameCount/nPointsMax missing`);
  }

  sliderEl.min = "0";
  sliderEl.max = String(frameCount - 1);
  sliderEl.value = "0";
  updateRangeUI(0, frameCount);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.96, 0.97, 0.98);

  // Narrower FOV + closer eye = larger subject; optional scale pulls camera back for dense / large AABB scenes.
  const initialFov = opts.initialFov ?? 40;
  const distScale = opts.cameraDistanceScale ?? 1.0;
  const camera = new THREE.PerspectiveCamera(
    initialFov,
    viewerEl.clientWidth / Math.max(1, viewerEl.clientHeight),
    0.01,
    Math.max(100, framingRadius * 1000)
  );
  camera.position.set(
    framingRadius * 1.05 * distScale,
    framingRadius * 0.58 * distScale,
    framingRadius * 1.05 * distScale
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  if ("outputColorSpace" in renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight, false);
  viewerEl.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.target.set(0, 0, 0);
  controls.update();
  controls.minDistance = Math.max(0.001, framingRadius * 0.2);
  controls.maxDistance = Math.max(controls.minDistance * 2, framingRadius * 50);

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

  const useSpheres = Boolean(opts.keypointSpheres);
  const sphereRel = opts.sphereRadiusScale ?? (opts.alignFramingRunDir ? 0.011 : 0.24);
  // Match marker size to scene scale from the shape run (same as old radius*(framing/radius)*sphereRel).
  const sphereWorldRadius =
    opts.alignFramingRunDir && framingRadius > 0 ? framingRadius * sphereRel : radius * sphereRel;

  /** @type {THREE.BufferGeometry | null} */
  let geometry = null;
  /** @type {THREE.Points | THREE.InstancedMesh | null} */
  let pointOrInst = null;
  const dummy = new THREE.Object3D();
  const _col = new THREE.Color();

  if (useSpheres) {
    const ballGeo = new THREE.SphereGeometry(1, 14, 14);
    // Three.js only multiplies instanceColor into the fragment when vertex colors are active; without a
    // base `color` attribute, shaded output stays black. White verts × instance HSV = HSV.
    const nVert = ballGeo.attributes.position.count;
    const whiteVert = new Float32Array(nVert * 3);
    whiteVert.fill(1);
    ballGeo.setAttribute("color", new THREE.BufferAttribute(whiteVert, 3));

    const ballMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      toneMapped: false,
    });
    const instancedMesh = new THREE.InstancedMesh(ballGeo, ballMat, nMax);
    instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nMax * 3), 3);
    instancedMesh.count = nMax;
    scene.add(instancedMesh);
    pointOrInst = instancedMesh;
  } else {
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3, false));
    geometry.setAttribute("color", new THREE.BufferAttribute(colorsU8, 3, true));

    const pointSize = opts.pointSize ?? 2.0;
    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: pointSize,
      sizeAttenuation: false,
      depthTest: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    pointOrInst = points;
  }

  setStatus("Loading first frame…");
  const { buffers, loadFrame, getParsed, prefetchWindow, startIdlePrefetch, cancelIdlePrefetch } =
    createFrameLoader(meta, framesBaseUrl);
  await loadFrame(0);
  setStatus("Playing…");
  prefetchWindow(0).catch((e) => console.error(e));
  startIdlePrefetch(setStatus);

  let playing = true;
  btnPlayEl.textContent = "Pause";
  let frameIdx = 0;
  let lastRendered = -1;
  const frameMs = 1000 / fps;
  let startMs = performance.now();
  /** When true, frame/playback come from a leader panel (sync mode); internal clock does not advance. */
  let externallyDriven = false;
  /** @type {null | ((state: { frameIdx: number; playing: boolean }) => void)} */
  let onTick = null;
  /** @type {Promise<void> | null} */
  let frameLoadInFlight = null;
  /** @type {Map<number, Uint8Array>} */
  const softenedColorCache = opts.softenErrorColors ? new Map() : null;

  function renderFrame(i) {
    const parsed = getParsed(i);
    if (!parsed) return;
    const { posView, colView } = parsed;
    if (useSpheres && pointOrInst instanceof THREE.InstancedMesh) {
      const fi = meta.frames[i];
      const nPts =
        fi && typeof fi.nPoints === "number" ? Math.min(fi.nPoints, nMax) : nMax;
      const ps = positionScale;
      for (let j = 0; j < nMax; j++) {
        if (j < nPts) {
          dummy.position.set(
            posView[j * 3] * ps,
            posView[j * 3 + 1] * ps,
            posView[j * 3 + 2] * ps
          );
          dummy.scale.setScalar(sphereWorldRadius);
          const r = colView[j * 3] / 255;
          const g = colView[j * 3 + 1] / 255;
          const b = colView[j * 3 + 2] / 255;
          if (THREE.SRGBColorSpace) {
            _col.setRGB(r, g, b, THREE.SRGBColorSpace);
          } else {
            _col.setRGB(r, g, b);
          }
          pointOrInst.setColorAt(j, _col);
        } else {
          dummy.position.set(0, 0, 0);
          dummy.scale.set(0, 0, 0);
        }
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        pointOrInst.setMatrixAt(j, dummy.matrix);
      }
      pointOrInst.instanceMatrix.needsUpdate = true;
      if (pointOrInst.instanceColor) pointOrInst.instanceColor.needsUpdate = true;
    } else {
      if (positionScale !== 1) {
        for (let k = 0; k < nMax * 3; k++) positions[k] = posView[k] * positionScale;
      } else {
        positions.set(posView);
      }
      if (opts.softenErrorColors && softenedColorCache) {
        let soft = softenedColorCache.get(i);
        if (!soft) {
          soft = new Uint8Array(colView);
          softenErrorMapColors(soft, nMax);
          softenedColorCache.set(i, soft);
        }
        colorsU8.set(soft);
      } else {
        colorsU8.set(colView);
      }
      if (geometry) {
        const fi = meta.frames[i];
        const nPts =
          fi && typeof fi.nPoints === "number" ? Math.min(fi.nPoints, nMax) : nMax;
        geometry.setDrawRange(0, nPts);
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
      }
    }
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
    const idx = frameIdx;
    if (buffers[idx]) {
      renderFrame(idx);
      setStatus(`Paused at frame ${idx + 1}`);
    } else {
      setStatus(`Loading frame ${idx + 1}…`);
      loadFrame(idx)
        .then(() => {
          renderFrame(idx);
          prefetchWindow(idx);
          setStatus(`Paused at frame ${idx + 1}`);
        })
        .catch((e) => {
          console.error(e);
          setStatus(`Error loading frame ${idx + 1}`);
        });
    }
    cancelIdlePrefetch();
    startIdlePrefetch(setStatus);
  });

  function tick(now) {
    requestAnimationFrame(tick);
    if (externallyDriven) {
      controls.update();
      renderer.render(scene, camera);
      return;
    }
    if (playing) {
      const elapsed = now - startMs;
      const next = Math.floor(elapsed / frameMs) % frameCount;
      if (next !== frameIdx) {
        frameIdx = next;
        updateRangeUI(frameIdx, frameCount);
      }
      const idx = frameIdx;
      if (buffers[idx]) {
        if (idx % 8 === 0) prefetchWindow(idx);
        if (idx !== lastRendered) renderFrame(idx);
      } else if (!frameLoadInFlight) {
        setStatus(`Loading frame ${idx + 1}…`);
        frameLoadInFlight = loadFrame(idx)
          .then(() => {
            frameLoadInFlight = null;
            renderFrame(idx);
            setStatus("Playing…");
          })
          .catch((e) => {
            frameLoadInFlight = null;
            console.error(e);
            setStatus(`Error loading frame ${idx + 1}`);
          });
      }
    }
    controls.update();
    renderer.render(scene, camera);
    if (onTick) onTick({ frameIdx, playing });
  }

  requestAnimationFrame(tick);

  function redraw() {
    controls.update();
    renderer.render(scene, camera);
  }

  /**
   * Match another viewer’s camera + orbit target + perspective (FOV, zoom, clip). Re-applies this panel’s aspect.
   * @param {{ camera: THREE.PerspectiveCamera; controls: OrbitControls }} other
   */
  function copyCameraFrom(other) {
    if (!other || !other.camera || !other.controls) return;
    camera.position.copy(other.camera.position);
    camera.quaternion.copy(other.camera.quaternion);
    camera.up.copy(other.camera.up);
    camera.fov = other.camera.fov;
    camera.zoom = other.camera.zoom;
    camera.near = other.camera.near;
    camera.far = other.camera.far;
    controls.target.copy(other.controls.target);
    const w = viewerEl.clientWidth;
    const h = viewerEl.clientHeight;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    controls.update();
  }

  return {
    camera,
    controls,
    copyCameraFrom,
    getFrameIndex: () => frameIdx,
    getPlaying: () => playing,
    getFrameCount: () => frameCount,
    setExternallyDriven: (v) => {
      externallyDriven = Boolean(v);
    },
    setOnTick: (fn) => {
      onTick = typeof fn === "function" ? fn : null;
    },
    applySync: (idx, playingFromLeader) => {
      const clamped = Math.max(0, Math.min(frameCount - 1, Math.floor(idx)));
      frameIdx = clamped;
      playing = Boolean(playingFromLeader);
      btnPlayEl.textContent = playing ? "Pause" : "Play";
      updateRangeUI(frameIdx, frameCount);
      const i = frameIdx;
      if (buffers[i]) {
        renderFrame(i);
        if (playing) {
          startMs = performance.now() - frameIdx * frameMs;
          setStatus("Playing…");
        } else {
          setStatus(`Paused at frame ${i + 1}`);
        }
        redraw();
      } else {
        setStatus(`Loading frame ${i + 1}…`);
        loadFrame(i)
          .then(() => {
            renderFrame(i);
            if (playing) {
              startMs = performance.now() - frameIdx * frameMs;
              setStatus("Playing…");
            } else {
              setStatus(`Paused at frame ${i + 1}`);
            }
            redraw();
          })
          .catch((e) => {
            console.error(e);
            setStatus(`Error loading frame ${i + 1}`);
          });
      }
    },
    redraw,
  };
}

/**
 * When checked, token + error panels mirror the keypoint panel: camera, frame index, and play/pause.
 * @param {Awaited<ReturnType<typeof initViewer>>} leader
 * @param {Awaited<ReturnType<typeof initViewer>>[]} followers
 * @param {HTMLInputElement | null} checkbox
 * @param {{ sliders: HTMLInputElement[]; buttons: HTMLButtonElement[] }} followerUi
 */
function wireKpFollow(leader, followers, checkbox, followerUi) {
  if (!checkbox) return;
  let onLeaderChange = () => {};
  const syncCamera = () => {
    for (const f of followers) {
      f.copyCameraFrom(leader);
    }
  };
  const setFollowerUiDisabled = (disabled) => {
    for (const el of followerUi.sliders) {
      if (el) el.disabled = disabled;
    }
    for (const el of followerUi.buttons) {
      if (el) el.disabled = disabled;
    }
  };
  const pushPlayback = () => {
    const idx = leader.getFrameIndex();
    const pl = leader.getPlaying();
    for (const f of followers) {
      const max = f.getFrameCount() - 1;
      f.applySync(Math.min(idx, max), pl);
    }
  };
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      syncCamera();
      onLeaderChange = syncCamera;
      leader.controls.addEventListener("change", onLeaderChange);
      leader.setOnTick(() => {
        pushPlayback();
      });
      for (const f of followers) {
        f.setExternallyDriven(true);
      }
      setFollowerUiDisabled(true);
      pushPlayback();
    } else {
      leader.controls.removeEventListener("change", onLeaderChange);
      onLeaderChange = () => {};
      leader.setOnTick(null);
      for (const f of followers) {
        f.setExternallyDriven(false);
      }
      setFollowerUiDisabled(false);
    }
  });
}

function setStatusError(statusId, err) {
  const el = document.getElementById(statusId);
  if (el) el.textContent = `Error: ${err?.message || String(err)}`;
}

async function initViewerTask(opts) {
  try {
    return { ok: true, viewer: await initViewer(opts), opts };
  } catch (err) {
    console.error(`[${opts.runDir}]`, err);
    if (opts.statusId) setStatusError(opts.statusId, err);
    return { ok: false, err, opts };
  }
}

/** @type {Map<string, object>} */
const viewerRegistry = new Map();

function registerViewerResult(result) {
  if (result?.ok) viewerRegistry.set(result.opts.containerId, result.viewer);
}

function getViewer(containerId) {
  return viewerRegistry.get(containerId) ?? null;
}

function setRowPendingStatus(tasks, text = "Scroll to load…") {
  for (const t of tasks) {
    if (!t.statusId) continue;
    const el = document.getElementById(t.statusId);
    if (el) el.textContent = text;
  }
}

function syncKpCameras() {
  const pairs = [
    ["viewer-kp-hand", "viewer-left"],
    ["viewer-kp-smpl", "viewer-smpl-left"],
    ["viewer-kp-double", "viewer-double-left"],
    ["viewer-kp-ear", "viewer-ear-left"],
    ["viewer-kp-go2", "viewer-go2-left"],
    ["viewer-train-process", "viewer-left"],
    ["viewer-train-process-h1", "viewer-left"],
  ];
  for (const [kpId, shapeId] of pairs) {
    const kp = getViewer(kpId);
    const shape = getViewer(shapeId);
    if (kp && shape) kp.copyCameraFrom(shape);
  }
}

function wireKpRow(wire) {
  const leader = getViewer(wire.leader);
  const followers = wire.followers.map((id) => getViewer(id));
  if (!leader || followers.some((f) => !f)) return;
  const checkbox = document.getElementById(wire.checkboxId);
  if (!checkbox) return;
  wireKpFollow(leader, followers, checkbox, {
    sliders: wire.sliderIds.map((id) => document.getElementById(id)),
    buttons: wire.buttonIds.map((id) => document.getElementById(id)),
  });
}

function buildRowTasks() {
  return {
    hand: [
      {
        containerId: "viewer-left",
        runDir: runLeft,
        statusId: "status-left",
        sliderId: "slider-left",
        frameTextId: "frameText-left",
        btnPlayId: "btnPlay-left",
        initialFov: 36,
        cameraDistanceScale: 0.88,
      },
      {
        containerId: "viewer-right",
        runDir: runRight,
        statusId: "status-right",
        sliderId: "slider-right",
        frameTextId: "frameText-right",
        btnPlayId: "btnPlay-right",
        softenErrorColors: true,
        initialFov: 36,
        cameraDistanceScale: 0.88,
      },
      {
        containerId: "viewer-kp-hand",
        runDir: runKpHand,
        statusId: "status-kp-hand",
        sliderId: "slider-kp-hand",
        frameTextId: "frameText-kp-hand",
        btnPlayId: "btnPlay-kp-hand",
        initialFov: 30,
        cameraDistanceScale: 0.88,
        keypointSpheres: true,
        sphereRadiusScale: kpSphereHand,
        alignFramingRunDir: runLeft,
      },
    ],
    smpl: [
      {
        containerId: "viewer-smpl-left",
        runDir: runSmplLeft,
        statusId: "status-smpl-left",
        sliderId: "slider-smpl-left",
        frameTextId: "frameText-smpl-left",
        btnPlayId: "btnPlay-smpl-left",
      },
      {
        containerId: "viewer-smpl-right",
        runDir: runSmplRight,
        statusId: "status-smpl-right",
        sliderId: "slider-smpl-right",
        frameTextId: "frameText-smpl-right",
        btnPlayId: "btnPlay-smpl-right",
        softenErrorColors: true,
      },
      {
        containerId: "viewer-kp-smpl",
        runDir: runKpSmpl,
        statusId: "status-kp-smpl",
        sliderId: "slider-kp-smpl",
        frameTextId: "frameText-kp-smpl",
        btnPlayId: "btnPlay-kp-smpl",
        keypointSpheres: true,
        sphereRadiusScale: kpSphereSmpl,
        alignFramingRunDir: runSmplLeft,
      },
    ],
    double: [
      {
        containerId: "viewer-double-left",
        runDir: runDoubleLeft,
        statusId: "status-double-left",
        sliderId: "slider-double-left",
        frameTextId: "frameText-double-left",
        btnPlayId: "btnPlay-double-left",
        initialFov: 55,
        cameraDistanceScale: 1.5,
      },
      {
        containerId: "viewer-double-right",
        runDir: runDoubleRight,
        statusId: "status-double-right",
        sliderId: "slider-double-right",
        frameTextId: "frameText-double-right",
        btnPlayId: "btnPlay-double-right",
        softenErrorColors: true,
        initialFov: 55,
        cameraDistanceScale: 1.5,
      },
      {
        containerId: "viewer-kp-double",
        runDir: runKpDouble,
        statusId: "status-kp-double",
        sliderId: "slider-kp-double",
        frameTextId: "frameText-kp-double",
        btnPlayId: "btnPlay-kp-double",
        initialFov: 55,
        cameraDistanceScale: 1.5,
        keypointSpheres: true,
        sphereRadiusScale: kpSphereDouble,
        alignFramingRunDir: runDoubleLeft,
      },
    ],
    ear: [
      {
        containerId: "viewer-ear-left",
        runDir: runEarLeft,
        statusId: "status-ear-left",
        sliderId: "slider-ear-left",
        frameTextId: "frameText-ear-left",
        btnPlayId: "btnPlay-ear-left",
        initialFov: 55,
        cameraDistanceScale: 1.5,
      },
      {
        containerId: "viewer-ear-right",
        runDir: runEarRight,
        statusId: "status-ear-right",
        sliderId: "slider-ear-right",
        frameTextId: "frameText-ear-right",
        btnPlayId: "btnPlay-ear-right",
        softenErrorColors: true,
        initialFov: 55,
        cameraDistanceScale: 1.5,
      },
      {
        containerId: "viewer-kp-ear",
        runDir: runKpEar,
        statusId: "status-kp-ear",
        sliderId: "slider-kp-ear",
        frameTextId: "frameText-kp-ear",
        btnPlayId: "btnPlay-kp-ear",
        initialFov: 55,
        cameraDistanceScale: 1.5,
        keypointSpheres: true,
        sphereRadiusScale: kpSphereEar,
        alignFramingRunDir: runEarLeft,
      },
    ],
    go2: [
      {
        containerId: "viewer-go2-left",
        runDir: runGo2Left,
        statusId: "status-go2-left",
        sliderId: "slider-go2-left",
        frameTextId: "frameText-go2-left",
        btnPlayId: "btnPlay-go2-left",
        initialFov: 36,
        cameraDistanceScale: 0.88,
      },
      {
        containerId: "viewer-go2-right",
        runDir: runGo2Right,
        statusId: "status-go2-right",
        sliderId: "slider-go2-right",
        frameTextId: "frameText-go2-right",
        btnPlayId: "btnPlay-go2-right",
        softenErrorColors: true,
        initialFov: 36,
        cameraDistanceScale: 0.88,
      },
      {
        containerId: "viewer-kp-go2",
        runDir: runKpGo2,
        statusId: "status-kp-go2",
        sliderId: "slider-kp-go2",
        frameTextId: "frameText-kp-go2",
        btnPlayId: "btnPlay-kp-go2",
        initialFov: 36,
        cameraDistanceScale: 0.88,
        keypointSpheres: true,
        sphereRadiusScale: kpSphereGo2,
        alignFramingRunDir: runGo2Left,
      },
    ],
    train: [
      {
        containerId: "viewer-train-process",
        runDir: runTrainProcess,
        statusId: "status-train-process",
        sliderId: "slider-train-process",
        frameTextId: "frameText-train-process",
        btnPlayId: "btnPlay-train-process",
        softenErrorColors: true,
        initialFov: 42,
        cameraDistanceScale: 1.0,
      },
      {
        containerId: "viewer-train-process-h1",
        runDir: runTrainProcessH1,
        statusId: "status-train-process-h1",
        sliderId: "slider-train-process-h1",
        frameTextId: "frameText-train-process-h1",
        btnPlayId: "btnPlay-train-process-h1",
        softenErrorColors: true,
        initialFov: 42,
        cameraDistanceScale: 1.0,
      },
    ],
  };
}

const ROW_KP_WIRE = {
  hand: {
    leader: "viewer-kp-hand",
    followers: ["viewer-left", "viewer-right"],
    checkboxId: "sync-follow-kp-hand",
    sliderIds: ["slider-left", "slider-right"],
    buttonIds: ["btnPlay-left", "btnPlay-right"],
  },
  smpl: {
    leader: "viewer-kp-smpl",
    followers: ["viewer-smpl-left", "viewer-smpl-right"],
    checkboxId: "sync-follow-kp-smpl",
    sliderIds: ["slider-smpl-left", "slider-smpl-right"],
    buttonIds: ["btnPlay-smpl-left", "btnPlay-smpl-right"],
  },
  double: {
    leader: "viewer-kp-double",
    followers: ["viewer-double-left", "viewer-double-right"],
    checkboxId: "sync-follow-kp-double",
    sliderIds: ["slider-double-left", "slider-double-right"],
    buttonIds: ["btnPlay-double-left", "btnPlay-double-right"],
  },
  ear: {
    leader: "viewer-kp-ear",
    followers: ["viewer-ear-left", "viewer-ear-right"],
    checkboxId: "sync-follow-kp-ear",
    sliderIds: ["slider-ear-left", "slider-ear-right"],
    buttonIds: ["btnPlay-ear-left", "btnPlay-ear-right"],
  },
  go2: {
    leader: "viewer-kp-go2",
    followers: ["viewer-go2-left", "viewer-go2-right"],
    checkboxId: "sync-follow-kp-go2",
    sliderIds: ["slider-go2-left", "slider-go2-right"],
    buttonIds: ["btnPlay-go2-left", "btnPlay-go2-right"],
  },
};

async function initViewerRow(tasks) {
  const results = await Promise.all(tasks.map((opts) => initViewerTask(opts)));
  for (const r of results) registerViewerResult(r);
  return results;
}

function rowIsHidden(el) {
  return Boolean(el.closest(".viz-more-block.is-hidden"));
}

async function main() {
  const rowTasks = buildRowTasks();
  const loadAllNow = params.get("eager") === "1";
  /** One viz row at a time so 3× panels do not flood the network together. */
  let rowInitChain = Promise.resolve();

  const rowEls = document.querySelectorAll("[data-viz-row]");
  if (!rowEls.length) {
    console.warn("No [data-viz-row] grids found; loading all viewers immediately.");
    for (const [rowId, tasks] of Object.entries(rowTasks)) {
      await initViewerRow(tasks);
      if (ROW_KP_WIRE[rowId]) wireKpRow(ROW_KP_WIRE[rowId]);
    }
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      syncKpCameras();
    });
    return;
  }

  const startRow = (rowId, tasks) => {
    setRowPendingStatus(tasks, "Loading…");
    rowInitChain = rowInitChain.then(async () => {
      await initViewerRow(tasks);
      if (ROW_KP_WIRE[rowId]) wireKpRow(ROW_KP_WIRE[rowId]);
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
        syncKpCameras();
      });
    });
    return rowInitChain;
  };

  const observeRow = (el, rowId, tasks) => {
    if (loadAllNow) {
      startRow(rowId, tasks);
      return;
    }

    setRowPendingStatus(tasks);

    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (started) return;
        if (!entries.some((e) => e.isIntersecting)) return;
        started = true;
        io.disconnect();
        startRow(rowId, tasks);
      },
      { root: null, rootMargin: "280px 0px", threshold: 0.01 }
    );
    io.observe(el);
  };

  for (const el of rowEls) {
    const rowId = el.dataset.vizRow;
    const tasks = rowTasks[rowId];
    if (!tasks) {
      console.warn(`Unknown data-viz-row="${rowId}"`);
      continue;
    }

    if (rowIsHidden(el)) continue;

    observeRow(el, rowId, tasks);
  }

  document.addEventListener("viz-reveal-row", (e) => {
    const rowId = e.detail?.rowId;
    if (!rowId) return;
    const el = document.querySelector(`[data-viz-row="${rowId}"]`);
    const tasks = rowTasks[rowId];
    if (!el || !tasks) return;
    observeRow(el, rowId, tasks);
  });
}

main().catch((err) => console.error(err));
