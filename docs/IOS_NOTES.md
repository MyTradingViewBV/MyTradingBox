# iPhone notes

Read this before changing anything at the top or bottom of a screen, a fixed or absolute overlay, page heights, or the `<meta>` tags in `src/index.html`. Everything here was measured on a real iPhone 17 Pro (iOS 27.0.1) in October 2026, after several releases that looked fine in desktop emulation and broke on the phone.

## How the app runs on an iPhone

- Users open it as a **home-screen web app** (standalone), not in Safari. `navigator.standalone` is `true`.
- `viewport-fit=cover` is set, so the page runs **under the status bar and the Dynamic Island**. The top inset is **62px** in portrait on an iPhone 17 Pro, 0 in landscape (the island then sits on the left or right: `--safe-area-left` / `--safe-area-right`).
- The bottom 34px is the home-indicator strip; `--footer-height` already includes it.
- The viewport is 402 × 874 CSS px (DPR 3).

## The iOS 26/27 top-edge blur

iOS itself blurs whatever the page draws under the status bar **and about 36px below it**, so content down to ~98px looks out of focus. It is drawn by the system on top of the web view: no CSS of ours causes it, Web Inspector does not see it, and Chrome/desktop iPhone emulation never shows it.

What does **not** turn it off (all tried, all released, none worked):

| Attempt | Result |
| --- | --- |
| A fixed, opaque strip under the status bar (with and without `pointer-events`) | Still blurred |
| `apple-mobile-web-app-status-bar-style` = `black` instead of `black-translucent` | Ignored by iOS 27: the inset stays 62px and content stays under the status bar |
| Removing our own `backdrop-filter`s | Not the cause; ours are all on panels in the middle or bottom |

What **does** work: keep text and controls out of the zone.

- `--ios-blur-bottom` (in `src/styles.scss`) = top inset + 36px: the bottom of the blur zone. 0 without an inset.
- `--safe-area-top` = `--ios-blur-bottom` on normal pages, so headers and content start below the blur.
- Chart pages (`.app-content:has(.trading-view-container)`) override `--safe-area-top` to the bare inset, so the chart runs up to the Dynamic Island. Candles there soften like a native app's top edge; the legend moves below the zone with `legendTopShift()` in `chart-plugins.ts`.

## Rules for changes

1. **Never hardcode `env(safe-area-inset-*)` or a pixel offset for the top.** Use `--safe-area-top` for layout and `--ios-blur-bottom` when something must be readable. Heights subtract `--safe-area-top` and `--footer-height`.
2. **Nothing readable in the top ~98px.** A new overlay at the top of a page or the chart (button, badge, label, toolbar) must sit below `--ios-blur-bottom`; on the chart canvas use `legendTopShift()` like the legend.
3. **Use `100dvh`, not `100vh`,** for full-screen heights. `100vh` is the large viewport on iOS and lets the page rubber-band a few pixels.
4. **Don't rely on `apple-mobile-web-app-status-bar-style`.** iOS 27 ignores it; changing it also only applies after re-adding the app to the home screen.
5. **Gaps show.** The band under the status bar and every gap between panes is visible on the phone; chart pages paint the status-bar band and the footer in the chart colour (#131722).
6. **Desktop emulation is not proof.** Anything near the top or bottom edge is only done once it is checked on a real iPhone (see below).

## Getting a release onto the phone

- The service worker keeps running the old version until the app restarts: close it in the app switcher and open it again, sometimes twice. Settings shows the running version.
- A private desktop window has no service worker; if it still shows an old version, check the live `assets/release-notes.mock.json` before redeploying.
- "Wat is er nieuw" hides titles that look like developer jargon. Product names (iOS, iPadOS, macOS, iPhone, iPad) are allowed since v0.2.110; a release with only hidden titles does not appear at all.
- When GitHub Actions is degraded, the Pages deploy queues: the build is already on `gh-pages`, don't push again.

## Checking on a real iPhone from Windows

One-time setup on this PC is done:

- **Apple Devices** (Microsoft Store) supplies the USB service; open it once if no device is listed.
- **pymobiledevice3** in a Python 3.12 venv: `C:\Users\Erwin\.pmd3\Scripts\pymobiledevice3.exe` (it does not install on Python 3.14).
- On the phone: trust the PC, and Settings → Apps → Safari → Advanced → **Web Inspector** on.

Then, with the app open on the phone:

- `pymobiledevice3 usbmux list` shows the device.
- In Python: `WebinspectorService(lockdown=create_using_usbmux())`, `await connect()`, `await get_open_application_pages(timeout=3)`; the app is bundle `com.apple.SafariViewService` with a `mytradingviewbv.github.io/MyTradingBox/...` URL. `inspector_session()` + `runtime_evaluate(js, return_by_value=True)` reads layout (`getBoundingClientRect`, computed styles, the inset via a probe element with `height: env(safe-area-inset-top)`) and which bundle is loaded (`performance.getEntriesByType('resource')`).
- Web Inspector cannot see the system blur. To judge it, take a screenshot on the phone, or enable Developer Mode for `pymobiledevice3` screenshots (this restarts the phone; ask first).
