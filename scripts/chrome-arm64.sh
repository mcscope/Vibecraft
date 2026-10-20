#!/bin/sh
# Chrome's native Apple Silicon build (scripts/perf.mjs). Started from an Intel-build Node, Chrome runs as Intel too,
# translated by Rosetta, and plays many times slower than it does for players.
exec /usr/bin/arch -arm64 "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@"
