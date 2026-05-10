# Changelog

This file is the project record for the desktop ASCII overlay effort. Every code change, fix, configuration addition, design decision, and implementation milestone should be recorded here as the project evolves.

## Project Scope

Build a real-time desktop ASCII overlay for GNOME Wayland, inspired by AcerolaFX's ReShade ASCII shader. The target is a hotkey-toggleable desktop/compositor effect that visually recreates the AcerolaFX ASCII style as closely as GNOME Shell allows.

This project is not intended to modify AcerolaFX directly. AcerolaFX is kept as reference material for shader behavior, tuning values, glyph textures, and visual goals.

## Current Environment

- Project root: `/home/wifiknight/ascii-desktop`
- Desktop session: GNOME Shell 49.0 on Wayland
- GJS version: 1.86.0
- Primary project target: GNOME Shell extension
- Reference source: AcerolaFX ReShade shader pack

## Work Completed So Far

- Created a separate project directory at `/home/wifiknight/ascii-desktop`.
- Created an extension workspace at `extension/ascii-overlay@local`.
- Created a reference workspace at `reference/AcerolaFX`.
- Copied only the relevant AcerolaFX reference files into the new project instead of copying the full upstream repo.
- Copied the main ASCII shader reference:
  - `reference/AcerolaFX/AcerolaFX_ASCII.fx`
  - `reference/AcerolaFX/AcerolaFX_Start.fx`
  - `reference/AcerolaFX/AcerolaFX_End.fx`
- Copied the required ASCII LUT textures:
  - `reference/AcerolaFX/Textures/fillASCII.png`
  - `reference/AcerolaFX/Textures/edgesASCII.png`
- Copied the preset that enables and tunes the ASCII effect:
  - `reference/AcerolaFX/Presets/AcerolaFX_Crimewave.ini`
- Copied supporting AcerolaFX documentation/license files:
  - `reference/AcerolaFX/README.md`
  - `reference/AcerolaFX/LICENSE.md`
- Verified the current directory is `/home/wifiknight/ascii-desktop`.
- Verified this directory is not currently a valid Git repository.
- Found an empty read-only `.git` placeholder directory that must be handled before running `git init`.
- Replaced the empty `.git` placeholder with a valid Git repository.
- Renamed the initial local branch to `main`.
- Added the GitHub remote:
  - `origin`: `https://github.com/knightsky-cpu/ascii-desktop.git`
- Prepared the initial repository baseline for commit, including the project changelog and AcerolaFX reference subset.
- Created the initial local commit:
  - `b83de42 Initial desktop ASCII overlay baseline`
- Attempted to push `main` to GitHub over HTTPS, but the non-interactive shell could not prompt for GitHub credentials.
- Tested SSH authentication to GitHub; GitHub's host key was accepted, but no authorized SSH key is currently available on this machine.
- Generated a GitHub SSH key for this machine:
  - private key: `/home/wifiknight/.ssh/id_ed25519_github_ascii_desktop`
  - public key: `/home/wifiknight/.ssh/id_ed25519_github_ascii_desktop.pub`
- Added SSH configuration so `github.com` uses the new project key.
- Switched `origin` from HTTPS to SSH:
  - `git@github.com:knightsky-cpu/ascii-desktop.git`
- Verified SSH authentication succeeds for GitHub as `knightsky-cpu`.
- Initial SSH push was rejected because GitHub already contained an initial `main` commit.
- Fetched and merged `origin/main` using unrelated-history merge to preserve both the GitHub initial commit and the local project baseline.
- Added the root `LICENSE` file from the GitHub initial commit during the merge.

## Initial Implementation Plan

1. Create a minimal GNOME Shell extension targeting GNOME Shell 49.
2. Add a persistent hotkey using GSettings and `Main.wm.addKeybinding`.
3. First milestone: toggle a simple fullscreen semi-transparent overlay on and off.
4. Second milestone: replace the basic overlay with a simple compositor effect such as tint, grayscale, pixel grid, or posterization.
5. Third milestone: implement luminance-based 8x8 ASCII cell quantization.
6. Fourth milestone: add procedural glyph masks approximating AcerolaFX's `fillASCII.png`.
7. Fifth milestone: add luminance/color edge detection to approximate AcerolaFX's edge glyph path.
8. Sixth milestone: tune exposure, attenuation, colors, fill/edge behavior, and cell style using `AcerolaFX_Crimewave.ini` as the visual reference.
9. Add preferences only after the core toggle and visual effect are stable.

## Key Technical Constraints

- AcerolaFX is a ReShade shader pack and expects a game/app backbuffer, ReShade texture declarations, compute shaders, storage textures, and optional game depth buffers.
- GNOME Shell extensions cannot directly run the original `.fx` shader unchanged.
- Desktop mode has no game depth buffer, so the GNOME implementation must replace depth/normal-based edge detection with color/luminance-based edge detection.
- The GNOME implementation should be treated as a port/reimplementation of the ASCII effect, not a direct compile of AcerolaFX.

## Git Status Note

Git has been initialized locally and linked to the GitHub repository at `git@github.com:knightsky-cpu/ascii-desktop.git`. The local branch is `main`. SSH authentication is configured and ready for pushing.
