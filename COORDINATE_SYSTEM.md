# TradingView-Style Coordinate System Implementation

## Overview

A unified coordinate transformation system has been implemented to ensure all chart elements (candles, signals, indicators, boxes, overlays) use consistent data→pixel mappings.

## Architecture

### Core Transforms

**1. Index → X Pixel**
```typescript
indexToX(index: number, viewport: ChartViewport): number
```
- Converts candle array index to horizontal pixel position
- Linear interpolation: `(index - startIdx) / visibleBars * width`
- Result: 0 = left edge, width = right edge

**2. Price → Y Pixel**
```typescript
priceToY(price: number, viewport: ChartViewport): number
```
- Converts price level to vertical pixel position
- Linear interpolation: `height - (price - minPrice) / range * height`
- Result: 0 = top (highest price), height = bottom (lowest price)
- Y-axis is **inverted** (Chart.js convention)

### Viewport Object

```typescript
interface ChartViewport {
  visibleStartIndex: number;    // First visible candle index in data array
  visibleEndIndex: number;      // Last visible candle index in data array
  minPrice: number;             // Lowest price in view
  maxPrice: number;             // Highest price in view
  width: number;                // Drawable canvas width (pixels)
  height: number;               // Drawable canvas height (pixels)
}
```

## Usage Guide

### Building a Viewport

**From Chart Reference:**
```typescript
import { ChartLayoutService } from './services/chart-layout.service';

constructor(private layout: ChartLayoutService) {}

onChartReady(): void {
  const chartRef = this.chart.chart; // Chart.js instance
  const viewport = this.layout.buildViewport(chartRef, this.candleData);
  
  console.log(`Visible: ${viewport.visibleStartIndex}-${viewport.visibleEndIndex}`);
  console.log(`Price range: ${viewport.minPrice}-${viewport.maxPrice}`);
  console.log(`Canvas: ${viewport.width}×${viewport.height}px`);
}
```

**Manual Construction:**
```typescript
import { buildChartViewport } from './utils/chart-utils';

const viewport = buildChartViewport(
  candleData,           // Array of {x, h, l, ...}
  xScale.min,           // Visible time start (ms)
  xScale.max,           // Visible time end (ms)
  yScale.min,           // Visible price min
  yScale.max,           // Visible price max
  chartArea.width,      // Drawable width (px)
  chartArea.height      // Drawable height (px)
);
```

### Calculating Positions

```typescript
import { indexToX, priceToY } from './utils/chart-utils';

// Get pixel position of a candle
const candleIndex = 42;
const x = indexToX(candleIndex, viewport);

// Get pixel position of a price level
const priceLevel = 65432.50;
const y = priceToY(priceLevel, viewport);

// Result: point (x, y) in canvas coordinates
```

### Candle Width

```typescript
import { calculateCandleWidth } from './utils/chart-utils';

const candleWidth = calculateCandleWidth(viewport);
// Result: 1-16 pixels depending on zoom level
// Uses TradingView approach: 80% candle, 20% gap
```

## Practical Examples

### Example 1: Position an Indicator Signal

```typescript
// In chart-indicators.service.ts
buildCapitalFlowDatasets(params: { ... }): any[] {
  const { rawSignals, baseData, chartRef } = params;
  const layout = inject(ChartLayoutService);
  
  const viewport = layout.buildViewport(chartRef, baseData);
  const datasets: any[] = [];

  for (const signal of rawSignals) {
    const candleIndex = this.findNearestCandleIndex(signal.endTime, baseData);
    const candle = baseData[candleIndex];
    
    const x = indexToX(candleIndex, viewport);
    const y = signal.isBullish 
      ? priceToY(candle.l, viewport)  // Below low
      : priceToY(candle.h, viewport); // Above high
    
    datasets.push({
      type: 'scatter',
      data: [{ x: candle.x, y: signal.isBullish ? candle.l : candle.h }],
      glyphX: x,    // Pixel-based positioning (custom)
      glyphY: y,
      // ... Chart.js config
    });
  }
  return datasets;
}
```

### Example 2: Draw Support/Resistance Boxes

```typescript
import { indexToX, priceToY } from './utils/chart-utils';

function buildBoxOverlays(viewport: ChartViewport, boxes: any[]): any[] {
  return boxes.map(box => {
    const x1 = indexToX(box.startIndex, viewport);
    const x2 = indexToX(box.endIndex, viewport);
    const y1 = priceToY(box.topPrice, viewport);
    const y2 = priceToY(box.bottomPrice, viewport);
    
    return {
      type: 'line',
      data: [
        { x: x1, y: y1 }, { x: x2, y: y1 },
        { x: x2, y: y2 }, { x: x1, y: y2 },
        { x: x1, y: y1 }
      ],
      borderColor: box.color,
      backgroundColor: `${box.color}33`,
      fill: true
    };
  });
}
```

