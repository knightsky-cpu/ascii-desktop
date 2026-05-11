#!/usr/bin/env python3
import argparse
from collections import Counter
import math
import shutil
import subprocess
import sys

EDGE_GLYPHS = " _|/\\"
EDGE_DIRECTIONS = ["_", "|", "/", "\\"]
EDGE_INDEX = {"_": 0, "|": 1, "/": 2, "\\": 3}
TANGENT_OFFSETS = {
    "_": [(0, -1), (0, 1)],
    "|": [(-1, 0), (1, 0)],
    "/": [(1, -1), (-1, 1)],
    "\\": [(-1, -1), (1, 1)],
}
NORMAL_OFFSETS = {
    "_": [(-1, 0), (1, 0)],
    "|": [(0, -1), (0, 1)],
    "/": [(-1, -1), (1, 1)],
    "\\": [(-1, 1), (1, -1)],
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Detect ASCII contour edges using DoG/Sobel direction data and per-cell histograms."
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
        "--edge-threshold",
        type=float,
        default=0.22,
        help="Minimum Sobel magnitude for a source pixel to count as an edge.",
    )
    parser.add_argument(
        "--cell-threshold",
        type=float,
        default=0.14,
        help="Minimum fraction of edge pixels in a cell before an edge glyph is emitted.",
    )
    parser.add_argument(
        "--dominance-threshold",
        type=float,
        default=0.58,
        help="Minimum fraction of a cell's edge pixels that must agree on one direction.",
    )
    parser.add_argument(
        "--dominance-margin",
        type=float,
        default=0.12,
        help="Minimum dominant-minus-runner-up fraction among a cell's edge pixels.",
    )
    parser.add_argument(
        "--diagonal-dominance-threshold",
        type=float,
        default=0.90,
        help="Minimum dominant direction fraction before hybrid mode accepts a diagonal glyph.",
    )
    parser.add_argument(
        "--diagonal-margin-threshold",
        type=float,
        default=0.45,
        help="Minimum dominant-minus-runner-up fraction before hybrid mode accepts a diagonal glyph.",
    )
    parser.add_argument(
        "--angle-mode",
        choices=["hybrid", "atan2", "ratio"],
        default="hybrid",
        help="Quantize Sobel direction with hybrid atan2/ratio voting, pure atan2, or the older axis-ratio heuristic.",
    )
    parser.add_argument(
        "--smooth-cells",
        type=int,
        default=0,
        help="Number of spatial smoothing passes over per-cell direction histograms before glyph selection.",
    )
    parser.add_argument(
        "--connect-gaps",
        type=int,
        default=1,
        help="Number of one-cell gap-connection passes to run after cell histogram selection.",
    )
    parser.add_argument(
        "--connect-threshold",
        type=float,
        default=0.05,
        help="Minimum source edge-pixel fraction for a blank cell to bridge matching neighboring edges.",
    )
    parser.add_argument(
        "--prune-isolated",
        type=int,
        default=1,
        help="Number of weak isolated edge cleanup passes to run after gap connection.",
    )
    parser.add_argument(
        "--prune-confidence",
        type=float,
        default=0.70,
        help="Maximum confidence for unsupported one-neighbor edge cells to be pruned.",
    )
    parser.add_argument(
        "--thin-edges",
        type=int,
        default=0,
        help="Number of passes that thin duplicate same-direction edge bands across the contour normal.",
    )
    parser.add_argument(
        "--skeletonize-edges",
        type=int,
        default=0,
        help="Number of cell-level skeletonization passes after thinning. Use 0 to disable.",
    )
    parser.add_argument(
        "--min-component-size",
        type=int,
        default=5,
        help="Remove connected edge islands smaller than this many cells. Use 0 to disable.",
    )
    parser.add_argument(
        "--full-output",
        help="Write the full-resolution edge ASCII cell frame to this text file.",
    )
    parser.add_argument(
        "--edge-source",
        choices=["dog", "raw", "ink", "hybrid"],
        default="dog",
        help="Use Difference of Gaussians, raw Sobel, ink centerline, or raw+ink hybrid edges.",
    )
    parser.add_argument(
        "--ink-threshold",
        type=float,
        default=0.65,
        help="Maximum luminance treated as ink when --edge-source ink is used.",
    )
    parser.add_argument(
        "--ink-cell-threshold",
        type=float,
        default=0.10,
        help="Minimum ink-pixel fraction for a cell to enter the centerline mask with --edge-source ink.",
    )
    parser.add_argument(
        "--hybrid-ink-density-threshold",
        type=float,
        default=1.0,
        help="Maximum 3x3 pre-skeleton ink occupancy for hybrid mode to trust an ink centerline cell.",
    )
    parser.add_argument(
        "--hybrid-max-ink-density",
        type=float,
        default=0.18,
        help="Maximum total ink-centerline cell density before hybrid mode falls back to raw edges.",
    )
    parser.add_argument(
        "--dog-small",
        type=float,
        default=0.8,
        help="Small Gaussian radius for Difference of Gaussians preprocessing.",
    )
    parser.add_argument(
        "--dog-large",
        type=float,
        default=2.0,
        help="Large Gaussian radius for Difference of Gaussians preprocessing.",
    )
    parser.add_argument(
        "--dog-gain",
        type=float,
        default=4.0,
        help="Gain applied to the Difference of Gaussians source before Sobel.",
    )
    return parser.parse_args()


