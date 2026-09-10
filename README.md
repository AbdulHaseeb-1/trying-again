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

Run it alongside the app:

```bash
cd server
npm install && npm run build
# Chromium has to run headed to clear ForexFactory's Cloudflare check:
xvfb-run -a node dist/main.js          # or just `node dist/main.js` with a display
```

Both tabs read the same service, so point the app at it with
`EXPO_PUBLIC_CALENDAR_API_URL` (defaults to
`http://localhost:4000`; a physical device needs the machine's LAN address):

```bash
EXPO_PUBLIC_CALENDAR_API_URL=http://192.168.1.20:4000 npx expo start
```

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
