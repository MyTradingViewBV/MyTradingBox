/**
 * Subscription plans shown on /plans (information only: there is no checkout yet).
 * Prices in euro; features are translation keys under PLANS.FEATURES, values under PLANS.VALUES.
 */
export type PlanId = 'trial' | 'basic' | 'pro';
export type BillingPeriod = 'monthly' | 'yearly';

export interface PlanFeature {
  /** PLANS.FEATURES.* key. */
  key: string;
  /** Optional PLANS.VALUES.* key shown next to the feature (e.g. "Limited"). */
  valueKey?: string;
}

export interface Plan {
  id: PlanId;
  /** Price per month in euro; 0 for the trial. */
  monthly: number;
  /** Price per year in euro; null when the plan has no yearly price. */
  yearly: number | null;
  /** Trial length in days (trial only). */
  trialDays?: number;
  highlight: 'none' | 'accent' | 'popular';
  /** The button is an outline button instead of the gradient one. */
  outlineCta?: boolean;
  /** Left column: the base features. */
  features: PlanFeature[];
  /** Right column. */
  extras: PlanFeature[];
}

const BASE: PlanFeature[] = [
  { key: 'CHART' },
  { key: 'ALL_LEVELS' },
  { key: 'BOXES' },
  { key: 'BOX_DESCRIPTION' },
  { key: 'LONG_SHORT_BOXES' },
];

export const PLANS: Plan[] = [
  {
    id: 'trial',
    monthly: 0,
    yearly: null,
    trialDays: 7,
    highlight: 'none',
    outlineCta: true,
    features: BASE,
    extras: [
      { key: 'GOLD_TRIGGER', valueKey: 'CONCEPT_VISIBLE' },
      { key: 'WATCHLIST', valueKey: 'LIMITED' },
      { key: 'SYMBOLS', valueKey: 'LIMITED_BTC' },
    ],
  },
  {
    id: 'basic',
    monthly: 9.99,
    yearly: 99,
    highlight: 'accent',
    features: BASE,
    extras: [
      { key: 'GOLD_TRIGGER' },
      { key: 'WATCHLIST', valueKey: 'EXTENDED' },
      { key: 'SYMBOLS', valueKey: 'MORE_SYMBOLS' },
    ],
  },
  {
    id: 'pro',
    monthly: 19.99,
    yearly: 199,
    highlight: 'popular',
    features: [
      ...BASE,
      { key: 'GOLD_TRIGGER' },
      { key: 'WATCHLIST', valueKey: 'EXTENDED' },
      { key: 'SYMBOLS', valueKey: 'FULL' },
    ],
    extras: [
      { key: 'ALERTS' },
      { key: 'BOX_STRENGTH' },
      { key: 'BOX_DENSITY' },
      { key: 'DENSITY_GRADIENT' },
      { key: 'CLUSTER_ANALYSIS' },
      { key: 'AI_TRADE_SETUP' },
      { key: 'ENTRY_ZONE' },
      { key: 'TARGET_1' },
      { key: 'TARGET_2' },
      { key: 'STOP_LOSS' },
      { key: 'RISK_REWARD' },
    ],
  },
];

/** Euro price text in the user's language: "€9,99" (nl) / "€9.99" (en); whole euros without decimals. */
export function formatEuro(value: number, lang: string): string {
  const locale = lang === 'nl' ? 'nl-NL' : 'en-IE';
  const whole = Number.isInteger(value);
  return `€${value.toLocaleString(locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Yearly saving versus paying monthly, in whole percent (rounded down); 0 without a yearly price. */
export function yearlySavingPercent(plan: Plan): number {
  if (plan.yearly == null || plan.monthly <= 0) return 0;
  return Math.floor((1 - plan.yearly / (plan.monthly * 12)) * 100);
}

/** Largest yearly saving across the plans (the "Save up to" badge). */
export function maxYearlySavingPercent(plans: Plan[] = PLANS): number {
  return Math.max(0, ...plans.map(yearlySavingPercent));
}
