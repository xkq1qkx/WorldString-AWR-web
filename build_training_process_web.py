#!/usr/bin/env python3
"""
Build browser-ready animation assets from training-process PLY snapshots.

Compared with build_web_from_colored_ply.py, this script adds:
  - Voxel downsampling from an assumed source grid (default 512) to target grid (default 256)
  - Sorting tailored for names like train_step_XXXXX_colored.ply and epoch_X_colored.ply

Output:
  <out_root>/frames_meta.json
  <out_root>/frames/frame_XXXXX.bin
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import numpy as np

try:
    import open3d as o3d
except ImportError as e:
    raise SystemExit("Please install open3d in the active environment.") from e


TRAIN_STEP_RE = re.compile(r"train_step_(\d+)_colored\.ply$")
EPOCH_RE = re.compile(r"epoch_(\d+)_colored\.ply$")


@dataclass(frozen=True)
class FrameItem:
    ply_path: str
    idx: int
    n_raw: int


def sort_key(path: Path) -> Tuple[int, int, str]:
    name = path.name
    m_step = TRAIN_STEP_RE.search(name)
    if m_step:
        return (0, int(m_step.group(1)), name)
    m_epoch = EPOCH_RE.search(name)
    if m_epoch:
        return (1, int(m_epoch.group(1)), name)
    return (2, 0, name)


def collect_frames(ply_dir: Path) -> List[Path]:
    frames = [p for p in ply_dir.iterdir() if p.is_file() and p.suffix.lower() == ".ply"]
    frames.sort(key=sort_key)
    return frames


def compute_global_center_and_extent(paths: List[Path]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    sum_xyz = np.zeros(3, dtype=np.float64)
    total_pts = 0
    mn = np.array([np.inf, np.inf, np.inf], dtype=np.float64)
    mx = np.array([-np.inf, -np.inf, -np.inf], dtype=np.float64)

    for p in paths:
        pc = o3d.io.read_point_cloud(str(p))
        pts = np.asarray(pc.points, dtype=np.float64)
        if pts.size == 0:
            continue
        sum_xyz += pts.sum(axis=0)
        total_pts += int(pts.shape[0])
        mn = np.minimum(mn, pts.min(axis=0))
        mx = np.maximum(mx, pts.max(axis=0))

    if total_pts == 0:
        raise SystemExit("All frames are empty.")

    center = sum_xyz / float(total_pts)
    extent = np.maximum(mx - mn, 1e-8)
    return center, mn, extent


def ensure_colors_u8(pc: o3d.geometry.PointCloud, n: int) -> np.ndarray:
    if not pc.has_colors():
        c = np.ones((n, 3), dtype=np.float64)
    else:
        c = np.asarray(pc.colors, dtype=np.float64)
        if c.shape[0] != n:
            c = np.ones((n, 3), dtype=np.float64)
    c01 = np.clip(c, 0.0, 1.0)
    return (c01 * 255.0 + 0.5).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser(description="Convert training_process_visual PLYs to web-friendly bin frames.")
    ap.add_argument("--ply_dir", type=str, default="training_process_visual")
    ap.add_argument("--out_root", type=str, default="training_process_visual_web")
    ap.add_argument("--fps", type=float, default=10.0)
    ap.add_argument("--pad_far", type=float, default=1e6)
    ap.add_argument("--grid_from", type=int, default=512, help="Assumed source voxel grid resolution.")
    ap.add_argument("--grid_to", type=int, default=256, help="Target voxel grid resolution after downsampling.")
    args = ap.parse_args()

    ply_dir = Path(args.ply_dir).expanduser().resolve()
    out_root = Path(args.out_root).expanduser().resolve()
    frames_dir = out_root / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    if not ply_dir.exists() or not ply_dir.is_dir():
        raise SystemExit(f"[Error] ply_dir does not exist: {ply_dir}")
    if args.grid_from <= 0 or args.grid_to <= 0:
        raise SystemExit("[Error] grid resolutions must be > 0")

    frame_paths = collect_frames(ply_dir)
    if not frame_paths:
        raise SystemExit(f"[Error] No .ply files in: {ply_dir}")
    print(f"[Info] Found {len(frame_paths)} frames.")

    center, mn, extent = compute_global_center_and_extent(frame_paths)
    max_extent = float(np.max(extent))
    # Doubling voxel size approximates 512->256 reduction.
    voxel_size = max_extent / float(args.grid_to)
    print(f"[Info] Global center: {center.tolist()}")
    print(f"[Info] Estimated voxel_size for {args.grid_from}->{args.grid_to}: {voxel_size:.8f}")

    prepared: List[FrameItem] = []
    down_counts: List[int] = []
    max_n = 0

    for i, p in enumerate(frame_paths):
        pc = o3d.io.read_point_cloud(str(p))
        n_raw = int(np.asarray(pc.points).shape[0])
        if n_raw > 0:
            pc = pc.voxel_down_sample(voxel_size=voxel_size)
        n_ds = int(np.asarray(pc.points).shape[0])
        down_counts.append(n_ds)
        max_n = max(max_n, n_ds)
        prepared.append(FrameItem(ply_path=str(p), idx=i, n_raw=n_raw))

        if (i + 1) % 10 == 0 or i == len(frame_paths) - 1:
            print(f"[Downsample] {i+1}/{len(frame_paths)}: raw={n_raw}, ds={n_ds}")

    if max_n == 0:
        raise SystemExit("[Error] All downsampled frames are empty.")
    print(f"[Info] N_MAX after downsampling: {max_n}")

    # Write fixed-size per-frame binary blobs
    for i, item in enumerate(prepared):
        pc = o3d.io.read_point_cloud(item.ply_path)
        if len(pc.points) > 0:
            pc = pc.voxel_down_sample(voxel_size=voxel_size)

        pts = np.asarray(pc.points, dtype=np.float64)
        n = int(pts.shape[0])
        if n == 0:
            pts_centered = np.zeros((max_n, 3), dtype=np.float32)
            colors_u8 = np.zeros((max_n, 3), dtype=np.uint8)
        else:
            pts_centered = (pts - center).astype(np.float32)
            colors_u8 = ensure_colors_u8(pc, n)
            if n < max_n:
                pad = max_n - n
                pts_pad = np.full((pad, 3), float(args.pad_far), dtype=np.float32)
                col_pad = np.zeros((pad, 3), dtype=np.uint8)
                pts_centered = np.vstack([pts_centered, pts_pad])
                colors_u8 = np.vstack([colors_u8, col_pad])
            else:
                pts_centered = pts_centered[:max_n]
                colors_u8 = colors_u8[:max_n]

        pos_flat = np.ascontiguousarray(pts_centered.reshape(-1), dtype=np.float32)
        col_flat = np.ascontiguousarray(colors_u8.reshape(-1), dtype=np.uint8)
        out_path = frames_dir / f"frame_{item.idx:05d}.bin"
        with out_path.open("wb") as f:
            f.write(pos_flat.tobytes())
            f.write(col_flat.tobytes())

        if (i + 1) % 10 == 0 or i == len(prepared) - 1:
            print(f"[Write] {i+1}/{len(prepared)}: {out_path.name}")

    meta = {
        "version": 1,
        "fps": float(args.fps),
        "frameCount": len(prepared),
        "nPointsMax": int(max_n),
        "center": center.tolist(),
        "radius": float(max(1e-6, 0.5 * np.linalg.norm(extent))),
        "frames": [
            {"idx": i, "bin": f"frame_{i:05d}.bin", "nPoints": int(down_counts[i])}
            for i in range(len(prepared))
        ],
    }
    meta_path = out_root / "frames_meta.json"
    with meta_path.open("w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"[Done] meta -> {meta_path}")


if __name__ == "__main__":
    main()
