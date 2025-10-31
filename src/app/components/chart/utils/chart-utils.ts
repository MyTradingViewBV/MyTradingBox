/* Stateless chart helper utilities extracted from ChartComponent to reduce size and enable reuse. */
/* eslint-disable @typescript-eslint/no-explicit-any */

export function formatPriceChange(change: number, previousPrice: number): string {
  const changePercent = previousPrice ? (change / previousPrice) * 100 : 0;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
}

export function isBtcSymbol(sym: string): boolean {
  if (!sym) return false;
  return sym.toUpperCase().includes('BTC');
}

export function resolveBoxColors(b: any, boxMode: 'boxes' | 'all'): { bg: string; br: string } {
  if (boxMode === 'boxes') {
    const sideRaw = (
      b.PositionType || b.positionType || b.Side || b.side || b.Direction || b.direction || ''
    ).toString().toLowerCase();
    const isShort = /short|sell|s\b/.test(sideRaw);
    const isLong = /long|buy|b\b/.test(sideRaw);
    const bg = isShort ? 'rgba(255,0,0,0.14)' : isLong ? 'rgba(0,200,0,0.14)' : 'rgba(0,200,0,0.14)';
    const br = isShort ? 'rgba(255,0,0,0.9)' : isLong ? 'rgba(0,200,0,0.9)' : 'rgba(0,200,0,0.9)';
    return { bg, br };
  }
  const provided = (b.Color || b.color || b.ColorString || b.colorString || '').toString();
  const isHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(provided);
  if (provided) {
    if (isHex) {
      const hex = provided.replace('#', '');
      const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.substring(0, 2), 16);
      const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.substring(2, 4), 16);
      const bl = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.substring(4, 6), 16);
      return { bg: `rgba(${r},${g},${bl},0.14)`, br: `rgba(${r},${g},${bl},0.95)` };
    }
    return { bg: `${provided}33`, br: provided } as any;
  }
  const sideRaw = (
    b.PositionType || b.positionType || b.Side || b.side || b.Direction || b.direction || ''
  ).toString().toLowerCase();
  const isShort = /short|sell|s\b/.test(sideRaw);
  const isLong = /long|buy|b\b/.test(sideRaw);
  const bg = isShort ? 'rgba(255,0,0,0.14)' : isLong ? 'rgba(0,200,0,0.14)' : 'rgba(0,200,0,0.14)';
  const br = isShort ? 'rgba(255,0,0,0.9)' : isLong ? 'rgba(0,200,0,0.9)' : 'rgba(0,200,0,0.9)';
  return { bg, br };
}

// Build box overlay datasets given base candle data and raw boxes collection.
export function buildBoxDatasets(params: {
  boxes: any[];
  baseData: any[];
  mainData: Array<{ x: number }>;
  boxMode: 'boxes' | 'all';
}): any[] {
  const { boxes, baseData, mainData, boxMode } = params;
  if (!mainData || mainData.length < 2) return [];
  let boxesToUse = boxes || [];
  // synthesize demo box if none
  if ((!boxesToUse || boxesToUse.length === 0) && baseData && baseData.length) {
    const highs = baseData.map((c: any) => c.h);
    const lows = baseData.map((c: any) => c.l);
    const minY = Math.min(...lows);
    const maxY = Math.max(...highs);
    const boxBottom = minY + (maxY - minY) * 0.25;
    const boxTop = minY + (maxY - minY) * 0.75;
    boxesToUse = [
      { Id: 1, min_zone: boxBottom, max_zone: boxTop, PositionType: 'LONG' },
    ];
  }
  const xMin = mainData[0].x;
  const xMax = mainData[mainData.length - 1].x;
  return (boxesToUse || [])
    .map((b: any, i: number) => {
      const zoneMin =
        b.min_zone ?? b.MinZone ?? b.zone_min ?? b.ZoneMin ?? b.minZone ?? b.ZoneMin ?? null;
      const zoneMax =
        b.max_zone ?? b.MaxZone ?? b.zone_max ?? b.ZoneMax ?? b.maxZone ?? b.ZoneMax ?? null;
      if (zoneMin == null || zoneMax == null) return null;
      const numericMin = Number(zoneMin);
      const numericMax = Number(zoneMax);
      if (Number.isNaN(numericMin) || Number.isNaN(numericMax)) return null;
      const resolved = resolveBoxColors(b, boxMode);
      const label = `${boxMode === 'all' ? 'AllBox' : 'TradeBox'} ${b.Id ?? b.id ?? i}`;
      return {
        type: 'line' as const,
        label,
        data: [
          { x: xMin, y: numericMin },
          { x: xMax, y: numericMin },
          { x: xMax, y: numericMax },
          { x: xMin, y: numericMax },
          { x: xMin, y: numericMin },
        ],
        showLine: true,
        borderColor: resolved.br,
        borderWidth: 2,
        borderDash: boxMode === 'all' ? [6, 4] : [],
        backgroundColor: resolved.bg,
        fill: true,
        spanGaps: true,
        order: 9999,
        clip: false,
        isBox: true,
        hidden: false,
        pointRadius: 0,
        tension: 0,
        parsing: true,
        boxLabelMin: `${numericMin >= 1000 ? numericMin.toLocaleString() : numericMin.toFixed(2)}`,
        boxLabelMax: `${numericMax >= 1000 ? numericMax.toLocaleString() : numericMax.toFixed(2)}`,
      };
    })
    .filter(Boolean) as any[];
}