def run_magick(args):
    if not shutil.which("magick"):
        raise RuntimeError("ImageMagick 'magick' command is required.")

    return subprocess.check_output(["magick", *args])


def parse_binary_netpbm(data, expected_magic):
    if not data.startswith(expected_magic):
        raise RuntimeError(f"Expected {expected_magic.decode('ascii')} output from ImageMagick.")

    tokens = []
    index = 0
    length = len(data)

    while len(tokens) < 4:
        while index < length and data[index] in b" \t\r\n":
            index += 1

        if index < length and data[index] == ord("#"):
            while index < length and data[index] not in b"\r\n":
                index += 1
            continue

        start = index
        while index < length and data[index] not in b" \t\r\n":
            index += 1

        if start == index:
            raise RuntimeError("Unexpected Netpbm header.")

        tokens.append(data[start:index])

    if index < length and data[index] == ord("\r"):
        index += 1
        if index < length and data[index] == ord("\n"):
            index += 1
    elif index < length and data[index] in b" \t\n":
        index += 1

    return tokens, data[index:]


def image_size(path):
    output = run_magick([path, "-format", "%w %h", "info:"]).decode("utf-8")
    width, height = output.strip().split()
    return int(width), int(height)


def read_ppm_rgb(path):
    data = run_magick([
        path,
        "-depth",
        "8",
        "ppm:-",
    ])

    header, pixels = parse_binary_netpbm(data, b"P6")
    width = int(header[1])
    height = int(header[2])
    max_value = int(header[3])

    if max_value != 255:
        raise RuntimeError(f"Unsupported PPM max value: {max_value}")
    if len(pixels) < width * height * 3:
        raise RuntimeError("PPM pixel data was shorter than expected.")

    return width, height, pixels


def read_pgm_gray(path, blur_radius=None):
    command = [
        path,
        "-colorspace",
        "Gray",
    ]

    if blur_radius is not None:
        command.extend(["-blur", f"0x{blur_radius}"])

    command.extend([
        "-depth",
        "8",
        "pgm:-",
    ])
    data = run_magick(command)

    header, pixels = parse_binary_netpbm(data, b"P5")
    width = int(header[1])
    height = int(header[2])
    max_value = int(header[3])

    if max_value != 255:
        raise RuntimeError(f"Unsupported PGM max value: {max_value}")
    if len(pixels) < width * height:
        raise RuntimeError("PGM pixel data was shorter than expected.")

    values = [pixel / 255.0 for pixel in pixels[:width * height]]
    return width, height, values


def luminance_plane(width, height, pixels):
    values = [0.0] * (width * height)
    cursor = 0

    for index in range(width * height):
        r = pixels[cursor]
        g = pixels[cursor + 1]
        b = pixels[cursor + 2]
        cursor += 3
        values[index] = ((0.2127 * r) + (0.7152 * g) + (0.0722 * b)) / 255.0

    return values


def edge_source_plane(path, source, dog_small, dog_large, dog_gain):
    if source == "raw":
        width, height, pixels = read_ppm_rgb(path)
        return width, height, luminance_plane(width, height, pixels)

    small_width, small_height, small = read_pgm_gray(path, dog_small)
    large_width, large_height, large = read_pgm_gray(path, dog_large)

    if small_width != large_width or small_height != large_height:
        raise RuntimeError("DoG blur sources returned different dimensions.")

    dog = [
        min(1.0, abs(small[index] - large[index]) * dog_gain)
        for index in range(small_width * small_height)
    ]

    return small_width, small_height, dog


def edge_glyph_ratio(gx, gy):
    abs_gx = abs(gx)
    abs_gy = abs(gy)

    if abs_gx > abs_gy * 1.35:
        return "|"
    if abs_gy > abs_gx * 1.35:
        return "_"
    if gx * gy > 0.0:
        return "/"
    return "\\"


def edge_glyph_atan2(gx, gy):
    # Sobel gives the gradient normal; contours run perpendicular to that normal.
    angle = (math.atan2(gy, gx) + (math.pi / 2.0)) % math.pi
    buckets = [
        (0.0, "_"),
        (math.pi / 4.0, "\\"),
        (math.pi / 2.0, "|"),
        ((3.0 * math.pi) / 4.0, "/"),
        (math.pi, "_"),
    ]
    return min(buckets, key=lambda bucket: abs(angle - bucket[0]))[1]


def edge_glyph(gx, gy, angle_mode):
    if angle_mode == "ratio":
        return edge_glyph_ratio(gx, gy)
    if angle_mode == "hybrid":
        return edge_glyph_atan2(gx, gy)
    return edge_glyph_atan2(gx, gy)


def cell_confidence(edge_count, cell_area, cell_threshold, dominance, dominance_margin, margin):
    if edge_count <= 0:
        return 0.0

    edge_fraction = edge_count / cell_area
    edge_score = min(1.0, edge_fraction / max(cell_threshold, 0.0001))
    margin_score = min(1.0, margin / max(dominance_margin * 2.0, 0.0001))
    return min(1.0, edge_score * dominance * (0.5 + (0.5 * margin_score)))


