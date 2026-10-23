#!/bin/sh
# Copies the crawl's latest output into the site. Run from the repo root.
set -e
SRC=${1:-/mnt/project-files/data}
cp "$SRC/happy_hours.geojson" data/happy_hours.geojson
cp "$SRC/unlisted.geojson" data/unlisted.geojson
echo "Copied $(grep -o '"Feature"' data/happy_hours.geojson | wc -l) happy hours and $(grep -o '"Feature"' data/unlisted.geojson | wc -l) unlisted venues from $SRC"
