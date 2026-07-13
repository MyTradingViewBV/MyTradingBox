import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import { BoxModel } from '../../../modules/shared/models/chart/boxModel.dto';
import { resolveBoxColors } from '../../chart/utils/chart-utils';

interface BoxZone {
  zoneMin: number;
  zoneMax: number;
  fillColor: string;
}

function resolveZone(box: BoxModel): { zoneMin: number; zoneMax: number } | null {
  const zoneMin = box.ZoneMin ?? (box as { min_zone?: number }).min_zone;
  const zoneMax = box.ZoneMax ?? (box as { max_zone?: number }).max_zone;
  if (zoneMin == null || zoneMax == null) return null;
  const numericMin = Number(zoneMin);
  const numericMax = Number(zoneMax);
  if (Number.isNaN(numericMin) || Number.isNaN(numericMax)) return null;
  return { zoneMin: numericMin, zoneMax: numericMax };
}

class BoxRangeRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly zones: BoxZone[],
    private readonly priceToCoordinate: (price: number) => number | null,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace(
      ({ context: ctx, bitmapSize, verticalPixelRatio }) => {
        const width = bitmapSize.width;
        for (const zone of this.zones) {
          const yTop = this.priceToCoordinate(zone.zoneMax);
          const yBottom = this.priceToCoordinate(zone.zoneMin);
          if (yTop === null || yBottom === null) continue;
          const top = Math.round(Math.min(yTop, yBottom) * verticalPixelRatio);
          const bottom = Math.round(Math.max(yTop, yBottom) * verticalPixelRatio);
          const height = bottom - top;
          if (height <= 0) continue;
          ctx.fillStyle = zone.fillColor;
          ctx.fillRect(0, top, width, height);
        }
      },
    );
  }
}

class BoxRangePaneView implements IPrimitivePaneView {
  constructor(private readonly owner: BoxRangePrimitive) {}

  zOrder(): 'bottom' {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer | null {
    const series = this.owner.series;
    if (!series) return null;
    const zones = this.owner.getZones();
    if (!zones.length) return null;
    return new BoxRangeRenderer(zones, (price) => series.priceToCoordinate(price));
  }
}

export class BoxRangePrimitive implements ISeriesPrimitive<Time> {
  private _series: SeriesAttachedParameter<Time, 'Candlestick'>['series'] | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _boxes: BoxModel[] = [];
  private readonly _paneView = new BoxRangePaneView(this);
  private readonly _paneViews = [this._paneView];

  get series(): SeriesAttachedParameter<Time, 'Candlestick'>['series'] | null {
    return this._series;
  }

  setBoxes(boxes: BoxModel[]): void {
    this._boxes = boxes || [];
    this.updateAllViews();
  }

  getZones(): BoxZone[] {
    return (this._boxes || [])
      .map((box) => {
        const zone = resolveZone(box);
        if (!zone) return null;
        const { bg } = resolveBoxColors(box, 'boxes');
        return { ...zone, fillColor: bg };
      })
      .filter((z): z is BoxZone => z !== null);
  }

  attached(param: SeriesAttachedParameter<Time, 'Candlestick'>): void {
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  updateAllViews(): void {
    this._requestUpdate?.();
  }
}
