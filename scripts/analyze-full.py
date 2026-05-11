#!/usr/bin/env python3
import argparse
from collections import Counter
import importlib.util
from pathlib import Path
import sys


SCRIPT_DIR = Path(__file__).resolve().parent


def load_script_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {filename}.")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


edges = load_script_module("analyze_edges_module", "analyze-edges.py")
luminance = load_script_module("analyze_luminance_module", "analyze-luminance.py")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Render combined luminance ASCII with coherent DoG/Sobel edge glyphs overlaid."
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
        "--max-rows",
        type=int,
        default=0,
        help="Maximum terminal preview rows. Use 0 to scale rows from --max-cols only.",
    )
    parser.add_argument(
        "--full-output",
        help="Write the full-resolution combined ASCII+edge frame to this text file.",
    )
    parser.add_argument("--contrast", type=float, default=1.0, help="Luminance contrast multiplier.")
    parser.add_argument("--gamma", type=float, default=1.0, help="Luminance gamma adjustment.")
    parser.add_argument(
        "--ramp",
        choices=sorted(luminance.RAMP_CHOICES),
        default="classic",
        help="Luminance glyph ramp. 'fine20' uses 20 buckets at 0.05 luminance increments.",
    )
    parser.add_argument(
        "--paper-background",
        action="store_true",
        help="Treat near-white luminance cells as blank paper before edge compositing.",
    )
    parser.add_argument(
        "--paper-threshold",
        type=float,
        default=0.92,
        help="Adjusted luminance at or above this value becomes space with --paper-background.",
    )
    parser.add_argument("--edge-threshold", type=float, default=0.22)
    parser.add_argument("--cell-threshold", type=float, default=0.14)
    parser.add_argument("--dominance-threshold", type=float, default=0.58)
    parser.add_argument("--dominance-margin", type=float, default=0.12)
    parser.add_argument("--diagonal-dominance-threshold", type=float, default=0.90)
    parser.add_argument("--diagonal-margin-threshold", type=float, default=0.45)
    parser.add_argument("--angle-mode", choices=["hybrid", "atan2", "ratio"], default="hybrid")
    parser.add_argument("--smooth-cells", type=int, default=0)
    parser.add_argument("--connect-gaps", type=int, default=1)
    parser.add_argument("--connect-threshold", type=float, default=0.05)
    parser.add_argument("--prune-isolated", type=int, default=1)
    parser.add_argument("--prune-confidence", type=float, default=0.70)
    parser.add_argument("--thin-edges", type=int, default=0)
    parser.add_argument("--skeletonize-edges", type=int, default=0)
    parser.add_argument("--min-component-size", type=int, default=5)
    parser.add_argument("--edge-source", choices=["dog", "raw", "ink", "hybrid"], default="dog")
    parser.add_argument("--dog-small", type=float, default=0.8)
    parser.add_argument("--dog-large", type=float, default=2.0)
    parser.add_argument("--dog-gain", type=float, default=4.0)
    parser.add_argument("--ink-threshold", type=float, default=0.65)
    parser.add_argument("--ink-cell-threshold", type=float, default=0.10)
    parser.add_argument("--hybrid-ink-density-threshold", type=float, default=1.0)
    parser.add_argument("--hybrid-max-ink-density", type=float, default=0.18)
    parser.add_argument(
        "--edge-composite-mode",
        choices=["confident", "replace"],
        default="confident",
        help="Use confidence-gated edge overlay or the older unconditional edge replacement.",
    )
    parser.add_argument(
        "--edge-composite-threshold",
        type=float,
        default=0.55,
        help="Minimum per-cell axis edge confidence required before an edge replaces luminance ASCII.",
    )
    parser.add_argument(
        "--edge-diagonal-composite-threshold",
        type=float,
        default=0.95,
        help="Minimum per-cell diagonal edge confidence required before an edge replaces luminance ASCII.",
    )
    return parser.parse_args()


