#!/usr/bin/env python3
"""Create a synthetic PSX BIN/CUE pair for loader and CD-ROM parsing tests."""

from __future__ import annotations

import argparse
from pathlib import Path


SECTOR_SIZE = 2352


def create_synthetic_psx_image(
    output_dir: Path,
    filename: str = "synthetic_psx_test",
    size_mb: float = 10,
) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)

    sector_count = max(1, int((size_mb * 1024 * 1024 + SECTOR_SIZE - 1) // SECTOR_SIZE))
    byte_count = sector_count * SECTOR_SIZE

    bin_file = output_dir / f"{filename}.bin"
    cue_file = output_dir / f"{filename}.cue"

    print(
        f"Generating synthetic binary payload: {bin_file} "
        f"({byte_count:,} bytes, {sector_count:,} sectors)..."
    )
    with bin_file.open("wb") as file:
        file.write(b"\x00" * byte_count)

    print(f"Generating cue sheet: {cue_file}...")
    cue_file.write_text(
        f'FILE "{bin_file.name}" BINARY\n'
        "  TRACK 01 MODE2/2352\n"
        "    INDEX 01 00:00:00\n",
        encoding="utf-8",
    )

    print("Build complete. Load the .cue file into the emulator.")
    return bin_file, cue_file


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a synthetic PSX MODE2/2352 BIN/CUE pair."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path.cwd(),
        help="Directory where the BIN/CUE pair should be written.",
    )
    parser.add_argument(
        "--filename",
        default="synthetic_psx_test",
        help="Base filename to use for the generated .bin and .cue files.",
    )
    parser.add_argument(
        "--size-mb",
        type=float,
        default=10,
        help="Approximate payload size in MiB. Output is rounded up to full sectors.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    create_synthetic_psx_image(args.output_dir, args.filename, args.size_mb)


if __name__ == "__main__":
    main()
