#!/usr/bin/env python3
"""
Build browser-friendly point-cloud animation assets from colored .ply frames.

Input:
  --ply_dir: folder containing frames like:
    xhand_best_colored_joint_states_00000.ply ... _00099.ply
  Only files matching "*colored*.ply" are used, and files whose name contains "error"
  are excluded.

Output (default):
  --out_root: /data/xueyanz/awr/AWR_web/run_002
  It will create:
    frames_meta.json
    frames/frame_00000.bin ... (fixed-size arrays)

Binary frame layout (per frame):
  - positions: float32[N_MAX * 3]   (N_MAX points, centered to origin)
  - colors:    uint8 [N_MAX * 3]   (RGB in [0,255], packed, no alpha)

We pad frames to N_MAX. Padded points are placed far away so they won't show up.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

try:
    import open3d as o3d
except ImportError as e:
    raise SystemExit("Please install open3d in the active environment.") from e


@dataclass(frozen=True)
class FrameItem:
    ply_path: str
    idx: int


def _frame_sort_key(path: str) -> Tuple[int, str]:
    base = os.path.basename(path)
    m = re.search(r"_(\d+)\.ply$", base)
    if m:
        return (int(m.group(1)), base)
    # fallback: stable alphabetical
    return (10**18, base)


def collect_colored_plys(ply_dir: str, pattern: str = "*colored*.ply", exclude_substr: str = "error") -> List[FrameItem]:
    paths = [os.path.join(ply_dir, p) for p in os.listdir(ply_dir) if p.endswith(".ply")]
    matched = []
    for p in paths:
        base_low = os.path.basename(p).lower()
        if exclude_substr and exclude_substr.lower() in base_low:
            continue
        if pattern.startswith("*colored*"):
            if "colored" not in base_low:
                continue
        else:
            # simple alternative: if user passes a pattern, still require 'colored' keyword
            if "colored" not in base_low:
                continue
        matched.append(p)

    matched.sort(key=_frame_sort_key)
    items: List[FrameItem] = []
    for p in matched:
        _, base = os.path.split(p)
        m = re.search(r"_(\d+)\.ply$", base)
        if m:
            idx = int(m.group(1))
        else:
            # If no suffix exists, assign a sequential index
            idx = len(items)
        items.append(FrameItem(ply_path=p, idx=idx))
    return items


def compute_global_center(frames: List[FrameItem]) -> np.ndarray:
    sum_xyz = np.zeros(3, dtype=np.float64)
    total_pts = 0
    for it in frames:
        pc = o3d.io.read_point_cloud(it.ply_path)
        pts = np.asarray(pc.points, dtype=np.float64)
        if pts.size == 0:
            continue
        sum_xyz += pts.sum(axis=0)
        total_pts += int(pts.shape[0])
    if total_pts == 0:
        return np.zeros(3, dtype=np.float64)
    return sum_xyz / float(total_pts)


def ensure_colors_as_uint8(pc, n: int) -> np.ndarray:
    """
    Return uint8 colors with shape (n, 3) in [0,255].
    If pc has no colors, use white.
    """
    if not pc.has_colors():
        c = np.ones((n, 3), dtype=np.float64)
    else:
        c = np.asarray(pc.colors, dtype=np.float64)
        if c.shape[0] != n:
            # unexpected; fall back
            c = np.ones((n, 3), dtype=np.float64)
    c01 = np.clip(c, 0.0, 1.0)
    return (c01 * 255.0 + 0.5).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(description="Convert colored PLY frames to browser-ready binary frames.")
    ap.add_argument("--ply_dir", type=str, required=True, help="Folder containing colored PLY frames.")
    ap.add_argument("--out_root", type=str, required=True, help="Output folder, e.g. awr/AWR_web/run_002")
    ap.add_argument("--fps", type=float, default=10.0)
    ap.add_argument("--pattern", type=str, default="*colored*.ply", help="Substring-based filter; keep default.")
    ap.add_argument("--exclude", type=str, default="error", help="Exclude frames whose basename contains this substring.")
    ap.add_argument("--pad_far", type=float, default=1e6, help="Pad point positions to this far value.")
    args = ap.parse_args()

    ply_dir = os.path.abspath(args.ply_dir)
    out_root = os.path.abspath(args.out_root)
    frames_dir = os.path.join(out_root, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    frames = collect_colored_plys(ply_dir, pattern=args.pattern, exclude_substr=args.exclude)
    if not frames:
        raise SystemExit(f"No colored frames found in: {ply_dir}")

    print(f"[Info] Found {len(frames)} colored frames.")

    # pass1: points count + N_MAX + global bbox (for camera distance in viewer)
    n_list: List[int] = []
    max_n = 0
    mn = np.array([np.inf, np.inf, np.inf], dtype=np.float64)
    mx = np.array([-np.inf, -np.inf, -np.inf], dtype=np.float64)
    for it in frames:
        pc = o3d.io.read_point_cloud(it.ply_path)
        n = int(np.asarray(pc.points).shape[0])
        if n > 0:
            pts = np.asarray(pc.points, dtype=np.float64)
            b = pc.get_axis_aligned_bounding_box()
            mn = np.minimum(mn, np.asarray(b.min_bound, dtype=np.float64))
            mx = np.maximum(mx, np.asarray(b.max_bound, dtype=np.float64))
        n_list.append(n)
        max_n = max(max_n, n)
    if max_n == 0:
        raise SystemExit("All frames have 0 points.")

    print(f"[Info] Max points across frames: N_MAX={max_n}")

    # pass2: global centroid for consistent target = origin
    center = compute_global_center(frames)
    print(f"[Info] Global center (will be subtracted): {center.tolist()}")

    # pass3: write fixed-size per-frame bin files
    for it_i, it in enumerate(frames):
        pc = o3d.io.read_point_cloud(it.ply_path)
        pts = np.asarray(pc.points, dtype=np.float64)
        n = int(pts.shape[0])
        if n == 0:
            pts_centered = np.zeros((max_n, 3), dtype=np.float32)
            colors_u8 = np.zeros((max_n, 3), dtype=np.uint8)
        else:
            pts_centered = (pts - center).astype(np.float32)
            if n < max_n:
                pad_count = max_n - n
                pts_pad = np.full((pad_count, 3), float(args.pad_far), dtype=np.float32)
                pts_centered = np.vstack([pts_centered, pts_pad])
                colors_u8 = ensure_colors_as_uint8(pc, n)
                colors_pad = np.zeros((pad_count, 3), dtype=np.uint8)
                colors_u8 = np.vstack([colors_u8, colors_pad])
            else:
                pts_centered = pts_centered[:max_n]
                colors_u8 = ensure_colors_as_uint8(pc, min(n, max_n))

        colors_u8 = colors_u8[:max_n].astype(np.uint8, copy=False)

        pos_flat = np.ascontiguousarray(pts_centered.reshape(-1), dtype=np.float32)
        col_flat = np.ascontiguousarray(colors_u8.reshape(-1), dtype=np.uint8)
        out_path = os.path.join(frames_dir, f"frame_{it.idx:05d}.bin")
        with open(out_path, "wb") as f:
            f.write(pos_flat.tobytes())
            f.write(col_flat.tobytes())

        if (it_i + 1) % 10 == 0 or it_i == len(frames) - 1:
            print(f"[Write] {it_i+1}/{len(frames)}: {os.path.basename(out_path)}")

    meta = {
        "version": 1,
        "fps": float(args.fps),
        "frameCount": len(frames),
        "nPointsMax": int(max_n),
        "center": center.tolist(),
        "radius": float(max(1e-6, 0.5 * np.linalg.norm(mx - mn))),
        "frames": [
            {"idx": it.idx, "bin": f"frame_{it.idx:05d}.bin", "nPoints": int(n_list[i])}
            for i, it in enumerate(frames)
        ],
    }
    meta_path = os.path.join(out_root, "frames_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"[Done] meta -> {meta_path}")


if __name__ == "__main__":
    main()