def combine_frames(
    ascii_lines,
    edge_lines,
    edge_confidences,
    edge_composite_mode,
    edge_composite_threshold,
    edge_diagonal_composite_threshold
):
    if len(ascii_lines) != len(edge_lines):
        raise RuntimeError("ASCII and edge frames returned different row counts.")
    if ascii_lines and len(ascii_lines[0]) != len(edge_lines[0]):
        raise RuntimeError("ASCII and edge frames returned different column counts.")

    histogram = Counter()
    lines = []

    cols = len(ascii_lines[0]) if ascii_lines else 0
    expected_confidences = len(ascii_lines) * cols
    if len(edge_confidences) != expected_confidences:
        raise RuntimeError("Edge confidence grid returned a different cell count.")

    for row, (ascii_line, edge_line) in enumerate(zip(ascii_lines, edge_lines)):
        glyphs = []
        for col, (ascii_glyph, edge_glyph) in enumerate(zip(ascii_line, edge_line)):
            confidence = edge_confidences[(row * cols) + col]
            confidence_threshold = (
                edge_diagonal_composite_threshold
                if edge_glyph in ["/", "\\"]
                else edge_composite_threshold
            )
            use_edge = edge_glyph != " " and (
                edge_composite_mode == "replace" or
                confidence >= confidence_threshold
            )
            glyph = edge_glyph if use_edge else ascii_glyph
            glyphs.append(glyph)
            histogram[glyph] += 1
        lines.append("".join(glyphs))

    return lines, histogram


def print_histogram(histogram, total_cells, ramp):
    print()
    print("combined histogram:")
    glyphs = list(ramp)
    for glyph in ["_", "|", "/", "\\"]:
        if glyph not in glyphs:
            glyphs.append(glyph)

    for glyph in glyphs:
        count = histogram[glyph]
        percent = (count / total_cells) * 100 if total_cells else 0
        label = "space" if glyph == " " else glyph
        print(f"  {label}: {count:6d} {percent:6.2f}%")