def choose_cell_glyph(
    counts,
    edge_count,
    dominance_threshold,
    dominance_margin,
    diagonal_dominance_threshold,
    diagonal_margin_threshold,
    angle_mode
):
    max_count = max(counts)
    sorted_counts = sorted(counts, reverse=True)
    runner_up = sorted_counts[1] if len(sorted_counts) > 1 else 0
    dominance = max_count / edge_count if edge_count else 0.0
    margin = (max_count - runner_up) / edge_count if edge_count else 0.0
    glyph = EDGE_DIRECTIONS[counts.index(max_count)]

    if angle_mode != "hybrid" or glyph in ["_", "|"]:
        return glyph, dominance, margin

    # Acerola-style cohesion comes from the tile vote, not from suppressing every
    # diagonal source pixel. Keep diagonals only when the whole cell strongly
    # agrees; otherwise fall back to the dominant axis or blank the ambiguous tile.
    diagonal_dominance = dominance
    diagonal_margin = margin
    if (
        diagonal_dominance >= diagonal_dominance_threshold and
        diagonal_margin >= diagonal_margin_threshold
    ):
        return glyph, dominance, margin

    axis_counts = [counts[0], counts[1]]
    axis_count = max(axis_counts)
    axis_total = counts[0] + counts[1]
    if axis_total <= 0:
        return " ", dominance, margin

    axis_glyph = "_" if counts[0] >= counts[1] else "|"
    axis_dominance = axis_count / edge_count
    axis_margin = abs(counts[0] - counts[1]) / edge_count
    if (
        axis_dominance >= 0.34 and
        axis_margin >= 0.08
    ):
        return axis_glyph, axis_dominance, axis_margin

    return " ", dominance, margin


def connected_neighbors(lines, row, col, glyph):
    rows = len(lines)
    cols = len(lines[0]) if rows else 0
    pairs = [(TANGENT_OFFSETS[glyph][0], TANGENT_OFFSETS[glyph][1])]

    for (a_row, a_col), (b_row, b_col) in pairs:
        ar = row + a_row
        ac = col + a_col
        br = row + b_row
        bc = col + b_col

        if not (0 <= ar < rows and 0 <= ac < cols and 0 <= br < rows and 0 <= bc < cols):
            continue
        if lines[ar][ac] == glyph and lines[br][bc] == glyph:
            return True

    return False


def smooth_cell_counts(cell_counts, cols, rows, passes):
    if passes <= 0:
        return [counts[:] for counts in cell_counts]

    current = [counts[:] for counts in cell_counts]
    weighted_offsets = [
        (0, 0, 4.0),
        (-1, 0, 2.0),
        (1, 0, 2.0),
        (0, -1, 2.0),
        (0, 1, 2.0),
        (-1, -1, 1.0),
        (-1, 1, 1.0),
        (1, -1, 1.0),
        (1, 1, 1.0),
    ]

    for _pass in range(passes):
        next_counts = []
        for row in range(rows):
            for col in range(cols):
                smoothed = [0.0, 0.0, 0.0, 0.0]
                for row_offset, col_offset, weight in weighted_offsets:
                    neighbor_row = row + row_offset
                    neighbor_col = col + col_offset
                    if not (0 <= neighbor_row < rows and 0 <= neighbor_col < cols):
                        continue

                    counts = current[(neighbor_row * cols) + neighbor_col]
                    for index, count in enumerate(counts):
                        smoothed[index] += count * weight
                next_counts.append(smoothed)
        current = next_counts

    return current


def aligned_neighbor_count(lines, row, col, glyph):
    rows = len(lines)
    cols = len(lines[0]) if rows else 0
    count = 0

    for row_offset, col_offset in TANGENT_OFFSETS[glyph]:
        neighbor_row = row + row_offset
        neighbor_col = col + col_offset
        if not (0 <= neighbor_row < rows and 0 <= neighbor_col < cols):
            continue
        if lines[neighbor_row][neighbor_col] == glyph:
            count += 1

    return count


def nonspace_neighbor_count(lines, row, col):
    rows = len(lines)
    cols = len(lines[0]) if rows else 0
    count = 0

    for row_offset in [-1, 0, 1]:
        for col_offset in [-1, 0, 1]:
            if row_offset == 0 and col_offset == 0:
                continue

            neighbor_row = row + row_offset
            neighbor_col = col + col_offset
            if not (0 <= neighbor_row < rows and 0 <= neighbor_col < cols):
                continue
            if lines[neighbor_row][neighbor_col] != " ":
                count += 1

    return count


def prune_isolated_edges(lines, confidences, passes, prune_confidence):
    if passes <= 0:
        return lines, confidences

    rows = len(lines)
    cols = len(lines[0]) if rows else 0
    current = [list(line) for line in lines]
    current_confidences = confidences[:]

    for _pass in range(passes):
        next_lines = [line[:] for line in current]
        next_confidences = current_confidences[:]

        for row in range(rows):
            for col in range(cols):
                glyph = current[row][col]
                if glyph == " ":
                    continue

                aligned = aligned_neighbor_count(current, row, col, glyph)
                neighbors = nonspace_neighbor_count(current, row, col)
                confidence = current_confidences[(row * cols) + col]
                if aligned == 0 and (
                    neighbors == 0 or
                    (neighbors == 1 and confidence <= prune_confidence)
                ):
                    next_lines[row][col] = " "
                    next_confidences[(row * cols) + col] = 0.0

        current = next_lines
        current_confidences = next_confidences

    return ["".join(line) for line in current], current_confidences


