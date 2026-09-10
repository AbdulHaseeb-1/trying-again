# MarketPulse Market Data Service

NestJS service that scrapes the market data the app runs on and keeps it warm:
the [ForexFactory][ff] economic calendar, and [CoinGlass][cg] derivatives.

Both pipelines share the same shape — sources behind a timeout and a circuit
breaker, an in-memory store that only ever advances, a last-known-good snapshot
on disk, and an SSE stream so clients hear about a change instead of polling for
it.

- [The calendar](#the-calendar) — 2 days back, 7 days ahead, burst-polled around
  every release.
- [Derivatives](#derivatives) — open interest, funding, liquidations and
  positioning per coin and per venue, refreshed every minute.

# The calendar

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

## Tooling

`scripts/import-snapshot.ts` converts a raw `calendarComponentStates` capture
into a snapshot, using the same mapper as the live scraper. Useful when the
scrape has to be taken on a machine that can reach ForexFactory and carried to
one that cannot:

```bash
npx tsx scripts/import-snapshot.ts capture.json data/calendar-snapshot.json
```

# Derivatives

Everything CoinGlass publishes about a coin's futures market, refreshed every
minute: open interest and its change over eight windows, funding weighted three
ways, liquidations by window / venue / coin plus the live order feed, taker and
account-level positioning, options open interest, the full venue table, and a
market-wide screener of ~1,000 coins.

## Endpoints

| Method | Path                        | Purpose |
| ------ | --------------------------- | ------- |
| `GET`  | `/api/derivatives`          | One asset's full breakdown plus market context (`?symbol=BTC`) |
| `GET`  | `/api/derivatives/assets`   | Every tracked asset, fully expanded |
| `GET`  | `/api/derivatives/market`   | Market totals, screener, liquidations, macro cards |
| `GET`  | `/api/derivatives/status`   | Which pages answered, sync history, cadence |
| `POST` | `/api/derivatives/refresh`  | Scrape now, bypassing the interval |
| `POST` | `/api/derivatives/config`   | Retune `refreshIntervalMs` live |
| `GET`  | `/api/derivatives/stream`   | SSE stream of `sync` events |

## How the data gets in

CoinGlass encrypts every API response — the body is `{"code":"0","data":"<base64>"}`
— and decodes it in the browser. The HTML is no better: the tables are drawn
from that decoded state, so a DOM scrape would lose precision, units, and every
value that only ever appears inside a chart.

So the scraper lets the page do its own work and reads the result. A script
injected before any page script wraps `JSON.parse` — the one funnel every
decoded payload passes through — and keeps what comes out. That yields
CoinGlass' own model, in the shape its front end consumes.

Three details make it work and are easy to lose:

- **The hook is injected as source text, not as a function.** Playwright
  stringifies a function argument, which sends whatever the transpiler emitted
  along with it — and esbuild's `keepNames` helper (`__name`) does not exist in
  the browser. The ReferenceError fires *before* `JSON.parse` is replaced, so
  the page runs happily and the harvest comes back empty with nothing in the
  logs to explain it.
- **Payloads are identified by shape, not by endpoint** (`coinglass.classify.ts`).
  The hook never sees the request URL, but shape turns out to be the more
  durable key anyway: CoinGlass re-versions endpoints far more often than it
  renames fields, and an unrecognised payload is skipped rather than mis-parsed.
- **Post-quantum TLS must be disabled** behind a TLS-terminating proxy, exactly
  as for the calendar scraper.

A run visits the home page (market totals, screener, funding extremes, macro
cards), the liquidation page (windows, venues, coins, the largest order and the
live feed) and one page per tracked coin (venue table, funding history, price
history, spot flow). Pages are independent, and each one's outcome is reported
in `/api/derivatives/status`, so a partial run is visible rather than silently
thin. The store merges per asset, so a page that fails leaves the previous
numbers standing instead of blanking a screen that was correct a minute ago.

### Where CoinGlass contradicts itself

The per-coin liquidation payload reports `longNumber`/`shortNumber` the wrong
way round against its own `longVolUsd`/`shortVolUsd` — and against the count
fields CoinGlass publishes for the same coin in the screener. The mapper drops
that pair and takes the counts from the screener; the venue payload, which is
self-consistent, keeps its own.

## Scraping by hand

`scripts/scrape-coinglass.ts` runs one scrape outside the server — useful for
re-seeding, for checking a mapper change against the live site without booting
Nest, and for capturing on a machine that can reach CoinGlass to carry to one
that cannot:

```bash
npx tsx scripts/scrape-coinglass.ts seed/derivatives-snapshot.json BTC,ETH,SOL
```

## Configuration

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `DERIVATIVES_ASSETS` | `BTC,ETH,SOL` | Coins to keep a full breakdown for |
| `DERIVATIVES_REFRESH_INTERVAL_MS` | `60000` | Base refresh loop |
| `COINGLASS_HEADLESS` | `true` | CoinGlass has no interstitial to clear |
| `COINGLASS_SETTLE_MS` | `12000` | How long to let a page keep answering |
| `COINGLASS_SETTLE_QUIET_MS` | `2500` | Quiet gap that ends a page early |
| `COINGLASS_MAX_ORDERS` / `_SCREENER_ROWS` / `_SERIES_POINTS` | `60` / `100` / `240` | Caps on the firehose endpoints |

# Tests

```bash
npm test
```

For the calendar: identity and merge rules (including the "never un-release a
print" invariant and window-scoped pruning), the window/filter logic, and the
release watcher's arm → poll → resolve and arm → poll → expire paths against a
stubbed source.

For derivatives: shape classification (including the payloads that must *not*
be recognised), the mapper's coercion and the contradictions it works around,
and the store's guarantee that a partial run never blanks an asset an earlier
run captured.

[ff]: https://www.forexfactory.com/calendar
[cg]: https://www.coinglass.com
[ck]: https://github.com/connor4312/cockatiel
