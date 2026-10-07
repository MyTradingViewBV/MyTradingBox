# Chart Interactions

Developer reference for the gesture system shared by `/mcb-chart` and `/chart` (`ChartBaseComponent`). The coordinate model behind it is in [Coordinate System](../COORDINATE_SYSTEM.md).

Code: `src/app/components/chart/services/chart-interaction.service.ts` (gestures, live follow), `.../scales/time-scale.ts` (scale and constants), `.../services/chart-linked-scale.service.ts` (MCB projection), `.../chart-base.component.ts` (DOM events, dblclick, "Return to live"), `.../market-cipher-b-chart/mcb-panel.component.ts` (MCB pane).

## State machine

`ChartInteractionService` is a root singleton and runs at most one gesture at a time, service-wide (main chart and MCB pane).

- `GestureKind`: `'pan' | 'zoom-x' | 'zoom-y' | 'pinch' | null`.
- `GestureClaim`: `'mcb-value-scale'`, a drag the MCB pane runs itself but registers with `claimGesture` / `releaseGesture`.
- `activeGesture` is derived from the gesture state itself (never from a flag that can be left behind). Priority: pinch > claim > zoom-x > zoom-y > pan; `null` while idle, hovering or tracking the crosshair.
- `begin*` calls are refused while another kind runs (pinch is the exception and preempts: it cancels long-press, axis drags and pan). `claimGesture` is refused while any gesture runs; while a claim is held, presses, wheel and pinch on the main chart and panes are ignored. The pane must release on every end (release, cancel, blur, destroy).
- `beginPress` / `clearStaleDrags`: a new press first drops drags whose release was lost (iframe, native dialog, missed touchend). A first finger also drops a stale pinch; a mouse press does not (hybrid touch+mouse: a touch clears a running mouse drag, see limitations).
- Drags use document-level capture (`mousemove`, `mouseup`, window `blur`), so they continue outside the chart and end on release or blur anywhere. `selectstart` is suppressed while a drag is captured.
- `cancelAllGestures()` ends everything without committing (route navigation, destroy), because the service outlives the page.
- Wheel is ignored while any gesture runs. While a touch crosshair is pinned, wheel is ignored over the plot and the panes, but still works over the main chart's axes (time wheel anchors on the pinned crosshair).

## Gestures

Every range-changing gesture computes the target from its start state and the total input (not per-event deltas) via `solveAnchoredRange` -> `commitAnchoredRange` -> `applyXRange`, and re-fits Y when auto scale is on. Only the Y part of the plot pan is incremental.

| Gesture | Input | Behavior | Anchor |
|---|---|---|---|
| Time-axis scale | Mouse drag on the time axis; touch swipe (horizontal, > 15 px) starting in the axis area | Drag right = zoom in (wider candles). `barSpacing = start * exp(dx * TIME_AXIS_SCALE_SENSITIVITY)` | A visible crosshair (hover or pinned): the candle under it keeps its screen x. Otherwise the rightmost visible candle (right edge when panned into whitespace) |
| Wheel zoom | Wheel over the plot or an MCB pane | Wheel up = zoom in. `factor = exp(-delta * WHEEL_ZOOM_SENSITIVITY)`; delta normalized by `deltaMode` (lines x `WHEEL_LINE_PX`, pages x plot height) and clamped to `WHEEL_MAX_DELTA_PX` | Time under the pointer |
| Trackpad pinch | ctrl+wheel (browsers report a trackpad pinch this way) | Delta clamped to `WHEEL_PINCH_MAX_DELTA`, then multiplied by `WHEEL_PINCH_FACTOR` | Time under the pointer |
| Touch pinch | Two fingers | `barSpacing = start * (distance / startDistance)`; pinch outranks everything | Moving centroid: the time grabbed at pinch start follows the centroid (zoom and move together) |
| Pan | Mouse drag / one-finger drag on the plot (touch threshold 10 px) | X: start range shifted by the total dx; continues outside the window; clamped to `extendedDataRange`; span never changes. Y: incremental shift, span and auto flag unchanged | Content follows the pointer |
| Price-axis scale | Mouse drag on the price axis; wheel over it; touch swipe (vertical) in the axis area | Drag up = zoom in. First movement switches Y from AUTO to MANUAL (a click without movement keeps AUTO). `solveAnchoredPriceRange`: exp scale from the start span, min span guard, max `MAX_PRICE_ZOOM_OUT` x start span | Price under the press point (wheel: under the pointer) |
| MCB value-axis scale | Drag on the MCB pane's value axis | Own y scale (default -110..110), registered as the `'mcb-value-scale'` claim | Pane-owned |

