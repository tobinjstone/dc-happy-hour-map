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

## Fizz Finder: fountain Diet Coke in the DMV

`fountain/` is a second site in this repo: a map of everywhere in DC, suburban Maryland and Northern Virginia to get a fountain Diet Coke. It lives at `/fountain/` next to the happy hour map and uses the same setup (static files, MapLibre, OpenFreeMap, no build step).

- **Find the closest one open now** uses your location to pick the nearest place that's open. Each place shows its hours, including drive-thru hours where the chain lists them.
- **Filters**: open now, drive-thru, Freestyle machines, 24 hours, places people have confirmed, and by chain.
- **Fizz reports**: on any place, "Log a Diet Coke here" records whether it was pouring, out, or not there at all, plus a 1–5 fizz rating, Freestyle/nugget ice/free refills, and what you paid. A place with a recent "pouring" report turns red on the map. "Out" reports fade after two days, since machines get fixed.
- **My log**: every Diet Coke you log, with totals, your average fizz and your regular spot. It's kept in your browser and can be downloaded as a CSV.
- **Add a spot** drops a pin for an independent place the chain data doesn't have.

### Where the data comes from

`fountain/js/chains.js` lists the 33 chains on the map: ones that pour Coca-Cola on their fountains (or Coke and Pepsi side by side). Each entry links its source: the chain's own page, a bottler or franchisor announcement, or news coverage, checked November 2026. Chains that pour Pepsi or have no fountain (Subway, Jersey Mike's, KFC until its 2027 switch, Taco Bell, Panera and so on) are listed at the bottom of the page instead. A single store can still differ from its chain, which is what the fizz reports are for.

Store locations and hours come from [All The Places](https://www.alltheplaces.xyz), which scrapes each chain's store locator every week. To refresh them:

```sh
npm run fountain-data          # writes fountain/data/places.geojson
```

The script picks, for each chain, the newest weekly run that isn't missing stores or coordinates, keeps what's inside the DMV, merges duplicate listings, and caches downloads in `.cache/atp`. To add a chain, add it to `chains.js` with its All The Places spider name and rerun.

### Shared reports

Without a server, reports stay on each visitor's device: they show on their own map and in their log. To share them with everyone, use the same Worker as the happy hour edits. `worker/schema.sql` also creates the `fountain_reports` and `fountain_places` tables, and the Worker answers on `/fountain/*` (40 reports or new spots per visitor per day, set by `FOUNTAIN_DAILY_LIMIT`). After deploying as above, put the Worker's address in `fountain/js/config.js` (`FOUNTAIN_API`).

