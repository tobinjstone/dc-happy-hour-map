# Happy Hour Lines · DC

Every happy hour in Washington DC, styled like a transit map. Each colored line is a
deal type (Beer, Wine, Cocktails, Late night), each stop is a bar wearing the bullets
of the lines it serves, and amber stops are pouring right now.
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

## Visitor edits

Anyone can fix a bar's happy hour, wiki style: "Edit this bar" on a bar's card opens a form for days, times and deals. Every edit needs a source, either a link or a photo of the menu. Edits show up for everyone right away, every version is kept, and "History" on the card lets anyone put an earlier version back (including the original listing). A visitor edit wins over the crawl data until the crawl checks that bar again.

Edits are saved by a small Cloudflare Worker in `worker/` (D1 for edits, R2 for photos, 30 edits per visitor per day). To set it up:

```sh
cd worker
npx wrangler d1 create dc-happy-hour-edits      # paste the id into wrangler.toml
npx wrangler d1 execute dc-happy-hour-edits --remote --file schema.sql
npx wrangler r2 bucket create dc-happy-hour-photos
npx wrangler deploy
```

Then put the Worker's address in `js/config.js` (`EDITS_API`). While it's empty, cards show a "Report a change" link that opens a GitHub issue instead.
