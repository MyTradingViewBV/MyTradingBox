# Onboarding

## Purpose

Onboarding introduces the main application areas through a global overlay. It is not a separate route and can appear over the current page when onboarding is incomplete.

## When It Appears

The application checks onboarding state during startup. The overlay is shown while the application store reports that onboarding is incomplete. Completion is persisted by the store's persistence meta-reducer under the `mtb.state.onboarding.v1` local-storage key (the legacy `mtb.onboarding.complete` key is migrated on startup).

## Available Functions

- Move forward through the seven onboarding steps.
- Move backward to review a previous step.
- Skip onboarding.
- Finish onboarding and mark it complete.
- Close the overlay after completion.

## States and Exceptions

- **First startup:** The overlay appears after the application determines onboarding is incomplete.
- **Previously completed:** The overlay normally stays hidden on later starts.
- **Cleared browser storage:** Clearing browser storage can cause onboarding to reappear. Signing out or the in-app storage clear keeps onboarding completion; the Settings "Show Onboarding Wizard" toggle shows it again.
- **Incomplete navigation:** Skipping or leaving before completion may leave onboarding incomplete, depending on the action taken.
- **Authentication context:** Onboarding is part of the application shell and should be understood alongside the login/session flow.

## Look and Feel

The overlay follows the login page style (see `docs/STYLE_GUIDE.md`): a blurred `--mtb-overlay` backdrop, a bordered `--mtb-radius-lg` panel with the logo and bold title in the header, step content in bordered list panels with orange bullets, an orange-to-yellow dot indicator that shows the current step, a bordered secondary "Back" button and a gradient primary "Next/Finish" button. All colours come from `--mtb-*` tokens, so dark and light themes follow automatically.

## Roles and Navigation

Onboarding does not grant permissions. It introduces navigation that is still governed by `authGuard` and `adminGuard`; admin-only destinations remain unavailable to non-admin users.

## Implementation References

- `src/app/components/onboarding/`
- `src/app/app.ts`
- NgRx application state and local storage

Verification date: 2026-10-13.
