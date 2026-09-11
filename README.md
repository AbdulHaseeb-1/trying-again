# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Live market data

The **Calendar** and **Derivatives** tabs are backed by a NestJS service in
[`server/`](server) that scrapes both feeds with Playwright and keeps them warm.
See [`server/README.md`](server/README.md) for the architecture and configuration.

- **Economic calendar** — the ForexFactory calendar over a rolling
  2-days-back / 7-days-ahead window, burst-polled every 10 seconds around each
  scheduled release until the actual number prints.
- **Derivatives** — CoinGlass open interest, funding, liquidations and
  positioning, per coin and per venue, refreshed every minute. CoinGlass
  encrypts its API payloads and decodes them in the browser, so the scraper
  loads the page and harvests what the page itself decoded rather than parsing
  the DOM.
- **Liquidity map** — CoinGlass' liquidation heatmap: how much leveraged money
  would be forced out at each price, drawn under the price line. Summed down
  server-side to a grid a phone can draw.
- **History** — an optional Postgres archive (Prisma) behind both. Each sync
  writes only what it had not already stored, so the past accumulates without
  being rewritten, and past releases come back out of the database instead of
  being scraped again. The service runs fine without it.

Run it alongside the app:

```bash
cd server
npm install && npm run build

# Optional, for history: Postgres plus the Prisma migrations.
docker compose up -d && cp .env.example .env && npm run prisma:migrate

# Chromium has to run headed to clear ForexFactory's Cloudflare check:
xvfb-run -a node dist/main.js          # or just `node dist/main.js` with a display
```

Both tabs read the same service, so point the app at it with
`EXPO_PUBLIC_CALENDAR_API_URL` (defaults to
`http://localhost:4000`; a physical device needs the machine's LAN address):

```bash
EXPO_PUBLIC_CALENDAR_API_URL=http://192.168.1.20:4000 npx expo start
```

## The assistant

MarketPulse ships an AI workspace rather than a chat box: a resizable panel on a
desktop, a sheet on a phone, and one runtime behind both.

- **Real agents.** Four of them — a main Market Assistant, a Market Analyst, a
  News Research agent and a Research agent — built on the official
  [`@openai/agents`](https://openai.github.io/openai-agents-js/) SDK, with
  delegation and hand-off where isolating context genuinely helps.
- **Application tools.** The agents read the same market data, charts, calendar
  and news the tabs read, through typed tools with schemas, permissions,
  timeouts and normalized errors. Read-only by default; nothing gets raw
  database access.
- **Citations that mean something.** Every `[1]` in an answer maps to a stored
  reference a tool actually returned — an article, a page, a market reading —
  and opens a preview of that source. Markers the model invents are removed
  before they are ever drawn.
- **Any provider.** OpenAI, OpenRouter, Anthropic, Google and any
  OpenAI-compatible endpoint, configured in the app. Models are chosen per role
  and per agent, with a recorded fallback when one is unavailable.
- **Search, if you want it.** Tavily, Exa, Brave, SearXNG, a plain REST endpoint
  or OpenAI's hosted tool, behind one `web_search` tool and one set of policies.

Configure it in **Settings → AI & Agents**. Keys are sealed at rest on the
server and are never sent back to the app. See
[`server/README.md`](server/README.md#ai--agents) for the runtime, the storage
and the security model, and [`server/.env.example`](server/.env.example) for the
environment.

Nothing above is required to run the app: with no provider configured the
assistant says so and every other feature works as before.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
