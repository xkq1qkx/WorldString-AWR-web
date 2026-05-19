#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).parent / "index.html"
text = path.read_text()
d = "div"

# 1) Robot hand
old = f'''        <{d} class="viz-grid viz-grid--cols3">
          <article class="viz-card" data-side="kp">
            <{d} class="viz-card-head">
              <h3 class="viz-card-title">Keypoints (input)</h3>
              <span class="viz-card-meta" id="status-kp-hand">Loading…</span>'''
new = f'''          <h3 class="viz-subsection-title viz-subsection-title--first">Robot hand</h3>
          <{d} class="viz-grid viz-grid--cols3" data-viz-row="hand">
            <article class="viz-card" data-side="kp">
              <{d} class="viz-card-head">
                <h3 class="viz-card-title">Keypoints (input)</h3>
                <span class="viz-card-meta" id="status-kp-hand">Loading…</span>'''
if old not in text:
    raise SystemExit("hand block not found")
text = text.replace(old, new, 1)

# Fix hand grid indentation for closing — indent articles inside hand row (optional, skip)

# 2) Insert ear + more before double stretch
ear_and_more = f'''
          <h3 class="viz-subsection-title">Earphone</h3>
          <{d} class="viz-grid viz-grid--cols3" data-viz-row="ear">
            <article class="viz-card" data-side="kp">
              <{d} class="viz-card-head">
                <h3 class="viz-card-title">Keypoints (input)</h3>
                <span class="viz-card-meta" id="status-kp-ear">Loading…</span>
              </{d}>
              <{d} class="viewer viewer--kp" id="viewer-kp-ear"></{d}>
              <{d} class="controls">
                <label class="row row--checkbox">
                  <input id="sync-follow-kp-ear" type="checkbox" />
                  <span class="label">Sync other panels to this view</span>
                </label>
                <button id="btnPlay-kp-ear" type="button">Pause</button>
                <label class="row">
                  <span class="label">Frame</span>
                  <input id="slider-kp-ear" type="range" min="0" max="0" step="1" value="0" />
                  <span class="value" id="frameText-kp-ear">0/0</span>
                </label>
              </{d}>
            </article>
            <article class="viz-card" data-side="left">
              <{d} class="viz-card-head">
                <h3 class="viz-card-title">Learned token assignment</h3>
                <span class="viz-card-meta" id="status-ear-left">Loading…</span>
              </{d}>
              <{d} class="viewer" id="viewer-ear-left"></{d}>
              <{d} class="controls">
                <{d} class="controls-sync-spacer" aria-hidden="true"></{d}>
                <button id="btnPlay-ear-left" type="button">Pause</button>
                <label class="row">
                  <span class="label">Frame</span>
                  <input id="slider-ear-left" type="range" min="0" max="0" step="1" value="0" />
                  <span class="value" id="frameText-ear-left">0/0</span>
                </label>
              </{d}>
            </article>
            <article class="viz-card" data-side="right">
              <{d} class="viz-card-head">
                <h3 class="viz-card-title">Error map vs. ground truth</h3>
                <span class="viz-card-meta" id="status-ear-right">Loading…</span>
              </{d}>
              <{d} class="viewer" id="viewer-ear-right"></{d}>
              <{d} class="controls">
                <{d} class="controls-sync-spacer" aria-hidden="true"></{d}>
                <button id="btnPlay-ear-right" type="button">Pause</button>
                <label class="row">
                  <span class="label">Frame</span>
                  <input id="slider-ear-right" type="range" min="0" max="0" step="1" value="0" />
                  <span class="value" id="frameText-ear-right">0/0</span>
                </label>
              </{d}>
            </article>
          </{d}>

          <{d} class="viz-more-wrap" id="viz-more-wrap">
            <button id="viz-more-btn" class="viz-reveal viz-more" type="button">
              <span class="viz-reveal__arrows" aria-hidden="true">
                <span class="viz-reveal__arrow"></span>
                <span class="viz-reveal__arrow"></span>
              </span>
              <span class="viz-reveal__label">More</span>
            </button>
          </{d}>

          <{d} class="viz-more-block is-hidden" data-viz-more-row="double">
'''

marker = '        <h3 class="viz-subsection-title">Double stretch (soft / deformable)</h3>'
if marker not in text:
    raise SystemExit("double marker not found")
text = text.replace(marker, ear_and_more + marker, 1)

# 3) data-viz-row on double grid
text = text.replace(
    '          shape sequence).\n'
    '        </p>\n'
    '\n'
    f'        <{d} class="viz-grid viz-grid--cols3">\n'
    '          <article class="viz-card" data-side="kp">\n'
    f'            <{d} class="viz-card-head">\n'
    '              <h3 class="viz-card-title">Keypoints (input)</h3>\n'
    '              <span class="viz-card-meta" id="status-kp-double">Loading…</span>',
    '          shape sequence).\n'
    '        </p>\n'
    '\n'
    f'        <{d} class="viz-grid viz-grid--cols3" data-viz-row="double">\n'
    '          <article class="viz-card" data-side="kp">\n'
    f'            <{d} class="viz-card-head">\n'
    '              <h3 class="viz-card-title">Keypoints (input)</h3>\n'
    '              <span class="viz-card-meta" id="status-kp-double">Loading…</span>',
    1,
)

