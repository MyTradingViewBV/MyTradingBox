/**
 * Fixed Volume Profile layer state: the saved profiles of the current symbol,
 * their selection / hover / drag state, the histogram cache and the pixel boxes
 * of the last render (hit-tests use exactly what the user sees).
 *
 * Profiles are persisted through the FixedVolumeProfiles API, never as
 * drawings in ChartState.
 */
import { Injectable } from '@angular/core';
import { FixedVolumeProfileDto } from 'src/app/modules/shared/models/chart/fixed-volume-profile.dto';
import { parseApiTime } from '../utils/key-zone-layers';
import {
  FixedVolumeProfileResult,
  VolumeProfileCandle,
  candlesInRange,
  computeFixedVolumeProfile,
} from '../utils/fixed-volume-profile';

export type FixedProfileHitPart = 'body' | 'left' | 'right';

export interface FixedProfileHit {
  id: number;
  part: FixedProfileHitPart;
}

export interface FixedProfileRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Pixel box of a rendered profile, clamped to the plot area. */
export interface FixedProfileGeometry {
  id: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Edge lies inside the plot area and resizes the stored time (false = off-screen or extended). */
  leftEdge: boolean;
  rightEdge: boolean;
  /**
   * Histogram bar boxes: only the bars and the edges hit, so the rest of a
   * (possibly chart-wide) range does not block clicks and panning.
   */
  bars: FixedProfileRect[];
}

/** Plot area the geometry was clipped to. */
export interface FixedProfileArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type FixedProfileCandle = VolumeProfileCandle & { x: number };

/** Edge grab distance (px) for resizing; touch uses a wider one. */
export const FIXED_PROFILE_EDGE_PX = 6;
export const FIXED_PROFILE_TOUCH_EDGE_PX = 12;
/** Edge grab distance of the full-height fallback box. */
export const FIXED_PROFILE_FALLBACK_EDGE_PX = 8;

