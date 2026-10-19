# Plans (Subscriptions)

## Purpose

Plans shows the subscription options (Trial, Basic, Pro) with their prices and features, in the login page's look. It is information only: there is no checkout yet.

## Route and Access

- Route: `/plans`
- Required access: none (public), so the page can be shared before logging in. Logged-in users open it from Settings > Account > Plans.

## Available Functions

- Switch between monthly and yearly prices. Monthly shows the price per month with the yearly price below; yearly shows the price per year with the monthly equivalent below. The badge shows the largest yearly saving (currently 17%).
- Read the features per plan; some features carry a value (for example Watchlist: Limited / Extended).
- The plan buttons (Start free trial, Get Basic, Get Pro) show a "coming soon" message instead of starting a payment.
- Close (X) returns to the previous page, or to the start page when there is none.

## Plan data

Prices and features live in `src/app/components/plans/plans.data.ts` (one place to change them). Texts are in `PLANS.*` in `src/assets/i18n/en.json` and `nl.json`.

| Plan | Monthly | Yearly | Notes |
| --- | --- | --- | --- |
| Trial | €0 | — | 7 days; Gold Trigger concept visible, limited watchlist and symbols (BTC central) |
| Basic | €9.99 | €99 | Gold Trigger, extended watchlist, more symbols |
| Pro | €19.99 | €199 | Everything in Basic plus alerts, box strength/density, cluster analysis, AI trade setup (entry zone, targets, stop-loss, risk/reward); full symbols |

## States and Exceptions

- No payment, account change or API call happens on this page.
- Prices are shown in euro in the user's language format (`€9,99` in Dutch, `€9.99` in English).

## Roles and Navigation

Everyone can view Plans. Entry points: Settings > Account > Plans, or a direct link to `/plans`.

## Implementation References

- `src/app/components/plans/`
- `src/app/components/settings/settings.component.ts` (Plans row)
- `src/app/app.routes.ts`

## Look and feel

Built from the user's design in the login page style: shared `--mtb-*` tokens and mixins (`docs/STYLE_GUIDE.md`), so dark and light mode follow automatically. Feature values sit under their feature name so they fit on a phone.

Verification date: 2026-10-19.
