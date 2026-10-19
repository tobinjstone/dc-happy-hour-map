# Happy Hour Lines · DC

Every happy hour in Washington DC, drawn as a transit map. Each colored line is a
deal type (Beer, Wine, Cocktails, Late night), each stop is a bar, and bars with
more than one kind of deal are transfer stations. Filled stops are pouring right now.
The amber board lists the happy hours ending soonest.

It's a static site: plain HTML, CSS and JavaScript with [MapLibre](https://maplibre.org/)
and [OpenFreeMap](https://openfreemap.org/) tiles. No build step, no keys.

## Run it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Data

The site reads `data/happy_hours.geojson`, one point per venue with its happy hour
`windows` (days, start, end or null for "until close", area) and `deals`
(category, item, price, kind, optional window index), plus `source_url` and
`last_verified`. Until that file exists it falls back to `data/sample.geojson`,
which is made-up bars and shows a "Sample data" badge.

To refresh the data from the crawl: `scripts/sync-data.sh path/to/happy_hours.geojson`.

## Tests

```sh
npm test
```

## Spot a wrong deal?

Use "Report a change" on the bar's card, which opens a GitHub issue.
