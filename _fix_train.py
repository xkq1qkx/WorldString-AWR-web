#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).parent / "index.html"
text = path.read_text()
d = "motion"
d = "motion"
d = "div"

train_start = '        <h3 class="viz-subsection-title">Go2</h3>'
train_end = '      </section>\n\n      <section class="paper-figure-section paper-figure-section--method"'

i0 = text.find(train_start)
i1 = text.find(train_end)
if i0 < 0 or i1 < 0:
    raise SystemExit(f"train block not found: {i0}, {i1}")

new_train = f'''        <{d} class="viz-grid viz-grid--cols4 viz-grid--train-row" data-viz-row="train">
          <article class="viz-card">
            <{d} class="viz-card-head">
              <h3 class="viz-card-title">Go2 training process (point cloud)</h3>
              <span class="viz-card-meta" id="status-train-process">Loading…</span>
            </{d}>
            <{d} class="viewer" id="viewer-train-process"></{d}>
            <{d} class="controls">
              <button id="btnPlay-train-process" type="button">Pause</button>
              <label class="row">
                <span class="label">Frame</span>
                <input id="slider-train-process" type="range" min="0" max="0" step="1" value="0" />
                <span class="value" id="frameText-train-process">0/0</span>
              </label>
            </{d}>
          </article>

          <article class="viz-card">
            <{d} class="viz-card-head">
              <h3 class="viz-card-title">Go2 multi-pose</h3>
            </{d}>
            <video class="inline-video inline-video--panel" controls autoplay muted loop playsinline preload="metadata">
              <source src="./go2_multipose.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </article>

          <article class="viz-card">
            <{d} class="viz-card-head">
              <h3 class="viz-card-title">H1 training process (point cloud)</h3>
              <span class="viz-card-meta" id="status-train-process-h1">Loading…</span>
            </{d}>
            <{d} class="viewer" id="viewer-train-process-h1"></{d}>
            <{d} class="controls">
              <button id="btnPlay-train-process-h1" type="button">Pause</button>
              <label class="row">
                <span class="label">Frame</span>
                <input id="slider-train-process-h1" type="range" min="0" max="0" step="1" value="0" />
                <span class="value" id="frameText-train-process-h1">0/0</span>
              </label>
            </{d}>
          </article>

          <article class="viz-card">
            <{d} class="viz-card-head">
              <h3 class="viz-card-title">H1 multi-pose</h3>
            </{d}>
            <video class="inline-video inline-video--panel" controls autoplay muted loop playsinline preload="metadata">
              <source src="./h1_multipose.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </article>
        </{d}>
      </section>

      <section class="paper-figure-section paper-figure-section--method"'''

text = text[:i0] + new_train + text[i1 + len(train_end) :]

# Remove pipeline sections if still present
for marker in (
    '      <section class="pipeline-section" aria-labelledby="pipeline-heading">',
    '      <section class="pipeline-section" aria-labelledby="sim-pipeline-heading">',
):
    while marker in text:
        start = text.find(marker)
        end = text.find("      </section>", start) + len("      </section>")
        # include trailing newline
        if end < len(text) and text[end] == "\n":
            end += 1
        text = text[:start] + text[end:]

path.write_text(text)
print("ok")