# 4) Go2 block + close double more-block before footnote
go2 = f'''
          </{d}>

          <{d} class="viz-more-block is-hidden" data-viz-more-row="go2">
            <h3 class="viz-subsection-title">Unitree Go2</h3>
            <{d} class="viz-grid viz-grid--cols3" data-viz-row="go2">
              <article class="viz-card" data-side="kp">
                <{d} class="viz-card-head">
                  <h3 class="viz-card-title">Keypoints (input)</h3>
                  <span class="viz-card-meta" id="status-kp-go2">Loading…</span>
                </{d}>
                <{d} class="viewer viewer--kp" id="viewer-kp-go2"></{d}>
                <{d} class="controls">
                  <label class="row row--checkbox">
                    <input id="sync-follow-kp-go2" type="checkbox" />
                    <span class="label">Sync other panels to this view</span>
                  </label>
                  <button id="btnPlay-kp-go2" type="button">Pause</button>
                  <label class="row">
                    <span class="label">Frame</span>
                    <input id="slider-kp-go2" type="range" min="0" max="0" step="1" value="0" />
                    <span class="value" id="frameText-kp-go2">0/0</span>
                  </label>
                </{d}>
              </article>
              <article class="viz-card" data-side="left">
                <{d} class="viz-card-head">
                  <h3 class="viz-card-title">Learned token assignment</h3>
                  <span class="viz-card-meta" id="status-go2-left">Loading…</span>
                </{d}>
                <{d} class="viewer" id="viewer-go2-left"></{d}>
                <{d} class="controls">
                  <{d} class="controls-sync-spacer" aria-hidden="true"></{d}>
                  <button id="btnPlay-go2-left" type="button">Pause</button>
                  <label class="row">
                    <span class="label">Frame</span>
                    <input id="slider-go2-left" type="range" min="0" max="0" step="1" value="0" />
                    <span class="value" id="frameText-go2-left">0/0</span>
                  </label>
                </{d}>
              </article>
              <article class="viz-card" data-side="right">
                <{d} class="viz-card-head">
                  <h3 class="viz-card-title">Error map vs. ground truth</h3>
                  <span class="viz-card-meta" id="status-go2-right">Loading…</span>
                </{d}>
                <{d} class="viewer" id="viewer-go2-right"></{d}>
                <{d} class="controls">
                  <{d} class="controls-sync-spacer" aria-hidden="true"></{d}>
                  <button id="btnPlay-go2-right" type="button">Pause</button>
                  <label class="row">
                    <span class="label">Frame</span>
                    <input id="slider-go2-right" type="range" min="0" max="0" step="1" value="0" />
                    <span class="value" id="frameText-go2-right">0/0</span>
                  </label>
                </{d}>
              </article>
            </{d}>
          </{d}>

'''
footnote = '        <p class="viz-footnote">'
idx = text.find(footnote)
if idx < 0:
    raise SystemExit("footnote not found")
text = text[:idx] + go2 + text[idx:]

# 5) Close academic-band after interactive viz
text = text.replace(
    '        </p>\n      </section>\n\n      <section class="viz-section" aria-labelledby="train-process-heading">',
    '        </p>\n        </section>\n      </div>\n\n      <section class="viz-section" aria-labelledby="train-process-heading">',
    1,
)

# 6) Scripts
more_script = r'''
    <script>
      (function () {
        const moreBtn = document.getElementById("viz-more-btn");
        const moreWrap = document.getElementById("viz-more-wrap");
        const hiddenBlocks = Array.from(document.querySelectorAll(".viz-more-block.is-hidden"));
        if (!moreBtn || !moreWrap) return;
        moreBtn.addEventListener("click", () => {
          const next = hiddenBlocks.shift();
          if (!next) return;
          next.classList.remove("is-hidden");
          const rowId = next.dataset.vizMoreRow;
          if (rowId) document.dispatchEvent(new CustomEvent("viz-reveal-row", { detail: { rowId } }));
          window.dispatchEvent(new Event("resize"));
          if (!hiddenBlocks.length) {
            moreWrap.classList.add("is-hidden");
            moreWrap.setAttribute("aria-hidden", "true");
          }
        });
      })();
    </script>'''
text = text.replace(
    '<script type="module" src="./app.js"></script>',
    '<script type="module" src="./app.js?v=lazy3"></script>' + more_script,
)

path.write_text(text)
print("ok")
