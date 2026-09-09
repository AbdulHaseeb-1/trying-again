# MarketPulse Calendar Service

NestJS service that keeps a rolling window of the [ForexFactory][ff] economic
calendar warm and serves it to the MarketPulse app.

## What it does

- Holds a rolling window — **2 days of history, 7 days ahead** (configurable).
- Refreshes on a base loop (**5 minutes**, retunable at runtime).
- Arms a timer for **every upcoming release** and, from the moment it is due,
  polls **every 10 seconds until the actual number prints**.
- Pushes changes to clients over SSE, so a print reaches the UI within a second
  of being captured rather than on the client's next poll.

## Running it

```bash
npm install
npm run build

# Chromium must run headed to clear Cloudflare — on a server, under Xvfb:
xvfb-run -a --server-args="-screen 0 1440x1000x24" node dist/main.js
```

The API is then on `http://localhost:4000`, with Swagger at `/docs`.

`npm run dev` runs the same thing in watch mode; wrap it in `xvfb-run` too if
the machine has no display.

## Endpoints

| Method | Path                    | Purpose |
| ------ | ----------------------- | ------- |
| `GET`  | `/api/calendar`         | The window, flat and grouped by day, plus freshness metadata |
| `GET`  | `/api/calendar/next`    | The next event that has not printed yet |
| `GET`  | `/api/calendar/status`  | Sources, sync history, and every armed release watch |
| `POST` | `/api/calendar/refresh` | Fetch now, bypassing the interval |
| `POST` | `/api/calendar/config`  | Retune `refreshIntervalMs` / `watchPollIntervalMs` live |
| `GET`  | `/api/calendar/stream`  | SSE stream of `sync` and `release` events |

`GET /api/calendar` accepts `from`, `to`, `currencies` (`USD,EUR`) and
`minImpact` (`holiday|low|medium|high`).

## How the data gets in

Sources are tried in priority order and the first that answers wins. Each one
is wrapped in a timeout and a circuit breaker ([cockatiel][ck]), so a source
that is blocked or slow is taken out of rotation instead of stalling the
pipeline — which matters most during a 10-second release burst.

**1. `forex-factory-scrape` (primary).** Playwright drives a real Chromium at
`/calendar?range=…`. Rather than parsing the results table — which changes
shape between event types and shows only a localized time label — it reads the
JSON state the page hydrates itself from (`window.calendarComponentStates`).
That yields unix timestamps, revisions, and ForexFactory's own better/worse
verdict, none of which survive DOM scraping cleanly.

Two things are needed to make this work and are easy to lose:

- **The browser must be headed.** Headless Chromium never clears ForexFactory's
  Cloudflare interstitial. Run the process under `xvfb-run` on a server. The
  profile is persisted (`SCRAPER_USER_DATA_DIR`) so only the first request of a
  session pays the challenge cost.
- **Post-quantum TLS must be disabled** (`--disable-features=PostQuantumKyber,UseMLKEM`).
  Behind a TLS-terminating proxy, Chromium's post-quantum key share makes every
  request fail with a bare `ERR_CONNECTION_RESET`.

**2. `forex-factory-feed` (fallback).** faireconomy's JSON mirror of the same
calendar. No browser needed, so it keeps the app populated when the scrape is
blocked — but it covers only the current week and carries **no `actual`
values**, which is why the scraper stays primary.

**3. Snapshot (warm start).** Every successful fetch is written to
`data/calendar-snapshot.json`, and the store is hydrated from it at boot. A
restart therefore comes up populated, and a blocked scrape degrades to
*stale-but-correct* rather than silently losing already-printed numbers. On a
first run, before any fetch has succeeded, it falls back to the checked-in
`seed/calendar-snapshot.json`.

A merge never lets a released `actual` revert to pending: ForexFactory briefly
blanks the cell while revising, and the UI must not flip a printed number back
to "awaiting".

## The release watcher

The base loop alone would find a print up to five minutes late. Instead:

1. After every sync, a timer is armed for each upcoming release inside the
   watch horizon (default 26h).
2. At the scheduled moment (minus `leadMs`), a burst starts.
3. The burst syncs every `pollIntervalMs` (default 10s) until that event
   reports an `actual`, or `maxDurationMs` (default 10 min) elapses.
4. The capture is emitted on the SSE stream as a `release` event.

Timers are registered with Nest's `SchedulerRegistry`, so they are visible in
`/api/calendar/status` and torn down cleanly on shutdown. Concurrent syncs are
coalesced — the base loop and a burst regularly coincide, and scraping twice is
both slower and ruder.

## Configuration

Every knob is an environment variable; see [`.env.example`](.env.example) for
the full list with defaults. The ones worth knowing:

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `CALENDAR_PAST_DAYS` / `CALENDAR_FUTURE_DAYS` | `2` / `7` | Window size |
| `CALENDAR_REFRESH_INTERVAL_MS` | `300000` | Base refresh loop |
| `CALENDAR_WATCH_POLL_INTERVAL_MS` | `10000` | Gap between burst polls |
| `CALENDAR_WATCH_MAX_DURATION_MS` | `600000` | How long a burst persists |
| `CALENDAR_WATCH_MIN_IMPACT` | `low` | Only watch releases at or above this |
| `CALENDAR_SOURCE_TIMEOUT_MS` | `60000` | Hard deadline per source attempt |
| `SCRAPER_HEADLESS` | `false` | Headless will not clear Cloudflare |
| `SCRAPER_CHROMIUM_PATH` | — | Override the Chromium binary |

## Tests

```bash
npm test
```

Covers identity and merge rules (including the "never un-release a print"
invariant and window-scoped pruning), the window/filter logic, and the release
watcher's arm → poll → resolve and arm → poll → expire paths against a stubbed
source.

## Tooling

`scripts/import-snapshot.ts` converts a raw `calendarComponentStates` capture
into a snapshot, using the same mapper as the live scraper. Useful when the
scrape has to be taken on a machine that can reach ForexFactory and carried to
one that cannot:

```bash
npx tsx scripts/import-snapshot.ts capture.json data/calendar-snapshot.json
```

[ff]: https://www.forexfactory.com/calendar
[ck]: https://github.com/connor4312/cockatiel
