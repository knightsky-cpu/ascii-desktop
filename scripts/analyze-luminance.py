#!/usr/bin/env python3
import argparse
from collections import Counter
import math
import shutil
import subprocess
import sys

RAMP_CHOICES = {
    "classic": " .:coPO?@#",
    "fine20": " .-,'`:;coOP0Q&8%B@#",
}
ASCII_RAMP = RAMP_CHOICES["classic"]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Downscale a screenshot into ASCII luminance cells."
    )
    parser.add_argument("image", help="Input screenshot PNG/JPEG/etc.")
    parser.add_argument("--cell-size", type=int, default=8, help="Source pixels per ASCII cell.")
    parser.add_argument(
        "--max-cols",
        type=int,
        default=120,
        help="Maximum terminal preview columns. Use 0 for full cell resolution.",
    )
    parser.add_argument(
        "--full-output",
        help="Write the full-resolution ASCII cell frame to this text file.",
    )
    parser.add_argument(
        "--contrast",
        type=float,
        default=1.0,
        help="Luminance contrast multiplier around midpoint 0.5. Default keeps input unchanged.",
    )
    parser.add_argument(
        "--gamma",
        type=float,
        default=1.0,
        help="Gamma adjustment applied after contrast. Values below 1 brighten midtones.",
    )
    parser.add_argument(
        "--ramp",
        choices=sorted(RAMP_CHOICES),
        default="classic",
        help="Luminance glyph ramp. 'fine20' uses 20 buckets at 0.05 luminance increments.",
    )
    parser.add_argument(
        "--paper-background",
        action="store_true",
        help="Treat near-white luminance cells as blank paper instead of dense fill glyphs.",
    )
    parser.add_argument(
        "--paper-threshold",
        type=float,
        default=0.92,
        help="Adjusted luminance at or above this value becomes space with --paper-background.",
    )
    return parser.parse_args()


def run_magick(args):
    if not shutil.which("magick"):
        raise RuntimeError("ImageMagick 'magick' command is required.")

    return subprocess.check_output(["magick", *args])


def image_size(path):
    output = run_magick([path, "-format", "%w %h", "info:"]).decode("utf-8")
    width, height = output.strip().split()
    return int(width), int(height)


def read_ppm_rgb(path, cols, rows):
    data = run_magick([
        path,
        "-resize",
        f"{cols}x{rows}!",
        "-depth",
        "8",
        "ppm:-",
    ])

    if not data.startswith(b"P6"):
        raise RuntimeError("Expected binary PPM output from ImageMagick.")

    parts = data.split(maxsplit=4)
    if len(parts) < 5:
        raise RuntimeError("Unexpected PPM header.")

    width = int(parts[1])
    height = int(parts[2])
    max_value = int(parts[3])
    pixels = parts[4]

    if max_value != 255:
        raise RuntimeError(f"Unsupported PPM max value: {max_value}")
    if width != cols or height != rows:
        raise RuntimeError(f"Unexpected resized dimensions: {width}x{height}")

    return pixels


def clamp(value, min_value=0.0, max_value=1.0):
    return max(min_value, min(max_value, value))


def adjust_luminance(luminance, contrast, gamma):
    adjusted = clamp(((luminance - 0.5) * contrast) + 0.5)
    return clamp(math.pow(adjusted, gamma))


def luminance_to_glyph(r, g, b, contrast, gamma, ramp, paper_background, paper_threshold):
    luminance = ((0.2127 * r) + (0.7152 * g) + (0.0722 * b)) / 255.0
    luminance = adjust_luminance(luminance, contrast, gamma)
    if paper_background and luminance >= paper_threshold:
        return luminance, " "

    index = min(len(ramp) - 1, math.floor(luminance * len(ramp)))
    return luminance, ramp[index]


def ascii_frame(
    path,
    cols,
    rows,
    contrast,
    gamma,
    ramp=ASCII_RAMP,
    paper_background=False,
    paper_threshold=0.92
):
    pixels = read_ppm_rgb(path, cols, rows)
    histogram = Counter()
    lines = []
    cursor = 0

    for _row in range(rows):
        glyphs = []
        for _col in range(cols):
            r = pixels[cursor]
            g = pixels[cursor + 1]
            b = pixels[cursor + 2]
            cursor += 3
            _luminance, glyph = luminance_to_glyph(
                r,
                g,
                b,
                contrast,
                gamma,
                ramp,
                paper_background,
                paper_threshold
            )
            glyphs.append(glyph)
            histogram[glyph] += 1
        lines.append("".join(glyphs))

    return lines, histogram


def print_histogram(histogram, total_cells, ramp):
    print()
    print("histogram:")
    for glyph in ramp:
        count = histogram[glyph]
        percent = (count / total_cells) * 100 if total_cells else 0
        label = "space" if glyph == " " else glyph
        print(f"  {label!r}: {count:6d} {percent:6.2f}%")


def main():
    args = parse_args()
    source_width, source_height = image_size(args.image)
    full_cols = max(1, source_width // args.cell_size)
    full_rows = max(1, source_height // args.cell_size)

    if args.max_cols and full_cols > args.max_cols:
        cols = args.max_cols
        rows = max(1, round(full_rows * (cols / full_cols)))
    else:
        cols = full_cols
        rows = full_rows

    if args.gamma <= 0:
        raise RuntimeError("--gamma must be greater than 0.")
    if args.contrast < 0:
        raise RuntimeError("--contrast must be greater than or equal to 0.")
    if not 0 <= args.paper_threshold <= 1:
        raise RuntimeError("--paper-threshold must be between 0 and 1.")

    ramp = RAMP_CHOICES[args.ramp]

    full_lines, full_histogram = ascii_frame(
        args.image,
        full_cols,
        full_rows,
        args.contrast,
        args.gamma,
        ramp,
        args.paper_background,
        args.paper_threshold
    )
    preview_lines = full_lines

    if cols != full_cols or rows != full_rows:
        preview_lines, _preview_histogram = ascii_frame(
            args.image,
            cols,
            rows,
            args.contrast,
            args.gamma,
            ramp,
            args.paper_background,
            args.paper_threshold
        )

    if args.full_output:
        with open(args.full_output, "w", encoding="utf-8") as output_file:
            output_file.write("\n".join(full_lines))
            output_file.write("\n")

    print(f"source={source_width}x{source_height} cell-size={args.cell_size}")
    print(
        f"cells={full_cols}x{full_rows} preview={cols}x{rows} "
        f"ramp={ramp!r} ramp-name={args.ramp} contrast={args.contrast} gamma={args.gamma} "
        f"paper-background={args.paper_background} paper-threshold={args.paper_threshold}"
    )
    if args.full_output:
        print(f"full-output={args.full_output}")
    print()

    print("\n".join(preview_lines))
    print_histogram(full_histogram, full_cols * full_rows, ramp)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(1)
