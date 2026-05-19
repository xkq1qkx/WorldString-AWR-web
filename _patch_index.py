#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).parent / "index.html"
text = path.read_text()

tg = "d" + "iv"
open_ = "<" + tg
close_ = "</" + tg + ">"

# Fix mistaken tags from earlier edits
text = text.replace("<motion ", open_ + " ")
text = text.replace("</motion>", close_)

# 1) Robot hand
old_hand = (
    f'        {open_} class="viz-grid viz-grid--cols3">\n'
    f'          <article class="viz-card" data-side="kp">\n'
    f'            {open_} class="viz-card-head">\n'
    '              <h3 class="viz-card-title">Keypoints (input)</h3>\n'
    '              <span class="viz-card-meta" id="status-kp-hand">Loading…</span>'
)
new_hand = (
    '          <h3 class="viz-subsection-title viz-subsection-title--first">Robot hand</h3>\n'
    f'          {open_} class="viz-grid viz-grid--cols3" data-viz-row="hand">\n'
    '            <article class="viz-card" data-side="kp">\n'
    f'              {open_} class="viz-card-head">\n'
    '                <h3 class="viz-card-title">Keypoints (input)</h3>\n'
    '                <span class="viz-card-meta" id="status-kp-hand">Loading…</span>'
)
if old_hand not in text:
    raise SystemExit("hand block not found")
text = text.replace(old_hand, new_hand, 1)

# 2) SMPL data-viz-row
old_smpl = (
    '          shape export).\n'
    '        </p>\n'
    '\n'
    f'        {open_} class="viz-grid viz-grid--cols3">\n'
    '          <article class="viz-card" data-side="kp">\n'
    f'            {open_} class="viz-card-head">\n'
    '              <h3 class="viz-card-title">Keypoints (input)</h3>\n'
    '              <span class="viz-card-meta" id="status-kp-smpl">Loading…</span>'
)
new_smpl = (
    '          shape export).\n'
    '        </p>\n'
    '\n'
    f'          {open_} class="viz-grid viz-grid--cols3" data-viz-row="smpl">\n'
    '            <article class="viz-card" data-side="kp">\n'
    f'              {open_} class="viz-card-head">\n'
    '                <h3 class="viz-card-title">Keypoints (input)</h3>\n'
    '                <span class="viz-card-meta" id="status-kp-smpl">Loading…</span>'
)
if old_smpl not in text:
    raise SystemExit("smpl block not found")
text = text.replace(old_smpl, new_smpl, 1)

# 3) Insert ear row before double stretch; wrap double+go2 in more blocks
ear_block = '''
          <h3 class="viz-subsection-title">Earphone</h3>
          <div class="viz-grid viz-grid--cols3" data-viz-row="ear">
            <article class="viz-card" data-side="kp">
              <motion class="viz-card-head">
                <h3 class="viz-card-title">Keypoints (input)</h3>
                <span class="viz-card-meta" id="status-kp-ear">Loading…</span>
              </div>
              <div class="viewer viewer--kp" id="viewer-kp-ear"></div>
              <div class="controls">
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
              </div>
            </article>
            <article class="viz-card" data-side="left">
              <div class="viz-card-head">
                <h3 class="viz-card-title">Learned token assignment</h3>
                <span class="viz-card-meta" id="status-ear-left">Loading…</span>
              </div>
              <div class="viewer" id="viewer-ear-left"></div>
              <div class="controls">
                <div class="controls-sync-spacer" aria-hidden="true"></div>
                <button id="btnPlay-ear-left" type="button">Pause</button>
                <label class="row">
                  <span class="label">Frame</span>
                  <input id="slider-ear-left" type="range" min="0" max="0" step="1" value="0" />
                  <span class="value" id="frameText-ear-left">0/0</span>
                </label>
              </div>
            </article>
            <article class="viz-card" data-side="right">
              <div class="viz-card-head">
                <h3 class="viz-card-title">Error map vs. ground truth</h3>
                <span class="viz-card-meta" id="status-ear-right">Loading…</span>
              </div>
              <div class="viewer" id="viewer-ear-right"></motion>
              <div class="controls">
                <div class="controls-sync-spacer" aria-hidden="true"></div>
                <button id="btnPlay-ear-right" type="button">Pause</button>
                <label class="row">
                  <span class="label">Frame</span>
                  <input id="slider-ear-right" type="range" min="0" max="0" step="1" value="0" />
                  <span class="value" id="frameText-ear-right">0/0</span>
                </label>
              </div>
            </article>
          </div>

          <div class="viz-more-wrap" id="viz-more-wrap">
            <button id="viz-more-btn" class="viz-reveal viz-more" type="button">
              <span class="viz-reveal__arrows" aria-hidden="true">
                <span class="viz-reveal__arrow"></span>
                <span class="viz-reveal__arrow"></span>
              </span>
              <span class="viz-reveal__label">More</span>
            </button>
          </div>

          <div class="viz-more-block is-hidden" data-viz-more-row="double">
'''