def prune_small_components(lines, confidences, min_component_size):
    if min_component_size <= 1:
        return lines, confidences

    rows = len(lines)
    cols = len(lines[0]) if rows else 0
    current = [list(line) for line in lines]
    visited = [[False for _col in range(cols)] for _row in range(rows)]

    for row in range(rows):
        for col in range(cols):
            if visited[row][col] or current[row][col] == " ":
                continue

            component = []
            stack = [(row, col)]
            visited[row][col] = True

            while stack:
                cell_row, cell_col = stack.pop()
                component.append((cell_row, cell_col))

                for row_offset in [-1, 0, 1]:
                    for col_offset in [-1, 0, 1]:
                        if row_offset == 0 and col_offset == 0:
                            continue

                        neighbor_row = cell_row + row_offset
                        neighbor_col = cell_col + col_offset
                        if not (0 <= neighbor_row < rows and 0 <= neighbor_col < cols):
                            continue
                        if visited[neighbor_row][neighbor_col] or current[neighbor_row][neighbor_col] == " ":
                            continue

                        visited[neighbor_row][neighbor_col] = True
                        stack.append((neighbor_row, neighbor_col))

            if len(component) >= min_component_size:
                continue

            for cell_row, cell_col in component:
                current[cell_row][cell_col] = " "
                confidences[(cell_row * cols) + cell_col] = 0.0

    return ["".join(line) for line in current], confidences


def stronger_or_equal_neighbor(confidence, neighbor_confidence, row, col, neighbor_row, neighbor_col):
    if neighbor_confidence > confidence:
        return True
    if neighbor_confidence < confidence:
        return False

    # Deterministic tie-breaker prevents adjacent equal-strength band cells from
    # preserving both sides of a duplicated contour.
    return (neighbor_row, neighbor_col) < (row, col)


def thin_edge_bands(lines, confidences, passes):
    if passes <= 0:
        return lines, confidences

    rows = len(lines)
    cols = len(lines[0]) if rows else 0
    current = [list(line) for line in lines]
    current_confidences = confidences[:]

    for _pass in range(passes):
        next_lines = [line[:] for line in current]
        next_confidences = current_confidences[:]

        for row in range(rows):
            for col in range(cols):
                glyph = current[row][col]
                if glyph == " ":
                    continue

                confidence = current_confidences[(row * cols) + col]
                normal_neighbors = []
                for row_offset, col_offset in NORMAL_OFFSETS[glyph]:
                    neighbor_row = row + row_offset
                    neighbor_col = col + col_offset
                    if not (0 <= neighbor_row < rows and 0 <= neighbor_col < cols):
                        continue
                    if current[neighbor_row][neighbor_col] == " ":
                        continue

                    neighbor_confidence = current_confidences[(neighbor_row * cols) + neighbor_col]
                    normal_neighbors.append((neighbor_confidence, neighbor_row, neighbor_col))

                if any(
                    stronger_or_equal_neighbor(
                        confidence,
                        neighbor_confidence,
                        row,
                        col,
                        neighbor_row,
                        neighbor_col
                    )
                    for neighbor_confidence, neighbor_row, neighbor_col in normal_neighbors
                ):
                    next_lines[row][col] = " "
                    next_confidences[(row * cols) + col] = 0.0

        current = next_lines
        current_confidences = next_confidences

    return ["".join(line) for line in current], current_confidences


def skeleton_neighbor_values(binary, row, col):
    rows = len(binary)
    cols = len(binary[0]) if rows else 0

    def value(row_offset, col_offset):
        neighbor_row = row + row_offset
        neighbor_col = col + col_offset
        if not (0 <= neighbor_row < rows and 0 <= neighbor_col < cols):
            return 0
        return 1 if binary[neighbor_row][neighbor_col] else 0

    # Clockwise neighbors starting north, matching Zhang-Suen notation.
    return [
        value(-1, 0),
        value(-1, 1),
        value(0, 1),
        value(1, 1),
        value(1, 0),
        value(1, -1),
        value(0, -1),
        value(-1, -1),
    ]


def skeleton_transition_count(neighbors):
    transitions = 0
    for index, value in enumerate(neighbors):
        next_value = neighbors[(index + 1) % len(neighbors)]
        if value == 0 and next_value == 1:
            transitions += 1
    return transitions


def topology_glyph(binary, row, col, fallback):
    rows = len(binary)
    cols = len(binary[0]) if rows else 0
    scores = {glyph: 0 for glyph in EDGE_DIRECTIONS}

    for row_offset in [-1, 0, 1]:
        for col_offset in [-1, 0, 1]:
            if row_offset == 0 and col_offset == 0:
                continue

            neighbor_row = row + row_offset
            neighbor_col = col + col_offset
            if not (0 <= neighbor_row < rows and 0 <= neighbor_col < cols):
                continue
            if not binary[neighbor_row][neighbor_col]:
                continue

            if row_offset == 0:
                scores["_"] += 2
            elif col_offset == 0:
                scores["|"] += 2
            elif row_offset * col_offset < 0:
                scores["/"] += 2
            else:
                scores["\\"] += 2

    best_score = max(scores.values())
    if best_score <= 0:
        return fallback

    tied = [glyph for glyph, score in scores.items() if score == best_score]
    return fallback if fallback in tied else tied[0]


