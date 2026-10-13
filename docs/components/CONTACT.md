# Contact and Support

## Purpose

Contact provides support channels, service information, and links to community or security resources.

## Route and Access

- Route: `/contact`
- Required access: authenticated user

## Available Functions

- View support email and service information.
- Open the available external community, status, or security links.
- Return to the previous page using the shared back control.
- Use shared footer navigation where present.

## States and Exceptions

- External links depend on the destination service and the device/browser.
- Contact content is primarily static and does not itself submit a support ticket.
- The current UI references `/help/faq`, but that route is not registered in `app.routes.ts`; treat the FAQ destination as unavailable until the route is added.
- Placeholder or unavailable community links should not be treated as guaranteed support channels.

## Roles and Navigation

Any authenticated user can view Contact. It does not expose admin-only controls. The normal entry point is Settings or the footer.

## Implementation References

- `src/app/components/contact/`
- `src/app/components/footer/`
- `src/app/app.routes.ts`

## Look and feel

Restyled to match the login page: panels, inputs and buttons use the shared --mtb-* tokens and mixins (see docs/STYLE_GUIDE.md), so dark and light mode follow automatically. Status colors use the success, danger and warning tokens.

Verification date: 2026-10-13.
