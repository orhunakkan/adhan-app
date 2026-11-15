#!/usr/bin/env bash
# Normalises an azan/dua recording for the clock (brief §10):
#   - trims leading and trailing silence (internal pauses are kept)
#   - loudness-normalises to -16 LUFS integrated, -1.5 dBTP, LRA 11 (EBU R128)
#   - encodes AAC 128 kbit/s in an .m4a container
#
# Usage:
#   scripts/normalize-audio.sh <input> <output.m4a>
#   scripts/normalize-audio.sh --silence [output.m4a]   # 0.5 s silent clip for the iOS unlock
#
# Copyrighted recordings must never be committed (public repo): put them in
# public/audio/ (git-ignored except silence.m4a) for a local build, or upload
# them on the iPad in Settings → Azan.
set -euo pipefail

command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 2; }

if [[ "${1:-}" == "--silence" ]]; then
  out="${2:-public/audio/silence.m4a}"
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i anullsrc=r=44100:cl=mono -t 0.5 \
    -c:a aac -b:a 32k "$out"
  echo "wrote $out (0.5 s silence)"
  exit 0
fi

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <input> <output.m4a> | --silence [output.m4a]" >&2
  exit 2
fi
in="$1"
out="$2"

# Trim silence at both ends: remove leading silence, reverse, remove again, reverse back.
trim="silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1,areverse"
ffmpeg -hide_banner -loglevel error -y -i "$in" \
  -af "${trim},loudnorm=I=-16:TP=-1.5:LRA=11" \
  -ar 44100 -c:a aac -b:a 128k -movflags +faststart "$out"
echo "wrote $out"