ear_block = ear_block.replace("<motion ", open_ + " ")
ear_block = ear_block.replace("</motion>", close_)

marker = '        <h3 class="viz-subsection-title">Double stretch (soft / deformable)</h3>'
if marker not in text:
    raise SystemExit("double marker not found")
text = text.replace(marker, ear_block + "        <h3 class=\"viz-subsection-title\">Double stretch (soft / deformable)</h3>", 1)

# double grid data-viz-row
text = text.replace(
    '        <h3 class="viz-subsection-title">Double stretch (soft / deformable)</h3>\n'
    '        <p class="section-lead viz-subsection-lead">\n'
    '          Double-stretch sloth; keypoints from aligned <code>state_*.da</code> in the training split (indices match the\n'
    '          shape sequence).\n'
    '        </p>\n'
    '\n'
    f'        {open_} class="viz-grid viz-grid--cols3">\n'
    '          <article class="viz-card" data-side="kp">\n'
    f'            {open_} class="viz-card-head">\n'
    '              <h3 class="viz-card-title">Keypoints (input)</h3>\n'
    '              <span class="viz-card-meta" id="status-kp-double">Loading…</span>',
    '        <h3 class="viz-subsection-title">Double stretch (soft / deformable)</h3>\n'
    '        <p class="section-lead viz-subsection-lead">\n'
    '          Double-stretch sloth; keypoints from aligned <code>state_*.da</code> in the training split (indices match the\n'
    '          shape sequence).\n'
    '        </p>\n'
    '\n'
    f'        {open_} class="viz-grid viz-grid--cols3" data-viz-row="double">\n'
    '          <article class="viz-card" data-side="kp">\n'
    f'            {open_} class="viz-card-head">\n'
    '              <h3 class="viz-card-title">Keypoints (input)</h3>\n'
    '              <span class="viz-card-meta" id="status-kp-double">Loading…</span>',
    1,
)

# Close double block and add go2 block - find end of double grid (before footnote)
footnote = '        <p class="viz-footnote">'
idx = text.find(footnote)
if idx < 0:
    raise SystemExit("footnote not found")

# Insert closing div for double more-block and go2 block before footnote
go2_block = f'''
          </div>

          <div class="viz-more-block is-hidden" data-viz-more-row="go2">
            <h3 class="viz-subsection-title">Unitree Go2</h3>
            {open_} class="viz-grid viz-grid--cols3" data-viz-row="go2">
              <article class="viz-card" data-side="kp">
                {open_} class="viz-card-head">
                  <h3 class="viz-card-title">Keypoints (input)</h3>
                  <span class="viz-card-meta" id="status-kp-go2">Loading…</span>
                </div>
                <div class="viewer viewer--kp" id="viewer-kp-go2"></div>
                <motion class="controls">
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
                </div>
              </article>
              <article class="viz-card" data-side="left">
                <div class="viz-card-head">
                  <h3 class="viz-card-title">Learned token assignment</h3>
                  <span class="viz-card-meta" id="status-go2-left">Loading…</span>
                </div>
                <div class="viewer" id="viewer-go2-left"></div>
                <div class="controls">
                  <div class="controls-sync-spacer" aria-hidden="true"></div>
                  <button id="btnPlay-go2-left" type="button">Pause</button>
                  <label class="row">
                    <span class="label">Frame</span>
                    <input id="slider-go2-left" type="range" min="0" max="0" step="1" value="0" />
                    <span class="value" id="frameText-go2-left">0/0</span>
                  </label>
                </div>
              </article>
              <article class="viz-card" data-side="right">
                <div class="viz-card-head">
                  <h3 class="viz-card-title">Error map vs. ground truth</h3>
                  <span class="viz-card-meta" id="status-go2-right">Loading…</span>
                </div>
                <div class="viewer" id="viewer-go2-right"></div>
                <div class="controls">
                  <div class="controls-sync-spacer" aria-hidden="true"></div>
                  <button id="btnPlay-go2-right" type="button">Pause</button>
                  <label class="row">
                    <span class="label">Frame</span>
                    <input id="slider-go2-right" type="range" min="0" max="0" step="1" value="0" />
                    <span class="value" id="frameText-go2-right">0/0</span>
                  </label>
                </div>
              </article>
            </div>
          </motion>

'''
go2_block = go2_block.replace("<motion ", open_ + " ")
go2_block = go2_block.replace("</motion>", close_)
# fix broken go2 opening div
go2_block = go2_block.replace(f'{open_} class="viz-grid', f'{open_} class="viz-grid')

