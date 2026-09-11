# Onboarding

## Purpose

Onboarding introduces the main application areas through a global overlay. It is not a separate route and can appear over the current page when onboarding is incomplete.

## When It Appears

The application checks onboarding state during startup. The overlay is shown while the application store reports that onboarding is incomplete. Completion is also persisted through the `mtb.onboarding.complete` local-storage key.

## Available Functions

- Move forward through the seven onboarding steps.
- Move backward to review a previous step.
- Skip onboarding.
- Finish onboarding and mark it complete.
- Close the overlay after completion.

## States and Exceptions

- **First startup:** The overlay appears after the application determines onboarding is incomplete.
- **Previously completed:** The overlay normally stays hidden on later starts.
- **Cleared browser storage:** Clearing local storage or application state can cause onboarding to reappear.
- **Incomplete navigation:** Skipping or leaving before completion may leave onboarding incomplete, depending on the action taken.
- **Authentication context:** Onboarding is part of the application shell and should be understood alongside the login/session flow.

## Roles and Navigation

Onboarding does not grant permissions. It introduces navigation that is still governed by `authGuard` and `adminGuard`; admin-only destinations remain unavailable to non-admin users.

## Implementation References

- `src/app/components/onboarding/`
- `src/app/app.ts`
- NgRx application state and local storage

Verification date: 2026-09-11.