/** Millisecond range of a profile (null when a time does not parse). */
export function fixedProfileRange(p: FixedVolumeProfileDto): { start: number; end: number } | null {
  const a = parseApiTime(p.StartTime);
  const b = parseApiTime(p.EndTime);
  if (a == null || b == null) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

/**
 * Range the histogram covers: with ExtendRight the end runs to the latest loaded
 * candle (like FixedVolumeProfileBot's effectiveEndTime), otherwise the stored range.
 */
export function effectiveFixedProfileRange(
  p: FixedVolumeProfileDto,
  candles: readonly { x: number }[],
): { start: number; end: number } | null {
  const range = fixedProfileRange(p);
  if (!range) return null;
  const lastX = candles?.length ? candles[candles.length - 1].x : null;
  if (p.ExtendRight && lastX != null && lastX > range.end) return { start: range.start, end: lastX };
  return range;
}

@Injectable({ providedIn: 'root' })
export class FixedVolumeProfileLayerService {
  private profilesValue: FixedVolumeProfileDto[] = [];

  selectedId: number | null = null;
  hoveredId: number | null = null;
  draggingId: number | null = null;
  /** Settings-panel toggle: hidden profiles are not drawn and never hit. */
  visible = true;

  private geometry: FixedProfileGeometry[] = [];
  private area: FixedProfileArea | null = null;
  private cache = new Map<number, { key: string; result: FixedVolumeProfileResult | null }>();

  get profiles(): readonly FixedVolumeProfileDto[] {
    return this.profilesValue;
  }

  find(id: number | null): FixedVolumeProfileDto | null {
    if (id == null) return null;
    return this.profilesValue.find((p) => p.Id === id) ?? null;
  }

  setProfiles(profiles: FixedVolumeProfileDto[]): void {
    this.profilesValue = [...(profiles ?? [])];
    this.cache.clear();
    this.geometry = [];
    if (!this.find(this.selectedId)) this.selectedId = null;
    if (!this.find(this.hoveredId)) this.hoveredId = null;
    if (!this.find(this.draggingId)) this.draggingId = null;
  }

  upsertProfile(profile: FixedVolumeProfileDto): void {
    const i = this.profilesValue.findIndex((p) => p.Id === profile.Id);
    this.profilesValue =
      i < 0
        ? [...this.profilesValue, profile]
        : this.profilesValue.map((p, j) => (j === i ? profile : p));
    this.cache.delete(profile.Id);
  }

  removeProfile(id: number): void {
    this.profilesValue = this.profilesValue.filter((p) => p.Id !== id);
    this.cache.delete(id);
    this.geometry = this.geometry.filter((g) => g.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    if (this.hoveredId === id) this.hoveredId = null;
    if (this.draggingId === id) this.draggingId = null;
  }

  /** Local (unsaved) time range change while dragging. */
  setRange(id: number, startMs: number, endMs: number): void {
    const start = new Date(Math.min(startMs, endMs)).toISOString();
    const end = new Date(Math.max(startMs, endMs)).toISOString();
    this.profilesValue = this.profilesValue.map((p) =>
      p.Id === id ? { ...p, StartTime: start, EndTime: end } : p,
    );
  }

  /**
   * Histogram of the candles inside the profile's effective range, cached per
   * profile. Live ticks replace the candle array, so the key is built from the
   * range and the candles themselves: a range that ends before the live candle
   * only recomputes when a bar is added or the history changes, a range that
   * contains it also on its ticks.
   */
  profileFor(profile: FixedVolumeProfileDto, candles: readonly FixedProfileCandle[]): FixedVolumeProfileResult | null {
    const range = effectiveFixedProfileRange(profile, candles);
    if (!range || !candles?.length) return null;
    const first = candles[0];
    const last = candles[candles.length - 1];
    const step = candles.length > 1 ? candles[1].x - first.x : 0;
    const liveInRange = last.x >= range.start && last.x <= range.end;
    const key = liveInRange
      ? `${range.start}|${range.end}|${candles.length}|${first.x}|${step}|${last.x}|${last.h}|${last.l}|${last.v ?? 0}`
      : `${range.start}|${range.end}|${first.x}|${step}|${this.closedRangeCount(candles, range.end)}`;
    const cached = this.cache.get(profile.Id);
    if (cached && cached.key === key) return cached.result;
    const result = computeFixedVolumeProfile(candlesInRange(candles, range.start, range.end));
    this.cache.set(profile.Id, { key, result });
    return result;
  }

  /** Number of candles up to `endMs` (sorted by x; binary search). */
  private closedRangeCount(candles: readonly { x: number }[], endMs: number): number {
    let lo = 0;
    let hi = candles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].x <= endMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  setGeometry(geometry: FixedProfileGeometry[], area: FixedProfileArea | null = null): void {
    this.geometry = geometry;
    this.area = area;
  }

  /**
   * Topmost (last drawn) profile under the pointer: near a resizable edge
   * resizes, on a histogram bar moves. The empty rest of the range
   * never hits. Points outside the plot area (axes) never hit.
   */
  hitTest(cx: number, cy: number, edgePx: number = FIXED_PROFILE_EDGE_PX): FixedProfileHit | null {
    const a = this.area;
    if (a && (cx < a.left || cx > a.right || cy < a.top || cy > a.bottom)) return null;
    for (let i = this.geometry.length - 1; i >= 0; i--) {
      const g = this.geometry[i];
      if (cy < g.top || cy > g.bottom) continue;
      const edge = g.bars.length ? edgePx : Math.max(edgePx, FIXED_PROFILE_FALLBACK_EDGE_PX);
      if (g.leftEdge && Math.abs(cx - g.left) <= edge) return { id: g.id, part: 'left' };
      if (g.rightEdge && Math.abs(cx - g.right) <= edge) return { id: g.id, part: 'right' };
      if (g.bars.some((b) => inRect(b, cx, cy))) return { id: g.id, part: 'body' };
    }
    return null;
  }
}

function inRect(r: FixedProfileRect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