def topology_lines_from_binary(binary, source_lines=None):
    rows = len(binary)
    cols = len(binary[0]) if rows else 0
    lines = []

    for row in range(rows):
        glyphs = []
        for col in range(cols):
            if not binary[row][col]:
                glyphs.append(" ")
                continue

            fallback = source_lines[row][col] if source_lines else "|"
            glyphs.append(topology_glyph(binary, row, col, fallback))
        lines.append("".join(glyphs))

    return lines


def local_binary_densities(binary):
    rows = len(binary)
    cols = len(binary[0]) if rows else 0
    densities = [0.0 for _ in range(rows * cols)]

    for row in range(rows):
        for col in range(cols):
            count = 0
            total = 0
            for row_offset in [-1, 0, 1]:
                for col_offset in [-1, 0, 1]:
                    neighbor_row = row + row_offset
                    neighbor_col = col + col_offset
                    if not (0 <= neighbor_row < rows and 0 <= neighbor_col < cols):
                        continue

                    total += 1
                    if binary[neighbor_row][neighbor_col]:
                        count += 1

            densities[(row * cols) + col] = count / max(total, 1)

    return densities


def skeletonize_edge_bands(lines, confidences, passes):
    if passes <= 0:
        return lines, confidences

    rows = len(lines)
    cols = len(lines[0]) if rows else 0
    binary = [[glyph != " " for glyph in line] for line in lines]

    for _pass in range(passes):
        changed = False
        for phase in [0, 1]:
            remove = []
            for row in range(rows):
                for col in range(cols):
                    if not binary[row][col]:
                        continue

                    neighbors = skeleton_neighbor_values(binary, row, col)
                    neighbor_count = sum(neighbors)
                    if neighbor_count < 2 or neighbor_count > 6:
                        continue
                    if skeleton_transition_count(neighbors) != 1:
                        continue

                    north, east, south, west = neighbors[0], neighbors[2], neighbors[4], neighbors[6]
                    if phase == 0:
                        if north and east and south:
                            continue
                        if east and south and west:
                            continue
                    else:
                        if north and east and west:
                            continue
                        if north and south and west:
                            continue

                    remove.append((row, col))

            if not remove:
                continue

            changed = True
            for row, col in remove:
                binary[row][col] = False
                confidences[(row * cols) + col] = 0.0

        if not changed:
            break

    return topology_lines_from_binary(binary, [list(line) for line in lines]), confidences


