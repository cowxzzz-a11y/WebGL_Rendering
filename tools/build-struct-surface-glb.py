from __future__ import annotations

from pathlib import Path

import trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals


ROOT = Path(__file__).resolve().parents[1]
PROJECT_DIR = ROOT / "assets" / "\u5730\u5c42"
SOURCE_DIR = PROJECT_DIR / "StructSurface"
OUTPUT_PATH = PROJECT_DIR / "struct-surface.glb"


def main() -> None:
    source_files = sorted(SOURCE_DIR.glob("*.ply"), key=lambda path: path.stem.casefold())
    if not source_files:
        raise FileNotFoundError(f"No PLY files found in {SOURCE_DIR}")

    red_material = PBRMaterial(
        name="StructSurface_Red",
        baseColorFactor=[220, 40, 40, 255],
        metallicFactor=0.0,
        roughnessFactor=0.65,
        doubleSided=True,
    )

    scene = trimesh.Scene(base_frame="world")
    for source_path in source_files:
        mesh = trimesh.load(source_path, force="mesh", process=False)
        if mesh.is_empty:
            raise ValueError(f"Empty mesh: {source_path.name}")

        mesh.visual = TextureVisuals(material=red_material)
        scene.add_geometry(
            mesh,
            node_name=source_path.stem,
            geom_name=source_path.stem,
        )

    OUTPUT_PATH.write_bytes(scene.export(file_type="glb"))

    bounds = scene.bounds
    print(f"Created: {OUTPUT_PATH}")
    print(f"Meshes: {len(scene.geometry)}")
    print(f"Bounds min: {bounds[0].tolist()}")
    print(f"Bounds max: {bounds[1].tolist()}")
    print(f"Size: {OUTPUT_PATH.stat().st_size} bytes")


if __name__ == "__main__":
    main()