### Example 3: Custom Crosshair

```typescript
function getCrosshairPoint(
  mouseX: number,
  mouseY: number,
  viewport: ChartViewport,
  candleData: any[]
): { index: number; price: number } {
  // Reverse transform: pixel → data space
  const visibleBars = viewport.visibleEndIndex - viewport.visibleStartIndex;
  const relX = mouseX / viewport.width;
  const index = Math.floor(relX * visibleBars) + viewport.visibleStartIndex;
  
  const priceRange = viewport.maxPrice - viewport.minPrice;
  const relY = (viewport.height - mouseY) / viewport.height;
  const price = viewport.minPrice + relY * priceRange;
  
  return { index, price };
}
```

## Integration Points

### Chart Component
```typescript
// After data loads, viewport is available for overlays
updateOverlays(): void {
  const viewport = this.layout.buildViewport(this.chart.chart, this.baseData);
  
  // Update all overlays
  this.updateSignals(viewport);
  this.updateBoxes(viewport);
  this.updateIndicators(viewport);
}
```

### Pan/Zoom Handling
```typescript
// After pan or zoom in chart-interaction.service
scheduleInteractionUpdate(chartRef: any): void {
  // ... existing pan/zoom logic (unchanged)
  
  // Notify subscribers that viewport changed
  this.onAfterInteractionUpdate?.(chartRef);
  // → This triggers overlay recalculation with new viewport
}
```

### Lazy Data Loading
No changes needed. Coordinate system works with any data subset:
```typescript
onLazyLoad(newCandles: any[]): void {
  this.baseData.push(...newCandles);
  // Viewport automatically includes new candles in index calculation
  const viewport = this.layout.buildViewport(chartRef, this.baseData);
  // ... new overlays render at correct positions
}
```

## Performance Notes

- **Caching**: Viewport is computed fresh on each pan/zoom (lightweight operation)
- **Batch Transforms**: If you have 100s of overlays, pre-compute viewport once:
  ```typescript
  const viewport = this.layout.buildViewport(chartRef, data);
  overlays.forEach(o => {
    const x = indexToX(o.index, viewport);
    const y = priceToY(o.price, viewport);
    // ... apply positions
  });
  ```

- **Avoid Per-Frame Recomputation**: Cache viewport in `@Input()` or component property

## Migration Checklist

If updating existing components to use the coordinate system:

- [ ] Import viewport functions: `indexToX, priceToY, buildChartViewport`
- [ ] Build viewport from chart state
- [ ] Replace hardcoded pixel calculations with transforms
- [ ] Test zoom and pan behavior
- [ ] Verify overlays align with candles
- [ ] Check mobile responsiveness

## API Reference

### Functions in `chart-utils.ts`

```typescript
// Transforms
indexToX(index: number, viewport: ChartViewport): number
priceToY(price: number, viewport: ChartViewport): number

// Builders
buildChartViewport(
  data: Array<{x, h?, l?}>,
  xMin, xMax, yMin, yMax,
  chartWidth, chartHeight
): ChartViewport
calculateCandleWidth(viewport: ChartViewport): number
```

### Methods in `ChartLayoutService`

```typescript
buildViewport(chartRef: any, candleData: Array<{x}>): ChartViewport
```

## Benefits

✅ **Consistency**: All elements use same coordinate mapping  
✅ **Alignment**: Overlays perfectly sync with candles  
✅ **Scalability**: Simple to add new overlay types  
✅ **Maintainability**: Coordinate logic in one place  
✅ **Performance**: Lightweight transforms  
✅ **TradingView-Compatible**: Industry-standard behavior  

## Troubleshooting

**Problem**: Overlays appear offset from candles
- **Solution**: Ensure viewport is built from same chartRef and candleData as Chart.js

**Problem**: Y-axis seems inverted
- **Solution**: This is correct! Canvas Y=0 is at top; Canvas Y=height is at bottom

**Problem**: Signals disappear on zoom
- **Solution**: Rebuild viewport after each pan/zoom event, before rendering overlays

---

**Document Version**: 1.0  
**Chart Framework**: Angular 21 + Chart.js + Chart.js Financial  
**Mobile-First**: Yes (TradingView style)
