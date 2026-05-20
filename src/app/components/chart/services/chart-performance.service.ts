import { Injectable } from '@angular/core';

export type ChartPerformanceTier = 'low' | 'balanced' | 'high';

export interface ChartPerformanceProfile {
  tier: ChartPerformanceTier;
  skipLabelsDuringInteraction: boolean;
  enableWatermark: boolean;
  interactionUpdateMs: number;
  candleWidthFrameSkip: number;
  xAxisLabelBounds: {
    mobile: { min: number; max: number; autoSkipPadding: number };
    desktop: { min: number; max: number; autoSkipPadding: number };
  };
}

@Injectable({ providedIn: 'root' })
export class ChartPerformanceService {
  private initialized = false;

  private currentProfile: ChartPerformanceProfile = this.profileForTier('balanced');

  get profile(): ChartPerformanceProfile {
    return this.currentProfile;
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const tier = this.detectTierFromDevice();
    this.applyTier(tier);

    // Refine tier with storage pressure when the API is available.
    this.refineTierFromStoragePressure();
  }

  private applyTier(tier: ChartPerformanceTier): void {
    this.currentProfile = this.profileForTier(tier);
    this.syncProfileToWindow(this.currentProfile);
  }

  private profileForTier(tier: ChartPerformanceTier): ChartPerformanceProfile {
    if (tier === 'low') {
      return {
        tier,
        skipLabelsDuringInteraction: true,
        enableWatermark: false,
        interactionUpdateMs: 34,
        candleWidthFrameSkip: 10,
        xAxisLabelBounds: {
          mobile: { min: 3, max: 6, autoSkipPadding: 22 },
          desktop: { min: 4, max: 9, autoSkipPadding: 18 },
        },
      };
    }

    if (tier === 'high') {
      return {
        tier,
        skipLabelsDuringInteraction: false,
        enableWatermark: true,
        interactionUpdateMs: 16,
        candleWidthFrameSkip: 3,
        xAxisLabelBounds: {
          mobile: { min: 5, max: 10, autoSkipPadding: 14 },
          desktop: { min: 6, max: 14, autoSkipPadding: 10 },
        },
      };
    }

    return {
      tier: 'balanced',
      skipLabelsDuringInteraction: true,
      enableWatermark: true,
      interactionUpdateMs: 16,
      candleWidthFrameSkip: 6,
      xAxisLabelBounds: {
        mobile: { min: 4, max: 8, autoSkipPadding: 18 },
        desktop: { min: 5, max: 12, autoSkipPadding: 14 },
      },
    };
  }

  private detectTierFromDevice(): ChartPerformanceTier {
    try {
      const nav = typeof navigator !== 'undefined' ? navigator as Navigator & {
        deviceMemory?: number;
      } : null;
      if (!nav) return 'balanced';

      const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 4;
      const memory = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined;
      const ua = (nav.userAgent || '').toLowerCase();
      const isAndroid = ua.includes('android');

      // Conservative defaults: bias older Android devices toward low.
      if ((memory != null && memory <= 3) || cores <= 4) return 'low';
      if ((memory != null && memory >= 8) && cores >= 8 && !isAndroid) return 'high';
      if ((memory != null && memory >= 6) && cores >= 8) return 'high';
      return 'balanced';
    } catch {
      return 'balanced';
    }
  }

  private refineTierFromStoragePressure(): void {
    try {
      const nav = typeof navigator !== 'undefined'
        ? (navigator as Navigator & {
            storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> };
          })
        : null;
      const estimate = nav?.storage?.estimate;
      if (!estimate) return;

      estimate.call(nav.storage)
        .then((res) => {
          const usage = res?.usage ?? 0;
          const quota = res?.quota ?? 0;
          if (!usage || !quota) return;

          const ratio = usage / quota;
          if (ratio < 0.9) return;

          // Under heavy storage pressure, avoid high tier rendering.
          if (this.currentProfile.tier === 'high') {
            this.applyTier('balanced');
            return;
          }

          if (this.currentProfile.tier === 'balanced') {
            this.applyTier('low');
          }
        })
        .catch(() => {
          // Ignore unsupported or blocked storage estimate.
        });
    } catch {
      // Ignore runtime capability errors.
    }
  }

  private syncProfileToWindow(profile: ChartPerformanceProfile): void {
    try {
      (window as Window & { __chartPerfProfile?: ChartPerformanceProfile }).__chartPerfProfile = profile;
    } catch {
      // Non-browser contexts can safely ignore this.
    }
  }
}