def detect_ink_centerline_frame(path, cell_size, ink_threshold, ink_cell_threshold, skeletonize_edges, min_component_size):
    source_width, source_height, pixels = read_ppm_rgb(path)
    luminance = luminance_plane(source_width, source_height, pixels)
    cols = max(1, source_width // cell_size)
    rows = max(1, source_height // cell_size)
    binary = [[False for _col in range(cols)] for _row in range(rows)]
    confidences = [0.0 for _ in range(cols * rows)]
    min_ink_pixels = max(1, math.ceil((cell_size * cell_size) * ink_cell_threshold))

    for row in range(rows):
        y_start = row * cell_size
        y_end = min(source_height, y_start + cell_size)
        for col in range(cols):
            x_start = col * cell_size
            x_end = min(source_width, x_start + cell_size)
            ink_pixels = 0
            total_pixels = 0

            for y in range(y_start, y_end):
                row_offset = y * source_width
                for x in range(x_start, x_end):
                    total_pixels += 1
                    if luminance[row_offset + x] <= ink_threshold:
                        ink_pixels += 1

            if ink_pixels < min_ink_pixels:
                continue

            binary[row][col] = True
            confidences[(row * cols) + col] = min(1.0, ink_pixels / max(total_pixels, 1))

    seed_lines = ["".join("|" if cell else " " for cell in row) for row in binary]
    ink_local_densities = local_binary_densities(binary)
    passes = skeletonize_edges if skeletonize_edges > 0 else 16
    lines, confidences = skeletonize_edge_bands(seed_lines, confidences, passes)
    lines, confidences = prune_small_components(lines, confidences, min_component_size)

    histogram = Counter()
    for line in lines:
        histogram.update(line)

    return {
        "source_width": source_width,
        "source_height": source_height,
        "cols": cols,
        "rows": rows,
        "lines": lines,
        "confidences": confidences,
        "histogram": histogram,
        "ink_local_densities": ink_local_densities,
        "edge_source": "ink",
        "angle_mode": "ink",
        "smooth_cells": 0,
        "connect_gaps": 0,
        "connect_threshold": 0.0,
        "prune_isolated": 0,
        "prune_confidence": 0.0,
        "thin_edges": 0,
        "skeletonize_edges": passes,
        "min_component_size": min_component_size,
        "dog_small": None,
        "dog_large": None,
        "dog_gain": None,
        "ink_threshold": ink_threshold,
        "ink_cell_threshold": ink_cell_threshold,
    }


def connect_edge_gaps(lines, confidences, cell_counts, cell_size, connect_threshold, passes):
    if passes <= 0:
        return lines, confidences

    rows = len(lines)
    cols = len(lines[0]) if rows else 0
    min_connect_pixels = max(1, math.ceil((cell_size * cell_size) * connect_threshold))
    current = [list(line) for line in lines]
    current_confidences = confidences[:]

    for _pass in range(passes):
        next_lines = [line[:] for line in current]
        next_confidences = current_confidences[:]

        for row in range(rows):
            for col in range(cols):
                if current[row][col] != " ":
                    continue

                counts = cell_counts[(row * cols) + col]
                edge_count = sum(counts)
                if edge_count < min_connect_pixels:
                    continue

                for glyph in EDGE_DIRECTIONS:
                    if connected_neighbors(current, row, col, glyph):
                        next_lines[row][col] = glyph
                        next_confidences[(row * cols) + col] = max(
                            next_confidences[(row * cols) + col],
                            0.45
                        )
                        break

        current = next_lines
        current_confidences = next_confidences

    return ["".join(line) for line in current], current_confidences


def detect_hybrid_edge_frame(
    path,
    cell_size,
    edge_threshold,
    cell_threshold,
    dominance_threshold,
    dominance_margin,
    diagonal_dominance_threshold,
    diagonal_margin_threshold,
    angle_mode,
    smooth_cells,
    connect_gaps,
    connect_threshold,
    prune_isolated,
    prune_confidence,
    thin_edges,
    skeletonize_edges,
    min_component_size,
    dog_small,
    dog_large,
    dog_gain,
    ink_threshold,
    ink_cell_threshold,
    hybrid_ink_density_threshold,
    hybrid_max_ink_density
):
    raw_result = detect_edge_frame(
        path,
        cell_size,
        edge_threshold,
        cell_threshold,
        dominance_threshold,
        dominance_margin,
        diagonal_dominance_threshold,
        diagonal_margin_threshold,
        angle_mode,
        smooth_cells,
        connect_gaps,
        connect_threshold,
        prune_isolated,
        prune_confidence,
        thin_edges,
        skeletonize_edges,
        min_component_size,
        "raw",
        dog_small,
        dog_large,
        dog_gain,
        ink_threshold,
        ink_cell_threshold,
        hybrid_ink_density_threshold,
        hybrid_max_ink_density
    )
    ink_result = detect_ink_centerline_frame(
        path,
        cell_size,
        ink_threshold,
        ink_cell_threshold,
        skeletonize_edges,
        min_component_size
    )

    if (
        raw_result["cols"] != ink_result["cols"] or
        raw_result["rows"] != ink_result["rows"]
    ):
        raise RuntimeError("Hybrid edge sources returned different cell grids.")

    rows = raw_result["rows"]
    cols = raw_result["cols"]
    raw_lines = raw_result["lines"]
    ink_lines = ink_result["lines"]
    raw_confidences = raw_result["confidences"]
    ink_confidences = ink_result["confidences"]
    ink_cell_count = sum(1 for line in ink_lines for glyph in line if glyph != " ")
    ink_density = ink_cell_count / max(cols * rows, 1)
    ink_source_allowed = ink_density <= hybrid_max_ink_density
    if ink_source_allowed:
        lines = ink_lines[:]
        confidences = ink_confidences[:]
        selected_source = "ink"
        ink_cells_used = ink_cell_count
    else:
        lines = raw_lines[:]
        confidences = raw_confidences[:]
        selected_source = "raw"
        ink_cells_used = 0

    histogram = Counter()
    for line in lines:
        histogram.update(line)

    return {
        "source_width": raw_result["source_width"],
        "source_height": raw_result["source_height"],
        "cols": cols,
        "rows": rows,
        "lines": lines,
        "confidences": confidences,
        "histogram": histogram,
        "edge_source": "hybrid",
        "angle_mode": angle_mode,
        "smooth_cells": smooth_cells,
        "connect_gaps": connect_gaps,
        "connect_threshold": connect_threshold,
        "prune_isolated": prune_isolated,
        "prune_confidence": prune_confidence,
        "thin_edges": thin_edges,
        "skeletonize_edges": skeletonize_edges,
        "min_component_size": min_component_size,
        "dog_small": dog_small,
        "dog_large": dog_large,
        "dog_gain": dog_gain,
        "ink_threshold": ink_threshold,
        "ink_cell_threshold": ink_cell_threshold,
        "hybrid_ink_density_threshold": hybrid_ink_density_threshold,
        "hybrid_max_ink_density": hybrid_max_ink_density,
        "hybrid_ink_density": ink_density,
        "hybrid_ink_cells_used": ink_cells_used,
        "hybrid_selected_source": selected_source,
    }


def detect_edge_frame(
    path,
    cell_size,
    edge_threshold,
    cell_threshold,
    dominance_threshold,
    dominance_margin,
    diagonal_dominance_threshold,
    diagonal_margin_threshold,
    angle_mode,
    smooth_cells,
    connect_gaps,
    connect_threshold,
    prune_isolated,
    prune_confidence,
    thin_edges,
    skeletonize_edges,
    min_component_size,
    edge_source,
    dog_small,
    dog_large,
    dog_gain,
    ink_threshold=0.65,
    ink_cell_threshold=0.10,
    hybrid_ink_density_threshold=1.0,
    hybrid_max_ink_density=0.18
):
    if edge_source == "hybrid":
        return detect_hybrid_edge_frame(
            path,
            cell_size,
            edge_threshold,
            cell_threshold,
            dominance_threshold,
            dominance_margin,
            diagonal_dominance_threshold,
            diagonal_margin_threshold,
            angle_mode,
            smooth_cells,
            connect_gaps,
            connect_threshold,
            prune_isolated,
            prune_confidence,
            thin_edges,
            skeletonize_edges,
            min_component_size,
            dog_small,
            dog_large,
            dog_gain,
            ink_threshold,
            ink_cell_threshold,
            hybrid_ink_density_threshold,
            hybrid_max_ink_density
        )

    if edge_source == "ink":
        return detect_ink_centerline_frame(
            path,
            cell_size,
            ink_threshold,
            ink_cell_threshold,
            skeletonize_edges,
            min_component_size
        )

    source_width, source_height, luminance = edge_source_plane(
        path,
        edge_source,
        dog_small,
        dog_large,
        dog_gain
    )
    cols = max(1, source_width // cell_size)
    rows = max(1, source_height // cell_size)
    cell_counts = [[0, 0, 0, 0] for _ in range(cols * rows)]
    cell_confidences = [0.0 for _ in range(cols * rows)]

    for y in range(1, source_height - 1):
        row_offset = y * source_width
        top_offset = row_offset - source_width
        bottom_offset = row_offset + source_width

        for x in range(1, source_width - 1):
            top_left = luminance[top_offset + x - 1]
            top = luminance[top_offset + x]
            top_right = luminance[top_offset + x + 1]
            left = luminance[row_offset + x - 1]
            right = luminance[row_offset + x + 1]
            bottom_left = luminance[bottom_offset + x - 1]
            bottom = luminance[bottom_offset + x]
            bottom_right = luminance[bottom_offset + x + 1]

            gx = (top_right + (2.0 * right) + bottom_right) - (top_left + (2.0 * left) + bottom_left)
            gy = (bottom_left + (2.0 * bottom) + bottom_right) - (top_left + (2.0 * top) + top_right)
            magnitude = math.sqrt((gx * gx) + (gy * gy))

            if magnitude < edge_threshold:
                continue

            col = min(cols - 1, x // cell_size)
            row = min(rows - 1, y // cell_size)
            glyph = edge_glyph(gx, gy, angle_mode)
            glyph_index = EDGE_INDEX[glyph]
            cell_counts[(row * cols) + col][glyph_index] += 1

    smoothed_cell_counts = smooth_cell_counts(cell_counts, cols, rows, smooth_cells)
    min_edge_pixels = max(1, math.ceil((cell_size * cell_size) * cell_threshold))
    cell_area = cell_size * cell_size
    histogram = Counter()
    lines = []

    for row in range(rows):
        glyphs = []
        for col in range(cols):
            counts = cell_counts[(row * cols) + col]
            smoothed_counts = smoothed_cell_counts[(row * cols) + col]
            raw_edge_count = sum(counts)
            smoothed_edge_count = sum(smoothed_counts)
            glyph, dominance, margin = choose_cell_glyph(
                smoothed_counts,
                smoothed_edge_count,
                dominance_threshold,
                dominance_margin,
                diagonal_dominance_threshold,
                diagonal_margin_threshold,
                angle_mode
            )

            confidence = cell_confidence(
                raw_edge_count,
                cell_area,
                cell_threshold,
                dominance,
                dominance_margin,
                margin
            )

            if (
                raw_edge_count < min_edge_pixels or
                dominance < dominance_threshold or
                margin < dominance_margin or
                glyph == " "
            ):
                glyph = " "
            else:
                cell_confidences[(row * cols) + col] = confidence

            glyphs.append(glyph)
        lines.append("".join(glyphs))

    lines, cell_confidences = connect_edge_gaps(
        lines,
        cell_confidences,
        cell_counts,
        cell_size,
        connect_threshold,
        connect_gaps
    )
    lines, cell_confidences = prune_isolated_edges(
        lines,
        cell_confidences,
        prune_isolated,
        prune_confidence
    )
    lines, cell_confidences = thin_edge_bands(
        lines,
        cell_confidences,
        thin_edges
    )
    lines, cell_confidences = skeletonize_edge_bands(
        lines,
        cell_confidences,
        skeletonize_edges
    )
    lines, cell_confidences = prune_small_components(
        lines,
        cell_confidences,
        min_component_size
    )
    for line in lines:
        histogram.update(line)

    return {
        "source_width": source_width,
        "source_height": source_height,
        "cols": cols,
        "rows": rows,
        "lines": lines,
        "confidences": cell_confidences,
        "histogram": histogram,
        "edge_source": edge_source,
        "angle_mode": angle_mode,
        "smooth_cells": smooth_cells,
        "connect_gaps": connect_gaps,
        "connect_threshold": connect_threshold,
        "prune_isolated": prune_isolated,
        "prune_confidence": prune_confidence,
        "thin_edges": thin_edges,
        "skeletonize_edges": skeletonize_edges,
        "min_component_size": min_component_size,
        "dog_small": dog_small,
        "dog_large": dog_large,
        "dog_gain": dog_gain,
    }


def preview_lines(lines, max_cols, max_rows=0):
    if not lines:
        return lines

    if (not max_cols or len(lines[0]) <= max_cols) and (not max_rows or len(lines) <= max_rows):
        return lines

    full_rows = len(lines)
    full_cols = len(lines[0])
    width_ratio = (max_cols / full_cols) if max_cols and full_cols > max_cols else 1.0
    height_ratio = (max_rows / full_rows) if max_rows and full_rows > max_rows else 1.0
    ratio = min(width_ratio, height_ratio)
    preview_cols = max(1, round(full_cols * ratio))
    preview_rows = max(1, round(full_rows * ratio))
    sampled = []

    for row in range(preview_rows):
        source_row = min(full_rows - 1, math.floor(row * full_rows / preview_rows))
        sampled.append("".join(
            lines[source_row][min(full_cols - 1, math.floor(col * full_cols / preview_cols))]
            for col in range(preview_cols)
        ))

    return sampled


def print_histogram(histogram, total_cells):
    print()
    print("histogram:")
    for glyph in EDGE_GLYPHS:
        count = histogram[glyph]
        percent = (count / total_cells) * 100 if total_cells else 0
        if glyph == " ":
            label = "space"
        elif glyph == "\\":
            label = "\\"
        else:
            label = glyph
        print(f"  {label}: {count:6d} {percent:6.2f}%")


def main():
    args = parse_args()

    if args.cell_size <= 0:
        raise RuntimeError("--cell-size must be greater than 0.")
    if args.max_cols < 0:
        raise RuntimeError("--max-cols must be greater than or equal to 0.")
    if args.max_rows < 0:
        raise RuntimeError("--max-rows must be greater than or equal to 0.")
    if args.edge_threshold < 0:
        raise RuntimeError("--edge-threshold must be greater than or equal to 0.")
    if args.cell_threshold < 0:
        raise RuntimeError("--cell-threshold must be greater than or equal to 0.")
    if not 0 <= args.dominance_threshold <= 1:
        raise RuntimeError("--dominance-threshold must be between 0 and 1.")
    if not 0 <= args.dominance_margin <= 1:
        raise RuntimeError("--dominance-margin must be between 0 and 1.")
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
    if args.dog_small <= 0 or args.dog_large <= 0:
        raise RuntimeError("--dog-small and --dog-large must be greater than 0.")
    if args.dog_large <= args.dog_small:
        raise RuntimeError("--dog-large must be greater than --dog-small.")
    if args.dog_gain <= 0:
        raise RuntimeError("--dog-gain must be greater than 0.")
    if not 0 <= args.ink_threshold <= 1:
        raise RuntimeError("--ink-threshold must be between 0 and 1.")
    if not 0 <= args.ink_cell_threshold <= 1:
        raise RuntimeError("--ink-cell-threshold must be between 0 and 1.")
    if not 0 <= args.hybrid_ink_density_threshold <= 1:
        raise RuntimeError("--hybrid-ink-density-threshold must be between 0 and 1.")
    if not 0 <= args.hybrid_max_ink_density <= 1:
        raise RuntimeError("--hybrid-max-ink-density must be between 0 and 1.")

    result = detect_edge_frame(
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
    total_cells = result["cols"] * result["rows"]
    preview = preview_lines(result["lines"], args.max_cols, args.max_rows)

    if args.full_output:
        with open(args.full_output, "w", encoding="utf-8") as output_file:
            output_file.write("\n".join(result["lines"]))
            output_file.write("\n")

    print(f"source={result['source_width']}x{result['source_height']} cell-size={args.cell_size}")
    print(
        f"cells={result['cols']}x{result['rows']} preview={len(preview[0])}x{len(preview)} "
        f"edge-source={args.edge_source} edge-threshold={args.edge_threshold} "
        f"cell-threshold={args.cell_threshold} "
        f"dominance-threshold={args.dominance_threshold} "
        f"dominance-margin={args.dominance_margin} "
        f"diagonal-dominance-threshold={args.diagonal_dominance_threshold} "
        f"diagonal-margin-threshold={args.diagonal_margin_threshold} "
        f"angle-mode={args.angle_mode} "
        f"smooth-cells={args.smooth_cells} "
        f"connect-gaps={args.connect_gaps} "
        f"connect-threshold={args.connect_threshold} "
        f"prune-isolated={args.prune_isolated} "
        f"prune-confidence={args.prune_confidence} "
        f"thin-edges={args.thin_edges} "
        f"skeletonize-edges={args.skeletonize_edges} "
        f"min-component-size={args.min_component_size}"
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
            f"hybrid-ink-density={result['hybrid_ink_density']:.4f} "
            f"hybrid-selected-source={result['hybrid_selected_source']} "
            f"hybrid-ink-cells-used={result['hybrid_ink_cells_used']}"
        )
    if args.full_output:
        print(f"full-output={args.full_output}")
    print()

    print("\n".join(preview))
    print_histogram(result["histogram"], total_cells)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(1)