def main():
    args = parse_args()

    if args.cell_size <= 0:
        raise RuntimeError("--cell-size must be greater than 0.")
    if args.max_cols < 0:
        raise RuntimeError("--max-cols must be greater than or equal to 0.")
    if args.max_rows < 0:
        raise RuntimeError("--max-rows must be greater than or equal to 0.")
    if args.gamma <= 0:
        raise RuntimeError("--gamma must be greater than 0.")
    if args.contrast < 0:
        raise RuntimeError("--contrast must be greater than or equal to 0.")
    if not 0 <= args.paper_threshold <= 1:
        raise RuntimeError("--paper-threshold must be between 0 and 1.")
    if not 0 <= args.diagonal_dominance_threshold <= 1:
        raise RuntimeError("--diagonal-dominance-threshold must be between 0 and 1.")
    if not 0 <= args.diagonal_margin_threshold <= 1:
        raise RuntimeError("--diagonal-margin-threshold must be between 0 and 1.")
    if args.smooth_cells < 0:
        raise RuntimeError("--smooth-cells must be greater than or equal to 0.")
    if args.connect_gaps < 0:
        raise RuntimeError("--connect-gaps must be greater than or equal to 0.")
    if not 0 <= args.connect_threshold <= 1:
        raise RuntimeError("--connect-threshold must be between 0 and 1.")
    if args.prune_isolated < 0:
        raise RuntimeError("--prune-isolated must be greater than or equal to 0.")
    if not 0 <= args.prune_confidence <= 1:
        raise RuntimeError("--prune-confidence must be between 0 and 1.")
    if args.thin_edges < 0:
        raise RuntimeError("--thin-edges must be greater than or equal to 0.")
    if args.skeletonize_edges < 0:
        raise RuntimeError("--skeletonize-edges must be greater than or equal to 0.")
    if args.min_component_size < 0:
        raise RuntimeError("--min-component-size must be greater than or equal to 0.")
    if not 0 <= args.edge_composite_threshold <= 1:
        raise RuntimeError("--edge-composite-threshold must be between 0 and 1.")
    if not 0 <= args.edge_diagonal_composite_threshold <= 1:
        raise RuntimeError("--edge-diagonal-composite-threshold must be between 0 and 1.")
    if not 0 <= args.ink_threshold <= 1:
        raise RuntimeError("--ink-threshold must be between 0 and 1.")
    if not 0 <= args.ink_cell_threshold <= 1:
        raise RuntimeError("--ink-cell-threshold must be between 0 and 1.")
    if not 0 <= args.hybrid_ink_density_threshold <= 1:
        raise RuntimeError("--hybrid-ink-density-threshold must be between 0 and 1.")
    if not 0 <= args.hybrid_max_ink_density <= 1:
        raise RuntimeError("--hybrid-max-ink-density must be between 0 and 1.")

    source_width, source_height = luminance.image_size(args.image)
    cols = max(1, source_width // args.cell_size)
    rows = max(1, source_height // args.cell_size)
    ramp = luminance.RAMP_CHOICES[args.ramp]

    ascii_lines, _ascii_histogram = luminance.ascii_frame(
        args.image,
        cols,
        rows,
        args.contrast,
        args.gamma,
        ramp,
        args.paper_background,
        args.paper_threshold
    )
    edge_result = edges.detect_edge_frame(
        args.image,
        args.cell_size,
        args.edge_threshold,
        args.cell_threshold,
        args.dominance_threshold,
        args.dominance_margin,
        args.diagonal_dominance_threshold,
        args.diagonal_margin_threshold,
        args.angle_mode,
        args.smooth_cells,
        args.connect_gaps,
        args.connect_threshold,
        args.prune_isolated,
        args.prune_confidence,
        args.thin_edges,
        args.skeletonize_edges,
        args.min_component_size,
        args.edge_source,
        args.dog_small,
        args.dog_large,
        args.dog_gain,
        args.ink_threshold,
        args.ink_cell_threshold,
        args.hybrid_ink_density_threshold,
        args.hybrid_max_ink_density
    )

    combined_lines, combined_histogram = combine_frames(
        ascii_lines,
        edge_result["lines"],
        edge_result["confidences"],
        args.edge_composite_mode,
        args.edge_composite_threshold,
        args.edge_diagonal_composite_threshold
    )
    preview = edges.preview_lines(combined_lines, args.max_cols, args.max_rows)

    if args.full_output:
        with open(args.full_output, "w", encoding="utf-8") as output_file:
            output_file.write("\n".join(combined_lines))
            output_file.write("\n")

    print(f"source={source_width}x{source_height} cell-size={args.cell_size}")
    print(
        f"cells={cols}x{rows} preview={len(preview[0])}x{len(preview)} "
        f"ramp={ramp!r} ramp-name={args.ramp} contrast={args.contrast} gamma={args.gamma} "
        f"paper-background={args.paper_background} paper-threshold={args.paper_threshold}"
    )
    print(
        f"edge-source={args.edge_source} edge-threshold={args.edge_threshold} "
        f"cell-threshold={args.cell_threshold} dominance-threshold={args.dominance_threshold} "
        f"dominance-margin={args.dominance_margin} "
        f"diagonal-dominance-threshold={args.diagonal_dominance_threshold} "
        f"diagonal-margin-threshold={args.diagonal_margin_threshold} "
        f"angle-mode={args.angle_mode} "
        f"smooth-cells={args.smooth_cells} "
        f"connect-gaps={args.connect_gaps} connect-threshold={args.connect_threshold} "
        f"prune-isolated={args.prune_isolated} prune-confidence={args.prune_confidence} "
        f"thin-edges={args.thin_edges} "
        f"skeletonize-edges={args.skeletonize_edges} "
        f"min-component-size={args.min_component_size} "
        f"edge-composite-mode={args.edge_composite_mode} "
        f"edge-composite-threshold={args.edge_composite_threshold} "
        f"edge-diagonal-composite-threshold={args.edge_diagonal_composite_threshold}"
    )
    if args.edge_source == "dog":
        print(
            f"dog-small={args.dog_small} dog-large={args.dog_large} "
            f"dog-gain={args.dog_gain}"
        )
    if args.edge_source in ["ink", "hybrid"]:
        print(
            f"ink-threshold={args.ink_threshold} "
            f"ink-cell-threshold={args.ink_cell_threshold}"
        )
    if args.edge_source == "hybrid":
        print(
            f"hybrid-ink-density-threshold={args.hybrid_ink_density_threshold} "
            f"hybrid-max-ink-density={args.hybrid_max_ink_density} "
            f"hybrid-ink-density={edge_result['hybrid_ink_density']:.4f} "
            f"hybrid-selected-source={edge_result['hybrid_selected_source']} "
            f"hybrid-ink-cells-used={edge_result['hybrid_ink_cells_used']}"
        )
    if args.full_output:
        print(f"full-output={args.full_output}")
    print()

    print("\n".join(preview))
    print_histogram(combined_histogram, cols * rows, ramp)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(1)