text = text[:idx] + go2_block + text[idx:]

# Close viz section academic-band
text = text.replace(
    "        </p>\n      </section>\n\n      <section class=\"viz-section\" aria-labelledby=\"train-process-heading\">",
    "        </p>\n        </section>\n      </div>\n\n      <section class=\"viz-section\" aria-labelledby=\"train-process-heading\">",
    1,
)

# Training 4-col grid
old_train = (
    '        <h3 class="viz-subsection-title">Go2</h3>\n'
    f'        {open_} class="viz-grid viz-grid--cols2">\n'
)
new_train = f'        {open_} class="viz-grid viz-grid--cols4" data-viz-row="train">\n'
text = text.replace(
    '        <h3 class="viz-subsection-title">Go2</h3>\n        <motion class="viz-grid viz-grid--cols2">'.replace("motion", tg),
    new_train,
    1,
)
text = text.replace("<motion ", open_ + " ")

# Remove H1 subsection header and second grid - merge into first 4-col
h1_part = (
    '        </div>\n\n        <h3 class="viz-subsection-title">H1</h3>\n'
    f'        {open_} class="viz-grid viz-grid--cols2">\n'
)
text = text.replace(h1_part, '\n', 1)

# inline-video--panel on mp4s
text = text.replace('class="inline-video" controls', 'class="inline-video inline-video--panel" controls')

# Remove teaser3 section
teaser_start = '      <section class="paper-figure-section">\n        <p class="section-lead">\n          Qualitative overview:'
teaser_end = '      </section>\n\n      <footer class="site-footer">'
i0 = text.find(teaser_start)
i1 = text.find(teaser_end)
if i0 >= 0 and i1 >= 0:
    text = text[:i0] + "      <footer class=\"site-footer\">" + text[i1 + len(teaser_end) - len("      <footer class=\"site-footer\">"):]

# Scripts
text = text.replace('<script type="module" src="./app.js"></script>', '<script type="module" src="./app.js?v=lazy3"></script>\n    <script>\n      (function () {\n        const moreBtn = document.getElementById("viz-more-btn");\n        const moreWrap = document.getElementById("viz-more-wrap");\n        const hiddenBlocks = Array.from(document.querySelectorAll(".viz-more-block.is-hidden"));\n        if (!moreBtn || !moreWrap) return;\n        moreBtn.addEventListener("click", () => {\n          const next = hiddenBlocks.shift();\n          if (!next) return;\n          next.classList.remove("is-hidden");\n          const rowId = next.dataset.vizMoreRow;\n          if (rowId) document.dispatchEvent(new CustomEvent("viz-reveal-row", { detail: { rowId } }));\n          window.dispatchEvent(new Event("resize"));\n          if (!hiddenBlocks.length) {\n            moreWrap.classList.add("is-hidden");\n            moreWrap.setAttribute("aria-hidden", "true");\n          }\n        });\n      })();\n    </script>')

path.write_text(text)
print("patched ok")