Limits common to all x gestures: bar spacing `MIN_BAR_SPACING`..`MAX_BAR_SPACING`; visible span at least `MIN_CANDLES_VISIBLE` (10) candles and at most 98% of the data; the anchor yields only when a limit is hit. A zoom never reverses direction at a limit. After any zoom or pan the live-follow state is re-judged. There is no lazy loading of history: pan stops at `extendedDataRange` of the loaded candles.

MCB pane gestures (plot pan, time-axis scale, wheel, pinch) are forwarded to the shared `TimeScale`, so both panes always show the same time range.

## Double click / double tap

| Target | Result |
|---|---|
| Price axis | Y AUTO on, price fitted to the visible candles with 5% margins (`resetPriceScale`) |
| Time axis (main or MCB pane) | Bar spacing back to `DEFAULT_BAR_SPACING` (`resetTimeScale`). Following: right offset restored (latest candle + `RIGHT_PADDING_BARS` at the right edge). Detached: the time at the plot center is preserved, the view does not jump. Y mode untouched |
| Plot | No chart change. Fullscreen toggle (existing behavior) |
| MCB value axis | Resets its own value scale |

A dblclick where either of the two presses was a drag (travel > `CLICK_SLOP_PX`) is ignored (`doubleClickFollowsDrag`; drawing-tool presses are recorded through `recordComponentPress`). iOS fires no dblclick (touchstart is prevented), so double-taps on the axes are detected in the component (`axisDoubleTap`); a gesture between two taps breaks the pair.

Removed: the old "double click jumps to the latest candle" and "plot double click fits Y". Use the "Return to live" button for the former. (`ChartBaseComponent.zoomToLatestCandle` / `interaction.zoomToLatest` remain as code but have no UI caller.)

## Crosshair

- One synchronized crosshair across panes. The shared `_crosshairTime` is the snapped time; the main chart maps it through its own x scale at draw time, and that client x (`ChartLinkedScaleService.sharedCrosshairClientX`) is the one x every linked pane draws at, translated by its own canvas offset — a pure translation, so the line lands on the same viewport pixel in every pane. A pane's own x scale is only the fallback when no main chart is linked.
- Price/time labels appear only in the pane the pointer is in; the other pane shows the vertical line.
- Hidden during zoom gestures (zoom-x, zoom-y, pinch); follows the pointer during a pan. If the pointer leaves the chart during a gesture, the crosshair is hidden when the gesture ends.
- Touch: a 300 ms long press pins the crosshair; while pinned, pan and pinch are blocked and a plot touch only moves the crosshair or dismisses it.
- A pinned crosshair never blocks the axes (main chart, MCB time axis and MCB value axis): an axis press / drag always starts its scale, with the pinned crosshair as the time-scale focus point (the candle under it keeps its screen x). When the axis is released, the pinned crosshair interaction continues.

## Realtime follow

State: `LiveFollowState = 'following' | 'detached'`, exposed as the `liveFollow` signal (`liveFollowStateSignal`).

- Detach rule: `|rightOffsetBars - RIGHT_PADDING_BARS| > threshold`, evaluated after pans and at the end of zoom gestures. Back to `following` by panning/zooming back inside the threshold, "Return to live", the default view, and every exchange/symbol/timeframe change.
- `followLiveBars` (new candles appended): FOLLOWING shifts the range by exactly k bars, preserving right offset, bar spacing and Y. It judges the view first: a view that already left the edge (e.g. by a zoom) is detached instead of shifted. DETACHED never moves; new bars only join the dataset. The pan/zoom limits grow with the data either way.
- "Return to live": button at the bottom-right corner of the main plot, shown while detached (and data is present). `goToRealtime` puts the newest candle at the right edge with `RIGHT_PADDING_BARS` empty bars at the current bar spacing, keeps Y mode, sets `following`.
- Threshold: NgRx settings store, `liveFollowThresholdBars` (default `LIVE_FOLLOW_THRESHOLD_BARS` = 2, finite and >= 0), action `setLiveFollowThresholdBars`, persisted under `mtb.state.live-follow-threshold.v1` (`state-persistence.meta-reducer.ts`).
- Global command: `SettingsService.setAllChartsLiveFollow(enabled)` dispatches `setAllChartsLiveFollow({ enabled })`; the reducer stamps a growing `requestId`. `liveFollowRequests$` emits `enabled` for each new command (never the state present at subscribe). The chart page reacts: `true` = `goToRealtime()`, `false` = `detachLiveFollow()`.
- Dominance symbols still reload at period boundaries (see limitations).

