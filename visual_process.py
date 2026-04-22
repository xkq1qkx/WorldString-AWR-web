#!/usr/bin/env python3
"""
Play PLY point-cloud snapshots in sequence (default: 10 FPS).

Usage:
  python visual_process.py
  python visual_process.py --dir training_process_visual --fps 10
"""

from __future__ import annotations

import argparse
import re
import time
from pathlib import Path
from typing import List, Tuple

import open3d as o3d


TRAIN_STEP_RE = re.compile(r"train_step_(\d+)_colored\.ply$")
EPOCH_RE = re.compile(r"epoch_(\d+)_colored\.ply$")


def sort_key(path: Path) -> Tuple[int, int, str]:
    """
    Sort priority:
    1) train_step_XXXXX_colored.ply by numeric step
    2) epoch_X_colored.ply by epoch
    3) anything else by name
    """
    name = path.name
    m_step = TRAIN_STEP_RE.search(name)
    if m_step:
        return (0, int(m_step.group(1)), name)
    m_epoch = EPOCH_RE.search(name)
    if m_epoch:
        return (1, int(m_epoch.group(1)), name)
    return (2, 0, name)


def collect_frames(folder: Path) -> List[Path]:
    frames = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".ply"]
    frames.sort(key=sort_key)
    return frames


def main() -> None:
    parser = argparse.ArgumentParser(description="Visualize training-process PLY snapshots as an animation.")
    parser.add_argument(
        "--dir",
        default="training_process_visual",
        type=str,
        help="Directory containing .ply files (default: training_process_visual).",
    )
    parser.add_argument("--fps", default=10.0, type=float, help="Playback FPS (default: 10).")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Play once and exit (default behavior is looping playback).",
    )
    args = parser.parse_args()

    folder = Path(args.dir).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        raise SystemExit(f"[Error] Directory does not exist: {folder}")
    if args.fps <= 0:
        raise SystemExit("[Error] --fps must be > 0")

    frames = collect_frames(folder)
    if not frames:
        raise SystemExit(f"[Error] No .ply files found in: {folder}")

    print(f"[Info] Directory: {folder}")
    print(f"[Info] Frames: {len(frames)}")
    print(f"[Info] FPS: {args.fps}")
    print("[Info] Close the Open3D window to stop.")

    vis = o3d.visualization.Visualizer()
    vis.create_window(window_name="Training Process Point-Cloud Playback", width=1280, height=800)

    first_pcd = o3d.io.read_point_cloud(str(frames[0]))
    if len(first_pcd.points) == 0:
        raise SystemExit(f"[Error] First frame appears empty: {frames[0]}")
    vis.add_geometry(first_pcd)

    # Keep render options simple; users can still use mouse controls.
    render_opt = vis.get_render_option()
    render_opt.background_color = [0.98, 0.98, 0.98]
    render_opt.point_size = 2.0

    frame_interval = 1.0 / args.fps
    idx = 0
    running = True

    while running:
        t0 = time.perf_counter()

        pcd = o3d.io.read_point_cloud(str(frames[idx]))
        first_pcd.points = pcd.points
        first_pcd.colors = pcd.colors
        if pcd.has_normals():
            first_pcd.normals = pcd.normals

        vis.update_geometry(first_pcd)
        running = vis.poll_events()
        vis.update_renderer()
        if not running:
            break

        idx += 1
        if idx >= len(frames):
            if args.once:
                break
            idx = 0

        elapsed = time.perf_counter() - t0
        remain = frame_interval - elapsed
        if remain > 0:
            time.sleep(remain)

    vis.destroy_window()


if __name__ == "__main__":
    main()
