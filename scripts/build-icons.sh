#!/usr/bin/env bash
# Generates the PWA / Apple icons and iPad startup images from scripts/assets/icon.svg.
# Requires rsvg-convert (librsvg) and ImageMagick 7 (`magick`). Commit the output.
set -euo pipefail
cd "$(dirname "$0")/.."
src=scripts/assets/icon.svg
out=public/icons
mkdir -p "$out"
for size in 180 192 512; do
  rsvg-convert -w "$size" -h "$size" "$src" -o "$out/icon-$size.png"
done
# Maskable: the artwork already sits inside the 80% safe zone on a full-bleed background.
cp "$out/icon-512.png" "$out/icon-512-maskable.png"
# iPad Air 2 / mini 4 (2048×1536) launch images: Midnight background with the centred mark.
rsvg-convert -w 384 -h 384 "$src" -o /tmp/adhan-icon-384.png
magick -size 1536x2048 xc:'#0B1020' /tmp/adhan-icon-384.png -gravity center -composite -strip "$out/startup-1536x2048.png"
magick -size 2048x1536 xc:'#0B1020' /tmp/adhan-icon-384.png -gravity center -composite -strip "$out/startup-2048x1536.png"
rm -f /tmp/adhan-icon-384.png
ls -la "$out"