## Constants

| Name | Value | File | Tunes |
|---|---|---|---|
| `MIN_BAR_SPACING` | 0.5 | time-scale.ts | Narrowest bar spacing (px per candle) |
| `MAX_BAR_SPACING` | 64 | time-scale.ts | Widest bar spacing |
| `DEFAULT_BAR_SPACING` | 12 | time-scale.ts | Bar spacing of the default view and of the time-axis reset |
| `TIME_AXIS_SCALE_SENSITIVITY` | 0.006 | time-scale.ts | Time-axis drag/swipe: exp rate per px (100 px ~ x1.8) |
| `PRICE_AXIS_SCALE_SENSITIVITY` | 0.006 | time-scale.ts | Price-axis drag: exp rate per px |
| `WHEEL_ZOOM_SENSITIVITY` | 0.00105 | time-scale.ts | Wheel zoom rate (one 100 px notch ~ 11%) |
| `WHEEL_LINE_PX` | 32 | time-scale.ts | px per line for `deltaMode` 1 |
| `WHEEL_MAX_DELTA_PX` | 200 | time-scale.ts | Per-event wheel delta clamp |
| `WHEEL_PINCH_FACTOR` | 10 | time-scale.ts | Multiplier for ctrl+wheel (trackpad pinch) deltas |
| `WHEEL_PINCH_MAX_DELTA` | 12 | time-scale.ts | Per-event ctrl+wheel delta clamp (before the factor) |
| `LIVE_FOLLOW_THRESHOLD_BARS` | 2 | time-scale.ts | Default detach distance in bars |
| `Y_AUTO_MARGIN_TOP` / `Y_AUTO_MARGIN_BOTTOM` | 0.05 / 0.05 | time-scale.ts | Y auto-fit margins (fraction of the price range) |
| `MIN_PRICE_RANGE_EPSILON_REL` | 1e-6 | time-scale.ts | Min price span relative to the anchor price |
| `MIN_PRICE_RANGE_EPSILON_ABS` | `Number.EPSILON * 100` | time-scale.ts | Absolute min price span floor |
| `MAX_PRICE_ZOOM_OUT` | 1e3 | time-scale.ts | Max price span as a multiple of the span at press |
| `CANDLE_GAP_LOOKBACK` | 50 | time-scale.ts | Candles averaged for the extrapolation gap |
| `RIGHT_PADDING_BARS` | 3 | chart-interaction.service.ts | Empty bars right of the latest candle in the default/live view |
| `MIN_CANDLES_VISIBLE` | 10 | chart-interaction.service.ts | Minimum visible candles when zooming |
| `CLICK_SLOP_PX` | 5 | chart-interaction.service.ts | Travel up to which a press is a click (dblclick-after-drag test) |

## Known limitations

- `fitToData` half-clips the edge candles (no UI caller).
- Dominance symbols reload at period boundaries, which resets the view.
- Hybrid touch+mouse devices: a touch clears a running mouse drag.
- The MCB gutter realignment takes one extra frame after the price-label width changes.
- A splitter-induced price-label width change stretches bar gaps slightly (the time range is kept).
- On unevenly spaced candles the pointer anchor preserves the time (not the logical index) under the cursor.

## Manual QA on real devices

Automated tests cover the logic with synthetic events; check these on hardware:

1. Wheel and trackpad pinch anchors: the candle under the pointer stays put in Chrome, Firefox and Safari (mouse notch, trackpad two-finger scroll, trackpad pinch).
2. Drags released outside the window or on another window (alt-tab, blur): pan, time-axis and price-axis drags end cleanly; no text selection while dragging.
3. Touch: two-finger pinch anchor follows the centroid; `touchcancel` by system gestures (notification shade, iOS edge swipe, app switcher) leaves no stuck gesture; long-press crosshair pins and dismisses.
4. MCB exclusivity: dragging the MCB value axis blocks pan/zoom/wheel on the rest of the page until release; time gestures on the MCB pane move both panes together.
5. Route navigation mid-gesture (footer navigation while dragging or pinching): the next chart page starts idle.
6. Double click/tap: price axis, time axis (following and detached), plot (fullscreen only), after a drag (nothing resets); iOS double-tap on the axes.
7. Live following on a real market: FOLLOWING keeps the right offset as candles close; panning away shows "Return to live" and stops the view moving; the button and a global follow command restore it.
