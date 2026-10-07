# Chart Coordinate System

Authoritative description of how the chart pages map time and price to pixels. Applies to every route built on `ChartBaseComponent` (`/mcb-chart` and `/chart`). Interaction behavior is in [Chart Interactions](components/CHART_INTERACTIONS.md).

## One time scale

`TimeScale` (`src/app/components/chart/scales/time-scale.ts`) is the single source of truth for the horizontal axis. `ChartLinkedScaleService` owns the one instance (`timeScale`); the interaction service and the MCB pane read and write through it. No pane keeps its own derived x-range.

State:

| State | Meaning |
|---|---|
| candles | Timestamps (ms) of the loaded candles, indexed `0..n-1` |
| plot metrics | Left/right plot edges in CSS px (`setPlot`) |
| `barSpacingPx` | Pixels per candle, clamped to `MIN_BAR_SPACING`..`MAX_BAR_SPACING` (0.5..64) |
| `rightOffsetBars` | Empty bars between the last candle and the right plot edge |

Logical index: candle `i` sits at logical `i`; fractional values are positions between candles (`i + 0.5` is halfway to the next). Beyond either end of the data, the average candle gap over the last `CANDLE_GAP_LOOKBACK` (50) candles extrapolates further slots.

```
rightLogical = lastDataIndex + rightOffsetBars
logicalToX(l) = plotRight - (rightLogical - l) * barSpacingPx
xToLogical(x) = rightLogical - (plotRight - x) / barSpacingPx
```

`logicalToX` and `xToLogical` are exact inverses. Derived, never stored: `visibleLogicalRange()`, `visibleTimeRange()`, `timeRangeForPlot(pane)`, `timeSpanForPixels(px)`.

## Two mapping families

| Family | Methods | Model | Use for |
|---|---|---|---|
| Index-based | `timeToLogical`, `logicalToTime`, `timeToX`, `xToTime` | Interpolates between candles by index; extrapolates by average gap | Range bookkeeping in logical units (right offset, visible bar counts, live follow). |
| Time-linear (pixel-facing) | `projectedXToTime`, `projectedTimeToX` | Linear over `visibleTimeRange()` across the plot | Anything that must match what Chart.js draws: hit-testing, crosshair, anchors of gestures, overlays. |

Rule: never use the index-based methods for pixel conversion or hit-testing. Chart.js draws the x axis linearly in time, so with uneven candles (monthly candles, data gaps, the empty area right of the last candle) the two families disagree. The rule is also in the JSDoc of `timeToX`.

## Why `offset: false`

The x scales of the main chart (`chart-base.component.ts`) and of the MCB pane (`market-cipher-b-chart.component.ts`) set `offset: false`. With Chart.js's default category-style offset, the axis would pad half a bar at both ends and the pixel position of `min`/`max` would no longer equal the plot edges. With `offset: false`, `scales.x.min` sits exactly on the left plot edge and `max` on the right one, which is what makes `projectedXToTime` exact and lets two panes with different widths agree on every timestamp.

## Projecting the range to both panes

`TimeScale.applyToChart(chart, pane?)` writes the visible time range to the chart's x scale (`scales.x.min/max`, scale options, and the `options`/`config.options` objects ng2-charts reads) via `writeXRange`. It mutates existing option objects and never spreads Chart.js scale configs.

- Main pane: `applyToChart(chart)` writes `visibleTimeRange()`.
- MCB pane: `timeRangeForPlot(pane)` extends the range linearly to the pane's own plot edges, so every timestamp lands on the same x as in the main pane whatever the pane's padding or width. `ChartLinkedScaleService.projectToMcb` is the single write path to the MCB chart.
- DOM alignment: the MCB canvas is padded so its plot edges match the main plot (`mcbPlotDelta`); the sub-pixel rounding residue of that padding is absorbed into the MCB x-range instead of misaligning timestamps.
- The `linkedPanelSync` Chart.js plugin re-syncs the MCB pane after every main-chart `afterUpdate` and on `resize`, so a range written by a gesture and the rendered layout converge in the same frame.
- Crosshair: the vertical line's x is computed once — the shared (snapped) time through the main chart's rendered x scale, clamped to its plot (`ChartLinkedScaleService.sharedCrosshairClientX`, viewport coordinates). Linked panes draw at that client x minus their own canvas offset, a pure translation, so the line is pixel-identical in every pane regardless of padding residue or projection lag; a pane's own scale is only the fallback when no main chart is linked.

## Price scale

The y axis is linear; `yScale.options.min/max` hold the intended range.

- Anchored drag/wheel: `solveAnchoredPriceRange(start, dy)` (exported, pure). `span = startSpan * exp(dy * PRICE_AXIS_SCALE_SENSITIVITY)`, clamped between a minimum span (`max(MIN_PRICE_RANGE_EPSILON_ABS, MIN_PRICE_RANGE_EPSILON_REL * |anchorPrice|)`, never above the start span) and `startSpan * MAX_PRICE_ZOOM_OUT`. The anchor price stays at its press fraction down the plot.
- Auto scale (`autoFitYScale`): min/max of visible candles' low/high plus visible order lines, with `Y_AUTO_MARGIN_BOTTOM`/`Y_AUTO_MARGIN_TOP` (5% of the range each). Runs after every committed x-range while auto mode is on.
- `refitYForLiveCandle`: on a live tick, in auto mode and with no gesture running, refits only when the last candle left the current y range.
- `resetPriceScale`: auto mode on, refit to visible candles.
- The MCB pane has its own value scale (default -110..110) that is not tied to the main price scale.

## Where the write paths live

| What | Single write path |
|---|---|
| Main x-range | `ChartInteractionService.applyXRange` -> `TimeScale.setVisibleTimeRange` + `applyToChart`. Gestures compute a target with `solveAnchoredRange` and write it with `commitAnchoredRange`. |
| MCB x-range | `ChartLinkedScaleService.projectToMcb` |
| Main y-range | `autoFitYScale` (auto) or the anchored price solve (manual); the plot pan shifts the y range incrementally (documented exception: it is the only gesture not computed from its start state) |
| Time scale state | `TimeScale` setters only (`setBarSpacing`, `setRightOffsetBars`, `setVisibleLogicalRange`, `setVisibleTimeRange`, `setCandles`, `setPlot`) |

`solveAnchoredRange(chartRef, anchorTime, fraction, targetSpacing, refSpan, refSpacing)` returns the range showing `targetSpacing` with `anchorTime` at `fraction` across the plot. It clamps the spacing, enforces the span limits (minimum `MIN_CANDLES_VISIBLE` = 10 candles, maximum 98% of the data) and the pan limit `extendedDataRange` (the anchor yields at an extreme). Gestures pass their start span/spacing as the reference so the result is a pure function of start state and total input, not of event history.

## Constants

All scale constants are exported from `time-scale.ts`; the full table with meanings is in [Chart Interactions](components/CHART_INTERACTIONS.md#constants). `RIGHT_PADDING_BARS` (3), `MIN_CANDLES_VISIBLE` (10) and `CLICK_SLOP_PX` (5) live in `chart-interaction.service.ts`.

## Not in this system

The earlier `ChartViewport` / `indexToX` / `priceToY` / `buildChartViewport` model and the zoom/pan helpers built on it were removed. Overlay code should use the TimeScale pixel-facing pair for x and the Chart.js y scale for price. There is no lazy loading of history: panning is limited to `extendedDataRange` of the already loaded candles.
