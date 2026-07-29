"""Generate the rank texture used by the temporal dither material.

This is a deterministic toroidal void-and-cluster implementation based on
Robert Ulichney's ordered-dither construction. It is kept in-tree so the PNG is
reproducible and does not depend on a third-party binary asset.

Related implementation/reference:
https://github.com/NVIDIA-RTX/STBN
https://doi.org/10.1145/2001269.2001280
"""

from argparse import ArgumentParser
from pathlib import Path

import numpy as np
from PIL import Image


def generate_rank_texture(
    size: int = 128,
    sigma: float = 1.5,
    seed_density: float = 0.1,
    seed: int = 0xD17E_2026,
) -> np.ndarray:
    area = size * size
    seed_count = round(area * seed_density)
    radius = max(1, int(np.ceil(sigma * 3.0)))
    offsets = np.arange(-radius, radius + 1)
    yy, xx = np.meshgrid(offsets, offsets, indexing="ij")
    kernel = np.exp(-(xx * xx + yy * yy) / (2.0 * sigma * sigma))

    pattern = np.zeros((size, size), dtype=bool)
    seed_indices = np.random.default_rng(seed).choice(
        area,
        size=seed_count,
        replace=False,
    )
    pattern.flat[seed_indices] = True
    energy = np.zeros((size, size), dtype=np.float64)

    def update_energy(field: np.ndarray, flat_index: int, sign: float) -> None:
        y, x = divmod(int(flat_index), size)
        ys = (y + offsets) % size
        xs = (x + offsets) % size
        field[np.ix_(ys, xs)] += sign * kernel

    for flat_index in seed_indices:
        update_energy(energy, flat_index, 1.0)

    # Relax the random seed points into a toroidal blue-noise distribution.
    for _ in range(area * 2):
        cluster = int(np.argmax(np.where(pattern, energy, -np.inf)))
        pattern.flat[cluster] = False
        update_energy(energy, cluster, -1.0)

        void = int(np.argmin(np.where(~pattern, energy, np.inf)))
        pattern.flat[void] = True
        update_energy(energy, void, 1.0)
        if void == cluster:
            break

    seed_pattern = pattern.copy()
    seed_energy = energy.copy()
    ranks = np.full((size, size), -1, dtype=np.int32)

    # Phase I: assign the lower ranks by removing the tightest cluster.
    phase_pattern = seed_pattern.copy()
    phase_energy = seed_energy.copy()
    for rank in range(seed_count - 1, -1, -1):
        cluster = int(
            np.argmax(np.where(phase_pattern, phase_energy, -np.inf)),
        )
        ranks.flat[cluster] = rank
        phase_pattern.flat[cluster] = False
        update_energy(phase_energy, cluster, -1.0)

    # Phase II: assign the upper ranks by filling the largest remaining void.
    phase_pattern = seed_pattern.copy()
    phase_energy = seed_energy.copy()
    for rank in range(seed_count, area):
        void = int(
            np.argmin(np.where(~phase_pattern, phase_energy, np.inf)),
        )
        ranks.flat[void] = rank
        phase_pattern.flat[void] = True
        update_energy(phase_energy, void, 1.0)

    if np.any(ranks < 0) or len(np.unique(ranks)) != area:
        raise RuntimeError("Void-and-cluster rank generation failed")

    return np.rint(
        ranks.astype(np.float64) * 255.0 / (area - 1),
    ).astype(np.uint8)


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=(
            Path(__file__).resolve().parents[1]
            / "src"
            / "features"
            / "content"
            / "materials"
            / "ditherFade"
            / "blue-noise-void-cluster-128.png"
        ),
    )
    args = parser.parse_args()

    pixels = generate_rank_texture()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, mode="L").save(args.output, optimize=True)
    print(args.output)


if __name__ == "__main__":
    main()
