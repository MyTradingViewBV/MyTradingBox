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

/** Pixel box of a rendered profile. */
export interface FixedProfileGeometry {
  id: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type FixedProfileCandle = VolumeProfileCandle & { x: number };

/** Edge grab distance (px) for resizing; touch uses a wider one. */
export const FIXED_PROFILE_EDGE_PX = 6;
export const FIXED_PROFILE_TOUCH_EDGE_PX = 12;

/** Millisecond range of a profile (null when a time does not parse). */
export function fixedProfileRange(p: FixedVolumeProfileDto): { start: number; end: number } | null {
  const a = parseApiTime(p.StartTime);
  const b = parseApiTime(p.EndTime);
  if (a == null || b == null) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

@Injectable({ providedIn: 'root' })
export class FixedVolumeProfileLayerService {
  private profilesValue: FixedVolumeProfileDto[] = [];

  selectedId: number | null = null;
  hoveredId: number | null = null;
  draggingId: number | null = null;

  private geometry: FixedProfileGeometry[] = [];
  private cache = new Map<number, { key: string; result: FixedVolumeProfileResult | null }>();
  private cacheData: readonly unknown[] | null = null;

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
   * Histogram of the candles inside the profile's range. Cached per profile;
   * recomputed when the candle array, its length, the range or a live-updated
   * last candle inside the range changes.
   */
  profileFor(profile: FixedVolumeProfileDto, candles: readonly FixedProfileCandle[]): FixedVolumeProfileResult | null {
    const range = fixedProfileRange(profile);
    if (!range || !candles?.length) return null;
    if (candles !== this.cacheData) {
      this.cache.clear();
      this.cacheData = candles;
    }
    const last = candles[candles.length - 1];
    const lastPart = last.x >= range.start && last.x <= range.end ? `|${last.h}|${last.l}|${last.v ?? 0}` : '';
    const key = `${range.start}|${range.end}|${candles.length}|${candles[0].x}|${last.x}${lastPart}`;
    const cached = this.cache.get(profile.Id);
    if (cached && cached.key === key) return cached.result;
    const result = computeFixedVolumeProfile(candlesInRange(candles, range.start, range.end));
    this.cache.set(profile.Id, { key, result });
    return result;
  }

  setGeometry(geometry: FixedProfileGeometry[]): void {
    this.geometry = geometry;
  }

  /** Topmost (last drawn) profile under the pointer: near an edge resizes, inside moves. */
  hitTest(cx: number, cy: number, edgePx: number = FIXED_PROFILE_EDGE_PX): FixedProfileHit | null {
    for (let i = this.geometry.length - 1; i >= 0; i--) {
      const g = this.geometry[i];
      if (cy < g.top || cy > g.bottom) continue;
      if (cx < g.left - edgePx || cx > g.right + edgePx) continue;
      if (Math.abs(cx - g.left) <= edgePx) return { id: g.id, part: 'left' };
      if (Math.abs(cx - g.right) <= edgePx) return { id: g.id, part: 'right' };
      return { id: g.id, part: 'body' };
    }
    return null;
  }
}
