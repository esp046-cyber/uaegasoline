# Dubai Fuel Monitor (PWA)

UAE vs Philippines fuel prices, live AED/PHP exchange rate, fill-up and commute calculators, budget and fill-up log, station finder, news and rewards in one installable mobile app.

Live site: https://esp046-cyber.github.io/uaegasoline/

## Navigation

One navigation bar, five sections. On phones it is fixed to the bottom (with iPhone safe-area padding); on screens 768px and wider it becomes a top bar. There is no second navigation element.

| Button | Section (`#hash`) | What is inside |
|---|---|---|
| Home | `#home` | Live FX bar and converter, today's four UAE prices, UAE vs Philippines table, price announcement trackers and reminder, quick access buttons |
| Fuel | `#fuel` | AED/PHP currency selector, fill-up cost calculator, vehicle tank presets, saved car, quick cash fill-up, pit-stop add-ons, WhatsApp / story card / copy receipt |
| Tools | `#tools` | Monthly fuel budget, fill-up log and real km/L, commute and Salik estimator with carpool split |
| Stations | `#stations` | Nearest stations, area selection, Use my location, Apple / Google / Waze links |
| More | `#more` | Fuel and energy news and official sources, rewards and rebates, octane and engine guide, driving efficiency tips, ADNOC receipt example, themes and settings, install instructions |

Behaviour: smooth scrolling (instant when the phone asks for reduced motion), section headings are never hidden under fixed bars, the active button follows your scroll, the URL hash updates so browser back / forward and direct links such as `/#tools` work, and the app reopens on the last section you used when there is no hash. A back-to-top button appears after scrolling.

Deep links for sharing a setup still work: `?grade=95&liters=100&addons=coffee&show=PHP#fuel`.

## UX and UI improvements (v1.0.10)

1. Fixed five-button bottom navigation with icons and labels, clear active state, `aria-current`, 52px touch targets.
2. Desktop top navigation using the same element (no duplicates).
3. Every existing feature grouped into the five sections; nothing removed, all element IDs kept.
4. Clear section headings with one-line descriptions, plus a skip-to-content link.
5. Home quick-access buttons jump to a card and open it if collapsed.
6. Back-to-top button.
7. Content never sits under the bottom bar; toasts and the update pill float above it.
8. Button states: pressed, active, disabled and loading (spinner) with `aria-busy`.
9. Accidental double taps on action buttons are ignored (450 ms).
10. Confirmation before destructive actions: reset prices, clear log, remove saved car.
11. Clear success and error toasts (location denied, offline news, copy, save).
12. Share Story Card stays disabled until the image is ready.
13. Install instructions moved to More, plus the existing banner and `?` help button.
14. Visible keyboard focus rings and ARIA labels on icon-only buttons.
15. Mini-header total now appears correctly even when the nav jumps past the calculator.

## Project files

```
index.html  manifest.webmanifest  sw.js  offline.html  favicon.ico  favicon.svg
apple-touch-icon.png  og-image.png  .nojekyll  icons/  css/styles.css
js/app.js  js/news-fetcher.js  build_assets.py  verify_build.py  tests/nav_test.py
```

## Deploy to GitHub Pages

1. Extract the zip into the repository root (keep `.nojekyll`).
2. Settings, Pages, deploy from the main branch root.
3. All asset paths are relative, so any repository name works. Change the canonical and Open Graph URLs in `index.html` if you rename the repo.
4. After an update, bump the cache name in `sw.js` and `APP_VERSION` in `js/app.js` (the verify script checks they match).

## Build and verify

```
pip install pillow
python build_assets.py --zip        # regenerates icons, runs verify_build.py, then builds the zip
python verify_build.py --browser    # optional: also loads the app in Chromium (pip install playwright)
python tests/nav_test.py            # navigation tests
```

## Testing report (v1.0.10, headless Chromium, 390x844 phone and 1100x800 desktop)

Navigation suite: 28 passed, 0 failed.

| Test | Result |
|---|---|
| Bottom nav pinned to the bottom edge; five buttons, each at least 44x44 (measured 72x52) | Pass |
| Exactly one `<nav>` element; no duplicate element IDs | Pass |
| Home, Fuel, Tools, Stations, More: each scrolls to its section, one active button, `aria-current`, hash updated, heading not covered | Pass (x5) |
| Browser back goes to the previous section, forward returns | Pass |
| Last content ends above the bottom nav; More active at page bottom | Pass |
| Back-to-top shows and returns to Home | Pass |
| Quick access opens a collapsed drawer and activates its section | Pass |
| Direct link `#more` opens More; reopening without a hash restores the last section | Pass |
| Keyboard: Enter on a focused nav link navigates; focus ring visible | Pass |
| Double tap on Refresh runs once | Pass |
| Reset to baseline asks for confirmation | Pass |
| Sunlight theme from More restyles the nav; Install app opens the sheet | Pass |
| Desktop: nav is a top row, section heading sits below it, no horizontal overflow | Pass |
| No JavaScript errors on phone or desktop | Pass |

Regression run of the earlier features on the new layout (all passed): deep links, quick cash sync, mini-header total, saved car, copy receipt, custom rebate, fill-up log with km/L (12.0 km/L for 600 km on 50 L), budget bar, location-aware map links, Salik AED 0 option, month-end calendar file, three story-card themes at 1080x1920, offline load from the service worker, and the 41 build checks in `verify_build.py`.

Known limits: tested in a desktop browser engine, not on physical iPhone or Android devices. iPhone Safari does not support vibration. The iPhone safe-area inset is applied through CSS `env()` and could not be measured in the test browser (it evaluates to 0 there).
