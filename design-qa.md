# Design QA

**Method**

- Rendered app: Expo web (`npx expo start --web`) against the live NestJS
  service, captured with headless Chromium at 390 × 844 (phone) and 900 × 1000
  (tablet / desktop), dark theme, every tab plus both detail routes.
- Checks: rendered screenshots per route per width, console and page errors,
  horizontal overflow, and end-of-scroll captures to see what the floating tab
  bar and agent button cover.

The previous pass recorded `blocked` because no capture surface was available.
That is no longer true, so this is a real comparison rather than a build log.

## Findings, and what was done

### P0 — the app contradicted itself

- **Two different prices for the same coin.** Markets and the asset detail
  screen were mock data (BTC at $96,214) while Pulse, Calendar and Derivatives
  were live (BTC at $77,9xx). Both screens now read the same scrape as every
  other surface, so a price cannot disagree with itself one tab over.
- **The asset screen invented its numbers.** Open interest, funding, long/short
  and the 24H volume were literals in the JSX, the chart plotted an index
  series (its axis read "82 / 55 / 28", not prices), and the timeframe chips
  changed nothing. It is now the live coin, with a real price axis, and the
  chips window the five-minute series the service keeps.
- **A coin in the market list could not be opened.** The API answered 404 for
  any symbol outside the three fully tracked assets, which is most of the list.
  It now answers with the screener row it has, and the screen says which of the
  two it is showing.

### P1 — layout was inconsistent between tabs

- **Three tabs sprawled, two were centred.** Calendar and Derivatives
  constrained content to 560px; Pulse, Markets, Alerts and the detail routes
  did not, so at 900px a market row put 700px of dead space between a coin's
  name and its price. Every screen is now built in one `Screen` container.
- **Two tabs hid their last row under the tab bar.** Markets and Alerts padded
  the bottom by 32px against ~120px of floating chrome. `useChromeInset()` now
  derives that space once, from the bar's real height plus the agent button
  plus the safe area, and every scroll view uses it.
- **Two header idioms.** Some screens used `AppHeader` (22px, brand-styled),
  others a local title (24px), with status lines in different places. One
  `ScreenHeader` now carries title, live status and actions everywhere.
- **Scrolled chip rows were sliced.** The filter rows sat inside the screen's
  padding, so a scrolled chip was cut mid-glyph at the padding edge. They now
  bleed to the screen edge like a native picker.

### P2 — smaller things that read as bugs

- A ranking bar in a flex row collapsed to zero width (`ShareBar` had no width
  of its own); rows now give it space, and the component documents why the flex
  cannot live inside it.
- Coins outside a hardcoded set of eight rendered an empty icon box. Unknown
  symbols now get a deterministic monogram, so nothing renders blank.
- Chart axis labels were fixed at zero decimals, which turned a sub-dollar
  coin's whole axis into "0". Precision now follows magnitude.
- Missing calendar values rendered as `·`, which read as a rendering artefact.
  They are now `—`.
- The Pulse preview showed value columns with no legend; it now carries the
  same legend the calendar's day header does.
- Pulse showed its own name twice, in two sizes, pushing the next release below
  the fold.
- A stat note that explained a ratio was truncated to one line, which removed
  the explanation.

## Known gaps

- **Alerts are a local preview.** They live in component state, are not
  persisted, and nothing evaluates them — the screen now says so rather than
  implying a working monitor.
- **The Watchlist tab is empty by design.** It used to list five mock
  instruments; there is no watchlist store yet, so it shows an empty state.
- **The agent button overlays content while scrolling.** That is normal for a
  floating action button; what is fixed is that content now ends above it.

## Evidence

- `npx tsc --noEmit` — clean.
- `npx expo lint` — 20 problems, all pre-existing and none in the screens
  touched here (`tap.tsx`, `use-color-scheme.web.ts`, `market-session.tsx`,
  `skeleton.tsx`, `tab-swipe.tsx`, `theme-provider.tsx`).
- No console or page errors on any route at either width; no horizontal
  overflow at either width.

final result: pass, with the gaps above recorded rather than closed.
