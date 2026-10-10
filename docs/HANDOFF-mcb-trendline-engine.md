# Handoff: MCB Trendline Prediction Engine

Status on 2026-10-10. Read this first when you pick up this work in a new session or on another PC.
A copy of this file also lives in the Bots repo at `DivPredictionBot/docs/HANDOFF-mcb-trendline-engine.md`.

## Goal

Replace the wrong MCB prediction lines with a trendline engine:

- Purple lines in the MCB panel. They connect pivots of the **Slow Momentum Wave** (wt2 = SMA(wt1,3)).
- Brown lines on the price chart. They connect the candle highs/lows that belong to those same momentum pivots.
- White Money Flow lines, both long-term and short-term (Part B).
- Breakout detection, a lookback window per timeframe, and realtime updates (Part B).

The work spans two repos:

| Repo | Branch | Role |
|---|---|---|
| `Bots` (`DivPredictionBot`) | `feature/divprediction-momentum-waves` | Computes everything (C#) and publishes it in `symbol_predictions.timeframe_results` |
| `MyTradingBox` (Angular) | `feature/mcb-trendline-engine` | Only renders the lines |
| `API` | – | No change. It passes the `TimeframeResults` jsonb through as is |

## Why the old lines were wrong (root cause)

1. The bot used **wt1**, the fast wave (`McbProbabilityEngine.cs`, `wave = wt1`), not wt2.
2. The Money Flow tracker also produced **price lines**. That is how Money Flow ended up on the green price lines.
3. Pivots ignored the zero line, so positive and negative pivots were mixed.
4. The frontend mapped lines by bar index using `max(CurrentPriceBarIndex)` instead of `LastBarIndex`. It also fell back to other timeframes (12m used 30m). Every line was therefore shifted onto the wrong candles.
5. The live candle had two bugs:
   - `"1M"` was treated as `"1m"`.
   - The live bar of higher timeframes was built from a single 1m candle.

## Decisions (user said "choose the best option everywhere")

- The engine is in C#, with pure classes in `DivPredictionBot/Trendlines/`. The output goes in a **new additive** JSON field, `TimeframeResults[].Trendlines`, with all times in unix ms (candle open time, UTC).
- The legacy `DivergenceLines`, scores, box logic (`boxes.position_type`) and probability engine are **unchanged**.
- The Money Flow formula stays as it is (CCI-based `SMA(CCI(hlc3,5),60)`, the same one the app draws).
- Colours: purple (MCB), brown (price), white (Money Flow, Part B). There are no % labels. Developing lines are dashed and on by default.
- Hysteresis is ±5 on wt2 plus 2 closed candles. Thresholds for internal pivots are 6% of amplitude, and for major/dominant 18%. The floors for the slow wave are 2.0 and 8.0. All of these are **initial values that still need validation on history**.
- Price mapping: ±3 bars around the momentum pivot, never after the pivot's confirm bar. Price anchors form a chain that runs forward in time.
- At most 4 visible confirmed lines, plus 1 developing line.
- **Hierarchy scope = SamePolarity**: troughs are compared with troughs across several negative regimes inside the lookback window (as in the user's screenshot), and peaks with peaks. Polarities are never mixed. The old `CurrentRegime` scope is still available as an option.
- **The default lookback table is already applied** (`Trendlines/TrendlineLookback.cs`): 1m 12h, 3m 2d, 5m 4d, 6m 5d, 12m 7d, 24m 14d, 1h 30d, 4h 90d, 1d 365d, 1w 3y, 1M 7y. The dynamic expansion up to the maximum lookback is T11.
- **Warm-up**: the bot loads a rolling window of the last 2500 candles.
  - `windowStart` is the first regime start at or after max(warm-up, lookback bound).
  - warm-up = max(tSync+1, AmplitudeWindow+50 = 250).
  - Because of this, windows that start at the same point give identical lines (tested on about 17k windows).
  - Side effect: **1M never gets lines**, because there is too little history.
- The JSON contains only visible lines, plus `HiddenLineCount`. That is about 2.3 KB per timeframe.

## Status: Part A (T1–T8) DONE, audited, committed

| ID | Repo | What | Status |
|---|---|---|---|
| T1 | Bots | New xUnit project `DivPredictionBot.Tests`, plus characterization tests for the legacy engine | done |
| T2 | Bots | Live candle fix (`LiveCandleMerger.cs`): Ordinal `1m`/`1M`; the HTF bucket is built from closed 1m candles with an incremental seed cache (`BucketSeedCache`); a failure falls back to tick-only. The Dockerfile now builds the csproj | done |
| T3 | Bots | `OscillatorPivotDetector`: regimes + hysteresis, adaptive pivots, confirmed/developing, repaint-free, `Append` == `Detect` | done |
| T4 | Bots | `WaveHierarchy`: Dominant / PendingDominant / Internal / Superseded / History, SamePolarity scope | done |
| T5 | Bots | `MomentumTrendlineEngine` / `Builder` / `PriceAnchorMapper` / `SlowMomentumWave` (wt2 identical to the engine) | done |
| T6 | Bots | `TrendlineMapping` + `TrendlineDto` + `Worker` integration (`TryCompute` never throws) + lookback + warm-up | done |
| T7 | MyTradingBox | `mcb-trendlines.ts`: rendering, exact timeframe only (no fallback), sub-toggles; the old `mcb-prediction-lines.ts` is removed | done |
| T8 | both | README, `docs/trendline-engine.md`, RELEASE_LOG | done |

Test results at the end of Part A:

- `dotnet test DivPredictionBot/DivPredictionBot.sln`: **99/99**.
- MyTradingBox `npx ng test --watch=false`: **956/956**. The baseline was 938 passing plus 2 flaky watchlist timeouts that already existed.
- `npm run lint`: exit 0.
- `ng build`: OK.

### Not verified yet (do this first)

1. Run the bot against a real Postgres database. The new seed SQL in `Worker.cs` (`LoadBucketSeedChunkAsync`, with a `FILTER` clause) has not run against Postgres yet.
2. Check the result visually in MyTradingBox on BTCUSDT 12m against the user's reference screenshot:
   - Several purple lines from successive wt2 troughs to the latest trough.
   - Brown price lines on the corresponding lows.
3. Calibrate the thresholds against real data.
4. The API build fails on the original PC because the `BotShared.dll` HintPath is missing. This is not related to this work.

### Behaviour changes to know about

- Probability scores change slightly, because the live HTF bar is now correct.
- `divergence_candidates` now keeps `1m` and `1M` apart. No code reads that table.
- The MyTradingBox master toggle label is now "Trendlijnen" / "Trendlines".
- Shared settings-panel items now support optional `disabled` and `indent` flags.

## Part B: TODO (only after the user has reviewed Part A)

| ID | Repo | What | Model |
|---|---|---|---|
| T9 | Bots | `MoneyFlowEngine`: long-term trend (dominant MF pivots) and short-term trend (internal pivots). Report `Direction` (Rising/Falling/Sideways) and `Regime` (Positive/Negative) as separate fields. Reuse `OscillatorPivotDetector` with its own options. Test D: MF -50 → -35 → -20 gives Rising + Negative. MF pivots must not disappear when wt2 crosses zero | opus |
| T10 | Bots | `BreakoutTracker`, with states Active / BreakoutPending / BreakoutConfirmed / Invalidated / WaitingForNewPivot. Price: 2 closed candles beyond the line, with tolerance max(0.1·ATR, 0.05% of price). Oscillator: tolerance in its own units, no ATR. Replay chronologically using only the data available at each moment. After a breakout, re-anchor only when there are enough new confirmed pivots. Tests E and F | opus |
| T11 | Bots | Dynamic lookback: expand from the default to the maximum (table in the original spec) until there are at least 2 pivots and ideally 3 full regimes; otherwise no lines. The candle limit per timeframe must cover the maximum lookback (1m = 3 days = 4320 > 2500) | sonnet |
| T12 | Bots | Incremental: cache detector state per symbol/timeframe, recompute fully only on candle close, add a generation id to the output. Note: the detector is only repaint-free when its first bar is fixed | opus |
| T13 | MyTradingBox | White MF lines (long-term solid, short-term thin/dashed), hide broken lines, apply both panels atomically per generation | sonnet |
| T14 | both | Docs and final validation against the screenshot | haiku |

## Workflow (big-task skill)

For each task:

1. A subagent with the model shown in the table implements it.
2. Build and run the full test suite against the baseline.
3. Run lint.
4. A `task-auditor` (opus) reviews the diff.
5. Fix the findings, then re-audit.

Existing behaviour always takes priority. Don't commit unless asked.

## Useful commands

```bash
# Bots (build BotShared first if BotShared.dll is missing)
dotnet build Bots/BotShared/BotShared.sln
dotnet test  Bots/DivPredictionBot/DivPredictionBot.sln

# MyTradingBox
npx ng test --watch=false
npx ng test --watch=false --include src/app/components/market-cipher-b-chart/mcb-trendlines.spec.ts
npm run lint
npx ng build
```

## Key files

- Bots:
  - `DivPredictionBot/Trendlines/*.cs`
  - `DivPredictionBot/TrendlineMapping.cs`
  - `DivPredictionBot/TrendlineDto.cs`
  - `DivPredictionBot/LiveCandleMerger.cs`
  - `DivPredictionBot/Worker.cs` (Trendlines block after `timeframeResults.Add`, plus `MergeTickIntoTimeframeAsync`)
  - `DivPredictionBot/docs/trendline-engine.md`
  - `DivPredictionBot.Tests/`
- MyTradingBox:
  - `src/app/components/market-cipher-b-chart/mcb-trendlines.ts`
  - `market-cipher-b-chart.component.ts` (`loadPredictions`, `rebuildMcbPanelDatasets`, `updatePriceTrendlineDatasets`)
  - `mcb-indicator.ts` (toggles)
