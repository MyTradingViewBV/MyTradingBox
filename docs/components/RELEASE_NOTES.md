# Release Notes

## Purpose

Release Notes shows application changes and updates available to the authenticated user.

## Route and Access

- Route: `/settings/release-notes`
- Required access: authenticated user
- Entry point: Settings

## Available Functions

- Load release-note data from the application asset.
- Display release entries when data is available.
- Show the page's empty or fallback state when no release entries can be loaded.
- Return to Settings or use the shared page navigation.

## States and Exceptions

- **Loading:** The release asset is fetched asynchronously.
- **Empty:** No entries are available.
- **Fallback:** The application includes generated/mock release-note asset data; the page should not be treated as a live changelog service.
- **Asset/network failure:** The page may render no entries or an error/fallback state.

## Roles and Navigation

Any authenticated user can view release notes. The page does not expose administrative controls or change application settings.

## Implementation References

- `src/app/components/settings/release-notes.component.ts`
- `src/app/assets/release-notes.mock.json`
- `updates/RELEASE_LOG.md`

## Look and feel

A hero panel with the top glow, release cards in the panel look (18px radius), pill tags in the accent color, and gradient timeline markers. The page background is transparent so the global top glow shows. Styles use the shared `--mtb-*` tokens (see `docs/STYLE_GUIDE.md`), so dark and light mode follow automatically.

Verification date: 2026-10-13.
