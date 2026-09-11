---
name: Page Documentation Maintenance
description: "Use when adding, changing, renaming, or deleting an Angular page, route, guard, page template, or shared page navigation in MyTradingBox. Keep the detailed page documentation synchronized with application behavior."
applyTo: "src/app/components/**/*.ts,src/app/components/**/*.html,src/app/app.routes.ts,src/app/app.ts,src/app/modules/shared/auth/guards/**/*.ts,src/app/components/footer/**/*"
---

# Page Documentation Maintenance

When a page, route, guard, template, or shared navigation surface is added, changed, renamed, or deleted, update the documentation in the same task before reporting completion.

## Required Documentation Checks

1. Identify the affected route(s), component, template, guards, route parameters, query parameters, and navigation entry points.
2. Update the matching page guide under `docs/components/`.
3. If the page is new, add a dedicated guide and link it from `docs/components/README.md`.
4. If the page is renamed or deleted, update or remove its guide and remove stale index links.
5. Update `docs/ROUTES_AND_PERMISSIONS.md` for route, guard, role, redirect, parameter, or alias changes.
6. Update `docs/DOCUMENTATION_STATUS.md` when behavior becomes implemented, experimental, placeholder, unavailable, or unresolved.
7. Update `docs/USER_MANUAL.md` when a user workflow, navigation path, access rule, or troubleshooting behavior changes.
8. Update `docs/README.md` only when the documentation structure or top-level entry points change.

## Required Page Guide Content

Each affected page guide must describe:

- Purpose and intended audience.
- Route(s) and access requirements.
- Roles and permission behavior.
- Visible controls and user functions.
- Common workflows.
- Loading, empty, success, and error states.
- Exceptions, limitations, placeholders, and experimental behavior.
- Navigation to related pages.
- Implementation references and verification date.

## Accuracy Rules

- Verify route and guard statements against `src/app/app.routes.ts` and the guard implementations.
- Describe current visible behavior, not commented-out or planned features.
- Do not claim an order type, authentication provider, setting, API, or navigation destination unless it exists in the current implementation.
- Treat admin-only routes as requiring both authentication and administrator access.
- Document broken, missing, or unregistered links as limitations rather than silently presenting them as working.
- Preserve existing user changes in documentation files and update the smallest relevant sections.

## Completion Checklist

Before completing a page-related task:

- [ ] Matching page guide updated or created.
- [ ] Page index updated.
- [ ] Route and permission matrix checked.
- [ ] Documentation status checked for changed behavior.
- [ ] User manual updated when the workflow changed.
- [ ] Relative Markdown links validated.
- [ ] No stale page links or conflict markers remain.
- [ ] Documentation-only changes pass `git diff --check -- docs .github`.
