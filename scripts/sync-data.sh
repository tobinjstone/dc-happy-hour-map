#!/bin/sh
# Copies the crawl's latest output into the site. Run from the repo root.
set -e
SRC=${1:-/mnt/project-files/data/happy_hours.geojson}
cp "$SRC" data/happy_hours.geojson
echo "Copied $(grep -o '"Feature"' data/happy_hours.geojson | wc -l) venues from $SRC"
